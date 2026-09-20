import process from "node:process";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { engineSettings } from "../db/schema";

const FALLBACK_BASE_URL = "http://localhost:8080";

async function getOrCreateRow() {
  const db = getDb();
  const existing = await db.select().from(engineSettings).get();
  if (existing) return existing;

  const now = new Date().toISOString();
  await db.insert(engineSettings).values({ baseUrl: "", enabled: 1, updatedAt: now });
  return db.select().from(engineSettings).get();
}

/**
 * Absolute origin for tracking pixels and click redirects in engine-sent mail.
 * Unlike a test send there is no incoming request to derive it from, so it
 * comes from APP_BASE_URL, or from the origin the UI last reported, or finally
 * the dev-server default.
 */
export async function getBaseUrl(): Promise<string> {
  const fromEnv = process.env.APP_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const row = await getOrCreateRow();
  return (row?.baseUrl || FALLBACK_BASE_URL).replace(/\/$/, "");
}

/** Called by the UI with `window.location.origin` so the engine knows where it lives. */
export async function saveBaseUrl(baseUrl: string): Promise<void> {
  const db = getDb();
  const existing = await getOrCreateRow();
  if (!existing || existing.baseUrl === baseUrl) return;
  await db
    .update(engineSettings)
    .set({ baseUrl, updatedAt: new Date().toISOString() })
    .where(eq(engineSettings.id, existing.id));
}

export async function isEngineEnabled(): Promise<boolean> {
  const row = await getOrCreateRow();
  return (row?.enabled ?? 1) === 1;
}

export async function setEngineEnabled(enabled: boolean): Promise<void> {
  const db = getDb();
  const existing = await getOrCreateRow();
  if (!existing) return;
  await db
    .update(engineSettings)
    .set({ enabled: enabled ? 1 : 0, updatedAt: new Date().toISOString() })
    .where(eq(engineSettings.id, existing.id));
}
