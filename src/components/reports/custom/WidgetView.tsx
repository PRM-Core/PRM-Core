import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BarChart3, Loader2, Table2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { runCustomReportWidget } from "@/lib/api/custom-reports.functions";
import {
  findSource,
  widgetProblems,
  withoutEmptyFilters,
  type ReportRange,
  type ReportWidget,
  type TimeGrain,
} from "@/lib/reports/custom/catalog";
import type { WidgetData } from "@/lib/reports/custom/results";
import {
  formatPeriod,
  formatRange,
  formatValue,
  orderValues,
  SERIES_PALETTE,
  seriesColors,
} from "./format";
import { t as tr } from "@/lib/i18n";

/**
 * Jeden kafelek raportu: pobiera swoje dane i je rysuje.
 *
 * Podczas budowania raportu kafelek zmienia się przy każdym kliknięciu, więc
 * zapytanie idzie z opóźnieniem i tylko wtedy, gdy zmieniło się coś, co wpływa
 * na liczby — tytuł i szerokość nie wywołują ponownego liczenia.
 */

const GRID = "oklch(0.93 0.01 240)";
const TICK = { fontSize: 11, fill: "oklch(0.5 0.02 250)" };

function queryKey(w: ReportWidget, range: ReportRange): string {
  return JSON.stringify({
    t: w.type,
    s: w.source,
    m: w.measures,
    d: w.dimensions,
    f: w.filters,
    l: w.limit,
    r: range,
  });
}

export function WidgetView({
  widget: rawWidget,
  range,
}: {
  widget: ReportWidget;
  range: ReportRange;
}) {
  // Filtr bez zaznaczonych wartości nic nie zawęża — liczymy bez niego.
  const widget = useMemo(() => withoutEmptyFilters(rawWidget), [rawWidget]);
  const problems = useMemo(() => widgetProblems(widget), [widget]);
  const [data, setData] = useState<WidgetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [asTable, setAsTable] = useState(false);
  const request = useRef(0);
  const key = queryKey(widget, range);

  useEffect(() => {
    if (problems.length > 0) return;
    const id = ++request.current;
    setLoading(true);
    // Krótka zwłoka: przy szybkim klikaniu w konfiguracji idzie jedno zapytanie, nie dziesięć.
    const timer = setTimeout(() => {
      runCustomReportWidget({ data: { widget, range } })
        .then((res) => {
          if (id !== request.current) return;
          setData(res);
          setError(null);
        })
        .catch((e: unknown) => {
          if (id !== request.current) return;
          setError(e instanceof Error ? e.message : tr("Nie udało się policzyć kafelka."));
        })
        .finally(() => {
          if (id === request.current) setLoading(false);
        });
    }, 300);
    return () => clearTimeout(timer);
    // `key` opisuje wszystko, co wpływa na liczby.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, problems.length]);

  if (problems.length > 0) {
    return (
      <div className="flex min-h-[120px] items-start gap-2 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p className="font-medium text-foreground">{tr("Kafelek do dokończenia")}</p>
          <p>{problems[0]}</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="flex min-h-[120px] items-start gap-2 rounded-lg bg-destructive/5 p-3 text-sm text-destructive"
        role="alert"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-[120px] items-center justify-center">
        <Loader2
          className="h-5 w-5 animate-spin text-muted-foreground"
          aria-label={tr("Liczenie")}
        />
      </div>
    );
  }

  const chart = widget.type === "bar" || widget.type === "line";
  return (
    <div className="relative space-y-2">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{formatRange(data.from, data.to)}</p>
        <div className="flex items-center gap-1">
          {loading && (
            <Loader2
              className="h-3.5 w-3.5 animate-spin text-muted-foreground"
              aria-label={tr("Liczenie")}
            />
          )}
          {chart && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() => setAsTable((v) => !v)}
              aria-pressed={asTable}
            >
              {asTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
              {asTable ? tr("Wykres") : tr("Tabela")}
            </Button>
          )}
        </div>
      </div>

      {widget.type === "kpi" ? (
        <Kpi widget={widget} data={data} />
      ) : widget.type === "table" || asTable ? (
        <DataTable data={data} />
      ) : isEmpty(data) ? (
        <Empty />
      ) : widget.type === "bar" ? (
        <BarView data={data} />
      ) : (
        <LineView data={data} />
      )}

      {widget.type !== "kpi" && data.partial.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {data.partial.length === 1
            ? tr("Jeden okres jest niepełny")
            : tr("Pierwszy i ostatni okres są niepełne")}
          {tr(" — obejmują tylko dni z zakresu raportu, więc mają naturalnie mniejsze wartości.")}
          {chart && !asTable && tr(" Na wykresie są przygaszone.")}
        </p>
      )}

      {(data.truncated || data.seriesTruncated) && (
        <p className="text-[11px] text-muted-foreground">
          {data.truncated &&
            tr("Pokazano {shown} z {total} pozycji.", {
              shown: data.truncated.shown,
              total: data.truncated.total,
            })}
          {data.truncated && data.seriesTruncated && " "}
          {data.seriesTruncated &&
            tr("W podziale {shown} z {total} najliczniejszych.", {
              shown: data.seriesTruncated.shown,
              total: data.seriesTruncated.total,
            })}
        </p>
      )}
    </div>
  );
}

function isEmpty(data: WidgetData): boolean {
  if (data.rows.length === 0) return true;
  const valueKeys = data.series ? data.series.map((s) => s.key) : ["m0"];
  return data.rows.every((r) => valueKeys.every((k) => r[k] === null || r[k] === 0));
}

function Empty() {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-lg bg-muted/30 text-sm text-muted-foreground">
      {tr("Brak danych w tym okresie.")}
    </div>
  );
}

function Kpi({ widget, data }: { widget: ReportWidget; data: WidgetData }) {
  const measure = data.columns.find((c) => c.role === "measure");
  const source = findSource(widget.source);
  return (
    <div className="py-2">
      <p className="text-4xl font-semibold tracking-tight tabular-nums">
        {formatValue(data.rows[0]?.m0, measure?.format)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {measure?.label}
        {source ? tr(" · według: {dateLabel}", { dateLabel: source.dateLabel }) : ""}
      </p>
    </div>
  );
}

function dimLabel(
  row: Record<string, unknown>,
  i: number,
  grain: TimeGrain | undefined,
  long = false,
  partial?: string[],
) {
  const raw = String(row[`d${i}`] ?? "");
  if (!grain) return String(row[`d${i}_label`] ?? raw);
  const label = formatPeriod(raw, grain, long);
  // Dopisek tylko w pełnej postaci (podpowiedź, tabela) — oś zostaje czytelna.
  return long && partial?.includes(raw) ? tr("{label} (niepełny)", { label: label }) : label;
}

/**
 * Tekst legendy w kolorze tekstu, nie serii — barwę niesie kropka obok.
 * Recharts domyślnie maluje napis kolorem serii, a żółty czy różowy napis na
 * białej karcie ma kontrast ok. 2:1 i czyta się źle.
 */
function legendText(value: string) {
  return <span style={{ color: "oklch(0.37 0.02 250)" }}>{value}</span>;
}

/** Serie w kolejności palety — ta sama dla barw, legendy i warstw stosu. */
function useSeries(data: WidgetData) {
  return useMemo(() => {
    if (!data.series) return null;
    const colors = seriesColors(
      data.series.map((s) => s.value),
      data.valueColors,
    );
    const order = orderValues(data.series.map((s) => s.value));
    return order.map((value) => {
      const s = data.series!.find((x) => x.value === value)!;
      return { ...s, color: colors.get(value)! };
    });
  }, [data]);
}

function BarView({ data }: { data: WidgetData }) {
  const series = useSeries(data);
  const dim = data.columns[0];
  const measure = data.columns.find((c) => c.role === "measure")!;
  const grain = dim.grain;
  const rows = data.rows.map((r) => ({ ...r, __label: dimLabel(r, 0, grain) }));
  const fmt = (v: unknown) => formatValue(v, measure.format);

  // Czas — kolumny w poziomie. Kategorie — słupki poziome: nazwy lekarzy
  // i szablonów są długie, a obrócone etykiety osi czyta się źle.
  const horizontal = !grain;
  const height = horizontal ? Math.max(180, rows.length * 30 + 40) : 260;
  const valueKeys = series ? series.map((s) => s.key) : ["m0"];
  const lastKey = valueKeys[valueKeys.length - 1];

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ left: horizontal ? 8 : -12, right: 12, top: 4, bottom: 4 }}
          barCategoryGap={horizontal ? 6 : "20%"}
        >
          <CartesianGrid stroke={GRID} vertical={horizontal} horizontal={!horizontal} />
          {/* Osie jako bezpośrednie dzieci wykresu: Recharts 2 szuka ich po typie
              komponentu tylko na pierwszym poziomie. Owinięte we fragment Reacta
              znikały — bez skali wszystkie słupki lądowały w jednym punkcie,
              a osie nie miały żadnych etykiet. */}
          <XAxis
            type={horizontal ? "number" : "category"}
            dataKey={horizontal ? undefined : "__label"}
            tick={TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={horizontal ? fmt : undefined}
            minTickGap={horizontal ? undefined : 8}
          />
          <YAxis
            type={horizontal ? "category" : "number"}
            dataKey={horizontal ? "__label" : undefined}
            width={horizontal ? 140 : 56}
            tick={TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={horizontal ? undefined : fmt}
            interval={horizontal ? 0 : undefined}
          />
          <RTooltip
            cursor={{ fill: "oklch(0.96 0.01 240)" }}
            formatter={(v: unknown, name: string) => [fmt(v), name]}
            labelFormatter={(_l, payload) => {
              const row = payload?.[0]?.payload as Record<string, unknown> | undefined;
              return row ? dimLabel(row, 0, grain, true, data.partial) : "";
            }}
            contentStyle={{ borderRadius: 10, border: `1px solid ${GRID}`, fontSize: 12 }}
          />
          {series && series.length > 1 && (
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
          )}
          {(series ?? [{ key: "m0", label: measure.label, color: SERIES_PALETTE[0] }]).map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={series ? "stos" : undefined}
              fill={s.color}
              // Szczelina w kolorze karty między warstwami stosu; zaokrąglony
              // tylko koniec słupka z danymi.
              stroke={series ? "#ffffff" : undefined}
              strokeWidth={series ? 2 : 0}
              radius={s.key === lastKey ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : undefined}
              maxBarSize={horizontal ? 22 : 48}
            >
              {/* Niepełny okres przygaszony — drugie kodowanie obok dopisku
                  w podpowiedzi, żeby krótszy słupek nie czytał się jak spadek. */}
              {rows.map((r) => (
                <Cell
                  key={String((r as Record<string, unknown>).d0)}
                  fillOpacity={
                    grain && data.partial.includes(String((r as Record<string, unknown>).d0))
                      ? 0.4
                      : 1
                  }
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LineView({ data }: { data: WidgetData }) {
  const series = useSeries(data);
  const dim = data.columns[0];
  const measure = data.columns.find((c) => c.role === "measure")!;
  const grain = dim.grain;
  const rows = data.rows.map((r) => ({ ...r, __label: dimLabel(r, 0, grain) }));
  const fmt = (v: unknown) => formatValue(v, measure.format);

  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ left: -12, right: 12, top: 8, bottom: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="__label" tick={TICK} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={fmt} width={56} />
          <RTooltip
            formatter={(v: unknown, name: string) => [fmt(v), name]}
            labelFormatter={(_l, payload) => {
              const row = payload?.[0]?.payload as Record<string, unknown> | undefined;
              return row ? dimLabel(row, 0, grain, true, data.partial) : "";
            }}
            contentStyle={{ borderRadius: 10, border: `1px solid ${GRID}`, fontSize: 12 }}
          />
          {series && series.length > 1 && (
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
          )}
          {(series ?? [{ key: "m0", label: measure.label, color: SERIES_PALETTE[0] }]).map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 2 }}
              // Brak wartości (np. wskaźnik w dniu bez wysyłki) to przerwa w linii,
              // a nie spadek do zera.
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="sr-only">
        {tr("{label} w podziale na {v1} — dokładne wartości w widoku tabeli.", {
          label: measure.label,
          v1: dim.label.toLowerCase(),
        })}
      </p>
    </div>
  );
}

/** Tabela — kafelek tabelaryczny i widok tabeli dla wykresu. */
function DataTable({ data }: { data: WidgetData }) {
  const dims = data.columns.filter((c) => c.role === "dimension");
  const measureCols = data.columns.filter((c) => c.role === "measure");
  const series = data.series
    ? orderValues(data.series.map((s) => s.value)).map(
        (v) => data.series!.find((s) => s.value === v)!,
      )
    : null;
  const valueCols = series
    ? series.map((s) => ({ key: s.key, label: s.label, format: measureCols[0]?.format }))
    : measureCols.map((m) => ({ key: m.key, label: m.label, format: m.format }));
  const shownDims = series ? dims.slice(0, 1) : dims;

  if (data.rows.length === 0) return <Empty />;

  return (
    <div className="max-h-[420px] overflow-auto rounded-lg border border-border/60">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/60 backdrop-blur">
          <tr className="text-left text-xs text-muted-foreground">
            {shownDims.map((d) => (
              <th key={d.key} scope="col" className="px-3 py-2 font-medium">
                {d.label}
              </th>
            ))}
            {valueCols.map((c) => (
              <th key={c.key} scope="col" className="px-3 py-2 text-right font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i} className="border-t border-border/50">
              {shownDims.map((d, di) => (
                <td key={d.key} className="px-3 py-1.5">
                  {dimLabel(r, di, d.grain, true, data.partial)}
                </td>
              ))}
              {valueCols.map((c) => (
                <td key={c.key} className="px-3 py-1.5 text-right tabular-nums">
                  {formatValue(r[c.key], c.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
