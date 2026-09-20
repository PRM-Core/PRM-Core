import { createFileRoute } from "@tanstack/react-router";
import { readDocument } from "@/lib/documents/documents.server";
import { getSessionUser } from "@/lib/auth/session.server";
import { isReadOnlyRole } from "@/lib/auth/roles";
import { t } from "@/lib/i18n";

// Pobieranie dokumentu pacjenta. Osobna trasa, a nie funkcja RPC, bo plik ma
// wyjść jako plik — z nagłówkami, które przeglądarka rozumie.

export const Route = createFileRoute("/documents/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        // Dokumentacja medyczna: bez sesji nie ma pliku. Bez tego wystarczyłby
        // sam identyfikator, żeby ściągnąć cudze wyniki badań.
        const user = await getSessionUser();
        if (!user) return new Response("Wymagane zalogowanie.", { status: 401 });

        // Konto podglądu nie pobiera dokumentacji medycznej. „Tylko odczyt"
        // dotyczy danych marketingowych i raportów; skierowania i wyniki badań
        // to inna kategoria i nie ma powodu, żeby wychodziły na konto, które
        // loguje się samym hasłem.
        if (isReadOnlyRole(user.role)) {
          return new Response(t("To konto nie ma dostępu do dokumentacji."), { status: 403 });
        }

        const found = await readDocument(params.id);
        if (!found) return new Response("Nie znaleziono dokumentu.", { status: 404 });

        return new Response(new Uint8Array(found.bytes), {
          status: 200,
          headers: {
            "Content-Type": found.row.mimeType || "application/octet-stream",
            // `attachment` zamiast `inline`: plik od pacjenta nigdy nie renderuje
            // się w naszej domenie, więc nie ma jak wykonać czegoś w kontekście
            // zalogowanej sesji.
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(found.row.fileName)}`,
            "Content-Length": String(found.bytes.length),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
