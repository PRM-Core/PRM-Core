/**
 * Doba warszawska w SQL-u — bez obsługi stref czasowych w bazie.
 *
 * SQLite nie zna stref: `date(ts, 'unixepoch')` daje dobę UTC, więc wszystko
 * między północą a 1:00 (zimą) albo 2:00 (latem) trafiałoby do poprzedniego
 * dnia. Grupowanie po dniach w JS-ie jest dokładne, ale przy dziesiątkach
 * tysięcy wierszy wolne — dlatego przesunięcie liczymy w samym zapytaniu.
 *
 * **Reguła UE jest stała od 1996 r.**: czas letni zaczyna się w ostatnią
 * niedzielę marca o 01:00 UTC i kończy w ostatnią niedzielę października
 * o 01:00 UTC. Dla zakresu raportu wyliczamy te chwile i wstawiamy je do
 * wyrażenia `CASE`. Liczby pochodzą z arytmetyki na datach, nigdy od
 * użytkownika, więc wstawienie ich wprost do SQL-a jest bezpieczne.
 *
 * Zgodność z `warsawOffset()` sprawdza test na każdej godzinie kilku lat.
 */

const HOUR_MS = 60 * 60 * 1000;

/** Ostatnia niedziela miesiąca (0-11) o 01:00 UTC. */
function lastSundayAt0100Utc(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  const back = lastDay.getUTCDay(); // 0 = niedziela
  return Date.UTC(year, month, lastDay.getUTCDate() - back, 1, 0, 0);
}

/** Przedziały [od, do) czasu letniego, które zahaczają o zakres. */
export function dstIntervals(fromMs: number, toMs: number): [number, number][] {
  const out: [number, number][] = [];
  const y0 = new Date(fromMs).getUTCFullYear() - 1;
  const y1 = new Date(toMs).getUTCFullYear() + 1;
  for (let y = y0; y <= y1; y++) {
    const start = lastSundayAt0100Utc(y, 2);
    const end = lastSundayAt0100Utc(y, 9);
    if (end > fromMs && start < toMs) out.push([start, end]);
  }
  return out;
}

/** Offset Warszawy w ms dla chwili — ta sama reguła co w SQL-u, do testów i wypełniania luk. */
export function warsawOffsetMs(ms: number): number {
  return dstIntervals(ms - 1, ms + 1).some(([a, b]) => ms >= a && ms < b) ? 2 * HOUR_MS : HOUR_MS;
}

function assertSafeColumn(column: string): void {
  // Nazwę kolumny podaje kod z zamkniętej mapy, ale sprawdzamy i tak —
  // ta funkcja wkleja ją do SQL-a wprost.
  if (!/^[a-z_]+\.[a-z_]+$/.test(column)) {
    throw new Error(`warsaw-sql: niedozwolona nazwa kolumny ${column}`);
  }
}

/**
 * Wyrażenie SQL dające dobę warszawską `RRRR-MM-DD` dla kolumny z milisekundami.
 * Wartość `NULL` w kolumnie daje `NULL`.
 */
export function warsawDayExpr(column: string, fromMs: number, toMs: number): string {
  assertSafeColumn(column);
  const intervals = dstIntervals(fromMs, toMs);
  const offset =
    intervals.length === 0
      ? String(HOUR_MS)
      : `CASE WHEN ${intervals
          .map(([a, b]) => `(${column} >= ${a} AND ${column} < ${b})`)
          .join(" OR ")} THEN ${2 * HOUR_MS} ELSE ${HOUR_MS} END`;
  return `date((${column} + (${offset})) / 1000, 'unixepoch')`;
}

/**
 * Doba → kubełek. Tydzień to **poniedziałek** tego tygodnia (`weekday 0`
 * przesuwa na najbliższą niedzielę, także gdy dziś jest niedziela, a sześć dni
 * wstecz to poniedziałek). Miesiąc to `RRRR-MM`.
 */
export function bucketExpr(grain: "day" | "week" | "month", dayExpr: string): string {
  switch (grain) {
    case "day":
      return dayExpr;
    case "week":
      return `date(${dayExpr}, 'weekday 0', '-6 days')`;
    case "month":
      return `strftime('%Y-%m', ${dayExpr})`;
  }
}

/** To samo po stronie JS — do wypełniania pustych okresów zerami. */
export function bucketOfDay(grain: "day" | "week" | "month", day: string): string {
  if (grain === "day") return day;
  if (grain === "month") return day.slice(0, 7);
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // pon = 0
  return new Date(d.getTime() - back * 24 * HOUR_MS).toISOString().slice(0, 10);
}
