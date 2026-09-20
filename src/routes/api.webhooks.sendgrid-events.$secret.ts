import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import {
  getEventWebhookSecret,
  ingestSendGridEvents,
  type SendGridEvent,
} from "@/lib/email/event-webhook.server";
import { logStep } from "@/lib/engine/log.server";
import { t } from "@/lib/i18n";

// Event Webhook SendGrida: doręczenia, odbicia, zgłoszenia spamu.
//
// Adres wkleja się w SendGrid → Settings → Mail Settings → Event Webhook.
// Nieodgadywalny segment ścieżki JEST uwierzytelnieniem — tak samo jak przy
// Inbound Parse (patrz api.webhooks.inbound-email.$secret.ts) i z tego samego
// powodu: sekret da się obrócić w chwili, w której wycieknie.
//
// **Odpowiadamy 200 nawet na paczkę, z której nic nie weszło.** SendGrid
// ponawia wszystko, co nie dostało 2xx, i przy jednym nietypowym zdarzeniu
// potrafi zapętlić całą kolejkę. Co realnie weszło, widać w dzienniku silnika.

function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const Route = createFileRoute("/api/webhooks/sendgrid-events/$secret")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const expected = await getEventWebhookSecret();
        if (!secretsMatch(params.secret ?? "", expected)) {
          await logStep({
            kind: "error",
            message: t("Event Webhook SendGrid: żądanie z błędnym sekretem — odrzucone."),
          });
          return new Response("Not found", { status: 404 });
        }

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        if (!Array.isArray(payload)) {
          return new Response("Bad request", { status: 400 });
        }

        const result = await ingestSendGridEvents(payload as SendGridEvent[]);

        // Zdarzenia bez dopasowania odnotowujemy, ale nie co paczkę: przy
        // wiadomościach sprzed wpięcia webhooka (bez `prm_token`) zalałyby
        // dziennik. Wpis idzie dopiero wtedy, gdy NIC się nie dopasowało —
        // to sygnał, że coś jest nie tak z konfiguracją, a nie pojedynczy
        // stary e-mail.
        if (result.accepted === 0 && result.unmatched > 0) {
          await logStep({
            kind: "error",
            message: t(
              "Event Webhook SendGrid: {unmatched} zdarzeń bez dopasowania do wysyłki. Sprawdź, czy wiadomości wychodzą z tej instalacji.",
              { unmatched: result.unmatched },
            ),
          });
        }

        return Response.json({ ok: true, ...result });
      },
    },
  },
});
