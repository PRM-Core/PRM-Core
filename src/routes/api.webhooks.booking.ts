import { createFileRoute } from "@tanstack/react-router";
import { getWebhookSecret } from "@/lib/leads/lead-webhook.server";
import { processBooking, isTestPayload } from "@/lib/visits/booking-intake.server";
import { bookingWebhookPaused, parkBooking } from "@/lib/booking-system/pause.server";
import { logStep } from "@/lib/engine/log.server";
import { t } from "@/lib/i18n";

// Rezerwacje z systemu rezerwacji: POST, sekret w nagłówku X-Webhook-Secret, treść
// JSON. Rozkładanie pól i zapis siedzą w `booking-intake.server.ts` — ta sama
// funkcja obsługuje odbiór na żywo i przetwarzanie zaległości odłożonych na
// czas wstrzymania. Trasa robi tylko trzy rzeczy: sprawdza sekret, decyduje
// „przetworzyć czy odłożyć" i nadaje kod HTTP.

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/webhooks/booking")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const providedSecret = request.headers.get("x-webhook-secret") ?? "";
        const expectedSecret = await getWebhookSecret();
        if (!providedSecret || providedSecret !== expectedSecret) {
          await logStep({
            kind: "error",
            message: t(
              "Odrzucono wywołanie webhooka rezerwacji — nieprawidłowy lub brakujący sekret.",
            ),
            detail: {
              source: "booking-webhook",
              secretProvided: providedSecret ? "tak" : "nie",
            },
          });
          return json(
            { ok: false, error: t("Nieprawidłowy lub brakujący X-Webhook-Secret.") },
            401,
          );
        }

        let d: Record<string, unknown>;
        try {
          d = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ ok: false, error: t("Body musi być poprawnym JSON-em.") }, 400);
        }

        /**
         * Wstrzymanie odbioru — **odkładamy, nie odrzucamy**.
         *
         * Odesłanie błędu zmusiłoby system rezerwacji do ponawiania albo, gorzej, do
         * porzucenia zgłoszenia. Odesłanie „ok" bez zapisu byłoby cichym
         * zgubieniem rezerwacji pacjenta. Odłożenie surowej treści zostawia
         * placówce decyzję: po wznowieniu przetworzyć zaległe albo je odrzucić.
         *
         * **Tryb próbny działa mimo wstrzymania** — deweloperzy mają móc
         * sprawdzać mapowanie pól także wtedy, gdy odbiór stoi; i tak niczego
         * nie zapisuje.
         */
        if (!isTestPayload(d) && (await bookingWebhookPaused())) {
          const id = await parkBooking(d);
          return json(
            {
              ok: true,
              wstrzymane: true,
              zapisaneDoPrzetworzenia: id,
              info: t(
                "Odbiór rezerwacji jest chwilowo wstrzymany. Zgłoszenie zostało odłożone i zostanie przetworzone po wznowieniu — nie wysyłaj go ponownie.",
              ),
            },
            200,
          );
        }

        const result = await processBooking(d);
        return json(result, result.ok ? 200 : 400);
      },
    },
  },
});
