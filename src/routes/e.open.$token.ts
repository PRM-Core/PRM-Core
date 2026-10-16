import { createFileRoute } from "@tanstack/react-router";
import { recordEmailOpen } from "@/lib/email/tracking-events.server";

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
          await recordEmailOpen(params.token);
        } catch {
          // unknown/foreign-key-violating token — still serve the pixel
        }
        return gifResponse();
      },
    },
  },
});
