import process from "node:process";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { engineSettings } from "../db/schema";
import { DEFAULT_SEND_WINDOW, countSent, gateMessage, type MessageGate } from "./send-window";

const FALLBACK_BASE_URL = "http://localhost:8080";

async function getOrCreateRow() {
  const db = getDb();
  const existing = await db.select().from(engineSettings).get();
  if (existing) return existing;

  const now = new Date().toISOString();
  // A new installation starts with a sending window; one upgraded from before
  // 2.12.0 keeps its row, and with it "any hour", until someone sets one.
  await db
    .insert(engineSettings)
    .values({ baseUrl: "", enabled: 1, ...DEFAULT_SEND_WINDOW, updatedAt: now });
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

// ── when automation messages may go out ──────────────────────────────────────

export interface SendSettings {
  sendFrom: string;
  sendTo: string;
  perHourLimit: number | null;
  perDayLimit: number | null;
  /** Automation messages sent so far today (Warsaw day). */
  sentToday: number;
}

export async function getSendSettings(now = Date.now()): Promise<SendSettings> {
  const row = await getOrCreateRow();
  const { warsawDay } = await import("../visits/warsaw-time");
  return {
    sendFrom: row?.sendFrom ?? "",
    sendTo: row?.sendTo ?? "",
    perHourLimit: row?.perHourLimit ?? null,
    perDayLimit: row?.perDayLimit ?? null,
    sentToday: row && row.dayKey === warsawDay(now) ? row.daySentCount : 0,
  };
}

export async function saveSendSettings(input: {
  sendFrom: string;
  sendTo: string;
  perHourLimit: number | null;
  perDayLimit: number | null;
}): Promise<void> {
  const existing = await getOrCreateRow();
  if (!existing) return;
  await getDb()
    .update(engineSettings)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(eq(engineSettings.id, existing.id));
}

/**
 * May one automation message go out now? Moves the counters' windows on and
 * saves them; the message itself is counted by `recordMessageSent` only once
 * it actually went, so a step skipped for want of consent costs nothing.
 */
export async function gateAutomationMessage(
  ignoreWindow: boolean,
  now = Date.now(),
): Promise<MessageGate & { sendFrom: string; sendTo: string }> {
  const row = await getOrCreateRow();
  if (!row) {
    return {
      send: true,
      nextAt: now,
      blockedBy: null,
      state: { hourWindowAt: now, hourSentCount: 0, dayKey: "", daySentCount: 0 },
      sendFrom: "",
      sendTo: "",
    };
  }
  const gate = gateMessage(
    {
      sendFrom: row.sendFrom,
      sendTo: row.sendTo,
      perHourLimit: row.perHourLimit,
      perDayLimit: row.perDayLimit,
      hourWindowAt: row.hourWindowAt,
      hourSentCount: row.hourSentCount,
      dayKey: row.dayKey,
      daySentCount: row.daySentCount,
    },
    now,
    ignoreWindow,
  );
  await getDb().update(engineSettings).set(gate.state).where(eq(engineSettings.id, row.id));
  return { ...gate, sendFrom: row.sendFrom, sendTo: row.sendTo };
}

/** One automation message went out — it counts toward the hour and the day. */
export async function recordMessageSent(gate: MessageGate): Promise<void> {
  const row = await getOrCreateRow();
  if (!row) return;
  await getDb()
    .update(engineSettings)
    .set(countSent(gate.state))
    .where(eq(engineSettings.id, row.id));
}
