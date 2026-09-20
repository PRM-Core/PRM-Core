import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { automations, automationRuns, contacts, engineLog } from "../db/schema";
import { getAiConfig, isOverDailyLimit, getKeyStatus } from "./settings.server";
import { priceCall, type AiToolDef } from "./provider.server";
import { logStep } from "../engine/log.server";
import type { InsightDraft } from "../engine/supervisor.server";
import { t } from "@/lib/i18n";

// The model half of M4. It does NOT count anything: the deterministic
// detectors already did that, and a model asked to tally rows will get it
// wrong sooner or later. This pass looks at the same picture and proposes what
// counting cannot — patterns worth acting on, like a segment that keeps
// showing up or an automation nobody has ever finished.

const MAX_TOKENS = 2000;
const WINDOW_DAYS = 7;

interface EngineSnapshot {
  automations: Array<{
    name: string;
    status: string;
    runs: number;
    failed: number;
    completed: number;
  }>;
  topSegments: Array<{ segment: string; contacts: number }>;
  topTags: Array<{ tag: string; contacts: number }>;
  contactsTotal: number;
  contactsByStatus: Record<string, number>;
  recentErrors: string[];
  findings: string[];
}

/** Facts for the model to interpret — all of it already computed, none of it guessed. */
async function buildSnapshot(deterministic: InsightDraft[]): Promise<EngineSnapshot> {
  const db = getDb();
  const since = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const [autos, runs, people, errors] = await Promise.all([
    db.select().from(automations),
    db
      .select({ automationId: automationRuns.automationId, status: automationRuns.status })
      .from(automationRuns)
      .where(gte(automationRuns.startedAt, since)),
    db.select().from(contacts),
    db
      .select({ message: engineLog.message })
      .from(engineLog)
      .where(and(eq(engineLog.kind, "error"), gte(engineLog.createdAt, since)))
      .orderBy(desc(engineLog.createdAt))
      .limit(15),
  ]);

  const runStats = new Map<string, { runs: number; failed: number; completed: number }>();
  for (const run of runs) {
    const entry = runStats.get(run.automationId) ?? { runs: 0, failed: 0, completed: 0 };
    entry.runs += 1;
    if (run.status === "failed") entry.failed += 1;
    if (run.status === "completed") entry.completed += 1;
    runStats.set(run.automationId, entry);
  }

  const segmentCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const byStatus: Record<string, number> = {};
  for (const person of people) {
    for (const segment of person.segments ?? []) {
      segmentCounts.set(segment, (segmentCounts.get(segment) ?? 0) + 1);
    }
    for (const tag of person.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    byStatus[person.status] = (byStatus[person.status] ?? 0) + 1;
  }

  const top = (map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  return {
    automations: autos.map((a) => ({
      name: a.name,
      status: a.status,
      ...(runStats.get(a.id) ?? { runs: 0, failed: 0, completed: 0 }),
    })),
    topSegments: top(segmentCounts).map(([segment, count]) => ({ segment, contacts: count })),
    topTags: top(tagCounts).map(([tag, count]) => ({ tag, contacts: count })),
    contactsTotal: people.length,
    contactsByStatus: byStatus,
    recentErrors: errors.map((e) => e.message.slice(0, 160)),
    findings: deterministic.map((d) => `[${d.severity}] ${d.title}`),
  };
}

function buildTool(): AiToolDef {
  return {
    name: "report_insights",
    description: t(
      "Zgłasza spostrzeżenia o stanie systemu. Wywołaj dokładnie raz. Jeśli nie widzisz nic wartego uwagi, zwróć pustą listę.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        insights: {
          type: "array",
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["performance", "security", "pattern"] },
              severity: { type: "string", enum: ["info", "warning", "critical"] },
              title: { type: "string", description: t("Jedno zdanie, po polsku, konkretnie.") },
              detail: { type: "string", description: t("Na czym opierasz to spostrzeżenie.") },
              proposedAction: {
                type: "string",
                description: t("Co użytkownik może z tym zrobić."),
              },
            },
            required: ["kind", "severity", "title", "detail", "proposedAction"],
          },
        },
      },
      required: ["insights"],
    },
  };
}

const SYSTEM = () =>
  t(
    'Jesteś nadzorcą systemu PRM Core — CRM i automatyzacji komunikacji z pacjentami placówki medycznej.\n\nDostajesz zrzut stanu systemu: automatyzacje z liczbą przebiegów, segmenty i tagi kontaktów, ostatnie błędy oraz listę spostrzeżeń, które już wykryły detektory deterministyczne.\n\nTwoje zadanie: dołożyć **to, czego liczenie nie pokaże** — wzorce i wnioski. Na przykład: segment, który urósł na tyle, że warto zrobić dla niego osobną komunikację; automatyzacja aktywna od dawna, do której nikt nie wchodzi (zły wyzwalacz); powtarzający się motyw w błędach; automatyzacja, która startuje, ale prawie nigdy nie kończy.\n\nZasady, bez wyjątków:\n1. **Nie powtarzaj spostrzeżeń, które są już na liście detektorów.** Zostały zgłoszone i użytkownik je widzi.\n2. **Nie zmyślaj liczb.** Używaj wyłącznie tych ze zrzutu. Jeśli czegoś nie ma w danych, nie twierdź, że jest.\n3. Maksymalnie 4 spostrzeżenia. Lepiej dwa trafne niż cztery oczywiste.\n4. Poziom "critical" tylko wtedy, gdy coś realnie szkodzi pacjentom albo danym. Wzorce i propozycje to "info".\n5. Pisz po polsku, zwięźle, bez marketingowego tonu. Pole proposedAction ma być czynnością, którą da się wykonać w tym systemie.\n6. Jeśli dane są zbyt ubogie na sensowne wnioski (mało kontaktów, brak przebiegów) — zwróć pustą listę. To poprawna odpowiedź.',
  );

interface RawInsight {
  kind?: string;
  severity?: string;
  title?: string;
  detail?: string;
  proposedAction?: string;
}

/**
 * Tool arguments are not as uniform as the schema suggests: a model can hand
 * back the array as a JSON string, or a single object instead of a list of one.
 * Observed in practice with Haiku on this very tool, so the shape is normalised
 * here rather than trusting the cast — a supervisor that crashes on the model's
 * punctuation is worse than useless.
 */
function normaliseInsights(value: unknown): RawInsight[] {
  if (Array.isArray(value)) return value as RawInsight[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as RawInsight[]) : [parsed as RawInsight];
    } catch {
      return [];
    }
  }
  if (value && typeof value === "object") return [value as RawInsight];
  return [];
}

export interface AiSupervisorResult {
  drafts: InsightDraft[];
  used: boolean;
  error?: string;
}

/**
 * Never throws and never blocks the sweep: a missing key, a spent budget or a
 * provider outage just means the deterministic findings stand on their own.
 */
export async function runAiSupervisor(deterministic: InsightDraft[]): Promise<AiSupervisorResult> {
  const config = await getAiConfig();
  if (!(await getKeyStatus())[config.providerId]) {
    return {
      drafts: [],
      used: false,
      error: t("Brak klucza API dostawcy AI — pominięto analizę modelem."),
    };
  }

  const limit = await isOverDailyLimit();
  if (limit.over) {
    return {
      drafts: [],
      used: false,
      error: t("Dzienny limit kosztów AI wyczerpany (${v0} / ${v1}) — pominięto analizę modelem.", {
        v0: limit.spent.toFixed(4),
        v1: limit.limit.toFixed(2),
      }),
    };
  }

  try {
    const snapshot = await buildSnapshot(deterministic);
    const completion = await config.provider.complete({
      model: config.model,
      system: SYSTEM(),
      messages: [{ role: "user", text: JSON.stringify(snapshot, null, 1) }],
      tools: [buildTool()],
      maxTokens: MAX_TOKENS,
    });

    const costUsd = priceCall(config.providerId, config.model, completion.usage);
    await logStep({
      kind: "ai",
      message: t("Nadzorca PRM_Agent — analiza stanu systemu."),
      detail: { feature: "supervisor" },
      tokensIn: completion.usage.inputTokens,
      tokensOut: completion.usage.outputTokens,
      costUsd,
    });

    const call = completion.toolCalls.find((c) => c.name === "report_insights");
    if (!call) return { drafts: [], used: true, error: t("Model nie zwrócił spostrzeżeń.") };

    const drafts: InsightDraft[] = normaliseInsights(call.input.insights)
      .filter((i) => i.title && i.proposedAction)
      .map((i) => ({
        // Signature keyed on the title so the same observation next sweep folds
        // into one row instead of piling up near-duplicates.
        signature: `ai:${(i.title ?? "").toLowerCase().slice(0, 60)}`,
        kind: (["performance", "security", "pattern"].includes(i.kind ?? "")
          ? i.kind
          : "pattern") as InsightDraft["kind"],
        severity: (["info", "warning", "critical"].includes(i.severity ?? "")
          ? i.severity
          : "info") as InsightDraft["severity"],
        title: i.title as string,
        detail: i.detail ?? "",
        proposedAction: i.proposedAction as string,
        fromAi: true,
      }));

    return { drafts, used: true };
  } catch (err) {
    return {
      drafts: [],
      used: false,
      error: t("Analiza modelem nie powiodła się: {v0}", { v0: String(err) }),
    };
  }
}
