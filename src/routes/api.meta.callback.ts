import { createFileRoute } from "@tanstack/react-router";
import { consumeState, finishConnect } from "@/lib/meta/connect.server";
import { getSessionUser } from "@/lib/auth/session.server";
import { logStep } from "@/lib/engine/log.server";
import { t } from "@/lib/i18n";

// Powrót z logowania Facebooka. Wymiana kodu na tokeny stron i subskrypcja
// `leadgen`, potem przekierowanie z powrotem do Integracji z komunikatem.
//
// **Wymaga zalogowanej sesji** — inaczej ktokolwiek z odnośnikiem mógłby
// podłączyć swoją stronę do konta placówki. `state` sprawdzamy dodatkowo, bo
// sesja nie mówi, czy to My zaczęliśmy to logowanie.

function back(message: string, ok: boolean): Response {
  const url = `/integrations?meta=${ok ? "ok" : "err"}&msg=${encodeURIComponent(message)}`;
  return new Response(null, { status: 302, headers: { Location: url } });
}

export const Route = createFileRoute("/api/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        // **Ślad przy każdym wejściu, jeszcze przed sprawdzeniem czegokolwiek.**
        // Bez niego nie dało się odróżnić „callback zawiódł" od „Facebook nigdy
        // tu nie wrócił" — a to dwa zupełnie różne problemy, szukane w dwóch
        // różnych miejscach. Bez wartości parametrów: `code` to jednorazowy
        // klucz do tokenów.
        await logStep({
          kind: "action",
          message: t("Meta: powrót z logowania ({v0}).", {
            v0: [...url.searchParams.keys()].join(", ") || t("bez parametrów"),
          }),
        });

        const user = await getSessionUser();
        if (!user) return back(t("Wymagane zalogowanie — zaloguj się i spróbuj ponownie."), false);
        const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
        if (error) return back(error, false);

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return back("Brak kodu autoryzacji.", false);

        if (!(await consumeState(state))) {
          await logStep({
            kind: "error",
            message: t("Meta: powrót z logowania z nieznanym `state` — odrzucony."),
          });
          return back(
            t("Nieprawidłowy parametr bezpieczeństwa — spróbuj podłączyć jeszcze raz."),
            false,
          );
        }

        try {
          const result = await finishConnect(code);
          const okCount = result.connected.filter((c) => c.subscribed).length;
          const failed = result.connected.filter((c) => !c.subscribed);

          if (result.connected.length === 0) {
            return back(
              t("Zalogowano, ale Facebook nie oddał żadnej strony — sprawdzono konto osobiste ") +
                t("i portfolio firmowe. Najczęstsza przyczyna: przy podłączaniu nie zaznaczono ") +
                t("żadnej strony albo aplikacja nie ma uprawnienia business_management. ") +
                t("Kliknij „Podłącz stronę” jeszcze raz i zaznacz strony na liście."),
              false,
            );
          }
          if (failed.length > 0) {
            return back(
              t("Podłączono {okCount}, nie udało się dla: {v1}", {
                okCount: okCount,
                v1: failed.map((f) => f.pageName).join(", "),
              }),
              false,
            );
          }
          return back(t("Podłączono stron: {okCount}.", { okCount: okCount }), true);
        } catch (err) {
          const message = String(err instanceof Error ? err.message : err);
          await logStep({
            kind: "error",
            message: t("Meta: podłączanie nie powiodło się — {message}", { message: message }),
          });
          return back(message, false);
        }
      },
    },
  },
});
