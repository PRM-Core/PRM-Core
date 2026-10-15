import { and, eq, gte, like, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { aiSettings, automations, engineLog } from "../db/schema";
import type { AiProviderId } from "../db/schema";
import { localProvider } from "./local.server";
import { aiMode, localEndpoint } from "./boundary.server";
import type { AiMode } from "./boundary";
import { redactText } from "./redact";
import {
  AiProviderError,
  PROVIDER_ENV_VARS,
  type AiCompleteInput,
  type AiProvider,
} from "./provider.server";
import { t } from "@/lib/i18n";

// Resolves the provider PRM_Agent runs on and enforces the data boundary
// (PRM_AI_MODE). There is one provider: a model endpoint inside the clinic's
// perimeter. Since 2.0.0 the product has no adapter for a cloud provider, so
// nothing here can be configured to send text outside — the only choice left
// is whether a local model is used at all.
//
// The daily spend ceiling stays as a shape: a local model costs nothing per
// token, so it never trips, and every caller keeps one code path.

/** What stands in for a model when `PRM_AI_MODE=off`: every call fails with the reason. */
function disabledProvider(id: AiProviderId): AiProvider {
  return {
    id,
    supportsWebSearch: false,
    async complete() {
      throw new AiProviderError(
        t(
          "Model językowy jest wyłączony (PRM_AI_MODE=off). Wskaż serwer modelu w sieci placówki (PRM_AI_LOCAL_URL, PRM_AI_LOCAL_MODEL), żeby włączyć funkcje językowe; reszta agenta działa bez modelu.",
        ),
        id,
      );
    },
  };
}

/**
 * The pseudonymisation boundary. Every provider the rest of the code gets is
 * wrapped here, so no prompt builder can send a request that skips it: the
 * known identifiers of the request plus everything recognisable by shape are
 * replaced in the system prompt, every message, every tool result. The model
 * runs inside the perimeter, and still never learns who the patient is.
 */
export function withRedaction(provider: AiProvider): AiProvider {
  return {
    id: provider.id,
    supportsWebSearch: provider.supportsWebSearch,
    complete: (input: AiCompleteInput) => provider.complete(redactRequest(input)),
  };
}

export function redactRequest(input: AiCompleteInput): AiCompleteInput {
  const known = input.identifiers ?? {};
  return {
    ...input,
    system: redactText(input.system, known),
    messages: input.messages.map((m) => {
      // The model's own turns are echoed back as they came — they were
      // produced from redacted input, so there is nothing of ours in them.
      // What we add is redacted: the user turns and every tool result.
      if (m.role !== "user") return m;
      return {
        ...m,
        text: m.text === undefined ? undefined : redactText(m.text, known),
        toolResults: m.toolResults?.map((tr) => ({
          ...tr,
          content: redactText(tr.content, known),
        })),
      };
    }),
  };
}

async function getOrCreateRow() {
  const db = getDb();
  const existing = await db.select().from(aiSettings).get();
  if (existing) return existing;

  const now = new Date().toISOString();
  await db.insert(aiSettings).values({
    provider: "local",
    model: "",
    dailyLimitUsd: 5,
    updatedAt: now,
  });
  return db.select().from(aiSettings).get();
}

export interface ResolvedAiConfig {
  provider: AiProvider;
  providerId: AiProviderId;
  model: string;
  dailyLimitUsd: number;
  mode: AiMode;
}

/** The provider in force: the local adapter in `local`, the explaining stub in `off`. */
export async function getAiConfig(): Promise<ResolvedAiConfig> {
  const row = await getOrCreateRow();
  const mode = aiMode();
  const dailyLimitUsd = row?.dailyLimitUsd ?? 5;
  const model = localEndpoint().model;
  if (mode === "local")
    return {
      provider: withRedaction(localProvider),
      providerId: "local",
      model,
      dailyLimitUsd,
      mode,
    };
  return { provider: disabledProvider("local"), providerId: "local", model, dailyLimitUsd, mode };
}

/**
 * Whether the provider is usable. In `off` mode it reports true: nothing is
 * missing on the configuration side, and the call itself explains the mode.
 */
export async function getKeyStatus(): Promise<Record<AiProviderId, boolean>> {
  const endpoint = localEndpoint();
  const local = !!endpoint.url && !!endpoint.model && endpoint.hostClass !== "public";
  return { local: aiMode() === "off" ? true : local };
}

export function envVarFor(provider: AiProviderId): string {
  return PROVIDER_ENV_VARS[provider];
}

/** Local midnight — the day the limits count. */
function midnight(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** USD spent on AI steps since local midnight, summed from the engine log. Zero with a local model. */
export async function getSpendToday(): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ costUsd: engineLog.costUsd })
    .from(engineLog)
    .where(and(eq(engineLog.kind, "ai"), gte(engineLog.createdAt, midnight())));
  return rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
}

/** Model runs since local midnight — every "ai" entry of the engine log, or one automation's. */
export async function getCallsToday(automationId?: string): Promise<number> {
  const db = getDb();
  const conditions = [eq(engineLog.kind, "ai"), gte(engineLog.createdAt, midnight())];
  if (automationId) conditions.push(eq(engineLog.automationId, automationId));
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(engineLog)
    .where(and(...conditions))
    .get();
  return row?.n ?? 0;
}

export interface LimitState {
  over: boolean;
  used: number;
  limit: number;
  /** A sentence for whoever reads why a step did not use the model. */
  reason: string;
}

/** The installation's daily model runs against its limit. */
export async function isOverDailyLimit(): Promise<LimitState> {
  const row = await getOrCreateRow();
  const limit = row?.dailyCallLimit ?? 2000;
  const used = await getCallsToday();
  return {
    over: used >= limit,
    used,
    limit,
    reason: t(
      "Dzienny limit uruchomień modelu wyczerpany ({used} / {limit}) — do północy kroki z modelem są pomijane. Limit ustawia administrator w Ustawienia → PRM_Agent.",
      { used, limit },
    ),
  };
}

/** One automation's daily model runs against its own limit. */
export async function automationOverLimit(automationId: string): Promise<LimitState> {
  const db = getDb();
  const auto = await db
    .select({ name: automations.name, limit: automations.aiCallsPerDay })
    .from(automations)
    .where(eq(automations.id, automationId))
    .get();
  const limit = auto?.limit ?? 100;
  const used = await getCallsToday(automationId);
  const over = used >= limit;
  const reason =
    limit === 0
      ? t("Automatyzacja „{name}” nie korzysta z modelu (limit 0).", { name: auto?.name ?? "" })
      : t(
          "Automatyzacja „{name}” wykorzystała dzienny limit uruchomień modelu ({used} / {limit}).",
          { name: auto?.name ?? "", used, limit },
        );
  // Said once a day in the log, not on every patient that passes the node.
  if (over && limit > 0) {
    const already = await db
      .select({ id: engineLog.id })
      .from(engineLog)
      .where(
        and(
          eq(engineLog.automationId, automationId),
          gte(engineLog.createdAt, midnight()),
          like(engineLog.detail, '%"source":"agent-budget"%'),
        ),
      )
      .limit(1)
      .get();
    if (!already) {
      const { logStep } = await import("../engine/log.server");
      await logStep({
        automationId,
        kind: "agent",
        message: t("{reason} Do północy jej węzły agenta idą pierwszą ścieżką.", { reason }),
        detail: { source: "agent-budget", used: String(used), limit: String(limit) },
      });
    }
  }
  return { over, used, limit, reason };
}

export async function saveDailyCallLimit(limit: number): Promise<void> {
  const db = getDb();
  const row = await getOrCreateRow();
  if (!row) return;
  await db
    .update(aiSettings)
    .set({ dailyCallLimit: Math.max(0, Math.round(limit)), updatedAt: new Date().toISOString() })
    .where(eq(aiSettings.id, row.id));
}
