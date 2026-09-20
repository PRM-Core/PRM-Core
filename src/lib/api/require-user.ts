import { createMiddleware } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { isReadOnlyRole } from "@/lib/auth/roles";
import { t } from "@/lib/i18n";

/**
 * Wymóg zalogowania dla funkcji serwerowej.
 *
 * **Dlaczego to jest potrzebne.** Funkcje
 * serwerowe TanStack Start **nie są wewnętrznym wywołaniem** — każda z nich to
 * publiczny adres `GET/POST /_serverFn/<identyfikator>`, a identyfikatory leżą
 * w kodzie strony, który przeglądarka pobiera **przed** zalogowaniem.
 * Sprawdzenie sesji w `beforeLoad` trasy chroni **ekran**, nie dane: żeby dostać
 * dane, nie trzeba otwierać ekranu.
 *
 * Funkcja bez tego wymogu odpowiada na żądanie bez ciasteczka i bez tokenu,
 * wystarczy nagłówek `x-tsr-serverFn` — dla danych pacjentów niedopuszczalne.
 *
 * **Jak używać**: `createServerFn({ method: "POST" }).middleware([requireUser])`.
 * Wzorzec `createServerFn(...)` musi zostać **dosłowny** — kompilator TanStacka
 * rozpoznaje go po nazwie i na tej podstawie wycina kod serwera z pakietu
 * przeglądarki. Opakowanie go we własną funkcję psuje budowanie: `node:crypto` ląduje w kodzie klienta.
 *
 * **Co zostaje bez zamka**: wyłącznie `auth.functions.ts` — logowanie musi
 * działać, zanim istnieje sesja. Każde inne odstępstwo widać po braku
 * `.middleware([requireUser])`.
 */
export const requireUser = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { getSessionUser } = await import("@/lib/auth/session.server");
  const user = await getSessionUser();
  if (!user) {
    // **Przekierowanie, nie błąd.** Sesja trwa 30 minut, więc jej wygaśnięcie
    // w trakcie pracy jest codziennością, a nie awarią: zwykły `Error` dawałby
    // ekran „ta strona się nie wczytała" zamiast ekranu logowania. Dla obcego
    // z zewnątrz to i tak odmowa — danych nie ma w żadnym wariancie.
    throw redirect({ to: "/login" });
  }
  // Rola „reporter" ma **tylko odczyt** i tylko tam, gdzie go jawnie dopuszczono
  // (`allowReporter`). Tutaj, czyli w domyślnej bramce, jest odmowa — żeby nowa
  // funkcja serwerowa dodana za pół roku była dla reportera zamknięta, dopóki
  // ktoś świadomie nie zdecyduje inaczej.
  if (isReadOnlyRole(user.role)) {
    throw new Error(t("To konto ma dostęp wyłącznie do podglądu."));
  }

  return next({ context: { user } });
});

/**
 * Bramka dla funkcji **czytających**, dostępnych także dla roli „reporter".
 *
 * Różni się od `requireUser` jedną rzeczą: przepuszcza konto podglądu. Wszystko
 * inne — wymóg sesji, przekierowanie na logowanie — działa identycznie.
 *
 * **Zakładaj ją wyłącznie na odczyty.** Funkcja, która cokolwiek zapisuje,
 * wysyła albo eksportuje, ma zostać przy `requireUser`.
 */
export const allowReporter = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { getSessionUser } = await import("@/lib/auth/session.server");
  const user = await getSessionUser();
  if (!user) {
    throw redirect({ to: "/login" });
  }
  return next({ context: { user } });
});
