import { warsawToday } from "@/lib/visits/warsaw-time";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Filter,
  Users,
  Save,
  Pencil,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { makeFunnelId, makeStageId, type Funnel, type FunnelStage } from "@/lib/funnels";
import {
  getAllFunnels,
  saveFunnel,
  deleteFunnel,
  countContactsInFunnel,
} from "@/lib/api/funnels.functions";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/funnels")({
  head: () => ({
    meta: [
      { title: t("Lejki — PRM Core") },
      {
        name: "description",
        content: t(
          "Twórz i zarządzaj lejkami ścieżki pacjenta wykorzystywanymi w karcie kontaktu.",
        ),
      },
    ],
  }),
  component: FunnelsPage,
});

function blankFunnel(): Funnel {
  return {
    id: makeFunnelId(),
    name: t("Nowy lejek"),
    updatedAt: warsawToday(),
    stages: [
      { id: makeStageId(), label: t("Lead"), description: "" },
      { id: makeStageId(), label: t("Kwalifikacja"), description: "" },
    ],
  };
}

function FunnelsPage() {
  const [funnels, setFunnels] = useState<Funnel[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [view, setView] = useState<"list" | "builder">("list");
  const [editing, setEditing] = useState<Funnel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Funnel | null>(null);

  const refresh = async () => {
    const list = await getAllFunnels();
    setFunnels(list);
    const entries = await Promise.all(
      list.map(
        async (f) => [f.id, await countContactsInFunnel({ data: { funnelId: f.id } })] as const,
      ),
    );
    setCounts(Object.fromEntries(entries));
  };

  useEffect(() => {
    refresh();
  }, []);

  const openBuilder = (funnel: Funnel | null) => {
    setEditing(funnel ?? blankFunnel());
    setView("builder");
  };

  const handleSave = async (funnel: Funnel) => {
    await saveFunnel({ data: funnel });
    await refresh();
    setView("list");
  };

  const handleDuplicate = async (funnel: Funnel) => {
    const copy: Funnel = {
      ...funnel,
      id: makeFunnelId(),
      name: `${funnel.name} (kopia)`,
      stages: funnel.stages.map((s) => ({ ...s, id: makeStageId() })),
      updatedAt: warsawToday(),
    };
    await saveFunnel({ data: copy });
    await refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteFunnel({ data: { id: deleteTarget.id } });
    setDeleteTarget(null);
    await refresh();
  };

  if (view === "builder" && editing) {
    return <FunnelBuilder funnel={editing} onBack={() => setView("list")} onSave={handleSave} />;
  }

  if (!funnels) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{t("Lejki")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {funnels.length} {funnels.length === 1 ? "lejek" : t("lejków")}{" "}
            {t(" · ścieżki wykorzystywane w karcie kontaktu (zakładka Overview)")}
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => openBuilder(null)}>
          <Plus className="h-4 w-4" /> {t(" Nowy lejek")}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {funnels.map((f) => {
          const contactsCount = counts[f.id] ?? 0;
          return (
            <Card key={f.id} className="border-border/60 shadow-[var(--shadow-card)] flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary-soft text-primary flex items-center justify-center shrink-0">
                    <Filter className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base leading-tight">{f.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {f.stages.length} {t(" etapów")}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {f.stages.map((s) => (
                    <Badge key={s.id} variant="secondary" className="font-normal text-[11px]">
                      {s.label}
                    </Badge>
                  ))}
                  {f.stages.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t("Brak etapów — dodaj je w edycji.")}
                    </span>
                  )}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> {contactsCount}{" "}
                    {contactsCount === 1 ? "kontakt" : t("kontaktów")}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t("Edytuj")}
                      onClick={() => openBuilder(f)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t("Duplikuj")}
                      onClick={() => handleDuplicate(f)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title={t("Usuń")}
                      onClick={() => setDeleteTarget(f)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Usunąć lejek „")}
              {deleteTarget?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Kontakty przypisane obecnie do tego lejka wrócą do pierwszego dostępnego lejka przy następnej wizycie na ich karcie. Tej operacji nie można cofnąć.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Anuluj")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {t("Usuń lejek")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------- Builder ------------------------------- */

function FunnelBuilder({
  funnel,
  onBack,
  onSave,
}: {
  funnel: Funnel;
  onBack: () => void;
  onSave: (funnel: Funnel) => void | Promise<void>;
}) {
  const [name, setName] = useState(funnel.name);
  const [stages, setStages] = useState<FunnelStage[]>(funnel.stages);

  const updateStage = (id: string, patch: Partial<FunnelStage>) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addStage = () => {
    setStages((prev) => [
      ...prev,
      { id: makeStageId(), label: t("Etap {v0}", { v0: prev.length + 1 }), description: "" },
    ]);
  };

  const removeStage = (id: string) => {
    setStages((prev) => prev.filter((s) => s.id !== id));
  };

  const moveStage = (index: number, dir: -1 | 1) => {
    setStages((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const canSave = name.trim().length > 0 && stages.every((s) => s.label.trim().length > 0);

  return (
    <div className="-m-4 md:-m-8 flex flex-col h-[calc(100vh-4rem)] bg-muted/30">
      <div className="flex items-center justify-between gap-3 border-b bg-background px-4 md:px-6 py-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 max-w-sm border-transparent text-lg font-semibold focus-visible:border-input focus-visible:bg-background"
          />
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!canSave}
          onClick={() =>
            onSave({
              ...funnel,
              name: name.trim(),
              stages,
              updatedAt: warsawToday(),
            })
          }
        >
          <Save className="h-4 w-4" /> {t(" Zapisz lejek")}
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <Card className="border-border/60 shadow-[var(--shadow-card)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("Podgląd")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-stretch gap-1.5 overflow-x-auto">
                {stages.map((s, i) => (
                  <div
                    key={s.id}
                    className={`relative flex-1 min-w-[130px] rounded-lg px-3.5 py-2.5
                      ${i === 0 ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground border border-border/60"}`}
                    style={{
                      clipPath:
                        "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)",
                    }}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                      {t("Etap ")} {i + 1}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold leading-tight truncate">
                      {s.label || "—"}
                    </div>
                  </div>
                ))}
                {stages.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">
                    {t("Dodaj pierwszy etap poniżej.")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {stages.map((s, i) => (
              <Card key={s.id} className="border-border/60 shadow-sm">
                <CardContent className="p-4 flex gap-3 items-start">
                  <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
                    <span className="h-6 w-6 rounded-full bg-primary-soft text-primary text-xs font-semibold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex flex-col">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        disabled={i === 0}
                        onClick={() => moveStage(i, -1)}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        disabled={i === stages.length - 1}
                        onClick={() => moveStage(i, 1)}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <Input
                      value={s.label}
                      onChange={(e) => updateStage(s.id, { label: e.target.value })}
                      placeholder={t("Nazwa etapu")}
                      className="font-medium"
                    />
                    <Textarea
                      value={s.description}
                      onChange={(e) => updateStage(s.id, { description: e.target.value })}
                      placeholder={t("Krótki opis etapu (widoczny na karcie kontaktu)")}
                      className="min-h-[60px] resize-none text-sm"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                    onClick={() => removeStage(s.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button variant="outline" className="gap-1.5" onClick={addStage}>
            <Plus className="h-4 w-4" /> {t(" Dodaj etap")}
          </Button>
        </div>
      </div>
    </div>
  );
}
