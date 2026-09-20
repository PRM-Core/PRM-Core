import { currentLocale, t } from "@/lib/i18n";

/**
 * Odmiana rzeczownika przez liczbę — po polsku.
 *
 * **Po co osobna funkcja.** Angielskie `n === 1 ? "x" : "xs"` daje po polsku
 * zdania w rodzaju „1 rzeczy do poprawy" i „5 krytyczne spostrzeżenia".
 * W interfejsie, który ma budzić zaufanie do liczb, taki błąd rzuca się
 * w oczy bardziej niż cokolwiek innego na ekranie.
 *
 * Polski ma trzy formy i **nie da się ich wybrać samą resztą z dzielenia**:
 * 12–14 wygląda jak 2–4, a zachowuje się jak 5+. Stąd wyjątek na drugą cyfrę.
 *
 *   plural(1, "spostrzeżenie", "spostrzeżenia", "spostrzeżeń")  → "spostrzeżenie"
 *   plural(3, …)                                                → "spostrzeżenia"
 *   plural(13, …)                                               → "spostrzeżeń"
 *   plural(22, …)                                               → "spostrzeżenia"
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n));
  // English has two forms: the Polish "one" and "many" forms are the keys.
  if (currentLocale() !== "pl") return t(abs === 1 ? one : many);
  if (abs === 1) return one;
  const last = abs % 10;
  const lastTwo = abs % 100;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
  return many;
}

/** To samo z doklejoną liczbą — „3 spostrzeżenia". */
export function count(n: number, one: string, few: string, many: string): string {
  return `${n} ${plural(n, one, few, many)}`;
}
