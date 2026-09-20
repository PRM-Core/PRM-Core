import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";
import { verifySignature } from "@/lib/meta/graph.server";
import { handleLeadgenNotification } from "@/lib/meta/leads.server";
import { logStep } from "@/lib/engine/log.server";
import { getCredential } from "@/lib/credentials/store.server";
import { t } from "@/lib/i18n";

// Webhook Lead Ads od Mety — leady wpadają wprost, bez Zapiera.
//
// Adres wkleja się w panelu dewelopera Mety (Webhooks → Page → leadgen).
// Meta wymaga dwóch rzeczy pod tym samym adresem:
//   GET  — jednorazowy uścisk dłoni: oddajemy `hub.challenge`, jeśli
//          `hub.verify_token` zgadza się z naszym.
//   POST — powiadomienia o leadach, podpisane `X-Hub-Signature-256`.
//
// **Adres jest publiczny i nie da się go ukryć**, więc to podpis, a nie
// nieodgadywalna ścieżka, odróżnia Metę od kogokolwiek innego. Bez sprawdzenia
// podpisu obcy mógłby zakładać kontakty w bazie placówki.

export const Route = createFileRoute("/api/webhooks/meta-leads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = await getCredential("META_VERIFY_TOKEN");

        if (mode === "subscribe" && expected && token === expected && challenge) {
          // Meta wymaga gołego tekstu, nie JSON-a.
          return new Response(challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        }

        await logStep({
          kind: "error",
          message: t(
            "Meta: nieudany uścisk dłoni webhooka — sprawdź token weryfikacji w Integracje → Klucze i dane dostępowe.",
          ),
        });
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        // Ciało czytane RAZ jako tekst: podpis liczy się z dokładnie tych
        // bajtów, które przyszły. `request.json()` i ponowne serializowanie
        // zmieniłoby białe znaki i podpis przestałby się zgadzać.
        const raw = await request.text();

        if (!(await verifySignature(raw, request.headers.get("x-hub-signature-256")))) {
          await logStep({
            kind: "error",
            message: t("Meta: powiadomienie z błędnym podpisem — odrzucone."),
          });
          return new Response("Forbidden", { status: 403 });
        }

        let payload: {
          object?: string;
          entry?: { id?: string; changes?: { field?: string; value?: Record<string, string> }[] }[];
        };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        let handled = 0;
        for (const entry of payload.entry ?? []) {
          for (const change of entry.changes ?? []) {
            if (change.field !== "leadgen") continue;
            const leadgenId = change.value?.leadgen_id;
            const pageId = change.value?.page_id ?? entry.id ?? "";
            if (!leadgenId || !pageId) continue;
            try {
              await handleLeadgenNotification(String(leadgenId), String(pageId));
              handled += 1;
            } catch {
              // Błąd pojedynczego leada jest już zapisany w dzienniku przez
              // `handleLeadgenNotification`. Nie przerywamy paczki — jeden
              // nieudany lead nie może zablokować pozostałych.
            }
          }
        }

        // **Zawsze 200.** Meta ponawia wszystko, co nie dostało 2xx, i przy
        // jednym problematycznym leadzie potrafi zapętlić kolejkę. Co realnie
        // weszło, widać w dzienniku silnika i na karcie integracji.
        return Response.json({ ok: true, handled });
      },
    },
  },
});
