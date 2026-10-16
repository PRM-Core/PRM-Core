import { randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { leadWebhookSettings } from "../db/schema";

async function getOrCreateRow() {
  const db = getDb();
  const existing = await db.select().from(leadWebhookSettings).get();
  if (existing) return existing;

  const now = new Date().toISOString();
  await db.insert(leadWebhookSettings).values({ secret: randomUUID(), updatedAt: now });
  return db.select().from(leadWebhookSettings).get();
}

/** Server-only (`.server.ts` — excluded from the client bundle, unlike `leads-webhook.functions.ts` which is a normal shared module). Checked by the raw /api/webhooks/leads route. */
export async function getWebhookSecret(): Promise<string> {
  const row = await getOrCreateRow();
  return row?.secret ?? "";
}

/** How long the previous secret keeps working after a rotation. */
export const PREVIOUS_SECRET_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * A new secret; the old one stays valid for 24 hours, so the booking system
 * and the lead sources keep working until each is given the new one.
 */
export async function regenerateSecret(
  now = Date.now(),
  /** False after a leak: the old secret stops at once. */
  keepPrevious = true,
): Promise<string> {
  const db = getDb();
  const existing = await db.select().from(leadWebhookSettings).get();
  const updatedAt = new Date(now).toISOString();
  const secret = randomUUID();

  if (existing) {
    await db
      .update(leadWebhookSettings)
      .set({
        secret,
        previousSecret: keepPrevious ? existing.secret : "",
        previousUntil: keepPrevious ? now + PREVIOUS_SECRET_GRACE_MS : null,
        updatedAt,
      })
      .where(eq(leadWebhookSettings.id, existing.id));
  } else {
    await db.insert(leadWebhookSettings).values({ secret, updatedAt });
  }

  return secret;
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Which secret the caller sent: the current one, the previous one within its
 * 24 hours (the caller still needs updating — worth a log line), or none.
 * Compared in constant time, so the answer's timing says nothing.
 */
export async function checkWebhookSecret(
  provided: string,
  now = Date.now(),
): Promise<{ ok: true; previous: boolean; previousUntil: number | null } | { ok: false }> {
  if (!provided) return { ok: false };
  const row = await getOrCreateRow();
  if (!row) return { ok: false };
  if (same(provided, row.secret)) return { ok: true, previous: false, previousUntil: null };
  if (
    row.previousSecret &&
    row.previousUntil &&
    now < row.previousUntil &&
    same(provided, row.previousSecret)
  )
    return { ok: true, previous: true, previousUntil: row.previousUntil };
  return { ok: false };
}
