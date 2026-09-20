import { useEffect, useState } from "react";
import { Filter, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { getCustomReportFilterValues } from "@/lib/api/custom-reports.functions";
import {
  MAX_FILTERS,
  MAX_ROWS,
  SOURCES,
  WIDGET_TYPE_BY_KEY,
  WIDGET_TYPES,
  findDimension,
  findSource,
  switchSource,
  widgetProblems,
  type ReportFilter,
  type ReportRange,
  type ReportWidget,
  type SourceKey,
  type WidgetType,
} from "@/lib/reports/custom/catalog";
import { t as tr } from "@/lib/i18n";

/**
 * Konfiguracja zaznaczonego kafelka. Każda zmiana od razu trafia do raportu,
 * a podgląd przelicza się sam — nie ma osobnego „Zastosuj".
 */

const NONE = "__brak__";

export function WidgetEditor({
  widget,
  range,
  onChange,
}: {
  widget: ReportWidget;
  range: ReportRange;
  onChange: (next: ReportWidget) => void;
}) {
  const source = findSource(widget.source)!;
  const type = WIDGET_TYPE_BY_KEY.get(widget.type)!;
  const problems = widgetProblems(widget);
  const set = (patch: Partial<ReportWidget>) => onChange({ ...widget, ...patch });

  const timeDims = source.dimensions.filter((d) => d.kind === "time");
  const categoryDims = source.dimensions.filter((d) => d.kind !== "time");
  const firstOptions = type.timeFirst ? timeDims : source.dimensions;
  const secondOptions = categoryDims.filter((d) => d.key !== widget.dimensions[0]);

  const changeType = (next: WidgetType) => {
    const spec = WIDGET_TYPE_BY_KEY.get(next)!;
    let dims = widget.dimensions.slice(0, spec.dimensions[1]);
    if (spec.dimensions[0] > 0 && dims.length === 0) {
      dims = [spec.timeFirst ? "day" : (categoryDims[0]?.key ?? "day")];
    }
    if (spec.timeFirst && dims[0] && findDimension(source, dims[0])?.kind !== "time") {
      dims = ["day", ...dims.filter((d) => findDimension(source, d)?.kind !== "time")].slice(
        0,
        spec.dimensions[1],
      );
    }
    set({ type: next, measures: widget.measures.slice(0, spec.maxMeasures), dimensions: dims });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="we-title" className="text-xs">
          {tr("Tytuł")}
        </Label>
        <Input
          id="we-title"
          value={widget.title}
          placeholder={tr("Automatyczny, z miary i podziału")}
          maxLength={120}
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="we-type" className="text-xs">
            {tr("Rodzaj")}
          </Label>
          <Select value={widget.type} onValueChange={(v) => changeType(v as WidgetType)}>
            <SelectTrigger id="we-type" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WIDGET_TYPES.map((t) => (
                <SelectItem key={t.type} value={t.type}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="we-width" className="text-xs">
            {tr("Szerokość")}
          </Label>
          <Select
            value={widget.width}
            onValueChange={(v) => set({ width: v as ReportWidget["width"] })}
          >
            <SelectTrigger id="we-width" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="half">{tr("Połowa")}</SelectItem>
              <SelectItem value="full">{tr("Cała szerokość")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      <div className="space-y-1.5">
        <Label htmlFor="we-source" className="text-xs">
          {tr("Dane")}
        </Label>
        <Select
          value={widget.source}
          onValueChange={(v) => onChange(switchSource(widget, v as SourceKey))}
        >
          <SelectTrigger id="we-source" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCES.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          {source.description} {tr(" Okres raportu liczony według: ")} {source.dateLabel}.
        </p>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium">
          {type.maxMeasures === 1
            ? tr("Co liczyć")
            : tr("Co liczyć (do {maxMeasures})", { maxMeasures: type.maxMeasures })}
        </legend>
        {type.maxMeasures === 1 ? (
          <Select value={widget.measures[0]} onValueChange={(v) => set({ measures: [v] })}>
            <SelectTrigger className="h-9" aria-label={tr("Co liczyć")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {source.measures.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="space-y-1">
            {source.measures.map((m) => {
              const checked = widget.measures.includes(m.key);
              const full = !checked && widget.measures.length >= type.maxMeasures;
              return (
                <div key={m.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`we-m-${m.key}`}
                    checked={checked}
                    disabled={full}
                    onCheckedChange={() =>
                      set({
                        measures: checked
                          ? widget.measures.filter((x) => x !== m.key)
                          : [...widget.measures, m.key],
                      })
                    }
                  />
                  <label
                    htmlFor={`we-m-${m.key}`}
                    className={`text-sm ${full ? "text-muted-foreground" : "cursor-pointer"}`}
                  >
                    {m.label}
                  </label>
                </div>
              );
            })}
          </div>
        )}
        {widget.measures
          .map((k) => source.measures.find((m) => m.key === k)?.hint)
          .filter(Boolean)
          .map((hint) => (
            <p key={hint} className="text-[11px] text-muted-foreground">
              {hint}
            </p>
          ))}
      </fieldset>

      {type.dimensions[1] > 0 && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="we-d0" className="text-xs">
              {type.timeFirst ? tr("Oś czasu") : tr("Podział")}
            </Label>
            <Select
              value={widget.dimensions[0] ?? ""}
              onValueChange={(v) =>
                set({
                  dimensions: [v, ...widget.dimensions.slice(1).filter((d) => d !== v)],
                })
              }
            >
              <SelectTrigger id="we-d0" className="h-9">
                <SelectValue placeholder={tr("Wybierz")} />
              </SelectTrigger>
              <SelectContent>
                {firstOptions.map((d) => (
                  <SelectItem key={d.key} value={d.key}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="we-d1" className="text-xs">
              {widget.type === "table"
                ? tr("Drugi podział (opcjonalnie)")
                : tr("Rozbicie na serie (opcjonalnie)")}
            </Label>
            <Select
              value={widget.dimensions[1] ?? NONE}
              onValueChange={(v) =>
                set({
                  dimensions:
                    v === NONE ? widget.dimensions.slice(0, 1) : [widget.dimensions[0], v],
                })
              }
            >
              <SelectTrigger id="we-d1" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{tr("Bez rozbicia")}</SelectItem>
                {secondOptions.map((d) => (
                  <SelectItem key={d.key} value={d.key}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {findDimension(source, widget.dimensions[0] ?? "")?.kind !== "time" && (
            <div className="space-y-1.5">
              <Label htmlFor="we-limit" className="text-xs">
                {tr("Ile pozycji pokazać")}
              </Label>
              <Input
                id="we-limit"
                type="number"
                min={1}
                max={MAX_ROWS}
                className="h-9 w-24"
                value={widget.limit}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  if (Number.isFinite(n)) set({ limit: Math.max(1, Math.min(MAX_ROWS, n)) });
                }}
              />
            </div>
          )}
        </div>
      )}

      <Separator />

      <FiltersEditor widget={widget} range={range} onChange={(filters) => set({ filters })} />

      {problems.length > 0 && (
        <p className="rounded-md bg-warning/15 px-2 py-1.5 text-xs" role="status">
          {problems[0]}
        </p>
      )}
    </div>
  );
}

function FiltersEditor({
  widget,
  range,
  onChange,
}: {
  widget: ReportWidget;
  range: ReportRange;
  onChange: (filters: ReportFilter[]) => void;
}) {
  const source = findSource(widget.source)!;
  const filterable = source.dimensions.filter((d) => d.filterable);
  const used = new Set(widget.filters.map((f) => f.dimension));
  const free = filterable.filter((d) => !used.has(d.key));

  const update = (i: number, next: ReportFilter | null) => {
    const list = [...widget.filters];
    if (next) list[i] = next;
    else list.splice(i, 1);
    onChange(list);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">{tr("Filtry")}</p>
        {free.length > 0 && widget.filters.length < MAX_FILTERS && (
          <Select
            value=""
            onValueChange={(v) =>
              onChange([...widget.filters, { dimension: v, operator: "in", values: [] }])
            }
          >
            <SelectTrigger
              className="h-7 w-auto gap-1 border-dashed px-2 text-xs"
              aria-label={tr("Dodaj filtr")}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{tr("Dodaj filtr")}</span>
            </SelectTrigger>
            <SelectContent>
              {free.map((d) => (
                <SelectItem key={d.key} value={d.key}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {widget.filters.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          {tr("Bez filtrów — liczone wszystko w okresie.")}
        </p>
      )}
      {widget.filters.map((f, i) => (
        <FilterRow
          key={f.dimension}
          filter={f}
          sourceKey={widget.source}
          range={range}
          onChange={(next) => update(i, next)}
        />
      ))}
    </div>
  );
}

function FilterRow({
  filter,
  sourceKey,
  range,
  onChange,
}: {
  filter: ReportFilter;
  sourceKey: string;
  range: ReportRange;
  onChange: (next: ReportFilter | null) => void;
}) {
  const source = findSource(sourceKey)!;
  const dim = findDimension(source, filter.dimension)!;
  const [options, setOptions] = useState<{ value: string; label: string; count: number }[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  // Bez samoczynnego otwierania po dodaniu filtra: zamykające kliknięcie listy
  // „Dodaj filtr" Radix odczytuje jako kliknięcie obok nowego okienka i od razu
  // je zamyka — otwarcie wyglądało na losowe. Przycisk „Wybierz wartości…" działa
  // zawsze.
  const [open, setOpen] = useState(false);
  const rangeKey = JSON.stringify(range);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(null);
    getCustomReportFilterValues({ data: { source: sourceKey, dimension: filter.dimension, range } })
      .then((v) => alive && setOptions(v))
      .catch(
        (e: unknown) =>
          alive && setError(e instanceof Error ? e.message : tr("Nie udało się pobrać wartości.")),
      );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceKey, filter.dimension, rangeKey]);

  const labelOf = (v: string) =>
    options?.find((o) => o.value === v)?.label ?? dim.valueLabels?.[v] ?? (v === "" ? "(brak)" : v);
  const toggle = (v: string) =>
    onChange({
      ...filter,
      values: filter.values.includes(v)
        ? filter.values.filter((x) => x !== v)
        : [...filter.values, v],
    });

  return (
    <div className="rounded-lg border border-border/60 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="text-xs font-medium">{dim.label}</span>
        <Select
          value={filter.operator}
          onValueChange={(v) => onChange({ ...filter, operator: v as ReportFilter["operator"] })}
        >
          <SelectTrigger
            className="h-7 w-auto px-2 text-xs"
            aria-label={tr("Warunek filtra {label}", { label: dim.label })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in">{tr("jest jednym z")}</SelectItem>
            <SelectItem value="not_in">{tr("nie jest żadnym z")}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto h-6 w-6"
          onClick={() => onChange(null)}
          aria-label={tr("Usuń filtr {label}", { label: dim.label })}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-8 w-full justify-start whitespace-normal py-1 text-left text-xs"
          >
            {filter.values.length === 0 ? (
              <span className="text-muted-foreground">{tr("Wybierz wartości…")}</span>
            ) : (
              filter.values.map(labelOf).join(", ")
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <div className="max-h-64 overflow-y-auto p-1">
            {error ? (
              <p className="px-2 py-2 text-xs text-destructive">{error}</p>
            ) : !options ? (
              <div className="flex justify-center py-3">
                <Loader2
                  className="h-4 w-4 animate-spin text-muted-foreground"
                  aria-label={tr("Wczytywanie")}
                />
              </div>
            ) : options.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                {tr("W tym okresie nie ma żadnych wartości.")}
              </p>
            ) : (
              options.map((o) => (
                <div
                  key={o.value}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  <Checkbox
                    id={`fv-${filter.dimension}-${o.value}`}
                    checked={filter.values.includes(o.value)}
                    onCheckedChange={() => toggle(o.value)}
                  />
                  <label
                    htmlFor={`fv-${filter.dimension}-${o.value}`}
                    className="flex-1 cursor-pointer truncate text-sm"
                    title={o.label}
                  >
                    {o.label}
                  </label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{o.count}</span>
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
      {filter.values.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          {tr("Filtr bez wartości nie jest liczony.")}
        </p>
      )}
    </div>
  );
}
