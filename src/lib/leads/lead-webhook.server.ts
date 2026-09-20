import { randomUUID } from "node:crypto";
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

export async function regenerateSecret(): Promise<string> {
  const db = getDb();
  const existing = await db.select().from(leadWebhookSettings).get();
  const now = new Date().toISOString();
  const secret = randomUUID();

  if (existing) {
    await db
      .update(leadWebhookSettings)
      .set({ secret, updatedAt: now })
      .where(eq(leadWebhookSettings.id, existing.id));
  } else {
    await db.insert(leadWebhookSettings).values({ secret, updatedAt: now });
  }

  return secret;
}
