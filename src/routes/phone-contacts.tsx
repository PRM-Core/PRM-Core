import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  FileText,
  Info,
  Loader2,
  Phone,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
import { toast } from "sonner";
import type { Contact, ContactStatus } from "@/lib/contacts";
import { DIALLING_CODES, withDiallingCode } from "@/lib/phone";
import { CONSENT_HEADERS, csvBool } from "@/lib/contacts-import";
import { getContactsPage, getContactFacets } from "@/lib/api/contacts.functions";
import { getContactFields, type ContactFieldDef } from "@/lib/api/contact-fields.functions";
import { useColumnPrefs, COLUMN_SORT_KEY, statusLabel } from "@/lib/table-columns";
import { ColumnPicker } from "@/components/contacts/ColumnPicker";
import { CustomFieldFilters } from "@/components/contacts/CustomFieldFilters";
import { TablePagination } from "@/components/contacts/TablePagination";
import { ContactCell } from "@/components/contacts/ContactCells";
import {
  getPhoneContactStats,
  createPhoneContact,
  createPhoneContacts,
  type PhoneContactInput,
} from "@/lib/api/phone-contacts.functions";
import { intlLocale, t as tr } from "@/lib/i18n";

export const Route = createFileRoute("/phone-contacts")({
  head: () => ({
    meta: [
      { title: tr("Kontakty telefoniczne — PRM Core") },
      {
        name: "description",
        content: tr("Pacjenci znani z numeru telefonu — rejestracja telefoniczna i import list."),
      },
    ],
  }),
  component: PhoneContactsPage,
});

// ── import listy numerów ────────────────────────────────────────────────────

/** Ten sam parser, co przy imporcie kontaktów: cudzysłowy, przecinek albo średnik. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n?/g, "\n");
  const firstLine = src.split("\n", 1)[0] ?? "";
  const delim =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delim) {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Pusty kontakt telefoniczny — jedno miejsce, żeby nie rozjechało się między formularzem a importem. */
function emptyDraft(): PhoneContactInput {
  return {
    phone: "",
    firstName: "",
    lastName: "",
    note: "",
    source: "",
    campaign: "",
    consentEmail: false,
    consentSms: false,
    consentProfiling: false,
    consentSource: "",
    tags: [],
  };
}

/** Nagłówki kolumny z tagami — obsługiwana osobno, bo wartość trzeba rozbić na listę. */
const TAG_HEADERS = ["tagi", "tags", "tag"];

// Słownik zgód i `csvBool` mieszkają w `lib/contacts-import.ts` — ten sam plik
// czyta import w Kontaktach. Dwie kopie rozjechałyby się przy pierwszym nowym
// wariancie nagłówka, a wtedy ten sam arkusz zaciągnąłby zgodę w jednym module
// i pominął w drugim.

/**
 * Nagłówki mapowane na pola TEKSTOWE. Zgody i tagi mają własne tablice, bo
 * wymagają przetworzenia wartości — typ pilnuje, żeby nie trafiły tutaj.
 */
type TextField = {
  [K in keyof PhoneContactInput]: PhoneContactInput[K] extends string ? K : never;
}[keyof PhoneContactInput];

const HEADERS: Record<string, TextField> = {
  telefon: "phone",
  phone: "phone",
  tel: "phone",
  "numer telefonu": "phone",
  numer: "phone",
  imie: "firstName",
  imię: "firstName",
  firstname: "firstName",
  nazwisko: "lastName",
  lastname: "lastName",
  notatka: "note",
  uwagi: "note",
  note: "note",
  źródło: "source",
  zrodlo: "source",
  source: "source",
  kampania: "campaign",
  campaign: "campaign",
  "zgoda zrodlo": "consentSource",
  "zgoda źródło": "consentSource",
  zgoda_zrodlo: "consentSource",
  "podstawa zgody": "consentSource",
};

/**
 * Plik bez nagłówka też ma zadziałać — lista numerów z rejestracji bywa jedną
 * kolumną bez opisu, a odrzucenie jej z komunikatem o brakującym nagłówku
 * byłoby uprzejmością wobec formatu, nie wobec człowieka.
 */
function rowsToPhoneContacts(
  rows: string[][],
  diallingCode: string,
): { items: PhoneContactInput[]; skipped: number } {
  if (rows.length === 0) return { items: [], skipped: 0 };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = header.some(
    (h) => h in HEADERS || h in CONSENT_HEADERS || TAG_HEADERS.indexOf(h) !== -1,
  );
  const startAt = hasHeader ? 1 : 0;
  const items: PhoneContactInput[] = [];
  let skipped = 0;

  for (let i = startAt; i < rows.length; i++) {
    const r = rows[i];
    const item = emptyDraft();

    if (hasHeader) {
      header.forEach((h, idx) => {
        const raw = (r[idx] ?? "").trim();
        const consentKey = CONSENT_HEADERS[h];
        if (consentKey) {
          item[consentKey] = csvBool(raw);
          return;
        }
        if (TAG_HEADERS.indexOf(h) !== -1) {
          // Kilka tagów w jednej komórce rozdziela przecinek, średnik albo
          // kreska pionowa. Gdy separator kolidowałby z separatorem pliku,
          // wystarczy ująć komórkę w cudzysłów — parser to rozumie.
          item.tags = raw
            .split(/[;,|]/)
            .map((t) => t.trim())
            .filter(Boolean);
          return;
        }
        const key = HEADERS[h];
        if (key) item[key] = raw;
      });
    } else {
      // Bez nagłówka: pierwsza kolumna to numer, kolejne (jeśli są) imię i nazwisko.
      item.phone = (r[0] ?? "").trim();
      item.firstName = (r[1] ?? "").trim();
      item.lastName = (r[2] ?? "").trim();
    }

    // Numer musi mieć dziewięć cyfr polskiego numeru — wiersz bez tego nie jest
    // kontaktem telefonicznym, tylko śmieciem, który zaśmieciłby moduł.
    if (item.phone.replace(/\D/g, "").length < 9) {
      skipped++;
      continue;
    }
    // Kierunkowy doklejany po sprawdzeniu długości — inaczej „+48" doklejone do
    // śmiecia zrobiłoby z niego numer wyglądający poprawnie.
    item.phone = withDiallingCode(item.phone, diallingCode);
    items.push(item);
  }
  return { items, skipped };
}

// ── strona ──────────────────────────────────────────────────────────────────

type SortKey = "phone" | "name" | "source" | "created";

function createdRank(c: Contact): number {
  const ms = /-(\d{13})(?:-|$)/.exec(c.id)?.[1];
  if (ms) return Number(ms);
  const day = Date.parse(c.createdAt);
  return Number.isNaN(day) ? 0 : day;
}

function SortableHead({
  label,
  sortBy,
  sortKey,
  sortDesc,
  onSort,
}: {
  label: string;
  sortBy: SortKey;
  sortKey: SortKey;
  sortDesc: boolean;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === sortBy;
  const Icon = !active ? ChevronsUpDown : sortDesc ? ChevronDown : ChevronUp;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(sortBy)}
        className="flex cursor-pointer items-center gap-1 hover:text-foreground"
        aria-sort={active ? (sortDesc ? "descending" : "ascending") : "none"}
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-muted-foreground/60"}`} />
      </button>
    </TableHead>
  );
}

function PhoneContactsPage() {
  const navigate = useNavigate();
  // Stronicowanie serwerowe — ten sam mechanizm co w module Kontakty. Wcześniej
  // strona ładowała **całą** listę do pamięci i filtrowała ją w przeglądarce;
  // przy kilkunastu tysiącach numerów to ten sam problem, który tam rozwiązaliśmy.
  const [rows, setRows] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, unnamed: 0 });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("all");
  const [customFilters, setCustomFilters] = useState<Record<string, string>>({});
  const [allFieldDefs, setAllFieldDefs] = useState<ContactFieldDef[]>([]);
  const [facets, setFacets] = useState<{
    segments: [string, number][];
    tags: [string, number][];
    statuses: [string, number][];
    custom: Record<string, [string, number][]>;
  }>({ segments: [], tags: [], statuses: [], custom: {} });
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDesc, setSortDesc] = useState(true);

  const columns = useColumnPrefs("prm.columns.phone-contacts", allFieldDefs);

  // Wpisywanie nie ma odpytywać serwera na każdą literę.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Zmiana filtra cofa na pierwszą stronę — inaczej filtr zawężający wynik do
  // kilku osób pokazałby pustkę i wyglądał jak zepsuty.
  useEffect(() => {
    setPage(0);
  }, [debouncedQ, status, customFilters, pageSize]);

  useEffect(() => {
    getContactFields()
      .then((view) => setAllFieldDefs(view.fields))
      .catch(() => setAllFieldDefs([]));
    getContactFacets({ data: { phoneOnly: true } })
      .then(setFacets)
      .catch(() => setFacets({ segments: [], tags: [], statuses: [], custom: {} }));
  }, []);

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<PhoneContactInput[]>([]);
  const [previewSkipped, setPreviewSkipped] = useState(0);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [diallingCode, setDiallingCode] = useState("+48");
  const fileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<PhoneContactInput>(emptyDraft);

  /**
   * Klucz sortowania serwera.
   *
   * Moduł ma własną kolumnę „Telefon", a serwer sortuje kolumną złożoną
   * `contact` (e-mail + telefon) — dla listy telefonicznej to ten sam porządek,
   * bo e-mail jest tu pusty.
   */
  const serverSortKey = sortKey === "phone" ? "contact" : sortKey;

  const query = useMemo(
    () => ({
      q: debouncedQ,
      status,
      segments: [] as string[],
      tag: "",
      sortKey: serverSortKey as "name" | "contact" | "source" | "created" | "status",
      sortDesc,
      phoneOnly: true,
      custom: customFilters,
    }),
    [debouncedQ, status, serverSortKey, sortDesc, customFilters],
  );

  const refresh = useCallback(async () => {
    setLoadingPage(true);
    try {
      const result = await getContactsPage({
        data: { ...query, offset: page * pageSize, limit: pageSize },
      });
      setRows(result.rows);
      setTotal(result.total);
      setLoaded(true);
    } finally {
      setLoadingPage(false);
    }
    getPhoneContactStats()
      .then(setStats)
      .catch(() => {});
  }, [query, page, pageSize]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc((d) => !d);
      return;
    }
    setSortKey(key);
    setSortDesc(key === "created");
  }
  const sortProps = { sortKey, sortDesc, onSort: toggleSort };

  // Filtrowanie i sortowanie robi teraz SQL — `rows` to gotowa strona wyniku.
  const sorted = rows;

  async function handleAdd() {
    if (draft.phone.replace(/\D/g, "").length < 9) {
      toast.error(tr("Podaj numer telefonu — bez niego to nie jest kontakt telefoniczny."));
      return;
    }
    const result = await createPhoneContact({
      data: { ...draft, consentSource: draft.consentSource || "rozmowa telefoniczna" },
    });
    if (!result.ok) {
      toast.error(result.error ?? tr("Nie udało się dodać kontaktu."), {
        action: result.duplicateOf
          ? {
              label: tr("Otwórz istniejący"),
              onClick: () => navigate({ to: "/contacts/$id", params: { id: result.duplicateOf! } }),
            }
          : undefined,
      });
      return;
    }
    toast.success(tr("Dodano kontakt telefoniczny."));
    setAddOpen(false);
    setDraft(emptyDraft());
    refresh();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCSV(String(reader.result ?? ""));
      const { items, skipped } = rowsToPhoneContacts(rows, diallingCode);
      setRawRows(rows);
      setPreview(items);
      setPreviewSkipped(skipped);
    };
    reader.readAsText(file, "utf-8");
  }

  /** Zmiana kierunkowego przelicza podgląd z zapamiętanych wierszy. */
  function applyDiallingCode(code: string) {
    setDiallingCode(code);
    if (rawRows.length === 0) return;
    const { items, skipped } = rowsToPhoneContacts(rawRows, code);
    setPreview(items);
    setPreviewSkipped(skipped);
  }

  async function handleImport() {
    if (preview.length === 0) return;
    setImporting(true);
    const result = await createPhoneContacts({ data: { rows: preview } });
    setImporting(false);
    toast.success(tr("Zaimportowano {inserted} numerów.", { inserted: result.inserted }), {
      description:
        result.skipped > 0
          ? tr("Pominięto {skipped} — już były w bazie.", { skipped: result.skipped })
          : tr("Żaden numer się nie powtórzył."),
    });
    setImportOpen(false);
    setPreview([]);
    setPreviewSkipped(0);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tr("Kontakty telefoniczne")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stats.total.toLocaleString(intlLocale())} {tr(" numerów")}
            {total !== stats.total &&
              tr(" · {v0} pasuje do filtra", { v0: total.toLocaleString(intlLocale()) })}
            {stats.unnamed > 0 &&
              tr(" · {v0} czeka na uzupełnienie nazwiska", {
                v0: stats.unnamed.toLocaleString(intlLocale()),
              })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> {tr(" Import listy")}
          </Button>
          <Button className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> {tr(" Nowy numer")}
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          {tr(
            "Pacjenci znani na razie tylko z numeru — z rejestracji telefonicznej albo z importu. Karta, oś czasu, notatki i zgody są takie same jak w Kontaktach.",
          )}{" "}
          <strong>{tr("Gdy uzupełnisz imię i nazwisko, kontakt przechodzi do Kontaktów")}</strong>{" "}
          {tr(" i znika z tej listy.")}
        </p>
      </div>

      <Card className="p-4 border-border/60 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative max-w-md flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={tr("Szukaj po numerze, imieniu, PRM ID…")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {/* Statusy z bazy, nie z listy w kodzie — moduł telefoniczny bywa
              zawężony do jednego czy dwóch i pusty filtr byłby mylący. */}
          {facets.statuses.length > 1 && (
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr("Wszystkie statusy")}</SelectItem>
                {facets.statuses.map(([value, count]) => (
                  <SelectItem key={value} value={value}>
                    {statusLabel[value as ContactStatus]?.label ?? value} ({count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <CustomFieldFilters
            fields={allFieldDefs}
            values={facets.custom}
            selected={customFilters}
            onChange={setCustomFilters}
          />
          <ColumnPicker prefs={columns} />
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {columns.visible.map((col) => {
                  const sortBy = COLUMN_SORT_KEY[col.key];
                  return sortBy ? (
                    <SortableHead
                      key={col.key}
                      label={col.label}
                      sortBy={col.key === "phone" ? "phone" : (sortBy as SortKey)}
                      {...sortProps}
                    />
                  ) : (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loaded && (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
                  </TableCell>
                </TableRow>
              )}
              {loaded && sorted.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={columns.visible.length}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    {stats.total === 0
                      ? tr(
                          "Brak kontaktów telefonicznych. Zaimportuj listę numerów albo dodaj pierwszy ręcznie.",
                        )
                      : tr("Nic nie pasuje do wyszukiwania.")}
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate({ to: "/contacts/$id", params: { id: c.id } })}
                >
                  {columns.visible.map((col) => (
                    <ContactCell key={col.key} colKey={col.key} contact={c} variant="phone" />
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <TablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          loading={loadingPage}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      </Card>

      {/* ── nowy numer ─────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("Nowy kontakt telefoniczny")}</DialogTitle>
            <DialogDescription>
              {tr("Wymagany jest tylko numer. Resztę można uzupełnić później na karcie.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{tr("Numer telefonu *")}</Label>
              <Input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="+48 600 100 200"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{tr("Imię")}</Label>
                <Input
                  value={draft.firstName}
                  onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                  placeholder={tr("Jan")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Nazwisko")}</Label>
                <Input
                  value={draft.lastName}
                  onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                  placeholder={tr("Kowalski")}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {tr("Podanie imienia i nazwiska od razu przenosi kontakt do Kontaktów.")}
            </p>
            <div className="space-y-1.5">
              <Label>{tr("Źródło")}</Label>
              <Input
                value={draft.source}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                placeholder={tr("Rejestracja telefoniczna")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Tagi")}</Label>
              <Input
                value={draft.tags.join(", ")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    tags: e.target.value
                      .split(/[;,|]/)
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                placeholder={tr("RDS, protezy")}
              />
              <p className="text-xs text-muted-foreground">
                {tr('Tag „telefon" dokłada się sam — te dopisują się obok.')}
              </p>
            </div>

            {/* Rozmowa telefoniczna to moment, w którym pacjent zgody udziela —
                dlatego są tutaj, a nie dopiero na karcie. Domyślnie odznaczone:
                zaznacza je ten, kto tę zgodę usłyszał. */}
            <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
              <Label className="text-xs">{tr("Zgody udzielone podczas rozmowy")}</Label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.consentSms}
                    onCheckedChange={(v) => setDraft({ ...draft, consentSms: v === true })}
                  />

                  {tr("Marketing SMS")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.consentEmail}
                    onCheckedChange={(v) => setDraft({ ...draft, consentEmail: v === true })}
                  />

                  {tr("Marketing e-mail")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.consentProfiling}
                    onCheckedChange={(v) => setDraft({ ...draft, consentProfiling: v === true })}
                  />

                  {tr("Profilowanie")}
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {tr(
                  "Zaznacz tylko to, na co pacjent naprawdę się zgodził. Zmiana trafi na oś czasu kontaktu razem ze źródłem — to jest ślad audytowy.",
                )}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {tr("Anuluj")}
            </Button>
            <Button onClick={() => void handleAdd()}>{tr("Dodaj")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── import ─────────────────────────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tr("Import listy numerów")}</DialogTitle>
            <DialogDescription>
              {tr(
                "Plik CSV. Wystarczy kolumna z numerem — nagłówek jest opcjonalny. Rozpoznawane nagłówki: telefon, imie, nazwisko, notatka, źródło, kampania, tagi oraz zgody —",
              )}
              <strong>
                {tr("„Zgoda Marketing e-mail”, „Zgoda Marketing SMS”, „Zgoda profilowanie”")}
              </strong>
              {tr("(albo krócej: zgoda_email, zgoda_sms, zgoda_profilowanie) i")}
              <strong> {tr(" zgoda_zrodlo")}</strong>.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
          />

          {fileName && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> {fileName}
            </div>
          )}

          {preview.length > 0 && (
            <>
              <div className="flex items-center gap-4 text-sm">
                <span className="inline-flex items-center gap-1.5 text-success">
                  <CheckCircle2 className="h-4 w-4" /> {preview.length} {tr(" do zaimportowania")}
                </span>
                {previewSkipped > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <AlertCircle className="h-4 w-4" /> {previewSkipped}{" "}
                    {tr(" pominięto (brak numeru)")}
                  </span>
                )}
              </div>
              <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/30 p-3">
                <Label className="text-xs">{tr("Kierunkowy dla numerów bez niego")}</Label>
                <Select value={diallingCode} onValueChange={applyDiallingCode}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIALLING_CODES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} · {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {tr(
                    "Numery zapisane już międzynarodowo (np. +49…) zostają bez zmian. Podgląd niżej pokazuje numery po doklejeniu.",
                  )}
                </p>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>{tr("Numer")}</TableHead>
                      <TableHead>{tr("Imię i nazwisko")}</TableHead>
                      <TableHead>{tr("Źródło")}</TableHead>
                      <TableHead>{tr("Tagi")}</TableHead>
                      <TableHead>{tr("Zgody")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.slice(0, 50).map((p, i) => (
                      <TableRow key={`${p.phone}-${i}`}>
                        <TableCell className="font-mono text-xs">{p.phone}</TableCell>
                        <TableCell className="text-xs">
                          {p.firstName || p.lastName ? (
                            `${p.firstName} ${p.lastName}`.trim()
                          ) : (
                            <span className="text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.source || tr("Rejestracja telefoniczna")}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.tags.length > 0 ? (
                            p.tags.join(", ")
                          ) : (
                            <span className="text-muted-foreground">{tr("telefon")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.consentEmail || p.consentSms || p.consentProfiling ? (
                            <span className="text-success">
                              {[
                                p.consentEmail && "e-mail",
                                p.consentSms && "SMS",
                                p.consentProfiling && "profilowanie",
                              ]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{tr("brak")}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                {tr(
                  "Numery, które już są w bazie, zostaną pominięte — import nie zakłada drugiej kartoteki temu samemu pacjentowi.",
                )}
                <br />
                <strong>{tr("Zgody nadawane są wyłącznie z kolumn w pliku")}</strong>{" "}
                {tr(
                  " („tak”, „1” albo „x”). Pusta kolumna znaczy brak zgody — plik sam w sobie nie jest dowodem, że pacjent się zgodził. W ",
                )}{" "}
                <code>{tr("zgoda_zrodlo")}</code>{" "}
                {tr(
                  " wpisz, skąd ta zgoda pochodzi (np. „formularz rejestracji 2026-03”); trafi na oś czasu pacjenta jako ślad audytowy.",
                )}
              </p>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
              {tr("Anuluj")}
            </Button>
            <Button
              onClick={() => void handleImport()}
              disabled={preview.length === 0 || importing}
            >
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tr("Importuj ")} {preview.length > 0 ? `(${preview.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
