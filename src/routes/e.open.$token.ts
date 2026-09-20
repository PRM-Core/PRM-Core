import { createFileRoute } from "@tanstack/react-router";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client.server";
import { emailEvents } from "@/lib/db/schema";
import { emitEvent, contactIdForSendToken } from "@/lib/engine/events.server";

// The open-tracking pixel: /e/open/:token. Returns a real 1x1 transparent
// GIF (mail clients need actual image bytes, not just a 200) and logs one
// "open" event — de-duped to the first load per token, since some mail
// clients (proxy image caching, prefetch/security scanners) fetch the pixel
// more than once per genuine open. Never errors out to the client even for
// an unknown token — a broken pixel would show as a missing-image icon in
// the recipient's inbox.

const TRANSPARENT_GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="),
  (c) => c.charCodeAt(0),
);

function makeEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const gifResponse = () =>
  new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });

export const Route = createFileRoute("/e/open/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const db = getDb();
          const existing = await db
            .select()
            .from(emailEvents)
            .where(and(eq(emailEvents.token, params.token), eq(emailEvents.kind, "open")))
            .limit(1);
          if (existing.length === 0) {
            await db.insert(emailEvents).values({
              id: makeEventId(),
              token: params.token,
              kind: "open",
              url: null,
              occurredAt: Date.now(),
            });
            // Inside the de-dupe branch on purpose: the engine should see one
            // "opened" event per genuine open, not one per pixel fetch.
            const contactId = await contactIdForSendToken(params.token);
            if (contactId) {
              await emitEvent({
                type: "email.opened",
                contactId,
                payload: { token: params.token },
              });
            }
          }
        } catch {
          // unknown/foreign-key-violating token — still serve the pixel
        }
        return gifResponse();
      },
    },
  },
});
