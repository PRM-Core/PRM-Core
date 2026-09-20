import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  agentInsights,
  automationRuns,
  automations,
  contactNotes,
  contacts,
  copilotMessages,
  emailEvents,
  emailSends,
  engineJobs,
  engineLog,
  inboxMessages,
  knowledgeEntries,
} from "../db/schema";
import type { CopilotMessageRow } from "../db/schema";
import { triggerLabel } from "../automation-catalog";
import { getAiConfig, isOverDailyLimit, getKeyStatus } from "./settings.server";
import { priceCall, AiProviderError, type AiMessage, type AiToolDef } from "./provider.server";
import { knowledgeForPrompt } from "./knowledge.server";
import { logStep } from "../engine/log.server";
import { t as tr, localized } from "@/lib/i18n";

// PRM_Agent as a chat assistant — the same model layer as the automation node
// (M3), but pointed at the workspace instead of at one patient's journey.
//
// **Read-only, deliberately.** The node version can tag, segment and message
// patients because an automation author granted it those permissions on a
// specific step. A chat box has no such gate: anything it could change, it could
// change because somebody phrased a question loosely. So every tool here only
// reads, the prompt says so, and the UI says so.

const MAX_TOOL_ROUNDS = 5;
const MAX_TOKENS = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CopilotTurn {
  role: "user" | "assistant";
  text: string;
}

/** How long a transcript is kept. Also enforced by the supervisor sweep. */
export const COPILOT_RETENTION_DAYS = 7;

export interface CopilotResult {
  ok: boolean;
  text?: string;
  error?: string;
  /** Tools the model actually consulted, so the UI can show what the answer stands on. */
  used?: string[];
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

const TOOLS: AiToolDef[] = localized(() => [
  {
    name: "count_contacts",
    description: tr(
      "Policz kontakty w bazie, opcjonalnie filtrując po statusie, segmencie lub tagu. Zwraca też rozbicie po statusach i najczęstsze segmenty.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "lead", "patient", "inactive"] },
        segment: { type: "string" },
        tag: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "find_contacts",
    description: tr(
      "Znajdź kontakty po imieniu, nazwisku, e-mailu, telefonie lub PRM ID. Zwraca podstawowe dane, status, segmenty i tagi.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "contact_history",
    description: tr(
      "Historia jednego pacjenta: kroki silnika, wiadomości ze skrzynki i notatki. Podaj id kontaktu z find_contacts.",
    ),
    inputSchema: {
      type: "object",
      properties: { contactId: { type: "string" }, limit: { type: "number" } },
      required: ["contactId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_automations",
    description: tr(
      "Lista automatyzacji: nazwa, status, wyzwalacz i ilu kontaktów przez nie przeszło.",
    ),
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "engine_overview",
    description: tr(
      "Stan silnika i wyniki wysyłek z ostatnich 30 dni: przebiegi wg statusu, kolejka, wysłane e-maile, otwarcia, kliknięcia oraz nieobsłużone spostrzeżenia nadzorcy.",
    ),
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
]);

function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Runs one read-only tool and returns JSON for the model. Never throws. */
async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
  const db = getDb();
  try {
    switch (name) {
      case "count_contacts": {
        const rows = await db.select().from(contacts);
        const status = String(input.status ?? "");
        const segment = String(input.segment ?? "");
        const tag = String(input.tag ?? "");
        const matching = rows.filter(
          (c) =>
            (!status || c.status === status) &&
            (!segment || (c.segments ?? []).some((s) => same(s, segment))) &&
            (!tag || (c.tags ?? []).some((t) => same(t, tag))),
        );
        const byStatus: Record<string, number> = {};
        for (const c of rows) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
        const bySegment: Record<string, number> = {};
        for (const c of rows) {
          for (const s of c.segments ?? []) bySegment[s] = (bySegment[s] ?? 0) + 1;
        }
        return JSON.stringify({
          pasujące: matching.length,
          wszystkie: rows.length,
          wgStatusu: byStatus,
          wgSegmentu: bySegment,
        });
      }

      case "find_contacts": {
        const q = String(input.query ?? "")
          .trim()
          .toLowerCase();
        const limit = Math.min(Number(input.limit ?? 10) || 10, 25);
        const rows = await db.select().from(contacts);
        const hits = rows
          .filter((c) =>
            [c.firstName, c.lastName, c.email, c.phone, c.prmId]
              .join(" ")
              .toLowerCase()
              .includes(q),
          )
          .slice(0, limit)
          .map((c) => ({
            id: c.id,
            imię: `${c.firstName} ${c.lastName}`.trim(),
            email: c.email,
            telefon: c.phone,
            status: c.status,
            segmenty: c.segments ?? [],
            tagi: c.tags ?? [],
            źródło: c.source,
            utworzony: c.createdAt,
          }));
        return JSON.stringify({ znalezione: hits.length, kontakty: hits });
      }

      case "contact_history": {
        const contactId = String(input.contactId ?? "");
        const limit = Math.min(Number(input.limit ?? 15) || 15, 40);
        const [log, messages, notes] = await Promise.all([
          db
            .select()
            .from(engineLog)
            .where(eq(engineLog.contactId, contactId))
            .orderBy(desc(engineLog.createdAt))
            .limit(limit),
          db
            .select()
            .from(inboxMessages)
            .where(eq(inboxMessages.contactId, contactId))
            .orderBy(desc(inboxMessages.createdAt))
            .limit(limit),
          db
            .select()
            .from(contactNotes)
            .where(eq(contactNotes.contactId, contactId))
            .orderBy(desc(contactNotes.createdAt))
            .limit(10),
        ]);
        return JSON.stringify({
          krokiSilnika: log.map((l) => ({
            kiedy: new Date(l.createdAt).toISOString(),
            rodzaj: l.kind,
            opis: l.message,
          })),
          wiadomości: messages.map((m) => ({
            kiedy: new Date(m.createdAt).toISOString(),
            kierunek: m.direction === "in" ? "od pacjenta" : "do pacjenta",
            kanał: m.channel,
            treść: m.body.slice(0, 400),
          })),
          notatki: notes.map((n) => ({
            kiedy: new Date(n.createdAt).toISOString(),
            treść: n.text.slice(0, 400),
          })),
        });
      }

      case "list_automations": {
        const rows = await db.select().from(automations);
        const runs = await db
          .select({ automationId: automationRuns.automationId })
          .from(automationRuns);
        const counts = new Map<string, number>();
        for (const r of runs) counts.set(r.automationId, (counts.get(r.automationId) ?? 0) + 1);
        return JSON.stringify(
          rows.map((a) => ({
            id: a.id,
            nazwa: a.name || "(bez nazwy)",
            status: a.status,
            wyzwalacz: triggerLabel(a.flow),
            liczbaKroków: a.flow?.nodes.length ?? 0,
            kontaktówWeszło: counts.get(a.id) ?? 0,
          })),
        );
      }

      case "engine_overview": {
        const since = Date.now() - 30 * DAY_MS;
        const [runs, jobs, sends, insights] = await Promise.all([
          db.select({ status: automationRuns.status }).from(automationRuns),
          db.select({ status: engineJobs.status }).from(engineJobs),
          db
            .select({ token: emailSends.token })
            .from(emailSends)
            .where(gte(emailSends.sentAt, since)),
          db
            .select({ severity: agentInsights.severity, title: agentInsights.title })
            .from(agentInsights)
            .where(inArray(agentInsights.status, ["new", "acknowledged"])),
        ]);

        const tokens = sends.map((s) => s.token);
        const opened = new Set<string>();
        const clicked = new Set<string>();
        if (tokens.length > 0) {
          const events = await db
            .select({ token: emailEvents.token, kind: emailEvents.kind })
            .from(emailEvents)
            .where(inArray(emailEvents.token, tokens.slice(0, 400)));
          for (const e of events) (e.kind === "open" ? opened : clicked).add(e.token);
        }

        const tally = <T extends { status: string }>(rows: T[]) => {
          const out: Record<string, number> = {};
          for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
          return out;
        };

        return JSON.stringify({
          przebiegi: tally(runs),
          kolejka: tally(jobs),
          wysłaneEmaile30d: tokens.length,
          unikalneOtwarcia: opened.size,
          unikalneKliknięcia: clicked.size,
          spostrzeżeniaNadzorcy: insights.map((i) => `${i.severity}: ${i.title}`),
        });
      }

      default:
        return JSON.stringify({ błąd: tr("Nieznane narzędzie „{name}”.", { name: name }) });
    }
  } catch (err) {
    return JSON.stringify({ błąd: String(err) });
  }
}

function buildSystemPrompt(knowledge: string | null): string {
  return [
    tr(
      "Jesteś PRM_Agent w trybie asystenta — pomagasz zespołowi placówki medycznej zrozumieć, co dzieje się w systemie PRM Core.",
    ),
    "",
    tr("MASZ WYŁĄCZNIE DOSTĘP DO ODCZYTU. Nie możesz nic zmienić, wysłać ani usunąć."),
    tr("Jeśli ktoś prosi o zmianę (dodanie tagu, wysłanie wiadomości, włączenie automatyzacji),"),
    tr("powiedz wprost, że tego nie zrobisz, i wskaż, gdzie w aplikacji można to zrobić ręcznie."),
    "",
    tr("ŹRÓDŁO FAKTÓW:"),
    tr("Liczby i fakty o bazie bierz WYŁĄCZNIE z narzędzi. Nie szacuj i nie zaokrąglaj w górę."),
    tr(
      "Zanim podasz jakąkolwiek liczbę, wywołaj narzędzie — nawet jeśli wydaje ci się, że znasz odpowiedź.",
    ),
    tr("Jeśli narzędzie czegoś nie zwraca, napisz, że system tego nie zapisuje. Nie zgaduj."),
    "",
    tr(
      "Fakty o ofercie placówki (ceny, godziny, zakres usług) bierz wyłącznie z bazy wiedzy poniżej.",
    ),
    tr("Czego tam nie ma, tego nie twierdź."),
    "",
    "STYL:",
    tr("- Po polsku, konkretnie, bez lania wody. Liczby podawaj wprost."),
    tr("- Jesteś narzędziem marketingowca i recepcji, nie lekarza — nie stawiaj diagnoz."),
    tr(
      "- Gdy widzisz problem w danych (zepsuta automatyzacja, brak zgód, dziwny wzorzec), powiedz o nim.",
    ),
    knowledge
      ? tr("\n## Baza wiedzy placówki\n{knowledge}", { knowledge: knowledge })
      : tr("\n## Baza wiedzy placówki\n(pusta — nie masz materiałów o ofercie placówki)"),
  ].join("\n");
}

/**
 * One copilot turn. Never throws: a missing key, a spent budget or a provider
 * outage come back as `{ ok: false, error }` for a toast.
 */
export async function askCopilot(
  history: CopilotTurn[],
  context: { userId: string; conversationId: string },
): Promise<CopilotResult> {
  const config = await getAiConfig();
  if (!(await getKeyStatus())[config.providerId]) {
    return {
      ok: false,
      error: tr(
        "Brak klucza API dostawcy {providerId} — uzupełnij go w Integracje → Klucze i dane dostępowe.",
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

  // The question is stored before the call: if the model fails, the transcript
  // should still show what was asked rather than losing the turn.
  const question = history[history.length - 1];
  if (question?.role === "user") {
    await saveTurn({ ...context, role: "user", text: question.text });
  }

  const knowledge = await knowledgeForPrompt();
  const system = buildSystemPrompt(knowledge);
  const messages: AiMessage[] = history.map((t) => ({ role: t.role, text: t.text }));

  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;
  const used: string[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await config.provider.complete({
        model: config.model,
        system,
        messages,
        tools: TOOLS,
        maxTokens: MAX_TOKENS,
      });

      tokensIn += completion.usage.inputTokens;
      tokensOut += completion.usage.outputTokens;
      costUsd += priceCall(config.providerId, config.model, completion.usage);

      // A server-side search hit its cap — resend to let the model carry on.
      if (completion.paused) {
        messages.push({ role: "assistant", raw: completion.raw });
        continue;
      }

      if (!completion.wantsTools || completion.toolCalls.length === 0) {
        await logStep({
          kind: "ai",
          message: tr("AI Copilot: „{v0}”.", {
            v0: history[history.length - 1]?.text.slice(0, 80) ?? "",
          }),
          detail: { feature: "copilot", tools: used.join(", ") },
          tokensIn,
          tokensOut,
          costUsd,
        });
        const answer = completion.text.trim();
        await saveTurn({
          ...context,
          role: "assistant",
          text: answer,
          tools: [...new Set(used)],
          tokensIn,
          tokensOut,
          costUsd,
        });
        return {
          ok: true,
          text: answer,
          used: [...new Set(used)],
          tokensIn,
          tokensOut,
          costUsd,
        };
      }

      messages.push({
        role: "assistant",
        text: completion.text,
        toolCalls: completion.toolCalls,
        raw: completion.raw,
      });

      const results = [];
      for (const call of completion.toolCalls) {
        used.push(call.name);
        results.push({ toolUseId: call.id, content: await runTool(call.name, call.input) });
      }
      messages.push({ role: "user", toolResults: results });
    }

    // Out of rounds: the spend already happened, so it is logged either way.
    await logStep({
      kind: "ai",
      message: tr("AI Copilot: przekroczono limit rund narzędzi bez odpowiedzi."),
      detail: { feature: "copilot", tools: used.join(", ") },
      tokensIn,
      tokensOut,
      costUsd,
    });
    return {
      ok: false,
      error: tr("Model nie doszedł do odpowiedzi w kilku krokach — spróbuj zapytać prościej."),
    };
  } catch (err) {
    if (tokensIn > 0) {
      // Tokens burned before the failure still count against the daily budget.
      await logStep({
        kind: "ai",
        message: tr("AI Copilot: wywołanie zakończone błędem."),
        detail: { feature: "copilot" },
        tokensIn,
        tokensOut,
        costUsd,
      });
    }
    return { ok: false, error: err instanceof AiProviderError ? err.message : String(err) };
  }
}

/** What the Copilot page shows about the model it is talking to. */
export async function copilotStatus(): Promise<{
  provider: string;
  model: string;
  keyConfigured: boolean;
  spentToday: number;
  dailyLimit: number;
  knowledgeEntries: number;
}> {
  const [config, limit] = await Promise.all([getAiConfig(), isOverDailyLimit()]);
  const rows = await getDb().select({ id: knowledgeEntries.id }).from(knowledgeEntries);

  return {
    provider: config.providerId,
    model: config.model,
    keyConfigured: (await getKeyStatus())[config.providerId],
    spentToday: limit.spent,
    dailyLimit: limit.limit,
    knowledgeEntries: rows.length,
  };
}

// ── transcript ──────────────────────────────────────────────────────────────

async function saveTurn(input: {
  userId: string;
  conversationId: string;
  role: "user" | "assistant";
  text: string;
  tools?: string[];
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}): Promise<void> {
  try {
    await getDb()
      .insert(copilotMessages)
      .values({
        id: randomUUID(),
        conversationId: input.conversationId,
        userId: input.userId,
        role: input.role,
        text: input.text,
        tools: input.tools ?? null,
        tokensIn: input.tokensIn ?? null,
        tokensOut: input.tokensOut ?? null,
        costUsd: input.costUsd ?? null,
        createdAt: Date.now(),
      });
  } catch (err) {
    // Losing the transcript must never lose the answer.
    console.error(tr("[Copilot] nie udało się zapisać tury"), err);
  }
}

export interface CopilotConversation {
  id: string;
  /** First question asked — what the list shows as the thread's name. */
  title: string;
  messages: number;
  lastAt: number;
}

/** This user's conversations from the retention window, newest first. */
export async function listCopilotConversations(userId: string): Promise<CopilotConversation[]> {
  const since = Date.now() - COPILOT_RETENTION_DAYS * DAY_MS;
  const rows = await getDb()
    .select()
    .from(copilotMessages)
    .where(and(eq(copilotMessages.userId, userId), gte(copilotMessages.createdAt, since)))
    .orderBy(desc(copilotMessages.createdAt));

  const byConversation = new Map<string, CopilotMessageRow[]>();
  for (const row of rows) {
    if (!byConversation.has(row.conversationId)) byConversation.set(row.conversationId, []);
    byConversation.get(row.conversationId)!.push(row);
  }

  return [...byConversation.entries()]
    .map(([id, msgs]) => {
      const ordered = [...msgs].sort((a, b) => a.createdAt - b.createdAt);
      const firstQuestion = ordered.find((m) => m.role === "user");
      return {
        id,
        title: (firstQuestion?.text ?? "(bez pytania)").slice(0, 80),
        messages: ordered.length,
        lastAt: ordered[ordered.length - 1].createdAt,
      };
    })
    .sort((a, b) => b.lastAt - a.lastAt);
}

/** One conversation's turns, oldest first. Scoped to the owner. */
export async function loadCopilotConversation(
  userId: string,
  conversationId: string,
): Promise<{ role: "user" | "assistant"; text: string; tools: string[] }[]> {
  const rows = await getDb()
    .select()
    .from(copilotMessages)
    .where(
      and(eq(copilotMessages.userId, userId), eq(copilotMessages.conversationId, conversationId)),
    )
    .orderBy(copilotMessages.createdAt);
  return rows.map((r) => ({ role: r.role, text: r.text, tools: r.tools ?? [] }));
}

export async function deleteCopilotConversation(
  userId: string,
  conversationId: string,
): Promise<void> {
  await getDb()
    .delete(copilotMessages)
    .where(
      and(eq(copilotMessages.userId, userId), eq(copilotMessages.conversationId, conversationId)),
    );
}

/**
 * Drops transcripts past the retention window. Called from the supervisor
 * sweep, next to the engine's own purge.
 */
export async function purgeCopilotHistory(): Promise<number> {
  const cutoff = Date.now() - COPILOT_RETENTION_DAYS * DAY_MS;
  const gone = await getDb()
    .delete(copilotMessages)
    .where(lt(copilotMessages.createdAt, cutoff))
    .returning({ id: copilotMessages.id });
  return gone.length;
}
