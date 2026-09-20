import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Copy,
  GripVertical,
  Hash,
  LineChart as LineIcon,
  Loader2,
  Table2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCustomReport } from "@/lib/api/custom-reports.functions";
import {
  MAX_WIDGETS,
  WIDGET_TYPES,
  widgetProblems,
  widgetTitle,
  withoutEmptyFilters,
  type ReportDefinition,
  type ReportWidget,
  type WidgetType,
} from "@/lib/reports/custom/catalog";
import {
  applyDrop,
  duplicateAt,
  moveBy,
  moveDragPayload,
  paletteDragPayload,
  parsePayload,
  removeAt,
  slotForPointer,
} from "@/lib/reports/custom/layout";
import { RangePicker } from "./RangePicker";
import { WidgetEditor } from "./WidgetEditor";
import { WidgetView } from "./WidgetView";
import { t as tr } from "@/lib/i18n";

/**
 * Kreator raportu: paleta kafelków po lewej, raport na środku, konfiguracja
 * zaznaczonego kafelka po prawej.
 *
 * Przeciąganie działa w dwie strony — z palety na raport i w obrębie raportu.
 * Ponieważ przeciąganie w przeglądarce nie działa z klawiatury i bywa zawodne
 * na ekranach dotykowych, wszystko da się zrobić też bez niego: kliknięcie
 * w kafelek palety dodaje go na końcu, a strzałki przestawiają kafelki.
 */

const TYPE_ICON: Record<WidgetType, typeof Hash> = {
  kpi: Hash,
  bar: BarChart3,
  line: LineIcon,
  table: Table2,
};

const PAYLOAD_TYPE = "text/plain";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ReportBuilder({
  reportId,
  initialName,
  initialDescription,
  initialDefinition,
  onSaved,
  onCancel,
}: {
  reportId?: string;
  initialName: string;
  initialDescription: string;
  initialDefinition: ReportDefinition;
  onSaved: (id: string) => void;
  onCancel: (dirty: boolean) => void;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [definition, setDefinition] = useState<ReportDefinition>(initialDefinition);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialDefinition.widgets[0]?.id ?? null,
  );
  const [dropTarget, setDropTarget] = useState<{ index: number; side: "before" | "after" } | null>(
    null,
  );
  const [overEnd, setOverEnd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const widgets = definition.widgets;
  const hasWidgets = widgets.length > 0;
  const [twoColumns, setTwoColumns] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () =>
      setTwoColumns(getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length > 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasWidgets]);
  const selectedIndex = widgets.findIndex((w) => w.id === selectedId);
  const selected = selectedIndex >= 0 ? widgets[selectedIndex] : null;
  const full = widgets.length >= MAX_WIDGETS;

  const blockers = useMemo(
    () =>
      widgets
        .map((w, i) => ({ i, problem: widgetProblems(withoutEmptyFilters(w))[0] }))
        .filter((x) => x.problem),
    [widgets],
  );

  const setWidgets = (next: ReportWidget[]) => {
    setDefinition((d) => ({ ...d, widgets: next }));
    setDirty(true);
  };

  const addAtEnd = (type: WidgetType) => {
    const r = applyDrop(widgets, { kind: "new", type }, widgets.length, newId, MAX_WIDGETS);
    if (!r.changed) return;
    setWidgets(r.widgets);
    setSelectedId(r.selectId);
  };

  const dropOn = (e: DragEvent, slot: number) => {
    e.preventDefault();
    setDropTarget(null);
    setOverEnd(false);
    const payload = parsePayload(e.dataTransfer.getData(PAYLOAD_TYPE));
    if (!payload) return;
    const r = applyDrop(widgets, payload, slot, newId, MAX_WIDGETS);
    if (!r.changed) return;
    setWidgets(r.widgets);
    if (r.selectId) setSelectedId(r.selectId);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error(tr("Nadaj raportowi nazwę."));
      return;
    }
    if (blockers.length > 0) {
      toast.error(
        tr("Kafelek {v0}: {problem}", { v0: blockers[0].i + 1, problem: blockers[0].problem }),
      );
      setSelectedId(widgets[blockers[0].i].id);
      return;
    }
    setSaving(true);
    try {
      const res = await saveCustomReport({
        data: {
          id: reportId,
          name,
          description,
          definition: { ...definition, widgets: widgets.map(withoutEmptyFilters) },
        },
      });
      setDirty(false);
      toast.success(tr("Raport zapisany"));
      onSaved(res.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Nie udało się zapisać raportu."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1 space-y-1">
          <Label htmlFor="rb-name" className="text-xs text-muted-foreground">
            {tr("Nazwa raportu")}
          </Label>
          <Input
            id="rb-name"
            value={name}
            maxLength={120}
            placeholder={tr("Np. Źródła leadów — kwartał")}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
          />
        </div>
        <div className="min-w-[220px] flex-[2] space-y-1">
          <Label htmlFor="rb-desc" className="text-xs text-muted-foreground">
            {tr("Opis (opcjonalnie)")}
          </Label>
          <Input
            id="rb-desc"
            value={description}
            maxLength={500}
            placeholder={tr("Do czego służy ten raport")}
            onChange={(e) => {
              setDescription(e.target.value);
              setDirty(true);
            }}
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onCancel(dirty)} disabled={saving}>
            {tr("Anuluj")}
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}

            {tr("Zapisz raport")}
          </Button>
        </div>
      </div>

      <RangePicker
        idPrefix="rb-range"
        value={definition.range}
        onChange={(range) => {
          setDefinition((d) => ({ ...d, range }));
          setDirty(true);
        }}
      />

      {/* Trzy kolumny dopiero na bardzo szerokim ekranie. Wcześniej (od lg) raport
          dostawał ok. 300 px między paletą a ustawieniami i kafelki robiły się
          nieczytelne; węższe ekrany mają paletę wierszem nad raportem. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[190px_minmax(0,1fr)_320px]">
        {/* ── Paleta ─────────────────────────────────────────────────────── */}
        <aside
          className="space-y-2 lg:col-span-2 xl:sticky xl:top-4 xl:col-span-1 xl:self-start"
          aria-label={tr("Paleta kafelków")}
        >
          <p className="text-xs font-medium text-muted-foreground">
            {tr("Przeciągnij albo kliknij")}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-1">
            {WIDGET_TYPES.map((t) => {
              const Icon = TYPE_ICON[t.type];
              return (
                <button
                  key={t.type}
                  type="button"
                  draggable={!full}
                  disabled={full}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(PAYLOAD_TYPE, paletteDragPayload(t.type));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => addAtEnd(t.type)}
                  className="flex w-full cursor-grab items-start gap-2 rounded-lg border border-border/60 bg-card p-2.5 text-left transition hover:border-primary/40 hover:shadow-sm active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium">{t.label}</span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">
                      {t.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {full && (
            <p className="text-[11px] text-muted-foreground">
              {tr("Raport ma już ")} {MAX_WIDGETS} {tr(" kafelków — to maksimum.")}
            </p>
          )}
        </aside>

        {/* ── Raport ─────────────────────────────────────────────────────── */}
        <section aria-label={tr("Kafelki raportu")} className="@container min-w-0">
          {widgets.length === 0 ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setOverEnd(true);
              }}
              onDragLeave={() => setOverEnd(false)}
              onDrop={(e) => dropOn(e, 0)}
              className={`flex min-h-[320px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${
                overEnd ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <p className="font-medium">{tr("Przeciągnij tu pierwszy kafelek")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr("Albo kliknij go w palecie — trafi na koniec raportu.")}
              </p>
            </div>
          ) : (
            // `@2xl` to szerokość samego raportu (42rem), nie okna — przy wąskim
            // środku dwie kolumny dawały kafelki po ~140 px.
            <div ref={gridRef} className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
              {widgets.map((w, i) => {
                const isSelected = w.id === selectedId;
                // Kafelek „połówkowy" leży obok sąsiada tylko wtedy, gdy siatka ma
                // dwie kolumny; w jednej kolumnie kafelki są pod sobą.
                const axis = w.width === "half" && twoColumns ? "x" : "y";
                const marker =
                  dropTarget?.index === i
                    ? axis === "y"
                      ? dropTarget.side === "before"
                        ? "before:absolute before:inset-x-0 before:-top-2.5 before:h-1 before:rounded-full before:bg-primary"
                        : "after:absolute after:inset-x-0 after:-bottom-2.5 after:h-1 after:rounded-full after:bg-primary"
                      : dropTarget.side === "before"
                        ? "before:absolute before:inset-y-0 before:-left-2.5 before:w-1 before:rounded-full before:bg-primary"
                        : "after:absolute after:inset-y-0 after:-right-2.5 after:w-1 after:rounded-full after:bg-primary"
                    : "";
                return (
                  <div
                    key={w.id}
                    className={`relative ${w.width === "full" ? "@2xl:col-span-2" : ""} ${marker}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const slot = slotForPointer(i, rect, { x: e.clientX, y: e.clientY }, axis);
                      setDropTarget({ index: i, side: slot === i ? "before" : "after" });
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
                    }}
                    onDrop={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      dropOn(e, slotForPointer(i, rect, { x: e.clientX, y: e.clientY }, axis));
                    }}
                  >
                    <Card
                      className={`h-full border-border/60 transition ${
                        isSelected ? "ring-2 ring-primary" : "hover:border-primary/30"
                      }`}
                      onClick={() => setSelectedId(w.id)}
                    >
                      <CardHeader className="flex flex-row items-center gap-1.5 space-y-0 p-3 pb-1">
                        <span
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(PAYLOAD_TYPE, moveDragPayload(i));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setDropTarget(null)}
                          className="cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
                          title={tr("Przeciągnij, aby przenieść")}
                          aria-hidden
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                          onClick={() => setSelectedId(w.id)}
                          aria-pressed={isSelected}
                        >
                          {widgetTitle(w)}
                        </button>
                        <div className="flex shrink-0 items-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={i === 0}
                            aria-label={tr("Przesuń wyżej: {v0}", { v0: widgetTitle(w) })}
                            onClick={(e) => {
                              e.stopPropagation();
                              setWidgets(moveBy(widgets, i, -1));
                            }}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={i === widgets.length - 1}
                            aria-label={tr("Przesuń niżej: {v0}", { v0: widgetTitle(w) })}
                            onClick={(e) => {
                              e.stopPropagation();
                              setWidgets(moveBy(widgets, i, 1));
                            }}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={full}
                            aria-label={tr("Powiel: {v0}", { v0: widgetTitle(w) })}
                            onClick={(e) => {
                              e.stopPropagation();
                              const r = duplicateAt(widgets, i, newId, MAX_WIDGETS);
                              setWidgets(r.widgets);
                              if (r.selectId) setSelectedId(r.selectId);
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            aria-label={tr("Usuń: {v0}", { v0: widgetTitle(w) })}
                            onClick={(e) => {
                              e.stopPropagation();
                              setWidgets(removeAt(widgets, i));
                              if (isSelected)
                                setSelectedId(widgets[i + 1]?.id ?? widgets[i - 1]?.id ?? null);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-3 pt-1">
                        <WidgetView widget={w} range={definition.range} />
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
              {!full && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverEnd(true);
                  }}
                  onDragLeave={() => setOverEnd(false)}
                  onDrop={(e) => dropOn(e, widgets.length)}
                  className={`flex min-h-16 items-center justify-center rounded-xl border-2 border-dashed text-xs text-muted-foreground transition @2xl:col-span-2 ${
                    overEnd ? "border-primary bg-primary/5 text-primary" : "border-border/70"
                  }`}
                >
                  {tr("Upuść tutaj, aby dodać na końcu")}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Konfiguracja ───────────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-4 lg:self-start" aria-label={tr("Ustawienia kafelka")}>
          <Card className="border-border/60">
            <CardContent className="p-4">
              {selected ? (
                <>
                  <p className="mb-3 text-xs font-medium text-muted-foreground">
                    {tr("Kafelek ")} {selectedIndex + 1} {tr(" z ")} {widgets.length}
                  </p>
                  <WidgetEditor
                    key={selected.id}
                    widget={selected}
                    range={definition.range}
                    onChange={(next) => {
                      const list = [...widgets];
                      list[selectedIndex] = next;
                      setWidgets(list);
                    }}
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {tr("Zaznacz kafelek w raporcie, żeby ustawić, co pokazuje.")}
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
