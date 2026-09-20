import { createFileRoute } from "@tanstack/react-router";
import { readMediaFile } from "@/lib/media/media.server";

// Publiczne serwowanie plików z biblioteki Media.
//
// **Celowo bez logowania** — w przeciwieństwie do /documents/:id. Obrazek
// osadzony w e-mailu pobiera klient pocztowy pacjenta, anonimowo; obrazek
// w pop-upie pobiera przeglądarka gościa na cudzej stronie. Wymóg sesji
// oznaczałby puste kwadraty u wszystkich odbiorców. Chroni nas losowość
// identyfikatora (UUID) i to, że w bibliotece leżą materiały marketingowe,
// z założenia przeznaczone do publikacji.

export const Route = createFileRoute("/media-file/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const found = await readMediaFile(params.id);
        if (!found) return new Response("Nie znaleziono pliku.", { status: 404 });

        return new Response(new Uint8Array(found.bytes), {
          status: 200,
          headers: {
            "Content-Type": found.row.mimeType,
            // `inline` + długi cache: plik spod tego adresu nigdy się nie
            // zmienia (podmiana = nowy UUID), więc klienty pocztowe i proxy
            // Gmaila mogą trzymać go do roku bez odpytywania nas o cokolwiek.
            //
            // **Nazwa dołączona przy dokumentach.** PDF otwiera się w oknie
            // przeglądarki, ale zapisany bez tego nagłówka lądował na dysku
            // pacjenta pod identyfikatorem UUID zamiast „Plan dietetyczny.pdf".
            "Content-Disposition": found.row.mimeType.startsWith("image/")
              ? "inline"
              : `inline; filename*=UTF-8''${encodeURIComponent(found.row.fileName)}`,
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Length": String(found.bytes.length),
            "X-Content-Type-Options": "nosniff",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
