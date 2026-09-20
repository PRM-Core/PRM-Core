import { createFileRoute } from "@tanstack/react-router";
import { buildTrackerScript } from "@/lib/tracking-script";

// Serves the real, static tracker script at /prm-tracker.js — the same
// content shown as a "preview" in Settings → Tracking (buildTrackerScript
// in src/lib/tracking-script.ts is the single source of truth for both).
// Filename escapes the literal dot as [.] per TanStack Router's flat-route
// convention (bare dots are treated as path-nesting separators otherwise).

export const Route = createFileRoute("/prm-tracker.js")({
  server: {
    handlers: {
      GET: async () =>
        new Response(buildTrackerScript(), {
          status: 200,
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
          },
        }),
    },
  },
});
