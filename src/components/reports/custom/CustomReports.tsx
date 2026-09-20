import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Copy, FileBarChart2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  deleteCustomReport,
  duplicateCustomReport,
  getCustomReport,
  listCustomReports,
} from "@/lib/api/custom-reports.functions";
import { widgetTitle, type ReportDefinition, type ReportRange } from "@/lib/reports/custom/catalog";
import type { ReportFull, ReportSummary } from "@/lib/reports/custom/store.server";
import { REPORT_TEMPLATES } from "@/lib/reports/custom/templates";
import { RangePicker } from "./RangePicker";
import { ReportBuilder } from "./ReportBuilder";
import { WidgetView } from "./WidgetView";
import { intlLocale, t as tr } from "@/lib/i18n";

/**
 * Zakładka „Własne raporty": lista → podgląd → kreator.
 *
 * Konto podglądu widzi listę i podgląd, bez tworzenia, zmiany, kopii
 * i usuwania — serwer i tak by to odrzucił, ale przyciski, które zawsze kończą
 * się błędem, nie mają prawa się pokazywać.
 */

type View =
  | { kind: "list" }
  | { kind: "view"; id: string }
  | { kind: "edit"; id?: string; name: string; description: string; definition: ReportDefinition };

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString(intlLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CustomReports({ canEdit }: { canEdit: boolean }) {
  const [view, setView] = useState<View>({ kind: "list" });
  const [confirmLeave, setConfirmLeave] = useState<View | null>(null);

  const leaveEditor = (dirty: boolean, target: View) => {
    if (dirty) setConfirmLeave(target);
    else setView(target);
  };

  return (
    <>
      {view.kind === "list" && (
        <ReportList
          canEdit={canEdit}
          onOpen={(id) => setView({ kind: "view", id })}
          onCreate={(name, definition) =>
            setView({ kind: "edit", name, description: "", definition })
          }
        />
      )}
      {view.kind === "view" && (
        <ReportViewer
          id={view.id}
          canEdit={canEdit}
          onBack={() => setView({ kind: "list" })}
          onOpen={(id) => setView({ kind: "view", id })}
          onEdit={(r) =>
            setView({
              kind: "edit",
              id: r.id,
              name: r.name,
              description: r.description,
              definition: r.definition,
            })
          }
        />
      )}
      {view.kind === "edit" && (
        <ReportBuilder
          key={view.id ?? "nowy"}
          reportId={view.id}
          initialName={view.name}
          initialDescription={view.description}
          initialDefinition={view.definition}
          onSaved={(id) => setView({ kind: "view", id })}
          onCancel={(dirty) =>
            leaveEditor(dirty, view.id ? { kind: "view", id: view.id } : { kind: "list" })
          }
        />
      )}

      <AlertDialog open={!!confirmLeave} onOpenChange={(open) => !open && setConfirmLeave(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Porzucić zmiany?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("Raport ma niezapisane zmiany. Po wyjściu z kreatora przepadną.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Zostań w kreatorze")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmLeave) setView(confirmLeave);
                setConfirmLeave(null);
              }}
            >
              {tr("Porzuć zmiany")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ReportList({
  canEdit,
  onOpen,
  onCreate,
}: {
  canEdit: boolean;
  onOpen: (id: string) => void;
  onCreate: (name: string, definition: ReportDefinition) => void;
}) {
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    listCustomReports()
      .then(setReports)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : tr("Nie udało się wczytać raportów.")),
      );
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {tr(
            "Raporty zbudowane z kafelków — wspólne dla całej placówki, liczone z bieżących danych przy każdym otwarciu.",
          )}
        </p>
        {canEdit && (
          <Button
            type="button"
            className="gap-1.5"
            onClick={() => setChoosing((v) => !v)}
            aria-expanded={choosing}
          >
            <Plus className="h-4 w-4" /> {tr(" Nowy raport")}
          </Button>
        )}
      </div>

      {canEdit && choosing && (
        <div className="grid gap-3 md:grid-cols-3">
          {REPORT_TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onCreate(t.key === "empty" ? "" : t.name, t.build())}
              className="rounded-xl border border-border/60 bg-card p-4 text-left transition hover:border-primary/40 hover:shadow-[var(--shadow-card)]"
            >
              <p className="font-medium">{t.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
            </button>
          ))}
        </div>
      )}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : !reports ? (
        <div className="flex justify-center py-10">
          <Loader2
            className="h-5 w-5 animate-spin text-muted-foreground"
            aria-label={tr("Wczytywanie")}
          />
        </div>
      ) : reports.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <FileBarChart2 className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">{tr("Nie ma jeszcze własnych raportów")}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {canEdit
                ? tr(
                    "Kliknij „Nowy raport”, wybierz szablon albo pustą kartkę i przeciągnij kafelki: liczby, wykresy i tabele z danych o kontaktach, wizytach, wysyłkach i skrzynce.",
                  )
                : tr("Gdy ktoś z placówki zbuduje raport, pojawi się tutaj.")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpen(r.id)}
              className="rounded-xl border border-border/60 bg-card p-4 text-left shadow-[var(--shadow-card)] transition hover:border-primary/40"
            >
              <p className="font-medium">{r.name}</p>
              {r.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                {r.widgetCount}{" "}
                {r.widgetCount === 1
                  ? "kafelek"
                  : r.widgetCount >= 2 && r.widgetCount <= 4
                    ? "kafelki"
                    : tr("kafelków")}
                {tr(" · zmieniony ")}
                {formatWhen(r.updatedAt)}
                {r.updatedByName && ` · ${r.updatedByName}`}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportViewer({
  id,
  canEdit,
  onBack,
  onOpen,
  onEdit,
}: {
  id: string;
  canEdit: boolean;
  onBack: () => void;
  onOpen: (id: string) => void;
  onEdit: (r: ReportFull) => void;
}) {
  const [report, setReport] = useState<ReportFull | null | undefined>(undefined);
  /** Okres oglądania — zmiana tutaj nie zmienia zapisanego raportu. */
  const [range, setRange] = useState<ReportRange | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setReport(undefined);
    getCustomReport({ data: { id } })
      .then((r) => {
        setReport(r);
        setRange(r?.definition.range ?? null);
      })
      .catch(() => setReport(null));
  }, [id]);

  useEffect(load, [load]);

  if (report === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Loader2
          className="h-5 w-5 animate-spin text-muted-foreground"
          aria-label={tr("Wczytywanie")}
        />
      </div>
    );
  }
  if (report === null) {
    return (
      <div className="space-y-3">
        <Button type="button" variant="ghost" className="gap-1.5 px-2" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> {tr(" Wszystkie raporty")}
        </Button>
        <p className="text-sm text-muted-foreground">
          {tr("Tego raportu już nie ma — mógł zostać usunięty.")}
        </p>
      </div>
    );
  }

  const duplicate = async () => {
    setBusy(true);
    try {
      const res = await duplicateCustomReport({ data: { id: report.id } });
      toast.success(tr("Utworzono kopię raportu"));
      onOpen(res.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Nie udało się skopiować raportu."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteCustomReport({ data: { id: report.id } });
      toast.success(tr("Raport usunięty"));
      onBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Nie udało się usunąć raportu."));
      setBusy(false);
    }
  };

  const changedRange = range && JSON.stringify(range) !== JSON.stringify(report.definition.range);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button
            type="button"
            variant="ghost"
            className="-ml-2 mb-1 h-7 gap-1.5 px-2 text-xs"
            onClick={onBack}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {tr(" Wszystkie raporty")}
          </Button>
          <h2 className="text-xl font-semibold tracking-tight">{report.name}</h2>
          {report.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{report.description}</p>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={duplicate}
              disabled={busy}
            >
              <Copy className="h-3.5 w-3.5" /> {tr(" Kopia")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              <Trash2 className="h-3.5 w-3.5" /> {tr(" Usuń")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => onEdit(report)}
              disabled={busy}
            >
              <Pencil className="h-3.5 w-3.5" /> {tr(" Edytuj")}
            </Button>
          </div>
        )}
      </div>

      {range && (
        <div className="flex flex-wrap items-end gap-3">
          <RangePicker idPrefix="rv-range" value={range} onChange={setRange} />
          {changedRange && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRange(report.definition.range)}
            >
              {tr("Przywróć okres zapisany w raporcie")}
            </Button>
          )}
        </div>
      )}

      {report.definition.widgets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tr("Raport nie ma jeszcze kafelków.")}</p>
      ) : (
        <div className="@container">
          <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
            {report.definition.widgets.map((w) => (
              <Card
                key={w.id}
                className={`border-border/60 shadow-[var(--shadow-card)] ${w.width === "full" ? "@2xl:col-span-2" : ""}`}
              >
                <CardHeader className="p-4 pb-1">
                  <h3 className="text-sm font-medium">{widgetTitle(w)}</h3>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <WidgetView widget={w} range={range ?? report.definition.range} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("Usunąć raport „")}
              {report.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                "Raport zniknie dla wszystkich w placówce. Dane, z których był liczony, zostają nietknięte.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Anuluj")}</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>{tr("Usuń raport")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
