import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Infinity as InfinityIcon,
  Layers,
  Loader2,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getSegments,
  previewSegmentDefinition,
  removeSegment,
  getSegmentDeletionImpact,
  saveSegmentDefinition,
  getCustomSegmentFields,
  getEmailMessageOptions,
  getSegmentDefinitionMembers,
  type SegmentMember,
  type SegmentPreview,
  type SegmentSummary,
} from "@/lib/api/segments.functions";
import { getContentItems } from "@/lib/api/content-items.functions";
import { getStatuses } from "@/lib/api/statuses.functions";
import { SegmentAssistant } from "@/components/segments/SegmentAssistant";
import {
  OPERATOR_LABELS,
  SEGMENT_FIELDS,
  withStatusOptions,
  VALUELESS_OPERATORS,
  countConditions,
  emptyDefinition,
  fieldDef,
  type SegmentCondition,
  type SegmentDefinition,
  type SegmentFieldDef,
  type SegmentOperator,
} from "@/lib/segments/segment-definition";
import { intlLocale, t as tr, localized } from "@/lib/i18n";

export const Route = createFileRoute("/segments")({
  head: () => ({
    meta: [
      { title: tr("Segmenty — PRM Core") },
      {
        name: "description",
        content: tr("Twórz segmenty pacjentów na bazie atrybutów, zgód i realnych zdarzeń."),
      },
    ],
  }),
  component: SegmentsPage,
});

/** Ile godzin zostało do zniknięcia segmentu. `null` przy stałym. */
function zostaloGodzin(expiresAt: number | null): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.round((expiresAt - Date.now()) / 3_600_000));
}

/**
 * Opis terminu ważności po ludzku. „za 47 h" jest czytelniejsze niż data,
 * bo pytanie brzmi „ile mam czasu", a nie „którego zniknie".
 */
function opisWygasania(expiresAt: number | null): string {
  const h = zostaloGodzin(expiresAt);
  if (h === null) return "bez terminu";
  if (h === 0) return "znika lada chwila";
  if (h < 24) return `za ${h} h`;
  return `za ${Math.round(h / 24)} dni`;
}

function SegmentsPage() {
  const [view, setView] = useState<"list" | "builder">("list");
  const [editing, setEditing] = useState<SegmentSummary | null>(null);
  const [list, setList] = useState<SegmentSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<SegmentSummary | null>(null);
  /** Co usunięcie zrobi kartotekom — dociągane po otwarciu potwierdzenia. */
  const [deleteImpact, setDeleteImpact] = useState<{ fromLabel: boolean; labelled: number } | null>(
    null,
  );

  const refresh = useCallback(() => getSegments().then(setList), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  if (view === "builder") {
    return (
      <SegmentBuilder
        segment={editing}
        onBack={() => {
          setView("list");
          refresh();
        }}
      />
    );
  }

  const filtered = (list ?? []).filter((s) =>
    !query.trim() ? true : s.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{tr("Segmenty")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {list === null
              ? tr("Wczytywanie…")
              : tr("{length} {v1} · liczba osób przeliczana na bieżąco z bazy", {
                  length: list.length,
                  v1: list.length === 1 ? "segment" : tr("segmentów"),
                })}
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setEditing(null);
            setView("builder");
          }}
        >
          <Plus className="h-4 w-4" /> {tr(" Nowy segment")}
        </Button>
      </div>

      <Card className="border-border/60 shadow-[var(--shadow-card)] p-0 overflow-hidden">
        <div className="flex items-center gap-3 border-b p-4">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("Szukaj segmentu…")}
              className="h-9 pl-9 bg-muted/40 border-transparent focus-visible:bg-background"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>{tr("Nazwa segmentu")}</TableHead>
                <TableHead>{tr("Status")}</TableHead>
                <TableHead>{tr("Warunki")}</TableHead>
                <TableHead className="text-right">{tr("Osób teraz")}</TableHead>
                <TableHead>{tr("Zmodyfikowano")}</TableHead>
                <TableHead>{tr("Przez")}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list === null && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
                  </TableCell>
                </TableRow>
              )}
              {list !== null && filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    {list.length === 0
                      ? tr(
                          "Nie ma jeszcze żadnego segmentu. „Nowy segment” otwiera builder — warunki liczą się z realnej bazy.",
                        )
                      : tr("Żaden segment nie pasuje do wyszukiwania.")}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => {
                    setEditing(s);
                    setView("builder");
                  }}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-primary-soft flex items-center justify-center text-primary shrink-0">
                        <Layers className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div>{s.name}</div>
                        {s.description && (
                          <div className="text-xs font-normal text-muted-foreground truncate max-w-[280px]">
                            {s.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        s.status === "live"
                          ? "bg-success/10 text-success border-success/20"
                          : "bg-muted text-muted-foreground border-border"
                      }
                    >
                      {s.status === "live" ? tr("Gotowy do użycia") : tr("Wersja robocza")}
                    </Badge>
                    {/* Kiedy segment zniknie sam. Bez tego „doraźny" byłby
                        niewidoczną właściwością, a segment znikałby bez
                        uprzedzenia — co wygląda jak awaria. */}
                    {s.permanent ? (
                      <Badge variant="outline" className="ml-1.5 gap-1 text-muted-foreground">
                        <InfinityIcon className="h-3 w-3" /> {tr(" stały")}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={`ml-1.5 gap-1 ${
                          (zostaloGodzin(s.expiresAt) ?? 99) <= 6
                            ? "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-500"
                            : "text-muted-foreground"
                        }`}
                        title={tr(
                          "Segment doraźny — zniknie sam, chyba że oznaczysz go jako stały.",
                        )}
                      >
                        <Clock className="h-3 w-3" /> {opisWygasania(s.expiresAt)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {countConditions(s.definition)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {s.members.toLocaleString(intlLocale())}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(s.updatedAt).toLocaleString(intlLocale())}
                  </TableCell>
                  <TableCell className="text-xs">{s.updatedBy || "—"}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      title={tr("Usuń segment")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(s);
                        setDeleteImpact(null);
                        void getSegmentDeletionImpact({ data: { id: s.id } })
                          .then((r) => setDeleteImpact(r))
                          .catch(() => setDeleteImpact(null));
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <div className="p-5 text-xs text-muted-foreground leading-relaxed space-y-2">
          <p>
            <b className="text-foreground">
              {tr("Segment dynamiczny nie jest listą osób, tylko zestawem warunków.")}
            </b>{" "}
            {tr(
              "Przynależność liczy się przy każdym odczycie, więc pacjent, który wczoraj dostał tag, jest w segmencie dziś, bez żadnego odświeżania. Dlatego nie ma tu przycisku „przelicz” — nie ma czego przeliczać na zapas.",
            )}
          </p>
          <p>
            <b className="text-foreground">{tr("Segmenty nadawane ręcznie też są tutaj.")}</b>{" "}
            {tr(
              " Przypisanie na karcie kontaktu, akcja „Zmień segment” i PRM_Agent zakładają segment o definicji „ma tę etykietę”, więc wszystko, czego używa placówka, jest widoczne na tej liście. Na karcie kontaktu można wybrać wyłącznie segment, który już tu istnieje — nazwy nie wpisuje się z ręki, bo „VIP” i „vip ” to dla automatyzacji dwie różne rzeczy.",
            )}
          </p>
        </div>
      </Card>

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmDelete(null);
            setDeleteImpact(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {tr("Usunąć segment „")}
              {confirmDelete?.name}”?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {tr(
                    "Znika definicja, nie kontakty — nikt nie wypada z bazy. Jeśli jakaś automatyzacja używa tej nazwy w warunku „W segmencie”, zacznie ją traktować jako etykietę.",
                  )}
                </p>
                {/* Segment z etykiety wraca sam, dopóki ktokolwiek ma tę etykietę
                    na karcie — dlatego usuwamy ją razem z nim. To zmiana
                    w kartotekach i musi być widoczna przed kliknięciem. */}
                {deleteImpact?.fromLabel && deleteImpact.labelled > 0 && (
                  <p className="rounded-md border border-[oklch(0.78_0.15_75)]/40 bg-[oklch(0.78_0.15_75)]/10 px-3 py-2 text-xs text-[oklch(0.38_0.1_75)] dark:text-[oklch(0.85_0.1_75)]">
                    {tr("Ten segment pochodzi z etykiety nadanej na kartach kontaktów.")}{" "}
                    <b>
                      {deleteImpact.labelled}{" "}
                      {deleteImpact.labelled === 1 ? tr("kontakt straci") : tr("kontaktów straci")}
                    </b>{" "}
                    {tr("etykietę „")}
                    {confirmDelete?.name}
                    {tr("”. Bez tego segment wróciłby na listę przy najbliższym odświeżeniu.")}
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>
              {tr("Anuluj")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                if (!confirmDelete) return;
                const r = await removeSegment({ data: { id: confirmDelete.id } });
                setConfirmDelete(null);
                setDeleteImpact(null);
                refresh();
                toast.success(tr("Segment usunięty."), {
                  description:
                    r.unlabelled > 0
                      ? tr(
                          "Etykietę zdjęto z {unlabelled} kontaktów — inaczej segment wróciłby na listę.",
                          { unlabelled: r.unlabelled },
                        )
                      : undefined,
                });
              }}
            >
              {tr("Usuń segment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------- Builder ------------------------------- */

let conditionSeq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${conditionSeq++}`;

function SegmentBuilder({
  segment,
  onBack,
}: {
  segment: SegmentSummary | null;
  onBack: () => void;
}) {
  const [name, setName] = useState(segment?.name ?? tr("Nowy segment"));
  const [description, setDescription] = useState(segment?.description ?? "");
  const [status, setStatus] = useState<"draft" | "live">(segment?.status ?? "draft");
  /**
   * Segment **doraźny** to domyślny wybór: powstaje pod jedną wysyłkę i znika
   * po 48 godzinach. „Stały" trzeba włączyć świadomie — inaczej lista rośnie
   * w nieskończoność i coraz trudniej znaleźć w niej segment, który jest
   * naprawdę w użyciu.
   */
  const [permanent, setPermanent] = useState(segment?.permanent ?? false);
  const [definition, setDefinition] = useState<SegmentDefinition>(
    segment?.definition ?? emptyDefinition(),
  );
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(segment?.id);
  const [customFields, setCustomFields] = useState<{ key: string; label: string }[]>([]);
  /** Statusy placówki — do listy wyboru w warunku „Status pacjenta". */
  const [statuses, setStatuses] = useState<{ key: string; label: string }[]>([]);
  const [panel, setPanel] = useState<"fields" | "assistant">("fields");
  const [messages, setMessages] = useState<{ id: string; name: string; kind: string }[]>([]);

  useEffect(() => {
    getCustomSegmentFields().then(setCustomFields);
    getStatuses()
      .then((rows) => setStatuses(rows.map((r) => ({ key: r.key, label: r.label }))))
      .catch(() => setStatuses([]));
  }, []);

  // Wiadomości do wyboru — z bazy. Wcześniej lista powstawała jako suma tego,
  // co wie serwer (migawki wysłanych treści), i tego, co leżało
  // w `localStorage` tej przeglądarki, bo tylko tam mieszkały treści kreatora.
  // Od czasu przeniesienia ich do bazy druga połowa jest zbędna i wręcz
  // szkodliwa: pokazywała różne listy na różnych komputerach.
  useEffect(() => {
    Promise.all([
      getEmailMessageOptions(),
      getContentItems({ data: { kind: "newsletter" } }),
      getContentItems({ data: { kind: "email" } }),
    ]).then(([sent, newsletters, emails]) => {
      const byId = new Map<string, { id: string; name: string; kind: string }>(
        sent.map((m) => [m.id, m]),
      );
      for (const i of newsletters) byId.set(i.id, { id: i.id, name: i.name, kind: "newsletter" });
      for (const i of emails) byId.set(i.id, { id: i.id, name: i.name, kind: "email" });
      setMessages([...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pl")));
    });
  }, []);

  // Recount as the definition changes, but not on every keystroke: the count is
  // a full pass over the base, and nobody needs it mid-word.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    setPreviewing(true);
    debounce.current = setTimeout(() => {
      previewSegmentDefinition({ data: { definition } })
        .then(setPreview)
        .finally(() => setPreviewing(false));
    }, 500);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [definition]);

  const allFields: SegmentFieldDef[] = useMemo(
    () => [
      // Statusy z bazy — inaczej własnego statusu placówki nie da się wybrać
      // w warunku, mimo że kontakty go mają.
      ...withStatusOptions(SEGMENT_FIELDS, statuses),
      ...customFields.map((f) => ({
        key: f.key,
        label: f.label,
        kind: "custom" as const,
        operators: [
          "equals",
          "not_equals",
          "contains",
          "not_contains",
          "starts",
          "is_set",
          "is_empty",
        ] as SegmentOperator[],
      })),
    ],
    [customFields, statuses],
  );

  const update = (fn: (d: SegmentDefinition) => SegmentDefinition) => setDefinition((d) => fn(d));

  const addCondition = (groupId: string, fieldKey: string) => {
    const def = allFields.find((f) => f.key === fieldKey);
    if (!def) return;
    update((d) => ({
      ...d,
      groups: d.groups.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              conditions: [
                ...g.conditions,
                {
                  id: nextId("c"),
                  field: fieldKey,
                  operator: def.operators[0],
                  value: "",
                  ...(def.supportsWindow ? { days: 0 } : {}),
                },
              ],
            },
      ),
    }));
  };

  const patchCondition = (id: string, patch: Partial<SegmentCondition>) =>
    update((d) => ({
      ...d,
      groups: d.groups.map((g) => ({
        ...g,
        conditions: g.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      })),
    }));

  const removeCondition = (id: string) =>
    update((d) => ({
      ...d,
      groups: d.groups.map((g) => ({
        ...g,
        conditions: g.conditions.filter((c) => c.id !== id),
      })),
    }));

  const save = async () => {
    setSaving(true);
    const result = await saveSegmentDefinition({
      data: { id: savedId, name, description, status, definition, permanent },
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? tr("Nie udało się zapisać segmentu."));
      return;
    }
    setSavedId(result.id);
    toast.success(tr("Segment zapisany."), {
      description: tr("„{name}” jest na liście segmentów.", { name: name }),
    });
    // Powrót na listę: zapis jest końcem pracy nad segmentem, a zostawanie
    // w kreatorze sugerowało, że coś jeszcze trzeba zrobić. Kto chce poprawiać
    // dalej, wchodzi w segment z listy — i wtedy widzi go w kontekście reszty.
    onBack();
  };

  const total = countConditions(definition);

  return (
    <div className="-m-4 md:-m-8 flex flex-col h-[calc(100vh-4rem)] bg-muted/30">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 md:px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 max-w-xs border-transparent text-lg font-semibold focus-visible:border-input focus-visible:bg-background"
          />
          <Badge
            variant="outline"
            className={
              status === "live"
                ? "bg-success/10 text-success border-success/20"
                : "bg-muted text-muted-foreground border-border"
            }
          >
            {status === "live" ? tr("Gotowy do użycia") : tr("Wersja robocza")}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-2 text-sm">
            {previewing ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {tr(" liczę…")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <UsersIcon className="h-4 w-4 text-primary" />
                <b>{preview?.members ?? 0}</b>
                <span className="text-muted-foreground">
                  {tr("z ")} {preview?.total ?? 0} {tr(" kontaktów")}
                </span>
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStatus(status === "live" ? "draft" : "live")}
          >
            {status === "live" ? tr("Cofnij do roboczej") : tr("Oznacz jako gotowy")}
          </Button>
          <Button
            variant={permanent ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setPermanent(!permanent)}
            title={
              permanent
                ? tr("Segment stały — zostaje na liście, dopóki go nie usuniesz.")
                : tr("Segment doraźny — zniknie 48 godzin po ostatniej zmianie.")
            }
          >
            {permanent ? <InfinityIcon className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            {permanent ? tr("Stały") : tr("Doraźny (48 h)")}
          </Button>
          <Button size="sm" className="gap-1.5" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}

            {tr("Zapisz")}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Canvas */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <Card className="border-border/60 bg-background shadow-[var(--shadow-card)] p-5">
            <div className="text-xs text-muted-foreground mb-1.5">{tr("Opis (opcjonalny)")}</div>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tr("Po co jest ten segment i kogo ma obejmować")}
              className="h-9"
            />
          </Card>

          <Card className="border-border/60 bg-background shadow-[var(--shadow-card)] p-5 md:p-6">
            {total === 0 && (
              <p className="text-sm text-muted-foreground mb-4">
                {tr("Dodaj pierwszy warunek z panelu po prawej.")}{" "}
                <b>{tr("Segment bez warunków nie obejmuje nikogo")}</b>{" "}
                {tr(" — pusty zestaw reguł to segment nieskończony, a nie segment na całą bazę.")}
              </p>
            )}

            <div className="space-y-4">
              {definition.groups.map((group, gi) => (
                <div key={group.id}>
                  {gi > 0 && (
                    <div className="flex justify-center py-2">
                      <button
                        onClick={() =>
                          update((d) => ({ ...d, match: d.match === "all" ? "any" : "all" }))
                        }
                        className="rounded-full border border-primary/30 bg-primary-soft px-3 py-1 text-xs font-medium text-primary"
                        title={tr("Kliknij, aby przełączyć sposób łączenia grup")}
                      >
                        {definition.match === "all" ? "ORAZ" : "LUB"}
                      </button>
                    </div>
                  )}
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
                    <div className="flex items-center justify-between mb-3 gap-2">
                      <div className="text-sm font-medium text-muted-foreground">
                        {tr("Grupa ")} {gi + 1}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            update((d) => ({
                              ...d,
                              groups: d.groups.map((g) =>
                                g.id === group.id
                                  ? { ...g, match: g.match === "all" ? "any" : "all" }
                                  : g,
                              ),
                            }))
                          }
                          className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                        >
                          {group.match === "all"
                            ? tr("dopasuj WSZYSTKIE warunki")
                            : tr("dopasuj DOWOLNY warunek")}
                        </button>
                        {definition.groups.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            title={tr("Usuń grupę")}
                            onClick={() =>
                              update((d) => ({
                                ...d,
                                groups: d.groups.filter((g) => g.id !== group.id),
                              }))
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {group.conditions.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        {tr("Pusta grupa — dodaj warunek z panelu po prawej.")}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {group.conditions.map((condition, ci) => (
                          <ConditionRow
                            key={condition.id}
                            condition={condition}
                            fields={allFields}
                            messages={messages}
                            joiner={ci === 0 ? null : group.match === "all" ? "ORAZ" : "LUB"}
                            onChange={(patch) => patchCondition(condition.id, patch)}
                            onRemove={() => removeCondition(condition.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              className="gap-1.5 mt-4"
              onClick={() =>
                update((d) => ({
                  ...d,
                  groups: [...d.groups, { id: nextId("g"), match: "all", conditions: [] }],
                }))
              }
            >
              <Plus className="h-4 w-4" /> {tr(" Dodaj grupę")}
            </Button>
          </Card>

          {/* Members */}
          <MembersPanel definition={definition} preview={preview} total={total} />
        </div>

        {/* Right panel */}
        <aside className="w-[340px] shrink-0 border-l bg-background flex flex-col">
          <div className="flex border-b px-2">
            {(["fields", "assistant"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPanel(t)}
                className={`relative px-3 py-2.5 text-sm font-medium transition-colors ${
                  panel === t ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "fields" ? (
                  tr("Warunki")
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> {tr(" Asystent AI")}
                  </span>
                )}
                {panel === t && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>

          {panel === "fields" ? (
            <FieldPicker
              fields={allFields}
              onPick={(key) =>
                addCondition(definition.groups[definition.groups.length - 1].id, key)
              }
            />
          ) : (
            <SegmentAssistant
              definition={definition}
              onApply={(proposed, proposedName) => {
                setDefinition(proposed);
                // Only fills a name nobody has typed over — replacing a chosen
                // name with the model's would be the assistant overreaching.
                if (proposedName && name === tr("Nowy segment")) setName(proposedName);
                toast.success(tr("Propozycja wstawiona — sprawdź warunki i zapisz."));
              }}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

const MEMBER_PAGE = 50;

/**
 * Osoby, które łapie ta definicja, i droga do każdej z nich.
 *
 * Zwinięty pokazuje tę samą garść co dotychczasowy podgląd — tyle, żeby dało
 * się sprawdzić regułę okiem. Rozwinięty dociąga całe audytorium, a to jest
 * różnica między „liczba mówi 340" a możliwością odpowiedzenia „dobrze, ale
 * kto". Wiersze prowadzą na kartę kontaktu, bo następne pytanie po zobaczeniu
 * nazwiska zawsze dotyczy tej osoby.
 */
function MembersPanel({
  definition,
  preview,
  total,
}: {
  definition: SegmentDefinition;
  preview: SegmentPreview | null;
  total: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<SegmentMember[]>([]);
  const [loading, setLoading] = useState(false);

  // Edycja warunków unieważnia to, co było wczytane — stara lista należy do
  // segmentu, który już nie istnieje.
  useEffect(() => {
    setExpanded(false);
    setMembers([]);
  }, [definition]);

  const loadMore = async () => {
    setLoading(true);
    try {
      const page = await getSegmentDefinitionMembers({
        data: { definition, offset: members.length, limit: MEMBER_PAGE },
      });
      setMembers((current) => [...current, ...page.members]);
      setExpanded(true);
    } catch {
      toast.error(tr("Nie udało się wczytać kontaktów."));
    } finally {
      setLoading(false);
    }
  };

  const shown = expanded ? members : (preview?.sample ?? []);
  const count = preview?.members ?? 0;

  return (
    <Card className="border-border/60 bg-background shadow-[var(--shadow-card)] p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold">{tr("Kontakty w segmencie")}</h3>
        <span className="text-xs text-muted-foreground">
          {preview ? tr("{count} z {total}", { count: count, total: preview.total }) : "—"}
        </span>
      </div>

      {preview?.warnings.length ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-[oklch(0.78_0.15_75)]/40 bg-[oklch(0.78_0.15_75)]/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.48_0.15_75)]" />
          <div className="text-xs leading-relaxed text-[oklch(0.38_0.1_75)] dark:text-[oklch(0.85_0.1_75)]">
            {preview.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        </div>
      ) : null}

      {!preview || count === 0 ? (
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? tr("Brak warunków — segment jest pusty.")
            : tr("Żaden kontakt nie spełnia tych warunków.")}
        </p>
      ) : (
        <>
          <div
            className={expanded ? "max-h-[420px] space-y-1.5 overflow-y-auto pr-1" : "space-y-1.5"}
          >
            {shown.map((c) => (
              <Link
                key={c.id}
                to="/contacts/$id"
                params={{ id: c.id }}
                className="group flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="font-medium group-hover:text-primary">{c.name}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="max-w-[14rem] overflow-x-auto whitespace-nowrap">
                    {c.email || c.phone || "—"}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </Link>
            ))}
          </div>

          {shown.length < count && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
              disabled={loading}
              onClick={loadMore}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              {expanded
                ? tr("Doładuj kolejne (zostało {v0})", { v0: count - shown.length })
                : tr("Pokaż wszystkie kontakty ({count})", { count: count })}
            </Button>
          )}

          <p className="pt-2 text-xs text-muted-foreground">
            {tr("Pokazano ")} {shown.length} {tr(" z ")} {count}
            {tr(". Klik w kontakt otwiera jego kartę.")}
          </p>
        </>
      )}
    </Card>
  );
}

const KIND_TITLES: Record<SegmentFieldDef["kind"], string> = localized(() => ({
  attribute: "Dane kontaktu",
  tag: tr("Tagi i etykiety"),
  label: tr("Tagi i etykiety"),
  consent: "Zgody",
  custom: tr("Pola własne"),
  event: "Zachowanie",
}));

function FieldPicker({
  fields,
  onPick,
}: {
  fields: SegmentFieldDef[];
  onPick: (key: string) => void;
}) {
  const [q, setQ] = useState("");
  const matching = fields.filter((f) =>
    !q.trim() ? true : f.label.toLowerCase().includes(q.trim().toLowerCase()),
  );

  const sections: { title: string; items: SegmentFieldDef[] }[] = [];
  for (const f of matching) {
    const title = KIND_TITLES[f.kind];
    const found = sections.find((s) => s.title === title);
    if (found) found.items.push(f);
    else sections.push({ title, items: [f] });
  }

  return (
    <>
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr("Szukaj warunku")}
            className="h-9 pl-9 bg-muted/40 border-transparent focus-visible:bg-background"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto px-4 pb-6 space-y-5">
        {sections.length === 0 && (
          <p className="text-xs text-muted-foreground">{tr("Nic nie pasuje do wyszukiwania.")}</p>
        )}
        {sections.map((section) => (
          <div key={section.title}>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </div>
            <div className="space-y-1">
              {section.items.map((f) => (
                <button
                  key={f.key}
                  onClick={() => onPick(f.key)}
                  className="w-full rounded-lg border border-transparent px-2.5 py-2 text-left text-sm hover:border-border hover:bg-muted/50"
                >
                  <span className="flex items-center justify-between gap-2">
                    {f.label}
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  {f.hint && (
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                      {f.hint}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ConditionRow({
  condition,
  fields,
  messages,
  joiner,
  onChange,
  onRemove,
}: {
  condition: SegmentCondition;
  fields: SegmentFieldDef[];
  messages: { id: string; name: string; kind: string }[];
  joiner: string | null;
  onChange: (patch: Partial<SegmentCondition>) => void;
  onRemove: () => void;
}) {
  const def = fields.find((f) => f.key === condition.field) ?? fieldDef(condition.field);
  const needsValue = !VALUELESS_OPERATORS.includes(condition.operator);
  const isEvent = def?.kind === "event";
  const picksMessage = def?.valueSource === "email-template";
  // A saved segment may point at a message this browser no longer has — say so
  // rather than silently showing "dowolna", which would be a different segment.
  const missingMessage =
    picksMessage && condition.value && !messages.some((m) => m.id === condition.value);

  return (
    <div className="rounded-lg border bg-background px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        {joiner && (
          <Badge variant="secondary" className="text-[10px] font-medium">
            {joiner}
          </Badge>
        )}
        <span className="text-sm font-medium">{def?.label ?? condition.field}</span>

        <select
          value={condition.operator}
          onChange={(e) => onChange({ operator: e.target.value as SegmentOperator })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {(def?.operators ?? []).map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </option>
          ))}
        </select>

        {needsValue && picksMessage ? (
          <select
            value={condition.value}
            onChange={(e) => onChange({ value: e.target.value })}
            className="h-8 max-w-[16rem] rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">{tr("dowolna wiadomość")}</option>
            {messages.map((m) => (
              <option key={m.id} value={m.id}>
                {m.kind === "newsletter" ? tr("Newsletter") : tr("Email")} · {m.name}
              </option>
            ))}
            {missingMessage && (
              <option value={condition.value}>
                {tr("(wiadomość niedostępna w tej przeglądarce: ")} {condition.value})
              </option>
            )}
          </select>
        ) : null}

        {needsValue &&
          !picksMessage &&
          (def?.options ? (
            <select
              value={condition.value}
              onChange={(e) => onChange({ value: e.target.value })}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">{tr("— wybierz —")}</option>
              {def.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={condition.value}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder={def?.placeholder ?? tr("wartość")}
              className="h-8 flex-1 min-w-[180px] text-xs"
            />
          ))}

        {isEvent && (
          <select
            value={String(condition.days ?? 0)}
            onChange={(e) => onChange({ days: Number(e.target.value) })}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="0">{tr("kiedykolwiek")}</option>
            <option value="7">{tr("ostatnie 7 dni")}</option>
            <option value="30">{tr("ostatnie 30 dni")}</option>
            <option value="90">{tr("ostatnie 90 dni")}</option>
            <option value="365">{tr("ostatni rok")}</option>
          </select>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7 text-muted-foreground"
          title={tr("Usuń warunek")}
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {needsValue && !condition.value.trim() && !isEvent && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {tr("Bez wartości ten warunek nie jest liczony.")}
        </p>
      )}
      {missingMessage && (
        <p className="mt-1.5 text-[11px] text-[oklch(0.48_0.15_75)]">
          {tr(
            "Ten segment wskazuje wiadomość, której nie ma w tej przeglądarce — treści żyją lokalnie. Warunek liczy się poprawnie na serwerze, ale nazwy nie da się tu pokazać.",
          )}
        </p>
      )}
      {def?.hint && <p className="mt-1.5 text-[11px] text-muted-foreground">{def.hint}</p>}
    </div>
  );
}
