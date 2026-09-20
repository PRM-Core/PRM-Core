import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { nodeTitle } from "@/lib/automation-catalog";
import type { AutomationGraph } from "@/lib/automation-flow";
import { getRunsForAutomation, type AutomationRunSummary } from "@/lib/api/engine.functions";
import { intlLocale, t, localized } from "@/lib/i18n";

// Who went through this automation, how far they got, and what broke. Reads
// automation_runs directly — the same rows the engine writes as it walks the
// graph, so this is history rather than a reconstruction.

const POLL_MS = 5000;

const STATUS_STYLES: Record<string, { label: string; className: string }> = localized(() => ({
  running: { label: t("W trakcie"), className: "bg-primary-soft text-primary border-primary/20" },
  waiting: {
    label: t("Czeka"),
    className: "bg-warning/15 text-warning-foreground border-warning/30",
  },
  completed: { label: t("Zakończony"), className: "bg-success/10 text-success border-success/20" },
  failed: {
    label: t("Błąd"),
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  stopped: { label: t("Zatrzymany"), className: "bg-muted text-muted-foreground" },
}));

function formatMoment(ms: number): string {
  return new Date(ms).toLocaleString(intlLocale(), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startedAt: number, endedAt: number | null): string {
  const seconds = Math.max(0, Math.round(((endedAt ?? Date.now()) - startedAt) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} godz.` : `${Math.round(hours / 24)} dni`;
}

export function RunHistorySheet({
  automationId,
  automationName,
  flow,
  open,
  onOpenChange,
}: {
  automationId: string;
  automationName: string;
  flow: AutomationGraph | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [runs, setRuns] = useState<AutomationRunSummary[] | null>(null);

  const refresh = useCallback(() => {
    getRunsForAutomation({ data: { automationId } })
      .then(setRuns)
      .catch(() => setRuns([]));
  }, [automationId]);

  // Runs move while the panel is open (a delay matures, a step fails), so it
  // polls — but only while open, and it stops the moment it closes.
  useEffect(() => {
    if (!open) return;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [open, refresh]);

  const labelFor = (nodeId: string | null): string => {
    if (!nodeId) return "—";
    const node = flow?.nodes.find((n) => n.id === nodeId);
    // A node deleted after the run passed through it still has an id in the
    // path; say that plainly instead of rendering a raw identifier.
    return node ? nodeTitle(node) : t("krok usunięty ze scenariusza");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("Przebiegi")}</SheetTitle>
          <SheetDescription>
            {t("Kontakty, które przeszły przez „")}
            {automationName || t("bez nazwy")}
            {t("”. Najnowsze u góry, maksymalnie 100.")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {runs === null ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : runs.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t(
                "Jeszcze nikt nie przeszedł tą automatyzacją. Aktywuj ją i wywołaj jej wyzwalacz — przebiegi pojawią się tutaj.",
              )}
            </p>
          ) : (
            <div className="divide-y">
              {runs.map((run) => {
                const style = STATUS_STYLES[run.status] ?? {
                  label: run.status,
                  className: "bg-muted text-muted-foreground",
                };
                const live = run.status === "running" || run.status === "waiting";
                return (
                  <div key={run.id} className="py-3 first:pt-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to="/contacts/$id"
                        params={{ id: run.contactId }}
                        className="text-sm font-medium hover:text-primary transition-colors inline-flex items-center gap-1 min-w-0"
                      >
                        <span className="truncate">{run.contactName}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                      </Link>
                      <Badge
                        variant="outline"
                        className={`${style.className} uppercase text-[10px] tracking-wider shrink-0`}
                      >
                        {style.label}
                      </Badge>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      {live ? (
                        <>
                          {t("Stoi na kroku:")}{" "}
                          <span className="text-foreground">{labelFor(run.currentNodeId)}</span>
                        </>
                      ) : (
                        <>
                          {t("Wykonanych kroków:")}{" "}
                          <span className="text-foreground">{run.path.length}</span>
                          {run.path.length > 0 && (
                            <>
                              {t(" · ostatni: ")}
                              <span className="text-foreground">
                                {labelFor(run.path[run.path.length - 1])}
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    <div className="text-[11px] text-muted-foreground">
                      {formatMoment(run.startedAt)} · {formatDuration(run.startedAt, run.endedAt)}
                      {live ? " (trwa)" : ""}
                    </div>

                    {run.lastError && (
                      <div className="flex gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive mt-0.5" />
                        <span className="text-[11px] text-destructive leading-relaxed">
                          {run.lastError}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
