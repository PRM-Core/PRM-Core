import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfigFields } from "@/components/automation/NodeInspector";
import { findCatalogItem, triggerCatalog, WAIT_EVENT_KEYS } from "@/lib/automation-catalog";
import type { AutomationGoal } from "@/lib/automation-flow";
import type { AutomationRecord } from "@/lib/automation-records";
import { getGoalReport, type GoalReport } from "@/lib/api/engine.functions";
import { t } from "@/lib/i18n";
import { goalLabel, percent } from "@/lib/automation-goal";

// The automation's goal: what counts as success (the patient's event, as a
// trigger, within N days of entering), how many reached it, and whether
// reaching it ends the run. Measured from runs and events the system already
// keeps, so a goal set today reports on the last 90 days at once.

function GoalDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AutomationGoal | null;
  onSave: (goal: AutomationGoal | null) => void;
}) {
  const [draft, setDraft] = useState<AutomationGoal>(
    initial ?? { key: "visit_scheduled", config: {}, days: 14, exit: true },
  );
  useEffect(() => {
    if (open) setDraft(initial ?? { key: "visit_scheduled", config: {}, days: 14, exit: true });
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Cel automatyzacji")}</DialogTitle>
          <DialogDescription>
            {t(
              "Co jest sukcesem tej automatyzacji — zdarzenie pacjenta w ciągu kilku dni od wejścia. Konwersja liczy się dla całej automatyzacji i dla każdego wariantu splitu A/B.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Zdarzenie")}</Label>
            <Select
              value={draft.key}
              onValueChange={(key) => setDraft({ ...draft, key, config: {} })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {triggerCatalog
                  .filter((c) => (WAIT_EVENT_KEYS as readonly string[]).includes(c.key))
                  .map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <ConfigFields
            fields={findCatalogItem("trigger", draft.key)?.fields ?? []}
            config={draft.config ?? {}}
            onChange={(config) => setDraft({ ...draft, config })}
          />
          <div className="space-y-1.5">
            <Label htmlFor="goal-days" className="text-xs">
              {t("W ciągu dni od wejścia")}
            </Label>
            <Input
              id="goal-days"
              type="number"
              min={1}
              max={365}
              value={draft.days}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  days: Math.min(365, Math.max(1, Number(e.target.value) || 1)),
                })
              }
              className="w-28"
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Switch checked={draft.exit} onCheckedChange={(exit) => setDraft({ ...draft, exit })} />
            <span>
              {t("Zakończ przebieg po osiągnięciu celu")}
              <span className="block text-xs text-muted-foreground">
                {t(
                  "Pacjent, który już umówił wizytę, przestaje dostawać zachęty do umówienia — kolejne kroki tej automatyzacji go nie dotyczą.",
                )}
              </span>
            </span>
          </label>
        </div>
        <DialogFooter className="gap-2">
          {initial && (
            <Button variant="outline" onClick={() => onSave(null)}>
              {t("Usuń cel")}
            </Button>
          )}
          <Button onClick={() => onSave(draft)}>{t("Zapisz")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GoalStrip({
  record,
  onChange,
}: {
  record: AutomationRecord;
  onChange: (goal: AutomationGoal | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<GoalReport | null>(null);
  const goal = record.goal ?? null;
  const goalKey = goal ? JSON.stringify(goal) : "";

  useEffect(() => {
    setReport(null);
    if (!goalKey) return;
    const shown = JSON.parse(goalKey) as AutomationGoal;
    getGoalReport({ data: { automationId: record.id, goal: shown } })
      .then(setReport)
      .catch(() => setReport(null));
  }, [record.id, goalKey]);

  const matured = report ? report.entered - report.pending : 0;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
      <Target className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="flex-1 min-w-[240px]">
        {!goal
          ? t(
              "Bez celu — ustaw, co jest sukcesem tej automatyzacji (np. umówiona wizyta), żeby mierzyć konwersję.",
            )
          : t("Cel: {goal} w ciągu {days} dni{exit}.", {
              goal: goalLabel(goal),
              days: goal.days,
              exit: goal.exit ? t(" — osiągnięcie kończy przebieg") : "",
            })}{" "}
        {goal && report && (
          <b className="text-foreground">
            {t("Osiągnęło {converted} z {matured} ({rate}); w trakcie {pending}.", {
              converted: report.converted,
              matured,
              rate: percent(report.rate),
              pending: report.pending,
            })}
          </b>
        )}
      </span>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>
        {goal ? t("Zmień cel") : t("Ustaw cel")}
      </Button>
      <GoalDialog
        open={open}
        onOpenChange={setOpen}
        initial={goal}
        onSave={(g) => {
          onChange(g);
          setOpen(false);
        }}
      />
    </div>
  );
}
