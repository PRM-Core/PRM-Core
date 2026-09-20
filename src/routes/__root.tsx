import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  redirect,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AppLayout } from "@/components/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentUser } from "@/lib/api/auth.functions";
import { SELF_REGISTRATION_ENABLED } from "@/lib/auth/policy";
import { currentLocale, t } from "@/lib/i18n";

// `/register` jest publiczna tylko wtedy, gdy rejestracja w ogóle działa.
// Przy wyłączonej trasa i tak przekierowuje na logowanie, ale trzymanie jej
// poza listą publiczną znaczy, że nie ma dwóch źródeł prawdy o tym, co jest
// otwarte bez logowania.
const PUBLIC_ROUTES = SELF_REGISTRATION_ENABLED ? ["/login", "/register"] : ["/login"];

/**
 * Trasy publiczne rozpoznawane po **początku ścieżki**, nie po pełnym adresie.
 * Ustawienie nowego hasła niesie token w adresie (`/reset-hasla/<token>`), więc
 * porównanie do pełnej listy nigdy by go nie objęło — i człowiek z odnośnika
 * z poczty lądowałby na ekranie logowania, którego właśnie nie potrafi przejść.
 */
const PUBLIC_PREFIXES = ["/reset-hasla/"];

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">{t("Strona nie znaleziona")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Nie znaleźliśmy tej strony. Wróć do panelu PRM Core.")}
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("Wróć do Dashboardu")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">{t("Coś poszło nie tak")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Spróbuj ponownie lub wróć na stronę główną.")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("Spróbuj ponownie")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            {t("Strona główna")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: t("PRM Core — Healthcare Patient Relationship Management") },
      {
        name: "description",
        content: t(
          "Nowoczesna platforma PRM Core dla branży healthcare — kontakty, automatyzacje, raporty i integracje w jednym miejscu.",
        ),
      },
      { property: "og:title", content: "PRM Core — Healthcare Patient Relationship Management" },
      { name: "twitter:title", content: "PRM Core — Healthcare Patient Relationship Management" },
      {
        property: "og:description",
        content: t(
          "Nowoczesna platforma PRM Core dla branży healthcare — kontakty, automatyzacje, raporty i integracje w jednym miejscu.",
        ),
      },
      {
        name: "twitter:description",
        content: t(
          "Nowoczesna platforma PRM Core dla branży healthcare — kontakty, automatyzacje, raporty i integracje w jednym miejscu.",
        ),
      },
      { name: "twitter:card", content: "summary" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Ikona wektorowa: czytelna i przy 16 px na karcie, i przy 180 px jako
      // skrót na pulpicie telefonu. Jeden plik zamiast zestawu bitmap.
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const user = await getCurrentUser();
    const isPublicRoute =
      PUBLIC_ROUTES.includes(location.pathname) ||
      PUBLIC_PREFIXES.some((p) => location.pathname.startsWith(p));
    if (!user && !isPublicRoute) {
      throw redirect({ to: "/login" });
    }
    if (user && isPublicRoute) {
      throw redirect({ to: "/" });
    }
    return { user };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang={currentLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      {isPublicRoute ? (
        <Outlet />
      ) : (
        <AppLayout>
          <Outlet />
        </AppLayout>
      )}
      <Toaster />
    </QueryClientProvider>
  );
}
