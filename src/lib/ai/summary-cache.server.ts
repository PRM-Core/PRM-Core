import { eq, lt, notInArray, or } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contactSummaries, contacts } from "../db/schema";

/**
 * Storage of the card's last PRM_Agent summary — the table only, no model.
 * Kept apart from contact-agent.server.ts so the code that deletes a patient
 * can forget the summary without loading the model layer.
 */

/** A summary older than this is dropped by the supervisor sweep, whatever the facts. */
export const SUMMARY_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

export type CachedSummaryRow = typeof contactSummaries.$inferSelect;

export async function readSummary(contactId: string): Promise<CachedSummaryRow | null> {
  const row = await getDb()
    .select()
    .from(contactSummaries)
    .where(eq(contactSummaries.contactId, contactId))
    .get();
  return row ?? null;
}

export async function storeSummary(row: CachedSummaryRow): Promise<void> {
  const { contactId, ...rest } = row;
  await getDb()
    .insert(contactSummaries)
    .values({ contactId, ...rest })
    .onConflictDoUpdate({ target: contactSummaries.contactId, set: rest });
}

/** The patient is deleted: the summary is a copy of the record and goes with it. */
export async function forgetSummary(contactId: string): Promise<void> {
  await getDb().delete(contactSummaries).where(eq(contactSummaries.contactId, contactId));
}

/**
 * Summaries past retention, and any whose patient is gone by a path that did
 * not call `forgetSummary` (a bulk import replacing rows, a restore). Called
 * from the supervisor sweep.
 */
export async function purgeSummaries(now = Date.now()): Promise<number> {
  const db = getDb();
  const cutoff = now - SUMMARY_RETENTION_DAYS * DAY_MS;
  const gone = await db
    .delete(contactSummaries)
    .where(
      or(
        lt(contactSummaries.createdAt, cutoff),
        notInArray(contactSummaries.contactId, db.select({ id: contacts.id }).from(contacts)),
      ),
    )
    .returning({ id: contactSummaries.contactId });
  return gone.length;
}
