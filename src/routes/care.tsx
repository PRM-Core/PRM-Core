import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Copy, Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/content-builder/RichTextEditor";
import {
  getTreatmentPlans,
  removeTreatmentPlan,
  saveTreatmentPlan,
} from "@/lib/api/treatment-plans.functions";
import type { TreatmentPlanRow } from "@/lib/db/schema";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/care")({
  head: () => ({ meta: [{ title: t("Plany leczenia — PRM Core") }] }),
  component: CarePage,
});

// Care — plany leczenia.
//
// Materiał, nie wiadomość: plan jest fragmentem wstawianym do dowolnej treści
// znacznikiem `%%PLAN%%`, więc ten sam plan idzie mailem, newsletterem
// i automatyzacją, a poprawia się go w jednym miejscu.

interface Draft {
  id?: string;
  name: string;
  category: string;
  description: string;
  html: string;
  active: boolean;
}

const EMPTY: Draft = { name: "", category: "", description: "", html: "", active: true };

function CarePage() {
  const [plans, setPlans] = useState<TreatmentPlanRow[] | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TreatmentPlanRow | null>(null);

  const refresh = useCallback(() => {
    getTreatmentPlans()
      .then((r) => {
        setPlans(r.plans);
        setUsage(r.usage);
      })
      .catch(() => setPlans([]));
  }, []);

  useEffect(refresh, [refresh]);

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    const r = await saveTreatmentPlan({ data: draft });
    setSaving(false);
    if (!r.ok) {
      toast.error(t("Nie zapisano"), { description: r.error });
      return;
    }
    toast.success(draft.id ? t("Plan zapisany.") : t("Plan utworzony."));
    setDraft(null);
    refresh();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const r = await removeTreatmentPlan({ data: { id: confirmDelete.id } });
    if (!r.ok) {
      toast.error(t("Nie usunięto"), { description: r.error });
      return;
    }
    toast.success(t("Plan „{name}” usunięty.", { name: confirmDelete.name }));
    setConfirmDelete(null);
    refresh();
  }

  function copyTag(name: string) {
    const tag = `%%PLAN:${name}%%`;
    void navigator.clipboard
      .writeText(tag)
      .then(() => toast.success(t("Skopiowano znacznik."), { description: tag }))
      .catch(() => toast.error(t("Nie udało się skopiować."), { description: tag }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Plany leczenia")}</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {t(
              "Gotowe materiały dla pacjentów — plan dietetyczny po bariatrii, zalecenia pozabiegowe, przygotowanie do badania. Plan przypisuje się pacjentowi w jego kartotece, a do wiadomości wstawia znacznikiem.",
            )}
          </p>
        </div>
        <Button className="gap-1.5 shrink-0" onClick={() => setDraft({ ...EMPTY })}>
          <Plus className="h-4 w-4" /> {t(" Nowy plan")}
        </Button>
      </div>

      {plans === null ? (
        <p className="text-sm text-muted-foreground">{t("Wczytywanie…")}</p>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t(
                "Nie ma jeszcze żadnego planu. Pierwszy zwykle jest ten, który dziś krąży w Wordzie.",
              )}
            </p>
            <Button variant="outline" size="sm" onClick={() => setDraft({ ...EMPTY })}>
              {t("Utwórz plan")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {plans.map((p) => (
            <Card key={p.id} className={p.active ? "" : "opacity-60"}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{p.name}</CardTitle>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {p.category && (
                        <Badge variant="secondary" className="font-normal">
                          {p.category}
                        </Badge>
                      )}
                      {!p.active && (
                        <Badge variant="outline" className="font-normal">
                          {t("wyłączony")}
                        </Badge>
                      )}
                      {(usage[p.id] ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" /> {usage[p.id]} {t(" pacjentów")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("Kopiuj znacznik do wiadomości")}
                      onClick={() => copyTag(p.name)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("Edytuj")}
                      onClick={() =>
                        setDraft({
                          id: p.id,
                          name: p.name,
                          category: p.category,
                          description: p.description,
                          html: p.html,
                          active: p.active,
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("Usuń")}
                      onClick={() => setConfirmDelete(p)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                {!p.html.trim() && (
                  <p className="text-xs text-warning-foreground">
                    {t("Plan nie ma jeszcze treści — w wiadomości podstawi się pustka.")}
                  </p>
                )}
                <code className="block text-[11px] text-muted-foreground truncate">
                  {t("%%PLAN:")}
                  {p.name}%%
                </code>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── ściąga ze znaczników ─────────────────────────────────────────── */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("Jak wstawić plan do wiadomości")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <code className="rounded bg-background px-1.5 py-0.5 text-xs">{t("%%PLAN%%")}</code>{" "}
            {t(" — wstawia")} <strong>{t("plan przypisany temu pacjentowi")}</strong>
            {t(". Jeden newsletter idzie do całego segmentu, a każdy dostaje w nim swój plan.")}
          </p>
          <p>
            <code className="rounded bg-background px-1.5 py-0.5 text-xs">
              {t("%%PLAN:nazwa%%")}
            </code>{" "}
            {t(" — wstawia konkretny plan, ten sam dla wszystkich odbiorców.")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Znacznik wpisuje się w treść newslettera albo e-maila i rozwija dopiero przy wysyłce. Jeśli pacjent nie ma przypisanego planu, znacznik znika z wiadomości, a informacja o tym trafia do dziennika kampanii — pacjent nigdy nie zobaczy surowego kodu.",
            )}
          </p>
        </CardContent>
      </Card>

      {/* ── edytor ───────────────────────────────────────────────────────── */}
      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t("Edytuj plan") : t("Nowy plan leczenia")}</DialogTitle>
            <DialogDescription>
              {t(
                "Treść planu trafi do wiadomości w miejsce znacznika. Pisz ją tak, jakby była fragmentem maila — bo nim będzie.",
              )}
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("Nazwa *")}</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder={t("np. Plan dietetyczny — Bariatria")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("Nazwa jest kluczem znacznika. Zmiana nazwy zerwie znaczniki")}
                    <code className="mx-1 text-[11px]">{t("%%PLAN:stara nazwa%%")}</code>

                    {t("już wstawione w treściach.")}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("Kategoria")}</Label>
                  <Input
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                    placeholder={t("np. Bariatria")}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t("Opis dla zespołu")}</Label>
                <Textarea
                  rows={2}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder={t("Kiedy stosować ten plan. Nie trafia do pacjenta.")}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("Treść planu")}</Label>
                <RichTextEditor
                  value={draft.html}
                  onChange={(html) => setDraft({ ...draft, html })}
                  minHeight={260}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{t("Plan aktywny")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Wyłączony nie podpowiada się przy przypisywaniu, ale pacjenci, którzy go już mają, dostają go dalej.",
                    )}
                  </p>
                </div>
                <Switch
                  checked={draft.active}
                  onCheckedChange={(active) => setDraft({ ...draft, active })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              {t("Anuluj")}
            </Button>
            <Button
              disabled={saving || !draft?.name.trim()}
              onClick={() => void handleSave()}
              className="gap-1.5"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}

              {t("Zapisz")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── potwierdzenie usunięcia ──────────────────────────────────────── */}
      <Dialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("Usunąć plan „")}
              {confirmDelete?.name}”?
            </DialogTitle>
            <DialogDescription>
              {t("Zniknie też historia przypisań — ")} {usage[confirmDelete?.id ?? ""] ?? 0}{" "}
              {t(" pacjentów straci ślad, że ten plan dostało. Wiadomości ze znacznikiem")}
              <code className="mx-1 text-[11px]">
                {t("%%PLAN:")}
                {confirmDelete?.name}%%
              </code>
              {t(
                "zaczną wychodzić bez tej treści. Jeśli chodzi tylko o to, żeby plan przestał się podpowiadać — wyłącz go zamiast usuwać.",
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              {t("Zostaw")}
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              {t("Usuń plan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
