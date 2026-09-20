import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client.server";
import { trackingPings } from "@/lib/db/schema";
import { emitEvent, contactIdForSendToken } from "@/lib/engine/events.server";

// Real collector endpoint for the tracker script generated in Settings →
// Tracking. Accepts a same-origin or cross-origin POST (sendBeacon/fetch send
// it as a "simple request" with a text/plain body, so no CORS preflight is
// needed for the write to succeed) and stores one row per event.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function makePingId(): string {
  return `ping-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Domena, z której naprawdę przyszedł sygnał.
 *
 * Liczona z adresu strony, a nie brana z deklaracji skryptu — po to, żeby
 * ekran ustawień odpowiadał na pytanie „czy z TEJ witryny coś dociera”
 * faktem, a nie tym, co ktoś wpisał w konfiguracji.
 *
 * `www.` jest ucinane: dla człowieka `www.klinika-abc.pl` i `klinika-abc.pl`
 * to jedna strona, a rozdzielanie ich zamieniłoby listę domen w quiz.
 */
function hostFromUrl(url: string, originHeader: string | null): string {
  const parse = (value: string): string => {
    try {
      return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  };
  return parse(url) || (originHeader ? parse(originHeader) : "");
}

export const Route = createFileRoute("/collect")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const raw = await request.text();
          const data = JSON.parse(raw) as Record<string, unknown>;

          if (data.workspaceId && data.visitorId && data.url) {
            const token = data.contactToken ? String(data.contactToken) : null;
            const db = getDb();
            await db.insert(trackingPings).values({
              id: makePingId(),
              workspaceId: String(data.workspaceId),
              visitorId: String(data.visitorId),
              contactToken: token,
              url: String(data.url),
              title: data.title ? String(data.title) : "",
              referrer: data.referrer ? String(data.referrer) : "",
              host: hostFromUrl(String(data.url), request.headers.get("origin")),
              receivedAt: Date.now(),
            });

            // Only attributable visits reach the engine: an anonymous ping has
            // no contact to run an automation for, so it stays a plain ping.
            if (token) {
              const contactId = await contactIdForSendToken(token);
              if (contactId) {
                // Doszycie historii wstecz: wcześniejsze ANONIMOWE wizyty tej
                // samej przeglądarki dostają ten token — od tej chwili widać
                // je na karcie pacjenta. Ktoś tydzień przeglądał cennik, dziś
                // kliknął link z e-maila: tamten tydzień właśnie przestał być
                // niczyj. UPDATE zamiast zdarzeń celowo — stare wizyty nie
                // uruchamiają automatyzacji, bo pacjent nie zrobił ich TERAZ.
                // Tylko tokeny zmapowane na kontakt doszywają cokolwiek;
                // token-śmieć z ręcznie sklejonego adresu nie zatruwa historii.
                await db
                  .update(trackingPings)
                  .set({ contactToken: token })
                  .where(
                    sql`${trackingPings.visitorId} = ${String(data.visitorId)}
                        AND (${trackingPings.contactToken} IS NULL OR ${trackingPings.contactToken} = '')`,
                  );
                await emitEvent({
                  type: "page.visit",
                  contactId,
                  payload: {
                    url: String(data.url),
                    title: data.title ? String(data.title) : "",
                  },
                });
              }
            }
          }
        } catch {
          // malformed payload — still respond so the beacon doesn't retry
        }
        return new Response(null, { status: 204, headers: corsHeaders });
      },
    },
  },
});
