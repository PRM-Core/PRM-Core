import { desc, eq, inArray } from "drizzle-orm";
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
import { priceCall } from "./provider.server";
import { logStep } from "../engine/log.server";
import { formatActivityDate } from "../activity-date";
import { t as tr } from "@/lib/i18n";

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
 */

const MAX_TOKENS = 1200;

export interface AgentResult {
  ok: boolean;
  text?: string;
  error?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

/** Wyciąg faktów o pacjencie — to samo źródło dla podsumowania i dla pytań. */
async function gatherFacts(contactId: string): Promise<string | null> {
  const db = getDb();
  const c = await db.select().from(contacts).where(eq(contacts.id, contactId)).get();
  if (!c) return null;

  const [visits, notes, msgs, mails, texts, runs] = await Promise.all([
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
      .limit(20),
    db
      .select()
      .from(inboxMessages)
      .where(eq(inboxMessages.contactId, contactId))
      .orderBy(desc(inboxMessages.createdAt))
      .limit(20),
    c.email
      ? db.select().from(emailSends).where(eq(emailSends.toEmail, c.email)).limit(30)
      : Promise.resolve([]),
    db.select().from(smsSends).where(eq(smsSends.contactId, contactId)).limit(30),
    db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.contactId, contactId))
      .orderBy(desc(automationRuns.startedAt))
      .limit(10),
  ]);

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

  const lines: string[] = [
    `PACJENT: ${c.firstName} ${c.lastName}`.trim(),
    tr("Status: {status} · w bazie od {createdAt}", { status: c.status, createdAt: c.createdAt }),
    `Kontakt: ${c.email || "brak e-maila"} · ${c.phone || "brak telefonu"}`,
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
    `WIZYTY (${visits.length}):`,
    ...visits.map(
      (v) =>
        `- ${v.startsAt ? formatActivityDate(v.startsAt) : tr("termin nieokreślony")} · ${v.title}${v.specialization ? ` · ${v.specialization}` : ""}${v.doctor ? ` · ${v.doctor}` : ""}`,
    ),
    "",
    `NOTATKI (${notes.length}):`,
    ...notes.map(
      (n) => `- ${formatActivityDate(n.createdAt)} · ${n.text.replace(/\n/g, " | ").slice(0, 300)}`,
    ),
    "",
    tr("WIADOMOŚCI W SKRZYNCE ({length}):", { length: msgs.length }),
    ...msgs.map(
      (m) =>
        `- ${formatActivityDate(m.createdAt)} · ${m.direction === "in" ? "OD pacjenta" : "DO pacjenta"} · ${m.channel} · ${m.body.slice(0, 200)}`,
    ),
    "",
    tr("WYSŁANE E-MAILE: {length}", { length: mails.length }),
    ...mails.slice(0, 10).map((m) => `- ${formatActivityDate(m.sentAt)} · ${m.subject}`),
    "",
    tr("WYSŁANE SMS-y: {length}", { length: texts.length }),
    ...texts.slice(0, 10).map((t) => `- ${formatActivityDate(t.sentAt)} · ${t.body.slice(0, 120)}`),
    "",
    tr("WEJŚCIA NA STRONĘ ({length}) — najnowsze pierwsze:", { length: pages.length }),
    ...pages
      .slice(0, 25)
      .map(
        (p) =>
          `- ${formatActivityDate(p.receivedAt)} · ${p.title || tr("(bez tytułu)")} · ${p.url}`,
      ),
    "",
    `AUTOMATYZACJE (${runs.length}):`,
    ...runs.map(
      (r) =>
        `- ${autoNames.get(r.automationId) ?? tr("usunięta")} · ${r.status} · start ${formatActivityDate(r.startedAt)}`,
    ),
  ];

  return lines.join("\n");
}

const SYSTEM = () =>
  tr(
    'Jesteś PRM_Agent — asystentem zespołu polskiej przychodni, pracującym na karcie konkretnego pacjenta.\n\nZASADY, od których nie ma odstępstw:\n1. Opierasz się WYŁĄCZNIE na danych z sekcji FAKTY. Nie zmyślasz statystyk, dat,\n   preferencji ani "open rate". Jeśli czegoś nie ma w faktach — piszesz, że tego nie wiemy.\n2. Nie stawiasz diagnoz i nie doradzasz leczenia. Jesteś narzędziem obsługi\n   pacjenta i marketingu, nie personelem medycznym.\n3. Piszesz po polsku, zwięźle, konkretnie. Bez lania wody i bez marketingowego żargonu.\n4. Gdy proponujesz następny krok, musi on wynikać z faktów i mieścić się w zgodach:\n   pacjent bez zgody na e-mail nie dostanie propozycji mailingu.\n5. WEJŚCIA NA STRONĘ mówią, czym pacjent realnie się interesował — to często\n   najświeższy sygnał, jaki mamy. Powtarzające się wejścia na tę samą podstronę\n   (np. cennik) traktuj jako wyraźną intencję i wspominaj o nich wprost, razem\n   z adresem. Pojedyncze wejście na stronę główną nie znaczy nic.',
  );

/** Podsumowanie pacjenta — to, czym udawała być zakładka „AI Resume". */
export async function summariseContact(contactId: string): Promise<AgentResult> {
  return callModel(contactId, [
    {
      role: "user" as const,
      text: tr(
        "Napisz zwięzłe podsumowanie tego pacjenta dla osoby z recepcji, która za chwilę z nim rozmawia.\n\nStruktura:\n**Kim jest** — 2–3 zdania.\n**Historia** — co się realnie wydarzyło (wizyty, wiadomości, wysyłki).\n**Na co uważać** — brakujące zgody, brakujące dane, sygnały ostrzegawcze.\n**Proponowany następny krok** — jeden, wynikający z faktów i możliwy w ramach zgód.\n\nJeśli danych jest mało, napisz to wprost zamiast rozbudowywać domysły.",
      ),
    },
  ]);
}

/** Pytanie o tego pacjenta — to, czym udawała być zakładka „AI Agent". */
export async function askAboutContact(
  contactId: string,
  history: { role: "user" | "assistant"; text: string }[],
): Promise<AgentResult> {
  return callModel(contactId, history);
}

async function callModel(
  contactId: string,
  history: { role: "user" | "assistant"; text: string }[],
): Promise<AgentResult> {
  const config = await getAiConfig();
  if (!(await getKeyStatus())[config.providerId]) {
    return {
      ok: false,
      error: tr(
        "Brak klucza API dostawcy {providerId} — uzupełnij go w Integracje → Klucze i dane dostępowe albo zmień dostawcę w Ustawieniach → PRM_Agent.",
        { providerId: config.providerId },
      ),
    };
  }

  const limit = await isOverDailyLimit();
  if (limit.over) {
    return {
      ok: false,
      error: tr(
        "Dzienny limit kosztów AI wyczerpany ({v0} / {v1} USD). Podnieś go w Ustawieniach → PRM_Agent.",
        { v0: limit.spent.toFixed(2), v1: limit.limit.toFixed(2) },
      ),
    };
  }

  const facts = await gatherFacts(contactId);
  if (!facts) return { ok: false, error: tr("Nie znaleziono pacjenta.") };

  try {
    const completion = await config.provider.complete({
      model: config.model,
      system: tr("{SYSTEM}\n\nFAKTY O PACJENCIE (jedyne źródło prawdy):\n{facts}", {
        SYSTEM: SYSTEM(),
        facts: facts,
      }),
      messages: history.map((h) => ({ role: h.role, text: h.text })),
      // Bez narzędzi: model dostaje gotowy wyciąg faktów i ma go streścić,
      // a nie chodzić po bazie. Mniej ruchomych części, żadnych zapytań,
      // których nikt nie przewidział przy karcie pacjenta.
      tools: [],
      maxTokens: MAX_TOKENS,
    });

    const costUsd = priceCall(config.providerId, config.model, completion.usage);
    await logStep({
      contactId,
      kind: "ai",
      message: tr("PRM_Agent odpowiedział na karcie pacjenta."),
      tokensIn: completion.usage.inputTokens,
      tokensOut: completion.usage.outputTokens,
      costUsd,
    });

    return {
      ok: true,
      text: completion.text,
      tokensIn: completion.usage.inputTokens,
      tokensOut: completion.usage.outputTokens,
      costUsd,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
