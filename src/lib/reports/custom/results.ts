import { isDay, rangeLength, shiftDay } from "../../dashboard/activity";
import {
  MAX_SERIES,
  findDimension,
  findMeasure,
  type ReportRange,
  type ReportWidget,
  type SourceDef,
  type TimeGrain,
  type ValueFormat,
} from "./catalog";
import { bucketOfDay } from "./warsaw-sql";
import { t, localized } from "@/lib/i18n";

/**
 * Własne raporty — zakres dat i kształtowanie wyniku zapytania.
 *
 * Czyste funkcje: dostają surowe wiersze z bazy, zwracają to, co rysuje ekran.
 * Tu zapadają decyzje, które łatwo pomylić bez błędu na ekranie — co ucinamy,
 * czym wypełniamy puste dni, jak liczyć „pokazano 15 z 42".
 */

/** Najdłuższy zakres raportu — trzy lata trendu wystarczą, dłuższe zapytania mulą bazę. */
export const MAX_REPORT_DAYS = 1096;

/** Wartość wymiaru dla pustego pola w bazie. Ekran pokazuje ją jako „(brak)". */
export const EMPTY_VALUE = "";
export const EMPTY_LABEL = "(brak)";

export const RANGE_PRESETS: { value: ReportRange["preset"]; label: string }[] = localized(() => [
  { value: "7", label: t("Ostatnie 7 dni") },
  { value: "30", label: t("Ostatnie 30 dni") },
  { value: "90", label: t("Ostatnie 90 dni") },
  { value: "365", label: t("Ostatnie 12 miesięcy") },
  { value: "this_month", label: t("Ten miesiąc") },
  { value: "last_month", label: t("Poprzedni miesiąc") },
  { value: "this_year", label: t("Ten rok") },
  { value: "custom", label: t("Własny zakres") },
]);

/** Zakres raportu jako dwie daty warszawskie — albo zdanie, co jest nie tak. */
export function resolveRange(
  range: ReportRange,
  today: string,
): { from: string; to: string } | { error: string } {
  switch (range.preset) {
    case "7":
    case "30":
    case "90":
    case "365":
      return { from: shiftDay(today, -(Number(range.preset) - 1)), to: today };
    case "this_month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "last_month": {
      const firstThis = `${today.slice(0, 7)}-01`;
      const lastPrev = shiftDay(firstThis, -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    }
    case "this_year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom": {
      if (!isDay(range.from) || !isDay(range.to)) return { error: t("Podaj obie daty zakresu.") };
      if (range.from > range.to)
        return { error: t("Data początkowa jest późniejsza niż końcowa.") };
      if (rangeLength(range.from, range.to) > MAX_REPORT_DAYS) {
        return {
          error: t("Zakres raportu może obejmować najwyżej {MAX_REPORT_DAYS} dni.", {
            MAX_REPORT_DAYS: MAX_REPORT_DAYS,
          }),
        };
      }
      return { from: range.from, to: range.to };
    }
  }
}

/**
 * Okresy (tygodnie, miesiące), których zakres raportu nie obejmuje w całości.
 *
 * Tydzień, z którego raport widzi dwa dni, ma naturalnie mniej wizyt niż pełny —
 * na wykresie wygląda to jak załamanie, którego nie było. Ekran oznacza takie
 * okresy, zamiast pozwolić czytelnikowi wyciągnąć fałszywy wniosek.
 */
export function partialBuckets(grain: TimeGrain, from: string, to: string): string[] {
  if (grain === "day") return [];
  return timeBuckets(grain, from, to).filter((b) => {
    const start = grain === "week" ? b : `${b}-01`;
    const end =
      grain === "week" ? shiftDay(b, 6) : shiftDay(`${shiftDay(`${b}-28`, 4).slice(0, 7)}-01`, -1);
    return start < from || end > to;
  });
}

/** Wszystkie kubełki czasu w zakresie, w kolejności — do wypełnienia pustych okresów. */
export function timeBuckets(grain: TimeGrain, from: string, to: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let day = from; day <= to; day = shiftDay(day, 1)) {
    const b = bucketOfDay(grain, day);
    if (!seen.has(b)) {
      seen.add(b);
      out.push(b);
    }
  }
  return out;
}

export type Cell = string | number | null;
export type RawRow = Record<string, Cell>;

export interface ResultColumn {
  key: string;
  label: string;
  role: "dimension" | "measure";
  format?: ValueFormat;
  grain?: TimeGrain;
}

export interface WidgetData {
  from: string;
  to: string;
  columns: ResultColumn[];
  /**
   * Wiersze. Wymiary pod `d0`, `d1` (wartość surowa) i `d0_label`, `d1_label`;
   * miary pod `m0`…`m3`. Przy rozbiciu na serie (wykres z dwoma wymiarami)
   * zamiast `m0` są `s0`…`sN`.
   */
  rows: RawRow[];
  /** Serie rozbicia — tylko wykres słupkowy i liniowy z drugim wymiarem. */
  series: { key: string; value: string; label: string }[] | null;
  /** „Pokazano N z M" — gdy pozycji było więcej niż limit kafelka. */
  truncated: { shown: number; total: number } | null;
  seriesTruncated: { shown: number; total: number } | null;
  /**
   * Barwy nadane wartościom przez placówkę (dziś: statusy kontaktu). Ekran
   * używa ich przed paletą, żeby „Pacjent" miał ten sam kolor w raporcie co na
   * pulpicie.
   */
  valueColors?: Record<string, string>;
  /** Niepełne okresy osi czasu — patrz `partialBuckets`. */
  partial: string[];
}

export type LabelFn = (dimension: string, value: string) => string;

function num(v: Cell): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Surowe wiersze z bazy → wynik kafelka.
 *
 * `raw` ma kolumny `d0`, `d1`, `m0`…`m3` dokładnie w kolejności wymiarów
 * i miar kafelka.
 */
export function shapeResult(input: {
  widget: ReportWidget;
  source: SourceDef;
  raw: RawRow[];
  from: string;
  to: string;
  labelOf: LabelFn;
}): WidgetData {
  const { widget: w, source, raw, from, to, labelOf } = input;
  const measures = w.measures.map((k) => findMeasure(source, k)!);
  const dims = w.dimensions.map((k) => findDimension(source, k)!);

  const columns: ResultColumn[] = [
    ...dims.map((d, i) => ({
      key: `d${i}`,
      label: d.label,
      role: "dimension" as const,
      grain: d.kind === "time" ? (d.key as TimeGrain) : undefined,
    })),
    ...measures.map((m, i) => ({
      key: `m${i}`,
      label: m.label,
      role: "measure" as const,
      format: m.format,
    })),
  ];

  const clean = (r: RawRow): RawRow => {
    const out: RawRow = {};
    dims.forEach((d, i) => {
      const v = r[`d${i}`];
      const value = v === null || v === undefined ? EMPTY_VALUE : String(v);
      out[`d${i}`] = value;
      out[`d${i}_label`] =
        d.kind === "time" ? value : value === EMPTY_VALUE ? EMPTY_LABEL : labelOf(d.key, value);
    });
    measures.forEach((_, i) => {
      out[`m${i}`] = num(r[`m${i}`]);
    });
    return out;
  };
  const rows = raw.map(clean);
  const timeDim = dims.find((d) => d.kind === "time");
  const base = {
    from,
    to,
    columns,
    series: null,
    truncated: null,
    seriesTruncated: null,
    partial: timeDim ? partialBuckets(timeDim.key as TimeGrain, from, to) : [],
  };

  // ── Liczba ────────────────────────────────────────────────────────────────
  if (dims.length === 0) {
    const row = rows[0] ?? {};
    const out: RawRow = {};
    measures.forEach((m, i) => {
      out[`m${i}`] = row[`m${i}`] ?? (m.additive === false ? null : 0);
    });
    return { ...base, rows: [out] };
  }

  const emptyMeasure = (i: number): Cell => (measures[i].additive === false ? null : 0);
  const firstIsTime = dims[0].kind === "time";
  const byValueDesc = (a: RawRow, b: RawRow) => (num(b.m0) ?? -Infinity) - (num(a.m0) ?? -Infinity);

  // ── Jeden wymiar ──────────────────────────────────────────────────────────
  if (dims.length === 1) {
    if (firstIsTime) {
      const grain = dims[0].key as TimeGrain;
      const got = new Map(rows.map((r) => [String(r.d0), r]));
      const filled = timeBuckets(grain, from, to).map((b) => {
        const existing = got.get(b);
        if (existing) return existing;
        const empty: RawRow = { d0: b, d0_label: b };
        measures.forEach((_, i) => (empty[`m${i}`] = emptyMeasure(i)));
        return empty;
      });
      return { ...base, rows: filled };
    }
    const sorted = [...rows].sort(byValueDesc);
    return {
      ...base,
      rows: sorted.slice(0, w.limit),
      truncated: sorted.length > w.limit ? { shown: w.limit, total: sorted.length } : null,
    };
  }

  // ── Dwa wymiary, wykres: rozbicie na serie ────────────────────────────────
  if (w.type === "bar" || w.type === "line") {
    const seriesTotals = new Map<string, { label: string; total: number }>();
    const groupTotals = new Map<string, { label: string; total: number }>();
    for (const r of rows) {
      const s = String(r.d1);
      const g = String(r.d0);
      const v = num(r.m0) ?? 0;
      const st = seriesTotals.get(s) ?? { label: String(r.d1_label), total: 0 };
      st.total += v;
      seriesTotals.set(s, st);
      const gt = groupTotals.get(g) ?? { label: String(r.d0_label), total: 0 };
      gt.total += v;
      groupTotals.set(g, gt);
    }
    const seriesRanked = [...seriesTotals.entries()].sort((a, b) => b[1].total - a[1].total);
    const keptSeries = seriesRanked.slice(0, MAX_SERIES);
    const series = keptSeries.map(([value, s], i) => ({ key: `s${i}`, value, label: s.label }));
    const seriesIndex = new Map(series.map((s) => [s.value, s.key]));

    let groups: { value: string; label: string }[];
    let truncated: WidgetData["truncated"] = null;
    if (firstIsTime) {
      groups = timeBuckets(dims[0].key as TimeGrain, from, to).map((b) => ({ value: b, label: b }));
    } else {
      const ranked = [...groupTotals.entries()].sort((a, b) => b[1].total - a[1].total);
      groups = ranked.slice(0, w.limit).map(([value, g]) => ({ value, label: g.label }));
      if (ranked.length > w.limit) truncated = { shown: w.limit, total: ranked.length };
    }

    const pivot = new Map<string, RawRow>();
    for (const g of groups) {
      const row: RawRow = { d0: g.value, d0_label: g.label };
      for (const s of series) row[s.key] = emptyMeasure(0);
      pivot.set(g.value, row);
    }
    for (const r of rows) {
      const row = pivot.get(String(r.d0));
      const sk = seriesIndex.get(String(r.d1));
      if (row && sk) row[sk] = num(r.m0);
    }
    return {
      ...base,
      rows: [...pivot.values()],
      series,
      truncated,
      seriesTruncated:
        seriesRanked.length > MAX_SERIES ? { shown: MAX_SERIES, total: seriesRanked.length } : null,
    };
  }

  // ── Dwa wymiary, tabela ───────────────────────────────────────────────────
  // Grupy pierwszego wymiaru obok siebie: czas rosnąco, kategorie od największej.
  const groupTotal = new Map<string, number>();
  for (const r of rows) {
    const g = String(r.d0);
    groupTotal.set(g, (groupTotal.get(g) ?? 0) + (num(r.m0) ?? 0));
  }
  const sorted = [...rows].sort((a, b) => {
    const ga = String(a.d0);
    const gb = String(b.d0);
    if (ga !== gb) {
      if (firstIsTime) return ga < gb ? -1 : 1;
      const diff = (groupTotal.get(gb) ?? 0) - (groupTotal.get(ga) ?? 0);
      return diff !== 0 ? diff : ga < gb ? -1 : 1;
    }
    return byValueDesc(a, b);
  });
  return {
    ...base,
    rows: sorted.slice(0, w.limit),
    truncated: sorted.length > w.limit ? { shown: w.limit, total: sorted.length } : null,
  };
}
