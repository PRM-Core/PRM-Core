import { createFileRoute } from "@tanstack/react-router";
import { markPopupShown } from "@/lib/engine/popup-queue.server";
import { logStep } from "@/lib/engine/log.server";
import { t } from "@/lib/i18n";

// Delivery confirmation for M5 popups queued for one patient. The tracker
// calls this AFTER it has actually rendered the popup — /popup-active handing
// it over proves nothing, because capping, device and URL rules are all
// decided in the browser and any of them can veto the display.
//
// Posted as text/plain to stay a CORS "simple request" (no preflight) — the
// same trick as /collect and the form/survey collectors.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/popups/shown")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const body = JSON.parse(await request.text()) as { queueId?: unknown };
          const queueId = typeof body.queueId === "string" ? body.queueId.trim() : "";
          if (!queueId) return json({ ok: false, error: t("Brak queueId.") }, 400);

          // Already-shown or expired rows come back null — a double report from
          // a page that fired the beacon twice must not log the popup twice.
          const row = await markPopupShown(queueId);
          if (!row) return json({ ok: true, alreadyShown: true }, 200);

          await logStep({
            runId: row.runId,
            automationId: row.automationId,
            contactId: row.contactId,
            nodeId: row.nodeId,
            kind: "action",
            message: t("Pop-up „{name}” wyświetlony pacjentowi na stronie.", { name: row.name }),
            detail: { action: "show_popup", queueId: row.id },
          });

          return json({ ok: true }, 200);
        } catch {
          // Never fail loudly on someone else's website.
          return json({ ok: false }, 200);
        }
      },
    },
  },
});
