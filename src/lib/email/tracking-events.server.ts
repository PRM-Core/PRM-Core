import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { emailEvents } from "../db/schema";
import { emitEvent, contactIdForSendToken } from "../engine/events.server";

/**
 * Recording an open and a click — the logging half of `/e/open/:token` and
 * `/e/click/:token`, which keep only the HTTP part (the pixel, the redirect).
 *
 * One implementation for both callers: the routes, and the demo simulator,
 * which opens and clicks what the engine really sent. Both throw on an unknown
 * token (the foreign key); the routes swallow that, because a broken pixel
 * would show as a missing image in the recipient's inbox.
 */

function makeEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * One "open" per token: some mail clients (proxy image caching, security
 * scanners) fetch the pixel more than once per genuine open, and the engine
 * should see one "opened" event per open, not one per fetch.
 */
export async function recordEmailOpen(token: string, at = Date.now()): Promise<boolean> {
  const db = getDb();
  const existing = await db
    .select()
    .from(emailEvents)
    .where(and(eq(emailEvents.token, token), eq(emailEvents.kind, "open")))
    .limit(1);
  if (existing.length > 0) return false;
  await db.insert(emailEvents).values({
    id: makeEventId(),
    token,
    kind: "open",
    url: null,
    occurredAt: at,
  });
  const contactId = await contactIdForSendToken(token);
  if (contactId) await emitEvent({ type: "email.opened", contactId, payload: { token } });
  return true;
}

/**
 * Every click counts — repeat clicks on the same or another link each mean
 * something, unlike the de-duplicated open. `target` is the address from the
 * message, `stored` the one the recipient is sent on to.
 */
export async function recordEmailClick(
  token: string,
  target: string,
  stored = target,
  at = Date.now(),
): Promise<void> {
  await getDb().insert(emailEvents).values({
    id: makeEventId(),
    token,
    kind: "click",
    url: stored,
    occurredAt: at,
  });
  const contactId = await contactIdForSendToken(token);
  if (contactId)
    await emitEvent({ type: "email.clicked", contactId, payload: { token, url: target } });
}
