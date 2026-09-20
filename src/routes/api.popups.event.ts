import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db/client.server";
import { popupEvents } from "@/lib/db/schema";

// Wyświetlenia i kliknięcia opublikowanych pop-upów, zgłaszane przez
// prm-tracker.js z cudzej strony.
//
// Osobny endpoint od /api/popups/shown: tamten potwierdza **dostarczenie**
// pop-upu zakolejkowanego dla jednego pacjenta i pisze do dziennika
// automatyzacji. Ten liczy statystyki wszystkich pop-upów i nie dotyka silnika.
// Zlanie ich w jeden dawałoby wpis w historii automatyzacji za każdym
// kliknięciem anonimowego gościa.
//
// Wysyłane jako text/plain, żeby zostać „prostym żądaniem" CORS (bez preflightu)
// — ta sama sztuczka co w /collect i pozostałych kolektorach.

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

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const Route = createFileRoute("/api/popups/event")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const body = JSON.parse(await request.text()) as Record<string, unknown>;
          const contentItemId = text(body.contentItemId, 120);
          const kind = text(body.kind, 20);
          // Bez treści nie ma czego liczyć, a nieznany rodzaj zdarzenia to albo
          // literówka, albo ktoś strzela w endpoint na oślep — w obu wypadkach
          // nie zapisujemy śmiecia do tabeli, z której potem liczymy statystyki.
          if (!contentItemId || (kind !== "impression" && kind !== "click")) {
            return json({ ok: false }, 400);
          }

          const settingsRaw = body.settingsId;
          const settingsId =
            typeof settingsRaw === "number" && Number.isFinite(settingsRaw) ? settingsRaw : null;

          await getDb()
            .insert(popupEvents)
            .values({
              id: randomUUID(),
              settingsId,
              contentItemId,
              kind,
              visitorId: text(body.visitorId, 80),
              url: text(body.url, 500),
              createdAt: Date.now(),
            });

          return json({ ok: true }, 200);
        } catch {
          // Nigdy nie hałasujemy na cudzej stronie — statystyka nie jest warta
          // błędu w konsoli odwiedzającego.
          return json({ ok: false }, 200);
        }
      },
    },
  },
});
