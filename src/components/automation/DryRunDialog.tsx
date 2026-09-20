import { useEffect, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Info, Loader2, PlayCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dryRunAutomation, listContactOptions, type DryRunStep } from "@/lib/api/engine.functions";
import { t, localized } from "@/lib/i18n";

// Walks a chosen contact through the scenario and shows what WOULD happen.
// Nothing is sent, tagged or moved — the point is to answer "which branch does
// this patient take, and what do they get" before switching the automation on
// and finding out on a real person.

const OUTCOME = localized(
  () =>
    ({
      ok: { icon: CheckCircle2, className: "text-success", label: t("wykona się") },
      warning: { icon: AlertTriangle, className: "text-warning-foreground", label: "uwaga" },
      blocked: { icon: Ban, className: "text-destructive", label: t("nie wykona się") },
      info: { icon: Info, className: "text-muted-foreground", label: "informacja" },
    }) as const,
);

export function DryRunDialog({
  open,
  onOpenChange,
  automationId,
  automationName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  automationId: string;
  automationName: string;
}) {
  const [options, setOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [contactId, setContactId] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<DryRunStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSteps(null);
    setError(null);
    listContactOptions()
      .then((list) => {
        setOptions(list);
        setContactId((prev) => prev || list[0]?.id || "");
      })
      .catch(() => setOptions([]));
  }, [open]);

  const run = async () => {
    if (!contactId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await dryRunAutomation({ data: { automationId, contactId } });
      if (!result.ok) {
        setError(result.error ?? t("Nie udało się wykonać podglądu."));
        setSteps(null);
      } else {
        setSteps(result.steps);
        setFinished(result.finished);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Przetestuj na kontakcie")}</DialogTitle>
          <DialogDescription>
            {t("Przeprowadzę wybrany kontakt przez „")}
            {automationName}
            {t("” i pokażę, co by się stało. Warunki i rozgałęzienia liczone są naprawdę; ")}{" "}
            <strong>{t("nic nie zostanie wysłane")}</strong> {t(" ani zapisane.")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5 flex-1 min-w-[220px]">
            <Label className="text-xs">{t("Kontakt")}</Label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger>
                <SelectValue placeholder={t("Wybierz kontakt…")} />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="gap-1.5" disabled={!contactId || busy} onClick={run}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}

            {t("Przejdź scenariusz")}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {steps && (
          <ol className="relative ml-2 border-l border-border space-y-4 mt-2">
            {steps.map((step, idx) => {
              const meta = OUTCOME[step.outcome as keyof typeof OUTCOME] ?? OUTCOME.info;
              const Icon = meta.icon;
              return (
                <li key={`${step.nodeId}-${idx}`} className="pl-5 relative">
                  <span className="absolute -left-[11px] top-0.5 h-5 w-5 rounded-full bg-card flex items-center justify-center ring-4 ring-card">
                    <Icon className={`h-4 w-4 ${meta.className}`} />
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{step.title}</span>
                    {step.branch && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-muted text-muted-foreground"
                      >
                        → {step.branch}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {step.message}
                  </p>
                </li>
              );
            })}
          </ol>
        )}

        {steps && !finished && (
          <p className="text-xs text-warning-foreground">
            {t("Podgląd zatrzymał się po 60 krokach — scenariusz może mieć pętlę.")}
          </p>
        )}

        {steps && steps.length > 0 && (
          <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
            {t(
              "Podgląd nie wywołuje modelu przy węźle Agent AI i nie losuje w Splicie — realny pacjent może pójść inną gałęzią.",
            )}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
