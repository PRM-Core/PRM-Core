import process from "node:process";
import { eq, gte, and } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { aiSettings, engineLog } from "../db/schema";
import type { AiProviderId } from "../db/schema";
import { anthropicProvider } from "./anthropic.server";
import { openaiProvider } from "./openai.server";
import { geminiProvider } from "./gemini.server";
import { PROVIDER_ENV_VARS, type AiProvider } from "./provider.server";
import { getCredentials } from "@/lib/credentials/store.server";

// Resolves which provider the PRM_Agent runs on, and enforces the daily
// spend ceiling. The ceiling deliberately stops only AI steps — the
// deterministic engine keeps executing so a cost cap never silently halts
// email, SMS, or tag automations.

const PROVIDERS: Record<AiProviderId, AiProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: geminiProvider,
};

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
}

export async function getAiConfig(): Promise<ResolvedAiConfig> {
  const row = await getOrCreateRow();
  const providerId = (row?.provider ?? "anthropic") as AiProviderId;
  return {
    provider: PROVIDERS[providerId],
    providerId,
    model: row?.model ?? "claude-opus-5",
    dailyLimitUsd: row?.dailyLimitUsd ?? 5,
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

/** Whether each provider's key is present in .env. Booleans only — key values never leave the server. */
export async function getKeyStatus(): Promise<Record<AiProviderId, boolean>> {
  const c = await getCredentials("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY");
  return {
    anthropic: !!c.ANTHROPIC_API_KEY,
    openai: !!c.OPENAI_API_KEY,
    google: !!c.GOOGLE_API_KEY,
  };
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
