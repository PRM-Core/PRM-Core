import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { popupQueue } from "../db/schema";
import type { PopupQueueRow } from "../db/schema";
import type { PopupConfig } from "../content-builder";

// M5: popups addressed to ONE patient. The show_popup action puts a row here;
// /popup-active hands it to the tracker the next time that patient is
// recognised on the site (by the click token from an email link), and
// /api/popups/shown confirms it was actually rendered.
//
// Server-only on purpose (node:crypto + the DB client) — routes import this
// file directly, RPC callers go through *.functions.ts. See CONTRIBUTING.md.

/** How long a queued popup waits for the patient to come back. */
const QUEUE_TTL_DAYS = 30;

export async function queuePopupForContact(input: {
  contactId: string;
  contentItemId: string;
  name: string;
  html: string;
  config: PopupConfig;
  automationId?: string | null;
  runId?: string | null;
  nodeId?: string | null;
}): Promise<{ queued: boolean; id: string | null }> {
  const db = getDb();

  // The same popup queued twice for one patient (a looping graph, a re-run)
  // would just sit in the queue twice and show up on two page views. One
  // pending copy per popup per contact is the honest interpretation of
  // "pokaż temu pacjentowi X".
  const existing = await db
    .select({ id: popupQueue.id })
    .from(popupQueue)
    .where(
      and(
        eq(popupQueue.contactId, input.contactId),
        eq(popupQueue.contentItemId, input.contentItemId),
        isNull(popupQueue.shownAt),
        gt(popupQueue.expiresAt, Date.now()),
      ),
    )
    .get();
  if (existing) return { queued: false, id: existing.id };

  const id = randomUUID();
  await db.insert(popupQueue).values({
    id,
    contactId: input.contactId,
    contentItemId: input.contentItemId,
    name: input.name,
    html: input.html,
    config: input.config,
    automationId: input.automationId ?? null,
    runId: input.runId ?? null,
    nodeId: input.nodeId ?? null,
    createdAt: Date.now(),
    expiresAt: Date.now() + QUEUE_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
  return { queued: true, id };
}

/** Everything still waiting for this contact, oldest first. */
export async function pendingPopupsForContact(contactId: string): Promise<PopupQueueRow[]> {
  const db = getDb();
  return db
    .select()
    .from(popupQueue)
    .where(
      and(
        eq(popupQueue.contactId, contactId),
        isNull(popupQueue.shownAt),
        gt(popupQueue.expiresAt, Date.now()),
      ),
    )
    .orderBy(asc(popupQueue.createdAt));
}

/**
 * Marks a queued popup as delivered. Called from the tracker AFTER it renders
 * the popup, not when /popup-active hands it over: being returned is not the
 * same as being shown (capping, device and URL rules are all evaluated in the
 * browser, and any of them can veto it).
 *
 * Returns the row so the caller can log the delivery against its automation.
 */
export async function markPopupShown(queueId: string): Promise<PopupQueueRow | null> {
  const db = getDb();
  const row = await db.select().from(popupQueue).where(eq(popupQueue.id, queueId)).get();
  if (!row || row.shownAt) return null;
  await db.update(popupQueue).set({ shownAt: Date.now() }).where(eq(popupQueue.id, queueId));
  return row;
}
