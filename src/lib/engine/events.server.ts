import { randomUUID } from "node:crypto";
import { eq, and, isNull, asc } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { engineEvents, emailSends, contacts } from "../db/schema";
import type { EngineEventRow, EngineEventType } from "../db/schema";
import { t } from "@/lib/i18n";

// The engine's single event bus. Everything the system genuinely observes is
// written here from the write points that already existed (/collect, /e/open,
// /e/click, the form and survey collectors, contact creation, funnel progress)
// — no new collection infrastructure, just one extra insert next to each.
//
// Server-only (`.server.ts`): `randomUUID` from node:crypto blows up the page
// if it reaches the client bundle, which is why this is not a *.functions.ts.

/**
 * Records one event. Never throws — an automation bus problem must not break
 * the user-facing write it is attached to (a lead still gets saved even if the
 * engine is unhappy), so failures are logged and swallowed.
 */
export async function emitEvent(input: {
  type: EngineEventType;
  contactId?: string | null;
  payload?: Record<string, string>;
}): Promise<void> {
  try {
    const db = getDb();
    await db.insert(engineEvents).values({
      id: randomUUID(),
      type: input.type,
      contactId: input.contactId ?? null,
      payload: input.payload ?? {},
      occurredAt: Date.now(),
      processedAt: null,
    });
  } catch (err) {
    console.error(t("[PRM Engine] nie udało się zapisać zdarzenia"), input.type, err);
  }
}

/**
 * Resolves the contact behind an email tracking token — the same
 * token → email_sends.toEmail → contacts chain the popup personalization and
 * the survey collector use. Returns null for unknown/foreign tokens.
 */
export async function contactIdForSendToken(token: string): Promise<string | null> {
  try {
    const db = getDb();
    const send = await db.select().from(emailSends).where(eq(emailSends.token, token)).get();
    if (!send) return null;
    const contact = await db.select().from(contacts).where(eq(contacts.email, send.toEmail)).get();
    return contact?.id ?? null;
  } catch {
    return null;
  }
}

/** Unprocessed events, oldest first — the input side of one engine tick. */
export async function takeUnprocessedEvents(limit = 100): Promise<EngineEventRow[]> {
  const db = getDb();
  return db
    .select()
    .from(engineEvents)
    .where(isNull(engineEvents.processedAt))
    .orderBy(asc(engineEvents.occurredAt))
    .limit(limit);
}

export async function markEventProcessed(id: string): Promise<void> {
  const db = getDb();
  await db
    .update(engineEvents)
    .set({ processedAt: Date.now() })
    .where(and(eq(engineEvents.id, id), isNull(engineEvents.processedAt)));
}
