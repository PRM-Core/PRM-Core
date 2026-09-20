import { getStatuses } from "@/lib/api/statuses.functions";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Database,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addContactField,
  getContactFields,
  removeContactField,
  reorderContactField,
  updateContactField,
  type ContactFieldDef,
} from "@/lib/api/contact-fields.functions";
import type { ContactFieldType } from "@/lib/db/schema";
import { t as tr, localized } from "@/lib/i18n";

/**
 * Ustawienia → Tabele / Dane.
 *
 * Every column the contact card shows, under the name this clinic gave it, plus
 * whatever fields it added itself. Two things happen here that look alike and
 * are not, so the copy says which is which: renaming changes the **label**, not
 * the column, while adding creates a field that has no column at all.
 */

const TYPE_LABELS: Record<ContactFieldType, string> = localized(() => ({
  text: "Tekst",
  textarea: "Tekst wielowierszowy",
  number: "Liczba",
  date: "Data",
  select: "Lista wyboru",
  boolean: tr("Tak / nie"),
  list: tr("Wiele wartości"),
}));

/** Types a clinic can pick for a field of its own. */
const CUSTOM_TYPES: ContactFieldType[] = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "boolean",
  "list",
];

const emptyDraft = {
  label: "",
  type: "text" as ContactFieldType,
  options: "",
  hint: "",
};

export function DataFieldsTab() {
  const [fields, setFields] = useState<ContactFieldDef[] | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ label: "", hint: "", options: "" });
  /** Statusy do wyboru przy przypisywaniu pól. */
  const [statuses, setStatuses] = useState<{ key: string; label: string; color: string }[]>([]);
  /** Robocze przypisanie edytowanego pola. Pusta lista = wszystkie statusy. */
  const [editStatuses, setEditStatuses] = useState<string[]>([]);

  useEffect(() => {
    getStatuses()
      .then((r) => setStatuses(r.map((x) => ({ key: x.key, label: x.label, color: x.color }))))
      .catch(() => setStatuses([]));
  }, []);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [confirmDelete, setConfirmDelete] = useState<ContactFieldDef | null>(null);

  const refresh = () =>
    getContactFields().then((data) => {
      setFields(data.fields);
      setUsage(data.usage);
    });

  useEffect(() => {
    refresh();
  }, []);

  const startEdit = (field: ContactFieldDef) => {
    setEditingKey(field.key);
    setEditDraft({
      label: field.label,
      hint: field.hint,
      options: field.options.join(", "),
    });
    setEditStatuses(field.statuses);
    // Statusy odświeżane **przy otwarciu edycji**, nie raz przy wejściu na
    // zakładkę: status dodany przed chwilą w karcie wyżej musi być tu widoczny
    // od razu. Inaczej trzeba przeładować stronę, żeby go zobaczyć — a nikt
    // nie zgaduje, że o to chodzi.
    void getStatuses()
      .then((r) => setStatuses(r.map((x) => ({ key: x.key, label: x.label, color: x.color }))))
      .catch(() => {});
  };

  const saveEdit = async (field: ContactFieldDef) => {
    setBusy(field.key);
    const result = await updateContactField({
      data: {
        key: field.key,
        label: editDraft.label,
        hint: editDraft.hint,
        visible: field.visible,
        // Pola zablokowane zostają przy wszystkich statusach — imienia i adresu
        // nie da się przypisać do jednego etapu, bo karta bez nich nie istnieje.
        ...(field.locked ? {} : { statuses: editStatuses }),
        ...(field.builtin
          ? {}
          : {
              type: field.type,
              options: editDraft.options
                .split(",")
                .map((o) => o.trim())
                .filter(Boolean),
            }),
      },
    });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error ?? tr("Nie udało się zapisać pola."));
      return;
    }
    setEditingKey(null);
    await refresh();
    toast.success(tr("Zapisano nazwę pola."));
  };

  const toggleVisible = async (field: ContactFieldDef) => {
    setBusy(field.key);
    const result = await updateContactField({
      data: {
        key: field.key,
        label: field.label,
        hint: field.hint,
        visible: !field.visible,
        ...(field.builtin ? {} : { type: field.type, options: field.options }),
      },
    });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error ?? tr("Nie udało się zmienić widoczności."));
      return;
    }
    await refresh();
  };

  const move = async (field: ContactFieldDef, direction: "up" | "down") => {
    setBusy(field.key);
    await reorderContactField({ data: { key: field.key, direction } });
    setBusy(null);
    await refresh();
  };

  const create = async () => {
    const result = await addContactField({
      data: {
        label: draft.label,
        type: draft.type,
        options: draft.options
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
        hint: draft.hint,
      },
    });
    if (!result.ok) {
      toast.error(result.error ?? tr("Nie udało się dodać pola."));
      return;
    }
    setAddOpen(false);
    setDraft(emptyDraft);
    await refresh();
    toast.success(tr("Pole dodane — pojawi się na karcie kontaktu."));
  };

  const remove = async (field: ContactFieldDef) => {
    setBusy(field.key);
    const result = await removeContactField({ data: { key: field.key } });
    setBusy(null);
    setConfirmDelete(null);
    if (!result.ok) {
      toast.error(result.error ?? tr("Nie udało się usunąć pola."));
      return;
    }
    await refresh();
    toast.success(tr("Pole i zapisane w nim wartości zostały usunięte."));
  };

  const customCount = fields?.filter((f) => !f.builtin).length ?? 0;

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base inline-flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" /> {tr(" Kontakty — pola karty")}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
              {tr("Wszystkie dane, jakie system trzyma o kontakcie. ")} <b>{tr("Zmiana nazwy")}</b>{" "}
              {tr(
                " dotyczy etykiety widocznej w interfejsie — kolumna w bazie zostaje ta sama, bo pod jej nazwą pisane są eksporty CSV, personalizacja w wiadomościach i narzędzia MCP. ",
              )}{" "}
              <b>{tr("Nowe pole")}</b>{" "}
              {tr(
                " nie ma własnej kolumny: jego wartość zapisuje się przy kontakcie i pojawia się na karcie w sekcji „Pola dodatkowe”.",
              )}
            </p>
          </div>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> {tr(" Dodaj pole")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {!fields ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            fields.map((field, index) => {
              const editing = editingKey === field.key;
              const used = usage[field.key] ?? 0;
              return (
                <div
                  key={field.key}
                  className={`rounded-lg border p-3 transition-colors ${
                    field.visible ? "border-border/60" : "border-border/40 bg-muted/20"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        disabled={index === 0 || busy === field.key}
                        onClick={() => void move(field, "up")}
                        title={tr("W górę")}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        disabled={index === fields.length - 1 || busy === field.key}
                        onClick={() => void move(field, "down")}
                        title={tr("W dół")}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>

                    <div className="flex-1 min-w-[220px]">
                      {editing ? (
                        <Input
                          value={editDraft.label}
                          onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                          className="h-8"
                          autoFocus
                        />
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{field.label}</span>
                          <code className="text-[11px] text-muted-foreground font-mono">
                            {field.key}
                          </code>
                          {field.locked && (
                            <Badge variant="outline" className="gap-1 font-normal text-[10px]">
                              <Lock className="h-2.5 w-2.5" /> {tr(" wymagane")}
                            </Badge>
                          )}
                          {field.readOnly && (
                            <Badge variant="outline" className="font-normal text-[10px]">
                              {tr("tylko odczyt")}
                            </Badge>
                          )}
                          {!field.builtin && (
                            <Badge variant="secondary" className="font-normal text-[10px]">
                              {tr("pole własne")}
                              {used > 0 ? tr(" · {used} kontaktów", { used: used }) : ""}
                            </Badge>
                          )}
                        </div>
                      )}
                      {!editing && field.hint && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          {field.hint}
                        </p>
                      )}
                    </div>

                    {/* Przypisanie do statusów — widoczne tylko w trybie edycji
                        i tylko dla pól, które wolno przypisać. Puste zaznaczenie
                        znaczy „wszystkie statusy"; mówi to podpis pod listą, bo
                        pusty wybór bez wyjaśnienia czyta się jako „żaden". */}
                    {editing && !field.locked && statuses.length > 0 && (
                      <div className="w-full space-y-1.5 border-t pt-2">
                        <span className="text-xs font-medium">{tr("Pokazuj przy statusach")}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {statuses.map((st) => {
                            const on = editStatuses.includes(st.key);
                            return (
                              <button
                                key={st.key}
                                type="button"
                                onClick={() =>
                                  setEditStatuses((prev) =>
                                    on ? prev.filter((x) => x !== st.key) : [...prev, st.key],
                                  )
                                }
                                className={
                                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors " +
                                  (on
                                    ? "border-primary bg-primary-soft font-medium"
                                    : "border-border/60 text-muted-foreground hover:bg-muted/50")
                                }
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ background: st.color || "#999" }}
                                />
                                {st.label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {editStatuses.length === 0
                            ? tr("Nic nie zaznaczono — pole pokaże się przy każdym statusie.")
                            : tr(
                                "Pole pokaże się tylko przy: {v0}. Wypełnione wartości pozostają widoczne zawsze.",
                                {
                                  v0: statuses
                                    .filter((x) => editStatuses.includes(x.key))
                                    .map((x) => x.label)
                                    .join(", "),
                                },
                              )}
                        </p>
                      </div>
                    )}

                    {!editing && field.statuses.length > 0 && (
                      <div className="flex flex-wrap gap-1 shrink-0">
                        {field.statuses.map((k) => {
                          const st = statuses.find((x) => x.key === k);
                          return (
                            <Badge key={k} variant="secondary" className="font-normal text-[10px]">
                              {st?.label ?? k}
                            </Badge>
                          );
                        })}
                      </div>
                    )}

                    <Badge variant="outline" className="font-normal text-[11px] shrink-0">
                      {TYPE_LABELS[field.type]}
                    </Badge>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {editing ? (
                        <>
                          <Button
                            size="sm"
                            disabled={busy === field.key}
                            onClick={() => void saveEdit(field)}
                          >
                            {busy === field.key ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                            ) : (
                              <Save className="h-3.5 w-3.5 mr-1.5" />
                            )}

                            {tr("Zapisz")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={tr("Zmień nazwę")}
                            onClick={() => startEdit(field)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={field.locked || busy === field.key}
                            title={
                              field.locked
                                ? tr(
                                    "Tego pola nie da się ukryć — karta kontaktu bez niego nie działa",
                                  )
                                : field.visible
                                  ? tr("Ukryj na karcie kontaktu")
                                  : tr("Pokaż na karcie kontaktu")
                            }
                            onClick={() => void toggleVisible(field)}
                          >
                            {field.visible ? (
                              <Eye className="h-3.5 w-3.5" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </Button>
                          {!field.builtin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              title={tr("Usuń pole")}
                              onClick={() => setConfirmDelete(field)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {editing && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{tr("Podpowiedź pod polem")}</Label>
                        <Input
                          value={editDraft.hint}
                          onChange={(e) => setEditDraft({ ...editDraft, hint: e.target.value })}
                          placeholder={tr("Co wpisywać w to pole")}
                          className="h-8"
                        />
                      </div>
                      {!field.builtin && field.type === "select" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">{tr("Opcje (po przecinku)")}</Label>
                          <Input
                            value={editDraft.options}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, options: e.target.value })
                            }
                            placeholder={tr("Tak, Nie, Nie wiem")}
                            className="h-8"
                          />
                        </div>
                      )}
                      {field.builtin && (
                        <p className="text-[11px] text-muted-foreground self-end leading-snug">
                          {tr(
                            "Pole systemowe — typu i listy wartości nie da się tu zmienić, bo pisze do konkretnej kolumny w bazie.",
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardContent className="p-5 text-xs text-muted-foreground leading-relaxed space-y-2">
          <p>
            <b className="text-foreground">{tr("Gdzie to widać.")}</b>{" "}
            {tr(
              " Kolejność i nazwy z tej listy obowiązują w sekcji „Dane kontaktowe” na karcie kontaktu. Ukryte pole znika z karty, ale jego wartość zostaje w bazie — to nie jest kasowanie danych.",
            )}
          </p>
          <p>
            <b className="text-foreground">{tr("Czego pola własne jeszcze nie potrafią.")}</b>{" "}
            {tr(
              " Zapisują się i wyzwalają automatyzację „Zmiana pola kontaktu” (klucz pola = nazwa techniczna obok etykiety), ale nie da się po nich filtrować listy kontaktów ani wstawiać ich jako personalizacji w wiadomościach.",
            )}{" "}
            {customCount > 0
              ? tr("Zdefiniowanych pól własnych: {customCount}.", { customCount: customCount })
              : ""}
          </p>
        </CardContent>
      </Card>

      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setDraft(emptyDraft);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tr("Nowe pole kontaktu")}</DialogTitle>
            <DialogDescription>
              {tr("Pojawi się na karcie każdego kontaktu w sekcji „Pola dodatkowe”.")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{tr("Nazwa pola *")}</Label>
              <Input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder={tr("np. Lekarz prowadzący")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Typ")}</Label>
              <Select
                value={draft.type}
                onValueChange={(v) => setDraft({ ...draft, type: v as ContactFieldType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOM_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {draft.type === "select" && (
              <div className="space-y-1.5">
                <Label>{tr("Opcje (po przecinku) *")}</Label>
                <Input
                  value={draft.options}
                  onChange={(e) => setDraft({ ...draft, options: e.target.value })}
                  placeholder={tr("Dr Kowalski, Dr Nowak")}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{tr("Podpowiedź")}</Label>
              <Input
                value={draft.hint}
                onChange={(e) => setDraft({ ...draft, hint: e.target.value })}
                placeholder={tr("Co wpisywać w to pole")}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
              {tr("Anuluj")}
            </Button>
            <Button size="sm" disabled={!draft.label.trim()} onClick={() => void create()}>
              {tr("Dodaj pole")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {tr("Usunąć pole „")}
              {confirmDelete?.label}”?
            </DialogTitle>
            <DialogDescription>
              {tr("Razem z definicją znikną wartości zapisane u")}{" "}
              <b>{usage[confirmDelete?.key ?? ""] ?? 0}</b>{" "}
              {tr(
                " kontaktów. Dane osobowe w polu, którego nikt już nie widzi, nie powinny zostawać w bazie — dlatego kasujemy je razem z polem. Tej operacji nie da się cofnąć.",
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
              {tr("Usuń pole i wartości")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
