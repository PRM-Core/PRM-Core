import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/session.server";
import { logStep } from "@/lib/engine/log.server";
import { canvaRedirectUri, consumeCanvaState } from "@/lib/canva/connect.server";
import { completeConnection } from "@/lib/canva/oauth.server";
import { t } from "@/lib/i18n";

// Powrót z logowania do Canvy: wymiana kodu na tokeny i zapis połączenia.
//
// **Wymaga zalogowanej sesji** — bez tego ktokolwiek z odnośnikiem podłączyłby
// swoje konto Canvy do instalacji placówki. `state` sprawdzamy dodatkowo, bo
// sesja mówi tylko „to ktoś nasz", a nie „to my zaczęliśmy to logowanie".

function back(message: string, ok: boolean): Response {
  const url = `/integrations?canva=${ok ? "ok" : "err"}&msg=${encodeURIComponent(message)}`;
  return new Response(null, { status: 302, headers: { Location: url } });
}

export const Route = createFileRoute("/api/canva/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        // Ślad przy każdym wejściu, przed sprawdzeniem czegokolwiek: inaczej
        // „powrót zawiódł" i „Canva nigdy tu nie wróciła" wyglądają tak samo,
        // a szuka się ich w dwóch różnych miejscach. Bez wartości parametrów —
        // `code` to jednorazowy klucz do tokenów.
        await logStep({
          kind: "action",
          message: t("Canva: powrót z logowania ({v0}).", {
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

        const verifier = await consumeCanvaState(state);
        if (!verifier) {
          await logStep({
            kind: "error",
            message: t("Canva: powrót z logowania z nieznanym `state` — odrzucony."),
          });
          return back("Nieaktualne albo obce logowanie. Zacznij od nowa z panelu.", false);
        }

        try {
          const wynik = await completeConnection({
            code,
            verifier,
            redirectUri: await canvaRedirectUri(),
          });
          await logStep({
            kind: "action",
            message: t("Canva połączona{v0}. Zakresy: {scopes}.", {
              v0: wynik.accountName ? ` — konto ${wynik.accountName}` : "",
              scopes: wynik.scopes,
            }),
          });
          return back(
            wynik.accountName
              ? t("Połączono z kontem {accountName}.", { accountName: wynik.accountName })
              : t("Połączono z Canvą."),
            true,
          );
        } catch (err) {
          const powod = err instanceof Error ? err.message : t("nieznany błąd");
          // Treść błędu **pokazujemy**: przy pierwszym logowaniu to zwykle
          // niezgodny adres powrotu albo brak zakresu, a jedno i drugie da się
          // poprawić w minutę — o ile wiadomo, które z nich.
          await logStep({
            kind: "error",
            message: t("Canva: połączenie nie powiodło się — {powod}", { powod: powod }),
          });
          return back(powod, false);
        }
      },
    },
  },
});
