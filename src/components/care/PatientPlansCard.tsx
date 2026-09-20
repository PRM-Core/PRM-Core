import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  assignTreatmentPlan,
  getContactPlans,
  getTreatmentPlans,
  unassignTreatmentPlan,
  type AssignedPlan,
} from "@/lib/api/treatment-plans.functions";
import type { TreatmentPlanRow } from "@/lib/db/schema";
import { intlLocale, t } from "@/lib/i18n";

/**
 * Plany leczenia przypisane pacjentowi.
 *
 * **Historia, nie stan.** Pacjent po bariatrii przechodzi kolejno plan
 * przedoperacyjny, płynny i stały; `%%PLAN%%` w wiadomości bierze ten ostatnio
 * przypisany, a poprzednie zostają, bo za pół roku ktoś zapyta, co temu
 * pacjentowi wysłano w marcu. Stąd lista, a nie jedno pole wyboru.
 */
export function PatientPlansCard({ contactId }: { contactId: string }) {
  const [assigned, setAssigned] = useState<AssignedPlan[] | null>(null);
  const [available, setAvailable] = useState<TreatmentPlanRow[]>([]);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getContactPlans({ data: { contactId } })
      .then(setAssigned)
      .catch(() => setAssigned([]));
  }, [contactId]);

  useEffect(refresh, [refresh]);

  // Lista do wyboru dociągana dopiero przy otwarciu okna — kartoteka pacjenta
  // i tak robi kilkanaście zapytań przy wejściu, a plany są potrzebne rzadko.
  useEffect(() => {
    if (!picking) return;
    getTreatmentPlans()
      .then((r) => setAvailable(r.plans.filter((p) => p.active)))
      .catch(() => setAvailable([]));
  }, [picking]);

  async function handleAssign() {
    if (!chosen) return;
    setBusy(true);
    const r = await assignTreatmentPlan({ data: { contactId, planId: chosen, note } });
    setBusy(false);
    if (!r.ok) {
      toast.error(t("Nie przypisano"), { description: r.error });
      return;
    }
    toast.success(t("Plan przypisany pacjentowi."));
    setPicking(false);
    setChosen("");
    setNote("");
    refresh();
  }

  async function handleRemove(a: AssignedPlan) {
    await unassignTreatmentPlan({ data: { assignmentId: a.assignmentId } });
    toast.success(t("Usunięto przypisanie planu „{planName}”.", { planName: a.planName }));
    refresh();
  }

  const alreadyIds = new Set((assigned ?? []).map((a) => a.planId));
  const choices = available.filter((p) => !alreadyIds.has(p.id));

  return (
    <>
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base inline-flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> {t(" Plany leczenia")}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("Materiały przypisane temu pacjentowi. Znacznik")}{" "}
              <code className="text-[11px]">{t("%%PLAN%%")}</code>{" "}
              {t(" w newsletterze albo e-mailu wstawi")} <strong>{t("ostatni z tej listy")}</strong>
              .
            </p>
          </div>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setPicking(true)}>
            <Plus className="h-4 w-4" /> {t(" Przypisz plan")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {assigned === null ? (
            <div className="py-6 flex justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : assigned.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("Pacjent nie ma jeszcze przypisanego planu.")}
            </p>
          ) : (
            assigned.map((a, i) => (
              <div
                key={a.assignmentId}
                className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{a.planName}</span>
                    {a.category && (
                      <Badge variant="secondary" className="font-normal">
                        {a.category}
                      </Badge>
                    )}
                    {i === 0 && (
                      <Badge variant="outline" className="font-normal">
                        {t("bieżący")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(a.assignedAt).toLocaleDateString(intlLocale(), {
                      timeZone: "Europe/Warsaw",
                    })}
                    {a.assignedBy ? ` · ${a.assignedBy}` : ""}
                  </p>
                  {a.note && <p className="text-xs mt-1">{a.note}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  title={t("Usuń przypisanie")}
                  onClick={() => void handleRemove(a)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Przypisz plan leczenia")}</DialogTitle>
            <DialogDescription>
              {t("Przypisanie nic nie wysyła — decyduje tylko o tym, co podstawi się pod")}{" "}
              <code className="text-[11px]">{t("%%PLAN%%")}</code>{" "}
              {t(" w następnej wiadomości do tego pacjenta.")}
            </DialogDescription>
          </DialogHeader>

          {choices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {available.length === 0
                ? t("Nie ma jeszcze żadnego aktywnego planu.")
                : t("Pacjent ma już przypisane wszystkie aktywne plany.")}{" "}
              <Link to="/care" className="text-primary hover:underline">
                {t("Przejdź do planów leczenia")}
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {choices.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setChosen(p.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left transition ${
                      chosen === p.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="text-sm font-medium">{p.name}</span>
                    {p.category && (
                      <Badge variant="secondary" className="ml-2 font-normal">
                        {p.category}
                      </Badge>
                    )}
                    {p.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                    )}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>{t("Notatka")}</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("np. start od 1 września, kontrola po 4 tygodniach")}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPicking(false)}>
              {t("Anuluj")}
            </Button>
            <Button
              disabled={!chosen || busy}
              onClick={() => void handleAssign()}
              className="gap-1.5"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}

              {t("Przypisz")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
