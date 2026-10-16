import { createFileRoute } from "@tanstack/react-router";
import { recordEmailClick } from "@/lib/email/tracking-events.server";

// Click-tracking redirect: /e/click/:token?u=<encoded target URL>. Logs a
// "click" event (every click, unlike the de-duped open pixel — repeat
// clicks on the same or different links are each meaningful) then forwards
// the recipient on to the real URL, with the send token appended as
// ?prm_ct=<token> — the one and only identity hand-off between "this email
// was clicked" and "this browser belongs to that contact". prm-tracker.js
// picks it up client-side and stores it in a first-party cookie set by the
// visited domain itself; no third-party cookie or cross-site mechanism is
// involved anywhere in this chain. Falls back to "/" if `u` is missing or
// not a valid absolute URL, so a malformed link never dead-ends the click.

export const Route = createFileRoute("/e/click/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const target = new URL(request.url).searchParams.get("u");
        let redirectTo = "/";
        if (target) {
          try {
            const url = new URL(target);
            url.searchParams.set("prm_ct", params.token);
            redirectTo = url.toString();
          } catch {
            // not a valid absolute URL — fall back to "/"
          }
        }

        try {
          await recordEmailClick(params.token, target ?? "", redirectTo);
        } catch {
          // unknown/foreign-key-violating token — still redirect
        }

        return new Response(null, { status: 302, headers: { Location: redirectTo } });
      },
    },
  },
});
