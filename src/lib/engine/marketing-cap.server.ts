import { randomUUID } from "node:crypto";
import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { engineSettings, marketingTouches } from "../db/schema";

// The weekly cap on marketing messages per patient, across every automation
// and campaign. Each automation is reasonable on its own; five of them with a
// newsletter on top are not, and the patient unsubscribes from all of it.
// Counted from a ledger written when a marketing message actually went out —
// the send tables do not say whether a message was marketing.

export const WEEK_MS = 7 * 86_400_000;

/** Marketing messages this patient got in the last 7 days. */
export async function marketingThisWeek(contactId: string, now = Date.now()): Promise<number> {
  const row = await getDb()
    .select({ n: count() })
    .from(marketingTouches)
    .where(
      and(eq(marketingTouches.contactId, contactId), gte(marketingTouches.sentAt, now - WEEK_MS)),
    )
    .get();
  return row?.n ?? 0;
}

/** The installation's cap; null when there is none. */
export async function marketingCap(): Promise<number | null> {
  const row = await getDb()
    .select({ cap: engineSettings.marketingPerWeek })
    .from(engineSettings)
    .get();
  const cap = row?.cap ?? null;
  return cap !== null && cap >= 1 ? cap : null;
}

/**
 * Would one more marketing message break the cap for this patient? `null`
 * when it would not (or there is no cap); otherwise the count and the cap,
 * for the log line that says why the step was skipped.
 */
export async function overMarketingCap(
  contactId: string,
  now = Date.now(),
): Promise<{ sent: number; cap: number } | null> {
  const cap = await marketingCap();
  if (cap === null) return null;
  const sent = await marketingThisWeek(contactId, now);
  return sent >= cap ? { sent, cap } : null;
}

/** One marketing message went to this patient. */
export async function recordMarketingTouch(input: {
  contactId: string;
  channel: "email" | "sms";
  source: "automation" | "campaign";
  automationId?: string | null;
  campaignId?: string | null;
  at?: number;
}): Promise<void> {
  await getDb()
    .insert(marketingTouches)
    .values({
      id: randomUUID(),
      contactId: input.contactId,
      channel: input.channel,
      source: input.source,
      automationId: input.automationId ?? null,
      campaignId: input.campaignId ?? null,
      sentAt: input.at ?? Date.now(),
    });
}
