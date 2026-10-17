import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  contacts,
  contactNotes,
  contactVisits,
  inboxMessages,
  emailSends,
  smsSends,
  automationRuns,
  automations,
  trackingPings,
} from "../db/schema";
import { getAiConfig, getKeyStatus, isOverDailyLimit } from "./settings.server";
import { readSummary, storeSummary } from "./summary-cache.server";
import { priceCall } from "./provider.server";
import { logStep } from "../engine/log.server";
import { formatActivityDate } from "../activity-date";
import { t as tr } from "@/lib/i18n";
import { identifiersOf, pseudonym } from "./redact";
import { patientSummary } from "../agent/summary.server";
import { visitLabel, isVisitState } from "../booking-system/status";
import { warsawDay, warsawWallClockToIso } from "../visits/warsaw-time";

/**
 * PRM_Agent na karcie pacjenta.
 *
 * Zastępuje dwie atrapy naraz: „AI Resume" z zaszytym na sztywno akapitem
 * i „AI Agent" z udawaną rozmową. Jedno i drugie odpowiadało na to samo
 * pytanie — „co wiemy o tym pacjencie" — więc jest jednym narzędziem.
 *
 * Fakty zbierane są PRZED wywołaniem modelu i wkładane do promptu. Model niczego
 * nie dopytuje i nie ma dostępu do bazy: dostaje gotowy wyciąg i ma go
 * streścić. Przy dokumentacji pacjenta to różnica między „podsumowaniem" a
 * „zgadywaniem", a zgadywanie w karcie medycznej jest nie do przyjęcia.
 *
 * Local model, slow hardware: a summary of a long record took about a minute
 * on a laptop (reading the prompt and writing the answer both cost). So the
 * card does not wait for it. The last summary is kept with a fingerprint of
 * the facts it came from and shown at once; a background pass on the engine
 * clock writes new ones ahead of today's and tomorrow's visits; the facts are
 * a short extract (the latest few of each list, page visits counted by
 * address) and the answer is capped at about 120 words.
 */

/** Cap of the summary: about 120 words, and a Polish word is ~3 tokens on Bielik. */
const SUMMARY_TOKENS = 400;
/** Cap of an answer to a question about the patient. */
const ANSWER_TOKENS = 500;
/**
 * Part of every fingerprint: raise it when the facts layout or the summary
 * prompt changes, and every cached summary counts as out of date.
 */
const SUMMARY_VERSION = "2";

/** How many of each list go into the facts — the latest ones. */
const PAST_VISITS = 5;
const NOTES = 5;
const MESSAGES = 6;
const SENDS = 3;
const PAGES = 6;
const AUTOMATIONS = 5;

export interface AgentResult {
  ok: boolean;
  text?: string;
  error?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  /** When the summary was written (epoch ms) — set by `summariseContact`. */
  createdAt?: number;
}

/**
 * Wyciąg faktów o pacjencie — to samo źródło dla podsumowania i dla pytań.
 *
 * Without today's date: the prompt adds it at the end (`withToday`), so the
 * extract is the same all day and fingerprints only what is known about the
 * patient. At the end, not the top, because a local server reuses the part of
 * the prompt it read last time — up to the first line that differs.
 */
export async function contactFacts(contactId: string, now = Date.now()): Promise<string | null> {
  const db = getDb();
  const c = await db.select().from(contacts).where(eq(contacts.id, contactId)).get();
  if (!c) return null;

  const counted = (n: { n: number } | undefined) => n?.n ?? 0;
  const [visits, notes, msgs, mails, texts, runs, totals] = await Promise.all([
    db
      .select()
      .from(contactVisits)
      .where(eq(contactVisits.contactId, contactId))
      .orderBy(desc(contactVisits.startsAt))
      .limit(20),
    db
      .select()
      .from(contactNotes)
      .where(eq(contactNotes.contactId, contactId))
      .orderBy(desc(contactNotes.createdAt))
      .limit(NOTES),
    db
      .select()
      .from(inboxMessages)
      .where(eq(inboxMessages.contactId, contactId))
      .orderBy(desc(inboxMessages.createdAt))
      .limit(MESSAGES),
    c.email
      ? db
          .select()
          .from(emailSends)
          .where(eq(emailSends.toEmail, c.email))
          .orderBy(desc(emailSends.sentAt))
          .limit(30)
      : Promise.resolve([]),
    db
      .select()
      .from(smsSends)
      .where(eq(smsSends.contactId, contactId))
      .orderBy(desc(smsSends.sentAt))
      .limit(SENDS),
    db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.contactId, contactId))
      .orderBy(desc(automationRuns.startedAt))
      .limit(30),
    // Totals beside the latest few, so a cut list never reads as the whole history.
    Promise.all([
      db
        .select({ n: sql<number>`count(*)` })
        .from(contactVisits)
        .where(eq(contactVisits.contactId, contactId))
        .get(),
      db
        .select({ n: sql<number>`count(*)` })
        .from(contactNotes)
        .where(eq(contactNotes.contactId, contactId))
        .get(),
      db
        .select({ n: sql<number>`count(*)` })
        .from(inboxMessages)
        .where(eq(inboxMessages.contactId, contactId))
        .get(),
      c.email
        ? db
            .select({ n: sql<number>`count(*)` })
            .from(emailSends)
            .where(eq(emailSends.toEmail, c.email))
            .get()
        : Promise.resolve(undefined),
      db
        .select({ n: sql<number>`count(*)` })
        .from(smsSends)
        .where(eq(smsSends.contactId, contactId))
        .get(),
    ]),
  ]);
  const [visitsTotal, notesTotal, msgsTotal, mailsTotal, textsTotal] = totals.map(counted);

  /**
   * Wejścia na stronę.
   *
   * Łączone przez tokeny z wysyłek e-mail — tak samo jak oś czasu na karcie,
   * więc agent widzi dokładnie to, co człowiek. Anonimowe wizyty tu nie trafiają,
   * bo nie należą do nikogo; te sprzed rozpoznania owszem, bo kolektor dopisuje
   * im token wstecz przy pierwszym kliknięciu z e-maila.
   */
  const tokens = mails.map((m) => m.token);
  const pages = tokens.length
    ? await db
        .select()
        .from(trackingPings)
        .where(inArray(trackingPings.contactToken, tokens))
        .orderBy(desc(trackingPings.receivedAt))
        .limit(40)
    : [];
  // Counted by address: the rule is that repeated visits to one page are the
  // intent, and a small model asked to count 25 lines miscounts them.
  const byUrl = new Map<string, { title: string; n: number; last: number }>();
  for (const p of pages) {
    const seen = byUrl.get(p.url);
    if (seen) seen.n += 1;
    else byUrl.set(p.url, { title: p.title, n: 1, last: p.receivedAt });
  }
  const topPages = [...byUrl]
    .sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)
    .slice(0, PAGES);

  const autoIds = [...new Set(runs.map((r) => r.automationId))];
  const autoNames = new Map<string, string>();
  for (const id of autoIds) {
    const a = await db
      .select({ name: automations.name })
      .from(automations)
      .where(eq(automations.id, id))
      .get();
    if (a) autoNames.set(id, a.name);
  }
  // One line per automation, newest run first: what it was and how it ended.
  const byAuto = new Map<string, { n: number; status: string; last: number }>();
  for (const r of runs) {
    const seen = byAuto.get(r.automationId);
    if (seen) seen.n += 1;
    else byAuto.set(r.automationId, { n: 1, status: r.status, last: r.startedAt });
  }

  // Upcoming and past apart, each with its state: a smaller local model does
  // not work out from bare dates which visit is ahead, and answered "no visit
  // booked" with one on the list.
  const state = (v: (typeof visits)[number]) =>
    isVisitState(v.systemStatus) ? visitLabel(v.systemStatus, v.startsAt, "", now) : "";
  const visitLine = (v: (typeof visits)[number]) =>
    `- ${v.startsAt ? formatActivityDate(v.startsAt) : tr("termin nieokreślony")} · ${v.title}${v.specialization ? ` · ${v.specialization}` : ""}${v.doctor ? ` · ${v.doctor}` : ""}${state(v) ? ` · ${state(v)}` : ""}`;
  const upcoming = visits
    .filter((v) => v.startsAt !== null && v.startsAt > now && v.systemStatus !== "cancelled")
    .reverse();
  const past = visits.filter((v) => !upcoming.includes(v)).slice(0, PAST_VISITS);
  const brief = (await patientSummary(contactId, now)) ?? [];
  const since = Date.parse(c.createdAt);

  const lines: string[] = [
    tr("W SKRÓCIE (policzone przez system z całej historii, pewne):"),
    ...brief.map((sentence) => `- ${sentence}`),
    "",
    // Who the patient is stays on this side of the boundary: a pseudonym and
    // the PRM ID identify the record for staff, not the person for the model.
    `PACJENT: ${pseudonym(c.id)} (${c.prmId})`,
    tr("Status: {status} · w bazie od {createdAt}", {
      status: c.status,
      createdAt: Number.isNaN(since) ? c.createdAt : formatActivityDate(since).slice(0, 10),
    }),
    tr("Kanały: e-mail {v0}, telefon {v1}", {
      v0: c.email ? tr("jest") : tr("brak"),
      v1: c.phone ? tr("jest") : tr("brak"),
    }),
    tr("Pozyskanie: źródło {v0}, medium {v1}, kampania {v2}", {
      v0: c.source || "—",
      v1: c.medium || "—",
      v2: c.campaign || "—",
    }),
    `Tagi: ${(c.tags ?? []).join(", ") || "brak"}`,
    `Segmenty (etykiety): ${(c.segments ?? []).join(", ") || "brak"}`,
    tr("Zgody: e-mail {v0}, SMS {v1}, profilowanie {v2} (źródło: {v3})", {
      v0: c.consentEmail ? "TAK" : "nie",
      v1: c.consentSms ? "TAK" : "nie",
      v2: c.consentProfiling ? "TAK" : "nie",
      v3: c.consentSource || "—",
    }),
    "",
    tr("WIZYTY ZAPLANOWANE — przyszłe, najbliższa pierwsza ({length}):", {
      length: upcoming.length,
    }),
    ...upcoming.map(visitLine),
    "",
    tr("WIZYTY MINIONE — {shown} najnowszych z {total}:", {
      shown: past.length,
      total: Math.max(visitsTotal - upcoming.length, past.length),
    }),
    ...past.map(visitLine),
    "",
    tr("NOTATKI — {shown} najnowszych z {total}:", { shown: notes.length, total: notesTotal }),
    ...notes.map(
      (n) => `- ${formatActivityDate(n.createdAt)} · ${n.text.replace(/\n/g, " | ").slice(0, 200)}`,
    ),
    "",
    tr("WIADOMOŚCI W SKRZYNCE — {shown} najnowszych z {total}:", {
      shown: msgs.length,
      total: msgsTotal,
    }),
    ...msgs.map(
      (m) =>
        `- ${formatActivityDate(m.createdAt)} · ${m.direction === "in" ? "OD pacjenta" : "DO pacjenta"} · ${m.channel} · ${m.body.replace(/\s+/g, " ").slice(0, 160)}`,
    ),
    "",
    tr("WYSŁANE E-MAILE: {length}", { length: mailsTotal }),
    ...mails.slice(0, SENDS).map((m) => `- ${formatActivityDate(m.sentAt)} · ${m.subject}`),
    "",
    tr("WYSŁANE SMS-y: {length}", { length: textsTotal }),
    ...texts.map((t) => `- ${formatActivityDate(t.sentAt)} · ${t.body.slice(0, 100)}`),
    "",
    tr("WEJŚCIA NA STRONĘ ({length}) — adresy od najczęstszych:", { length: pages.length }),
    ...topPages.map(([url, p]) =>
      tr("- {url} · {n}× · ostatnio {last}", {
        url: p.title ? `${url} (${p.title.slice(0, 60)})` : url,
        n: p.n,
        last: formatActivityDate(p.last),
      }),
    ),
    "",
    `AUTOMATYZACJE (${runs.length}):`,
    ...[...byAuto].slice(0, AUTOMATIONS).map(([id, a]) =>
      tr("- {name} · {n}× · ostatnio {status}, start {last}", {
        name: autoNames.get(id) ?? tr("usunięta"),
        n: a.n,
        status: a.status,
        last: formatActivityDate(a.last),
      }),
    ),
  ];

  return lines.join("\n");
}

/** The facts as the model gets them: today's date last (see `contactFacts`). */
function withToday(facts: string, now: number): string {
  return `${facts}\n\n${tr("DZIŚ: {today}", { today: formatActivityDate(now) })}`;
}

/** What a summary was written from: the facts, the model and the prompt version. */
export function factsFingerprint(facts: string, model: string): string {
  return createHash("sha256")
    .update(`${SUMMARY_VERSION}\n${model}\n${facts}`)
    .digest("hex")
    .slice(0, 32);
}

const SYSTEM = () =>
  tr(
    'Jesteś PRM_Agent — asystentem zespołu polskiej przychodni, pracującym na karcie konkretnego pacjenta.\n\nZASADY, od których nie ma odstępstw:\n1. Opierasz się WYŁĄCZNIE na danych z sekcji FAKTY. Nie zmyślasz statystyk, dat,\n   preferencji ani "open rate". Jeśli czegoś nie ma w faktach — piszesz, że tego nie wiemy.\n2. Nie stawiasz diagnoz i nie doradzasz leczenia. Jesteś narzędziem obsługi\n   pacjenta i marketingu, nie personelem medycznym.\n3. Piszesz po polsku, zwięźle, konkretnie. Bez lania wody i bez marketingowego żargonu.\n4. Gdy proponujesz następny krok, musi on wynikać z faktów i mieścić się w zgodach:\n   pacjent bez zgody na e-mail nie dostanie propozycji mailingu.\n5. WEJŚCIA NA STRONĘ mówią, czym pacjent realnie się interesował — to często\n   najświeższy sygnał, jaki mamy. Powtarzające się wejścia na tę samą podstronę\n   (np. cennik) traktuj jako wyraźną intencję i wspominaj o nich wprost, razem\n   z adresem. Pojedyncze wejście na stronę główną nie znaczy nic.',
  );

const SUMMARY_PROMPT = () =>
  tr(
    "Napisz podsumowanie tego pacjenta dla osoby z recepcji, która za chwilę z nim rozmawia. Bez wstępu i bez list punktowanych — dokładnie cztery krótkie sekcje, razem około 100 słów:\n\n**Kim jest** (do 15 słów) — kto to i od kiedy z nami.\n**Historia** (do 40 słów) — tylko to, co najważniejsze dla rozmowy: wizyty, wiadomości, wysyłki.\n**Na co uważać** (do 20 słów) — brakujące zgody, brakujące dane, sygnały ostrzegawcze.\n**Proponowany następny krok** (do 20 słów) — jeden, wynikający z faktów i możliwy w ramach zgód.\n\nJeśli danych jest mało, napisz to wprost zamiast rozbudowywać domysły.",
  );

/**
 * An answer that ran into the token cap ends mid-word. A local model does not
 * always keep to its word budgets (Bielik wrote ~120 words for "about 100"),
 * so the summary keeps what ends a sentence (or a line) instead of showing
 * reception a broken one — without the budgets it copied into the headings.
 */
export function wholeSentences(text: string): string {
  return cutToSentence(dropBudgets(text));
}

/** The word budgets of the prompt, which a small model copies into its headings. */
function dropBudgets(text: string): string {
  return text.replace(/[ \t]*\((?:do|up to) \d+ (?:słów|words)\)/gi, "");
}

function cutToSentence(text: string): string {
  const t = text.trimEnd();
  if (/[.!?…*)]$/.test(t)) return t;
  const end = t.search(/[.!?…](?=[^.!?…]*$)/);
  if (end > 0) return t.slice(0, end + 1);
  const line = t.lastIndexOf("\n");
  return line > 0 ? t.slice(0, line).trimEnd() : t;
}

/** Model calls started by a person and not finished yet — the background pass gives way to them. */
let liveCalls = 0;

/** Podsumowanie pacjenta — to, czym udawała być zakładka „AI Resume". Kept for the card. */
export async function summariseContact(contactId: string, now = Date.now()): Promise<AgentResult> {
  liveCalls += 1;
  try {
    return await writeSummary(contactId, "card", now);
  } finally {
    liveCalls -= 1;
  }
}

/** Pytanie o tego pacjenta — to, czym udawała być zakładka „AI Agent". */
export async function askAboutContact(
  contactId: string,
  history: { role: "user" | "assistant"; text: string }[],
): Promise<AgentResult> {
  liveCalls += 1;
  try {
    const out = await callModel(contactId, history, ANSWER_TOKENS, Date.now());
    return out.result;
  } finally {
    liveCalls -= 1;
  }
}

async function writeSummary(
  contactId: string,
  source: "card" | "background",
  now: number,
): Promise<AgentResult> {
  const out = await callModel(
    contactId,
    [{ role: "user" as const, text: SUMMARY_PROMPT() }],
    SUMMARY_TOKENS,
    now,
    source === "background"
      ? tr("PRM_Agent przygotował podsumowanie pacjenta przed wizytą.")
      : undefined,
  );
  const result =
    out.result.ok && out.result.text
      ? {
          ...out.result,
          text:
            (out.result.tokensOut ?? 0) >= SUMMARY_TOKENS
              ? wholeSentences(out.result.text)
              : dropBudgets(out.result.text),
        }
      : out.result;
  if (!result.ok || !result.text?.trim() || !out.fingerprint) return result;
  const createdAt = Date.now();
  await storeSummary({
    contactId,
    text: result.text.trim(),
    fingerprint: out.fingerprint,
    model: out.model ?? "",
    source,
    tokensIn: result.tokensIn ?? null,
    tokensOut: result.tokensOut ?? null,
    createdAt,
  });
  return { ...result, createdAt };
}

export interface CachedSummary {
  text: string;
  createdAt: number;
  source: "card" | "background";
  /** The facts changed since it was written (or the model, or the prompt). */
  stale: boolean;
}

/**
 * The summary the card shows on opening, without calling a model. Whether it
 * is still current is worked out from the facts of now — database reads only.
 */
export async function cachedSummary(
  contactId: string,
  now = Date.now(),
): Promise<CachedSummary | null> {
  const row = await readSummary(contactId);
  if (!row) return null;
  const facts = await contactFacts(contactId, now);
  if (!facts) return null;
  const { model } = await getAiConfig();
  return {
    text: row.text,
    createdAt: row.createdAt,
    source: row.source,
    stale: row.fingerprint !== factsFingerprint(facts, model),
  };
}

async function callModel(
  contactId: string,
  history: { role: "user" | "assistant"; text: string }[],
  maxTokens: number,
  now: number,
  logMessage?: string,
): Promise<{ result: AgentResult; fingerprint?: string; model?: string }> {
  const fail = (error: string) => ({ result: { ok: false, error } });
  const config = await getAiConfig();
  if (!(await getKeyStatus())[config.providerId]) {
    return fail(
      tr(
        "Brak klucza API dostawcy {providerId} — uzupełnij go w Integracje → Klucze i dane dostępowe albo zmień dostawcę w Ustawieniach → PRM_Agent.",
        { providerId: config.providerId },
      ),
    );
  }

  const limit = await isOverDailyLimit();
  if (limit.over) return fail(limit.reason);

  const facts = await contactFacts(contactId, now);
  if (!facts) return fail(tr("Nie znaleziono pacjenta."));
  const who = await getDb().select().from(contacts).where(eq(contacts.id, contactId)).get();

  try {
    const completion = await config.provider.complete({
      model: config.model,
      system: tr("{SYSTEM}\n\nFAKTY O PACJENCIE (jedyne źródło prawdy):\n{facts}", {
        SYSTEM: `${SYSTEM()}\n${tr(
          "6. Dane kontaktowe pacjenta nie są w faktach i nie piszesz ich ani nie wstawiasz za nie znaczników typu {{phone}}. Daty i godziny bierzesz dokładnie z faktów; o tym, co już było, a co dopiero będzie, decyduje DZIŚ.",
        )}`,
        facts: withToday(facts, now),
      }),
      messages: history.map((h) => ({ role: h.role, text: h.text })),
      // Bez narzędzi: model dostaje gotowy wyciąg faktów i ma go streścić,
      // a nie chodzić po bazie. Mniej ruchomych części, żadnych zapytań,
      // których nikt nie przewidział przy karcie pacjenta.
      tools: [],
      maxTokens,
      identifiers: who ? identifiersOf(who) : undefined,
    });

    const costUsd = priceCall(config.providerId, config.model, completion.usage);
    await logStep({
      contactId,
      kind: "ai",
      message: logMessage ?? tr("PRM_Agent odpowiedział na karcie pacjenta."),
      tokensIn: completion.usage.inputTokens,
      tokensOut: completion.usage.outputTokens,
      costUsd,
    });

    return {
      result: {
        ok: true,
        text: completion.text,
        tokensIn: completion.usage.inputTokens,
        tokensOut: completion.usage.outputTokens,
        costUsd,
      },
      fingerprint: factsFingerprint(facts, config.model),
      model: config.model,
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Summaries written ahead of the visit ───────────────────────────────────

/** Between two background passes: each writes at most one summary, so the model is free most of the time. */
const PREFETCH_INTERVAL_MS = 2 * 60_000;
/** The background stops at this share of the daily limit; the rest is for people. */
const PREFETCH_LIMIT_SHARE = 0.8;
/** At most this many patients are looked at in one pass. */
const PREFETCH_SCAN = 200;
const DAY_MS = 86_400_000;

/** Local midnight in Warsaw after tomorrow — the end of the window ahead. */
function endOfTomorrow(now: number): number {
  const today = warsawDay(now);
  const plusTwo = new Date(Date.parse(`${today}T12:00:00Z`) + 2 * DAY_MS)
    .toISOString()
    .slice(0, 10);
  return Date.parse(warsawWallClockToIso(plusTwo, "00:00"));
}

/**
 * Patients with a visit still ahead today or tomorrow (Warsaw time), not
 * cancelled, nearest visit first — whose card reception will open next.
 */
export async function summaryCandidates(now = Date.now()): Promise<string[]> {
  const rows = await getDb()
    .select({ contactId: contactVisits.contactId })
    .from(contactVisits)
    .where(
      and(
        gt(contactVisits.startsAt, now),
        lt(contactVisits.startsAt, endOfTomorrow(now)),
        ne(contactVisits.systemStatus, "cancelled"),
      ),
    )
    .orderBy(asc(contactVisits.startsAt))
    .limit(PREFETCH_SCAN * 2);
  return [...new Set(rows.map((r) => r.contactId))].slice(0, PREFETCH_SCAN);
}

/**
 * One background step: the first candidate whose cached summary is missing
 * or no longer matches the facts gets a new one. Returns that patient's id,
 * or null when nothing was written. Only when a model may be used, someone
 * is not waiting for one on a card, and the day's runs leave room for people.
 */
export async function prefetchNextSummary(now = Date.now()): Promise<string | null> {
  if (liveCalls > 0) return null;
  const config = await getAiConfig();
  if (config.mode === "off" || !(await getKeyStatus())[config.providerId]) return null;
  const limit = await isOverDailyLimit();
  if (limit.over || limit.used >= limit.limit * PREFETCH_LIMIT_SHARE) return null;

  for (const contactId of await summaryCandidates(now)) {
    const facts = await contactFacts(contactId, now);
    if (!facts) continue;
    const row = await readSummary(contactId);
    if (row && row.fingerprint === factsFingerprint(facts, config.model)) continue;
    const result = await writeSummary(contactId, "background", now);
    if (!result.ok) {
      await logStep({
        contactId,
        kind: "agent",
        message: tr("PRM_Agent: podsumowanie przed wizytą nie powstało ({err}).", {
          err: result.error ?? "",
        }),
        detail: { feature: "contact-summary-prefetch" },
      });
      return null;
    }
    return contactId;
  }
  return null;
}

let prefetching: Promise<unknown> | null = null;
let lastPrefetchAt = 0;

/**
 * On the engine clock. Not awaited by the tick, unlike the other periodic
 * jobs: one summary on a local model takes up to a minute, and automations
 * must not wait that long for their next step. One pass at a time, the next
 * one at least two minutes after the previous one ended. Never throws.
 */
export function maybePrefetchSummaries(now = Date.now()): void {
  if (prefetching || now - lastPrefetchAt < PREFETCH_INTERVAL_MS) return;
  prefetching = prefetchNextSummary(now)
    .catch((err) =>
      logStep({
        kind: "error",
        message: tr("PRM_Agent: podsumowania przed wizytą nie powiodły się: {err}", {
          err: String(err),
        }),
        detail: { source: "contact-summary-prefetch" },
      }),
    )
    .finally(() => {
      prefetching = null;
      lastPrefetchAt = Date.now();
    });
}
