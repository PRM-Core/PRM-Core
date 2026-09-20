/**
 * Jeden format daty dla całej osi czasu kontaktu.
 *
 * Oś zbiera zdarzenia z sześciu źródeł (e-maile, wejścia na stronę, wizyty,
 * silnik, wiadomości, notatki) i **sortuje je jako napisy**. Dopóki wszystkie
 * używają tego samego formatu, porządek napisów jest porządkiem czasu — dlatego
 * ta funkcja jest jedna, a nie skopiowana do każdego pliku z osobna. Wcześniej
 * była skopiowana pięć razy i każda kopia liczyła czas w UTC.
 *
 * Czas jest warszawski, bo klinika pracuje w Polsce: wizyta o 9:30 ma na osi
 * pisać 9:30, a nie 7:30.
 *
 * Klient i serwer, więc żadnych importów z `node:`.
 */

/** `2026-08-20 09:30` w czasie warszawskim. */
export function formatActivityDate(ms: number): string {
  // sv-SE, bo jako jedyna popularna lokalizacja daje z siebie kolejność
  // rok-miesiąc-dzień z zerami wiodącymi — czyli dokładnie to, co sortuje się
  // poprawnie jako napis.
  return new Date(ms).toLocaleString("sv-SE", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Klucz sortowania osi czasu — malejąco, od najnowszego zdarzenia.
 *
 * **`sortDate` ma pierwszeństwo nad `date`**, gdy element je poda. Rozdzielenie
 * jest tu po to, że przy wizytach **data widoczna i data porządkująca to dwie
 * różne rzeczy**: u dołu wpisu ma stać data zarejestrowania aktywności, a oś ma
 * być poukładana po **terminie konsultacji**. Wcześniej jedno pole robiło oba
 * zadania, więc zmiana sortowania po cichu przestawiła to, co widać na karcie.
 * Pozostałe pięć źródeł `sortDate` nie podaje i sortuje się po `date` — dla nich
 * te dwie daty są tym samym.
 *
 * Jedyny moment w roku, w którym porównanie napisów myli kolejność, to godzina
 * cofana pod koniec października: 2:30 pojawia się wtedy dwa razy i zdarzenia
 * z tej jednej godziny mogą stanąć w złej kolejności względem siebie. Doba
 * przed i po jest poprawna, więc nie ma za co płacić przenoszeniem znaczników
 * czasu przez sześć źródeł.
 */
export function newestFirst(
  a: { date: string; sortDate?: string },
  b: { date: string; sortDate?: string },
): number {
  return (b.sortDate ?? b.date).localeCompare(a.sortDate ?? a.date);
}
