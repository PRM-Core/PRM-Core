import { intlLocale, t } from "@/lib/i18n";
/**
 * Formatowanie liczb w raportach — z jedną zasadą przewodnią.
 *
 * **`null` to „brak danych", nigdy „zero".** Bounce rate bez wpiętego Event
 * Webhooka SendGrida jest nieznany; wyświetlenie tam „0%" dałoby ekran, na
 * którym każda wysyłka wygląda bez zarzutu — a placówka podejmuje na tej
 * podstawie decyzje o kolejnych tysiącach wiadomości. Te trzy funkcje są
 * jedynym miejscem, w którym ta zasada się egzekwuje, więc nie wolno omijać
 * ich lokalnym `?? 0`.
 */

/** Kreska em, nie „0" i nie „—" ze spacjami: ma być widać, że to brak wartości. */
export const NO_DATA = "—";

export function pct(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return NO_DATA;
  return `${(value * 100).toFixed(digits)}%`;
}

export function num(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NO_DATA;
  return value.toLocaleString(intlLocale());
}

/** Grosze → złote. Kwoty trzymamy w groszach, żeby żaden float nie zaokrąglił ceny. */
export function zloty(grosze: number | null): string {
  if (grosze === null || !Number.isFinite(grosze)) return NO_DATA;
  return t("{v0} zł", {
    v0: (grosze / 100).toLocaleString(intlLocale(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  });
}

export function dateTime(ms: number | null): string {
  if (ms === null) return NO_DATA;
  return new Date(ms).toLocaleString(intlLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Ile wierszy na stronę w listach odbiorców. */
export const PAGE_SIZE = 30;

export interface PageMath {
  /** Strona faktycznie pokazana — może różnić się od żądanej, patrz niżej. */
  page: number;
  pages: number;
  from: number;
  to: number;
}

/**
 * Arytmetyka stronicowania.
 *
 * **Żądana strona jest przycinana do zakresu**, bo lista potrafi się skrócić
 * pod ręką: raport odświeża się po zmianie zakładki, a ktoś stojący na stronie
 * czwartej zobaczyłby pustą tabelę zamiast danych. Pusta lista daje jedną
 * stronę, nie zero — inaczej „0 / 0" wygląda jak błąd.
 */
export function pageMath(total: number, requested: number, size = PAGE_SIZE): PageMath {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(0, requested), pages - 1);
  const from = page * size;
  return { page, pages, from, to: Math.min(from + size, total) };
}
