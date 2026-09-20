import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  ShieldCheck,
  Loader2,
  Save,
  Mail,
  MessageSquare,
  Sparkles,
  ShieldOff,
  Plus,
  Trash2,
  FileSignature,
} from "lucide-react";
import {
  addConsentDef,
  getConsentOverview,
  removeConsentDef,
  saveConsentWording,
  type ConsentDef,
  type ConsentOverview,
} from "@/lib/api/consent.functions";
import { intlLocale, t as tr } from "@/lib/i18n";

export const Route = createFileRoute("/consent")({
  head: () => ({ meta: [{ title: tr("Consent & RODO — PRM Core") }] }),
  component: ConsentPage,
});

/** Icons for the three built-ins; anything the clinic adds gets the generic one. */
const BUILTIN_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  profiling: Sparkles,
};

const iconFor = (key: string) => BUILTIN_ICONS[key] ?? FileSignature;

const emptyDraft = { label: "", note: "", title: "", body: "" };

function ConsentPage() {
  const [data, setData] = useState<ConsentOverview | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ConsentDef>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newConsent, setNewConsent] = useState(emptyDraft);
  const [confirmDelete, setConfirmDelete] = useState<ConsentDef | null>(null);

  const refresh = () => {
    getConsentOverview().then((d) => {
      setData(d);
      setDrafts(Object.fromEntries(d.defs.map((t) => [t.key, { ...t }])));
    });
  };

  useEffect(refresh, []);

  const save = async (def: ConsentDef) => {
    const draft = drafts[def.key];
    if (!draft) return;
    setSaving(def.key);
    const result = await saveConsentWording({
      data: {
        key: def.key,
        label: draft.label,
        note: draft.note,
        title: draft.title,
        body: draft.body,
        active: draft.active,
      },
    });
    setSaving(null);
    if (!result.ok) {
      toast.error(result.error ?? tr("Nie udało się zapisać zgody."));
      return;
    }
    toast.success(tr("Zapisano treść zgody."));
    refresh();
  };

  const create = async () => {
    const result = await addConsentDef({ data: newConsent });
    if (!result.ok) {
      toast.error(result.error ?? tr("Nie udało się dodać zgody."));
      return;
    }
    setAddOpen(false);
    setNewConsent(emptyDraft);
    refresh();
    toast.success(tr("Zgoda dodana — przełącznik jest już na karcie każdego kontaktu."));
  };

  const remove = async (def: ConsentDef) => {
    const result = await removeConsentDef({ data: { key: def.key } });
    setConfirmDelete(null);
    if (!result.ok) {
      toast.error(result.error ?? tr("Nie udało się usunąć zgody."));
      return;
    }
    refresh();
    toast.success(tr("Zgoda i odpowiedzi pacjentów usunięte."));
  };

  const grantedFor = (key: string) => data?.stats.find((s) => s.key === key)?.granted ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              {tr("Zgody pacjentów")}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tr("Treści zgód i to, ilu pacjentów faktycznie je wyraziło.")}
            </p>
          </div>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> {tr(" Dodaj zgodę")}
        </Button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {!data
          ? [0, 1, 2, 3].map((i) => (
              <Card key={i} className="border-border/60 shadow-[var(--shadow-card)]">
                <CardContent className="p-5 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            ))
          : [
              ...data.stats.map((s) => {
                const Icon = iconFor(s.key);
                const pct = s.total > 0 ? Math.round((s.granted / s.total) * 100) : 0;
                return (
                  <Card key={s.key} className="border-border/60 shadow-[var(--shadow-card)]">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                          {s.label}
                        </p>
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </div>
                      <p className="mt-2 text-2xl font-semibold tracking-tight">
                        {s.granted.toLocaleString(intlLocale())}
                        <span className="text-sm font-normal text-muted-foreground">
                          {" "}
                          / {s.total.toLocaleString(intlLocale())}
                        </span>
                      </p>
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: "var(--gradient-primary)" }}
                        />
                      </div>
                      {/* "Granted" and "can actually be reached" are different
                          numbers — a consent on a contact with no phone is not
                          an audience. Only a consent that gates a channel has
                          reach to speak of. */}
                      {s.gates && (
                        <p className="mt-2 text-[11px] text-muted-foreground leading-snug">
                          {s.reachable === s.granted ? (
                            <>
                              {pct}
                              {tr("% bazy — wszyscy osiągalni tym kanałem.")}
                            </>
                          ) : (
                            <>
                              {pct}
                              {tr("% bazy, ale realnie osiągalnych")}{" "}
                              <b className="text-foreground">{s.reachable}</b>{" "}
                              {tr(" — reszta nie ma")} {s.key === "email" ? "adresu" : "numeru"}.
                            </>
                          )}
                        </p>
                      )}
                      {!s.gates && (
                        <p className="mt-2 text-[11px] text-muted-foreground leading-snug">
                          {pct}
                          {tr("% bazy. Ta zgoda nie blokuje wysyłki — jest zapisem, nie bramką.")}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              }),
              <Card key="withdrawn" className="border-border/60 shadow-[var(--shadow-card)]">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                      {tr("Wycofane zgody")}
                    </p>
                    <ShieldOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {data.withdrawn.toLocaleString(intlLocale())}
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground leading-snug">
                    {tr(
                      'Pacjenci, którzy kliknęli link wypisania albo mają tag „nie kontaktować".',
                    )}
                  </p>
                </CardContent>
              </Card>,
            ]}
      </div>

      {/* Editable wording */}
      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">{tr("Treści zgód")}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {tr(
              "To, na co pacjent się zgadza. Zmieniaj świadomie — treść zgody jest oświadczeniem prawnym, nie etykietą w interfejsie. Każda zgoda z tej listy ma swój przełącznik na karcie kontaktu.",
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {!data ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            data.defs.map((t) => {
              const draft = drafts[t.key] ?? t;
              const Icon = iconFor(t.key);
              const dirty =
                draft.title !== t.title ||
                draft.body !== t.body ||
                draft.label !== t.label ||
                draft.note !== t.note ||
                draft.active !== t.active;
              return (
                <div
                  key={t.key}
                  className={`space-y-2 border-b border-border/60 pb-6 last:border-0 last:pb-0 ${
                    t.active ? "" : "opacity-60"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <Input
                      value={draft.label}
                      disabled={t.builtin}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [t.key]: { ...draft, label: e.target.value } }))
                      }
                      className="h-8 w-auto min-w-[200px] font-medium"
                    />
                    <code className="text-[11px] text-muted-foreground font-mono">{t.key}</code>
                    {t.gates ? (
                      <Badge variant="secondary" className="font-normal text-[10px]">
                        {tr("blokuje wysyłkę bez zgody")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal text-[10px]">
                        {tr("nie blokuje wysyłki")}
                      </Badge>
                    )}
                    {t.builtin ? (
                      <Badge variant="outline" className="font-normal text-[10px]">
                        {tr("wbudowana")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="font-normal text-[10px]">
                        {grantedFor(t.key)} {tr(" zgód")}
                      </Badge>
                    )}
                    {dirty && (
                      <span className="text-[11px] text-[oklch(0.48_0.15_75)]">
                        {tr("niezapisane zmiany")}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-3">
                      {!t.builtin && (
                        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Switch
                            checked={draft.active}
                            onCheckedChange={(v) =>
                              setDrafts((d) => ({ ...d, [t.key]: { ...draft, active: v } }))
                            }
                          />
                          {draft.active ? "aktywna" : tr("wycofana z użycia")}
                        </label>
                      )}
                      {!t.builtin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          title={tr("Usuń zgodę")}
                          onClick={() => setConfirmDelete(t)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <Input
                    value={draft.note}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [t.key]: { ...draft, note: e.target.value } }))
                    }
                    placeholder={tr("Krótkie wyjaśnienie pod przełącznikiem na karcie kontaktu")}
                    className="text-xs"
                  />
                  <Input
                    value={draft.title}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [t.key]: { ...draft, title: e.target.value } }))
                    }
                    placeholder={tr("Nagłówek zgody")}
                  />
                  <Textarea
                    value={draft.body}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [t.key]: { ...draft, body: e.target.value } }))
                    }
                    className="min-h-[90px] resize-none text-sm"
                    placeholder={tr("Pełna treść zgody, którą widzi pacjent")}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={!dirty || saving === t.key}
                      onClick={() => void save(t)}
                    >
                      {saving === t.key ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <Save className="h-4 w-4 mr-1.5" />
                      )}

                      {tr("Zapisz")}
                    </Button>
                    {dirty && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDrafts((d) => ({ ...d, [t.key]: { ...t } }))}
                      >
                        {tr("Odrzuć")}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardContent className="p-5 text-xs text-muted-foreground leading-relaxed space-y-2">
          <p>
            <b className="text-foreground">{tr("Jak zgody działają w praktyce.")}</b>{" "}
            {tr(
              ' Wysyłka w trybie marketingowym idzie wyłącznie do kontaktów ze zgodą na dany kanał. Tryb administracyjny — ustawiany na kroku automatyzacji — pomija zgodę marketingową i służy wiadomościom niemarketingowym, np. przypomnieniu o wizycie. Tag „nie kontaktować" blokuje wysyłkę w obu trybach.',
            )}
          </p>
          <p>
            <b className="text-foreground">
              {tr("Zgody dodane przez placówkę są zapisem, nie bramką.")}
            </b>{" "}
            {tr(
              "Blokować wysyłkę mogą tylko zgody e-mail i SMS, bo tylko one mają kanał, na którym da się to wyegzekwować. Nowa zgoda („zgoda na wizerunek”, „udział w badaniu”) odnotowuje decyzję pacjenta na karcie i na osi czasu — i tak, wyzwala automatyzacje reagujące na zmianę pola.",
            )}
          </p>
          <p>
            {tr(
              "Pacjent wycofuje zgody sam, klikając link wypisania w dowolnej wiadomości. Link cofa trzy zgody wbudowane — nie rusza pozostałych, bo wypisanie się z newslettera nie jest wycofaniem zgody np. na wykorzystanie wizerunku.",
            )}
          </p>
        </CardContent>
      </Card>

      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setNewConsent(emptyDraft);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tr("Nowa zgoda")}</DialogTitle>
            <DialogDescription>
              {tr(
                "Pojawi się jako przełącznik na karcie każdego kontaktu. Nie blokuje wysyłki — odnotowuje decyzję pacjenta.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{tr("Nazwa zgody *")}</Label>
              <Input
                value={newConsent.label}
                onChange={(e) => setNewConsent({ ...newConsent, label: e.target.value })}
                placeholder={tr("np. Zgoda na wykorzystanie wizerunku")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Wyjaśnienie pod przełącznikiem")}</Label>
              <Input
                value={newConsent.note}
                onChange={(e) => setNewConsent({ ...newConsent, note: e.target.value })}
                placeholder={tr("np. Zdjęcia efektów zabiegu w materiałach placówki.")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Nagłówek treści")}</Label>
              <Input
                value={newConsent.title}
                onChange={(e) => setNewConsent({ ...newConsent, title: e.target.value })}
                placeholder={tr("Domyślnie: nazwa zgody")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Treść zgody *")}</Label>
              <Textarea
                value={newConsent.body}
                onChange={(e) => setNewConsent({ ...newConsent, body: e.target.value })}
                className="min-h-[110px] resize-none text-sm"
                placeholder={tr("Pełne oświadczenie, które podpisuje pacjent.")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
              {tr("Anuluj")}
            </Button>
            <Button
              size="sm"
              disabled={!newConsent.label.trim() || !newConsent.body.trim()}
              onClick={() => void create()}
            >
              {tr("Dodaj zgodę")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {tr("Usunąć zgodę „")}
              {confirmDelete?.label}”?
            </DialogTitle>
            <DialogDescription>
              {tr("Znikną też odpowiedzi pacjentów — obecnie")}{" "}
              <b>{grantedFor(confirmDelete?.key ?? "")}</b>{" "}
              {tr(
                " udzielonych zgód. Zapis „pacjent się zgodził” bez treści, na którą się zgodził, nie jest dowodem niczego, dlatego kasujemy jedno z drugim. Jeśli chcesz tylko przestać jej używać, przełącz zgodę na „wycofana z użycia” i zapisz.",
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>
              {tr("Anuluj")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => confirmDelete && void remove(confirmDelete)}
            >
              {tr("Usuń zgodę i odpowiedzi")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
