import { createFileRoute } from "@tanstack/react-router";
import { getWebhookSecret } from "@/lib/leads/lead-webhook.server";
import { recordHearingTestLead } from "@/lib/leads/hearing-test.server";
import { logStep } from "@/lib/engine/log.server";
import { t } from "@/lib/i18n";

// Inbound webhook for the "Razem dla Słuchu" qualification form on
// razemdlasluchu.pl/kwalifikacja, posted by a WordPress hook. Same contract as
// /api/webhooks/leads — secret in X-Webhook-Secret, JSON body, upsert rather
// than blind insert — but a different mapping: this form is a questionnaire,
// so only the identity fields become columns and every answer becomes a note.
//
// Accepts either the raw posted data as the body, or `{ data, labels,
// submissionId }` when the WordPress side can send field labels and a
// submission id (which makes a retried delivery a no-op).

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/webhooks/hearing-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const providedSecret = request.headers.get("x-webhook-secret") ?? "";
        const expectedSecret = await getWebhookSecret();
        if (!providedSecret || providedSecret !== expectedSecret) {
          // Logged, not just refused: a run of these is either a WordPress site
          // still using a rotated secret or somebody probing, and the M4
          // supervisor can only count what was written down.
          await logStep({
            kind: "error",
            message: t(
              "Odrzucono wywołanie webhooka testu słuchu — nieprawidłowy lub brakujący sekret.",
            ),
            detail: {
              source: "hearing-test-webhook",
              secretProvided: providedSecret ? "tak" : "nie",
            },
          });
          return json(
            { ok: false, error: t("Nieprawidłowy lub brakujący X-Webhook-Secret.") },
            401,
          );
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ ok: false, error: t("Body musi być poprawnym JSON-em.") }, 400);
        }

        // Both shapes are accepted so the WordPress snippet can start as a
        // one-liner and gain labels later without a second endpoint.
        const wrapped = body.data && typeof body.data === "object";
        const data = (wrapped ? body.data : body) as Record<string, unknown>;
        const labels =
          wrapped && body.labels && typeof body.labels === "object"
            ? (body.labels as Record<string, string>)
            : undefined;
        const submissionId =
          typeof body.submissionId === "string"
            ? body.submissionId
            : typeof body.submission_id === "string"
              ? body.submission_id
              : undefined;

        const result = await recordHearingTestLead({ data, labels, submissionId });
        if (!result.ok) {
          await logStep({
            kind: "error",
            message: t("Odrzucono zgłoszenie z testu słuchu — {error}", { error: result.error }),
            detail: { source: "hearing-test-webhook" },
          });
          return json(result, 400);
        }

        return json(result, 200);
      },
    },
  },
});
