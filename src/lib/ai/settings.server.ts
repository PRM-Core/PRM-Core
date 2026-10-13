import { eq, gte, and } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { aiSettings, engineLog } from "../db/schema";
import type { AiProviderId } from "../db/schema";
import { anthropicProvider } from "./anthropic.server";
import { openaiProvider } from "./openai.server";
import { geminiProvider } from "./gemini.server";
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
import { getCredentials } from "@/lib/credentials/store.server";
import { t } from "@/lib/i18n";

// Resolves which provider the PRM_Agent runs on, enforces the data boundary
// (PRM_AI_MODE) and the daily spend ceiling. The ceiling deliberately stops
// only AI steps — the deterministic engine keeps executing so a cost cap
// never silently halts email, SMS, or tag automations.

const HOSTED: Record<Exclude<AiProviderId, "local">, AiProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: geminiProvider,
};

/** What stands in for a model when `PRM_AI_MODE=off`: every call fails with the reason. */
function disabledProvider(id: AiProviderId): AiProvider {
  return {
    id,
    supportsWebSearch: false,
    async complete() {
      throw new AiProviderError(
        t(
          "PRM_Agent jest wyłączony (PRM_AI_MODE=off). Ustaw PRM_AI_MODE=local z modelem w sieci placówki albo PRM_AI_MODE=hosted, żeby włączyć funkcje AI.",
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
 * replaced in the system prompt, every message, every tool result.
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
      // The model's own turns are echoed back as they came (Claude verifies
      // its thinking blocks by signature) — they were produced from redacted
      // input, so there is nothing of ours in them. What we add is redacted:
      // the user turns and every tool result.
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
    provider: "anthropic",
    model: "claude-opus-5",
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

/**
 * The provider in force. The mode wins over the saved choice: in `local` the
 * local adapter is used whatever the settings row says, in `off` nothing is;
 * the row's hosted provider applies only in `hosted`.
 */
export async function getAiConfig(): Promise<ResolvedAiConfig> {
  const row = await getOrCreateRow();
  const mode = aiMode();
  const saved = (row?.provider ?? "anthropic") as AiProviderId;
  const hostedId: Exclude<AiProviderId, "local"> = saved === "local" ? "anthropic" : saved;
  const dailyLimitUsd = row?.dailyLimitUsd ?? 5;

  if (mode === "local") {
    return {
      provider: withRedaction(localProvider),
      providerId: "local",
      model: localEndpoint().model,
      dailyLimitUsd,
      mode,
    };
  }
  const model = row?.model ?? "claude-opus-5";
  if (mode === "off") {
    return {
      provider: disabledProvider(hostedId),
      providerId: hostedId,
      model,
      dailyLimitUsd,
      mode,
    };
  }
  return {
    provider: withRedaction(HOSTED[hostedId]),
    providerId: hostedId,
    model,
    dailyLimitUsd,
    mode,
  };
}

export async function saveAiConfig(input: {
  provider: AiProviderId;
  model: string;
  dailyLimitUsd: number;
}): Promise<void> {
  const db = getDb();
  const existing = await getOrCreateRow();
  if (!existing) return;
  await db
    .update(aiSettings)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(eq(aiSettings.id, existing.id));
}

/**
 * Whether each provider is usable. Booleans only — key values never leave
 * the server. In `off` mode the configured provider reports true: nothing is
 * missing on the key side, and the call itself explains the mode.
 */
export async function getKeyStatus(): Promise<Record<AiProviderId, boolean>> {
  const c = await getCredentials("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY");
  const endpoint = localEndpoint();
  const status: Record<AiProviderId, boolean> = {
    anthropic: !!c.ANTHROPIC_API_KEY,
    openai: !!c.OPENAI_API_KEY,
    google: !!c.GOOGLE_API_KEY,
    local: !!endpoint.url && !!endpoint.model && endpoint.hostClass !== "public",
  };
  if (aiMode() === "off") {
    const { providerId } = await getAiConfig();
    status[providerId] = true;
  }
  return status;
}

export function envVarFor(provider: AiProviderId): string {
  return PROVIDER_ENV_VARS[provider];
}

/** USD spent on AI steps since local midnight, summed from the engine log. */
export async function getSpendToday(): Promise<number> {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  const db = getDb();
  const rows = await db
    .select({ costUsd: engineLog.costUsd })
    .from(engineLog)
    .where(and(eq(engineLog.kind, "ai"), gte(engineLog.createdAt, midnight.getTime())));

  return rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
}

export async function isOverDailyLimit(): Promise<{ over: boolean; spent: number; limit: number }> {
  const [{ dailyLimitUsd }, spent] = await Promise.all([getAiConfig(), getSpendToday()]);
  return { over: spent >= dailyLimitUsd, spent, limit: dailyLimitUsd };
}
