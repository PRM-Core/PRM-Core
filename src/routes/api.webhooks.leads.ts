import { createFileRoute } from "@tanstack/react-router";
import { checkWebhookSecret } from "@/lib/leads/lead-webhook.server";
import { logStep } from "@/lib/engine/log.server";
import { processLead } from "@/lib/leads/lead-intake.server";
import { t as tr } from "@/lib/i18n";

// Inbound webhook for ad leads (built for Zapier's "Webhooks by Zapier" action
// feeding off its native Facebook Lead Ads trigger — see the SMS API/Email API
// integrations for the outbound equivalent of this pattern). Real endpoint,
// not simulated: POST /api/webhooks/leads, secret in the X-Webhook-Secret
// header (configured in Integracje > Meta Ads), creates a real row in
// `contacts` (status "lead"), upsert-by-email so a retried Zap doesn't create
// duplicates.

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/webhooks/leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const providedSecret = request.headers.get("x-webhook-secret") ?? "";
        const secretCheck = await checkWebhookSecret(providedSecret);
        if (secretCheck.ok && secretCheck.previous)
          // Still valid for 24 h after a rotation — the sender needs the new one.
          await logStep({
            kind: "security",
            message: tr(
              "Webhook przyjęty ze starym sekretem — zaktualizuj nadawcę przed {until}, potem stary sekret przestanie działać.",
              { until: new Date(secretCheck.previousUntil ?? 0).toISOString() },
            ),
            detail: { source: "lead-webhook", secret: "previous" },
          });
        if (!secretCheck.ok) {
          // Logged, not just refused: a series of these is either a broken
          // integration after a secret rotation or somebody probing the
          // endpoint, and the M4 supervisor can only report what was recorded.
          await logStep({
            kind: "error",
            message: tr(
              "Odrzucono wywołanie webhooka leadów — nieprawidłowy lub brakujący sekret.",
            ),
            detail: { source: "lead-webhook", secretProvided: providedSecret ? "tak" : "nie" },
          });
          return json(
            { ok: false, error: tr("Nieprawidłowy lub brakujący X-Webhook-Secret.") },
            401,
          );
        }

        let data: Record<string, unknown>;
        try {
          data = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ ok: false, error: tr("Body musi być poprawnym JSON-em.") }, 400);
        }

        const result = await processLead(data);
        return json(result.body, result.status);
      },
    },
  },
});
