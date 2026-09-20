import type { TimeGrain, ValueFormat } from "@/lib/reports/custom/catalog";
import { intlLocale, t } from "@/lib/i18n";

/**
 * Formatowanie wartości i barwy serii w raportach własnych.
 */

const numberFmt = new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 1 });
const currencyFmt = new Intl.NumberFormat(intlLocale(), {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 0,
});
const percentFmt = new Intl.NumberFormat(intlLocale(), {
  style: "percent",
  maximumFractionDigits: 1,
});

export function formatValue(value: unknown, format: ValueFormat | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  switch (format) {
    case "currency":
      return currencyFmt.format(n);
    case "percent":
      return percentFmt.format(n);
    default:
      return numberFmt.format(n);
  }
}

/** Data jako środek dnia UTC — żadna strefa przeglądarki jej nie przesunie. */
function asDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

/** Etykieta okresu na osi i w tabeli. Tydzień podpisany datą poniedziałku. */
export function formatPeriod(value: string, grain: TimeGrain, long = false): string {
  if (!value) return "—";
  if (grain === "month") {
    const d = asDate(`${value}-01`);
    return d.toLocaleDateString(intlLocale(), {
      month: long ? "long" : "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const d = asDate(value);
  if (grain === "week") {
    const label = d.toLocaleDateString(intlLocale(), {
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
    });
    return long ? t("tydzień od {label}", { label: label }) : label;
  }
  return d.toLocaleDateString(intlLocale(), {
    day: "2-digit",
    month: "2-digit",
    ...(long ? { year: "numeric", weekday: "short" } : {}),
    timeZone: "UTC",
  });
}

export function formatRange(from: string, to: string): string {
  const f = (d: string) =>
    asDate(d).toLocaleDateString(intlLocale(), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  return from === to ? f(from) : `${f(from)} – ${f(to)}`;
}

/**
 * Paleta kategorii — sprawdzona walidatorem na białej karcie: przechodzi
 * rozróżnialność dla daltonistów i normalnego widzenia między sąsiednimi
 * barwami. Trzy barwy (zielonkawa, żółta, różowa) mają kontrast poniżej 3:1,
 * dlatego każdy wykres ma legendę, podpowiedź i przełącznik widoku tabeli.
 * Kolejność stała; dziewiątej barwy nie ma — kafelek pokazuje najwyżej 8 serii.
 */
export const SERIES_PALETTE = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
];

/**
 * Barwy serii: **stała kolejność palety, przydzielana alfabetycznie po
 * wartości** — nie po pozycji w rankingu.
 *
 * Dwa wymogi naraz. Po pierwsze kolor ma iść za kategorią: gdyby „Kardiolog"
 * był pierwszą barwą tylko dlatego, że dziś ma najwięcej wizyt, jutrzejsza
 * zmiana kolejności przemalowałaby wykres. Po drugie paleta jest sprawdzona
 * pod kątem rozróżnialności **sąsiednich** barw w swojej kolejności — przydział
 * z funkcji skrótu postawiłby obok siebie np. żółty i pomarańczowy, a ta para
 * progów nie przechodzi. Stąd alfabet: kolejność nie zależy od liczb, a serie
 * rysowane są w tej samej kolejności co paleta (patrz `orderValues`).
 *
 * Barwy nadane przez placówkę (statusy kontaktu) mają pierwszeństwo.
 */
export function seriesColors(
  values: string[],
  fixed?: Record<string, string>,
): Map<string, string> {
  const out = new Map<string, string>();
  let slot = 0;
  for (const v of orderValues(values)) {
    if (fixed?.[v]) out.set(v, fixed[v]);
    else out.set(v, SERIES_PALETTE[slot++ % SERIES_PALETTE.length]);
  }
  return out;
}

/** Kolejność alfabetyczna po polsku — ta sama dla barw, legendy i warstw stosu. */
export function orderValues(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "pl"));
}
