import { warsawToday } from "@/lib/visits/warsaw-time";
import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  Download,
  Filter,
  Plus,
  Search,
  Tag as TagIcon,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  Info,
  Loader2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ShieldCheck,
  Trash2,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { isReadOnlyRole } from "@/lib/auth/roles";
import type { Contact, ContactStatus } from "@/lib/contacts";
import {
  getContactsPage,
  getContactsForExport,
  getContactFacets,
  createContact,
  createContacts,
  deleteContacts,
} from "@/lib/api/contacts.functions";
import { DIALLING_CODES, withDiallingCode } from "@/lib/phone";
import {
  CONSENT_HEADERS,
  FULL_NAME_HEADERS,
  buildNote,
  noteColumn,
  normalizePersonName,
  splitFullName,
  CONSENT_SOURCE_HEADERS,
  TEMPLATE_BUILTIN,
  buildImportTemplate,
  csvBool,
  parseStatus,
  statusesAccepted,
  type ConsentField,
} from "@/lib/contacts-import";
import { getContactFields, type ContactFieldDef } from "@/lib/api/contact-fields.functions";
import { getStatuses } from "@/lib/api/statuses.functions";
import { BulkConsentDialog } from "@/components/contacts/BulkConsentDialog";
import { useColumnPrefs, COLUMN_SORT_KEY, statusLabel } from "@/lib/table-columns";
import { ColumnPicker } from "@/components/contacts/ColumnPicker";
import { CustomFieldFilters } from "@/components/contacts/CustomFieldFilters";
import { TablePagination } from "@/components/contacts/TablePagination";
import { ContactCell } from "@/components/contacts/ContactCells";
import { intlLocale, t as tr } from "@/lib/i18n";

const emptyNewContact = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  pesel: "",
  segments: "",
  tags: "",
  source: "",
  medium: "",
  campaign: "",
  status: "lead" as ContactStatus,
};

// Minimal CSV parser supporting quoted values, commas/semicolons, escaped quotes.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // BOM zdejmowany jako pierwszy: Excel dopisuje go przy zapisie UTF-8 i **nasz
  // własny eksport też** (patrz `handleExport`). Bez tego nagłówek pierwszej
  // kolumny brzmi "<BOM>email", nie pasuje do żadnego aliasu i cała kolumna
  // znika po cichu — czyli eksport i ponowny import gubiły pierwsze pole.
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  // Detect delimiter from header line
  const firstLine = src.split("\n", 1)[0] ?? "";
  const delim =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
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

const HEADER_ALIASES: Record<string, keyof Contact> = {
  imie: "firstName",
  imię: "firstName",
  "first name": "firstName",
  firstname: "firstName",
  nazwisko: "lastName",
  "last name": "lastName",
  lastname: "lastName",
  email: "email",
  "e-mail": "email",
  mail: "email",
  telefon: "phone",
  phone: "phone",
  tel: "phone",
  "numer telefonu": "phone",
  pesel: "pesel",
  "prm id": "prmId",
  prmid: "prmId",
  "id prm": "prmId",
  idprm: "prmId",
  segmenty: "segments",
  segments: "segments",
  tagi: "tags",
  tags: "tags",
  źródło: "source",
  zrodlo: "source",
  source: "source",
  "źródło pozyskania": "source",
  "zrodlo pozyskania": "source",
  medium: "medium",
  "medium pozyskania": "medium",
  kampania: "campaign",
  campaign: "campaign",
  "kampania pozyskania": "campaign",
  status: "status",
};

/**
 * Dopasowanie nagłówka do pola własnego placówki.
 *
 * Po **etykiecie**, nie po kluczu technicznym: człowiek układający arkusz zna
 * „Wiek", a nie `custom_wiek`. Klucz też jest przyjmowany, bo tak wygląda
 * eksport. Porównanie bez wielkości liter i bez polskich znaków — „Płeć",
 * „plec" i „PŁEĆ" to ta sama kolumna, a arkusze przychodzą we wszystkich
 * trzech wariantach.
 */
function foldPl(s: string): string {
  const map: Record<string, string> = {
    ą: "a",
    ć: "c",
    ę: "e",
    ł: "l",
    ń: "n",
    ó: "o",
    ś: "s",
    ź: "z",
    ż: "z",
  };
  return s
    .trim()
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => map[ch] ?? ch);
}

/**
 * Kontakt z arkusza wraz z notatką złożoną z kolumn „Notatka…".
 *
 * Notatka jedzie obok kontaktu, a nie w nim, bo w bazie mieszka w osobnej
 * tabeli (`contact_notes`) — kontakt ma jedną kartotekę i wiele notatek.
 */
export type ImportedContact = Contact & { note?: string };

function rowsToContacts(
  rows: string[][],
  diallingCode: string,
  customFields: ContactFieldDef[] = [],
  knownStatuses: { key: string; label: string }[] = [],
): { contacts: ImportedContact[]; skipped: number; badStatuses: string[] } {
  if (rows.length < 2) return { contacts: [], skipped: 0, badStatuses: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  // Nagłówki w oryginalnej pisowni — potrzebne tylko notatkom, bo etykieta
  // „Notatka: Skąd trafił" ma trafić do kartoteki tak, jak ją napisano,
  // a nie zmniejszona do „skąd trafił".
  const headerRaw = rows[0].map((h) => h.trim());
  const out: ImportedContact[] = [];
  let skipped = 0;
  /** Wartości kolumny „Status", których nie rozpoznaliśmy — do pokazania userowi. */
  const badStatuses = new Set<string>();
  const today = warsawToday();

  // Etykieta i klucz prowadzą do tego samego pola.
  const customByHeader = new Map<string, string>();
  for (const f of customFields) {
    customByHeader.set(foldPl(f.label), f.key);
    customByHeader.set(foldPl(f.key), f.key);
  }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const obj: Partial<Contact> = {};
    const consents: Partial<Record<ConsentField, boolean>> = {};
    const custom: Record<string, string> = {};
    let consentSource = "";
    /** Kawałki notatki w kolejności kolumn — składane po przejściu wiersza. */
    const noteParts: { label: string; value: string }[] = [];
    header.forEach((h, idx) => {
      const val = (r[idx] ?? "").trim();

      // Imię i nazwisko w jednej kolumnie. Rozbijane tylko wtedy, gdy osobne
      // kolumny nic nie wniosły — plik mający i jedno, i drugie, ma pierwszeństwo
      // dla wersji rozdzielonej, bo jest jednoznaczna.
      if (FULL_NAME_HEADERS.indexOf(h) !== -1) {
        if (val && !obj.firstName && !obj.lastName) {
          const split = splitFullName(val);
          obj.firstName = split.firstName;
          obj.lastName = split.lastName;
        }
        return;
      }

      const note = noteColumn(headerRaw[idx] ?? h);
      if (note) {
        if (val) noteParts.push({ label: note.label, value: val });
        return;
      }

      // Zgody czytane z arkusza — patrz komentarz przy `consentEmail` niżej.
      const consentField = CONSENT_HEADERS[h];
      if (consentField) {
        // Duplikat nagłówka nie może cofnąć zgody: „Tak" z którejkolwiek
        // kolumny wygrywa. Plik z rejestracji potrafi mieć tę samą nazwę dwa
        // razy i to nie jest powód, żeby komuś odebrać zgodę.
        consents[consentField] = consents[consentField] || csvBool(val);
        return;
      }
      if (CONSENT_SOURCE_HEADERS.indexOf(h) !== -1) {
        if (val) consentSource = val;
        return;
      }

      const customKey = customByHeader.get(foldPl(h));
      if (customKey) {
        if (val) custom[customKey] = val;
        return;
      }

      const key = HEADER_ALIASES[h];
      if (!key) return;
      if (key === "segments" || key === "tags") {
        obj[key] = val
          ? val
              .split(/[;,|]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      } else {
        (obj as Record<string, unknown>)[key] = val;
      }
    });
    // Wiersz jest wart wczytania, jeśli niesie cokolwiek, po czym da się
    // rozpoznać albo złapać pacjenta. Sam telefon też się liczy — przy imporcie
    // bazy z rejestracji telefonicznej bywa jedyną rzeczą, jaka o kimś jest.
    if (!obj.firstName && !obj.lastName && !obj.email && !obj.phone) {
      skipped++;
      continue;
    }
    const id = `imp-${Date.now()}-${i}`;
    // Etykieta polska („Pacjent") jest równie poprawna co klucz („patient") —
    // patrz parseStatus. Wartość, której nie rozumiemy, jest liczona i pokazana
    // nad podglądem, zamiast po cichu zostać leadem.
    const parsedStatus = parseStatus(String(obj.status ?? ""), knownStatuses);
    const status: ContactStatus = parsedStatus.status;
    if (!parsedStatus.recognised) badStatuses.add(String(obj.status ?? "").trim());
    const anyConsent = consents.consentEmail || consents.consentSms || consents.consentProfiling;
    out.push({
      // Zgoda tylko wtedy, gdy arkusz mówi o niej wprost. **Brak kolumny to
      // brak zgody**, nie „pewnie tak" — sam fakt, że ktoś jest w pliku, nadal
      // niczego nie dowodzi (zasada z punktu 34).
      //
      // Kolumna JEST natomiast dowodem, gdy niesie podstawę: zgoda papierowa
      // zebrana w rejestracji jest mocniejsza niż cokolwiek zbieranego
      // elektronicznie, a odmawianie jej wczytania zmuszałoby recepcję do
      // klikania tysięcy kart po kolei. Stąd `zgoda_zrodlo` — bez podstawy
      // zostaje sama jedynka w komórce, która przy kontroli nic nie znaczy.
      consentEmail: consents.consentEmail ? 1 : 0,
      consentSms: consents.consentSms ? 1 : 0,
      consentProfiling: consents.consentProfiling ? 1 : 0,
      consentSource: consentSource || (anyConsent ? "import CSV" : "import"),
      consentUpdatedAt: anyConsent ? Date.now() : null,
      customFields: custom,
      // Import w Kontaktach tworzy pełne kartoteki. Kontakty telefoniczne mają
      // własny import, w swoim module.
      phoneOnly: 0,
      // Import i ręczne dodanie nie znają systemu rezerwacji; powiązanie nadaje synchronizacja.
      externalPatientId: null,
      externalSyncedAt: null,
      id,
      prmId: obj.prmId || `PRM-${String(90000 + i).slice(-5)}`,
      // Ta sama normalizacja co przy kolumnie łączonej: „ANNA", „anna"
      // i „dr Anna" mają dać „Anna" niezależnie od tego, którym układem
      // kolumn przyszedł plik.
      firstName: normalizePersonName(obj.firstName || ""),
      lastName: normalizePersonName(obj.lastName || ""),
      email: obj.email || "",
      // Kierunkowy doklejany TYLKO numerom, które go nie mają — patrz lib/phone.ts.
      phone: withDiallingCode(obj.phone || "", diallingCode),
      pesel: obj.pesel || "",
      segments: obj.segments || [],
      tags: obj.tags || ["import-csv"],
      source: obj.source || "CSV Import",
      medium: obj.medium || "import",
      campaign: obj.campaign || "—",
      createdAt: today,
      status,
      // Pusta notatka nie jedzie — kartoteka z pustym wpisem wygląda jak
      // notatka, której ktoś zapomniał dokończyć.
      note: buildNote(noteParts) || undefined,
    });
  }
  return { contacts: out, skipped, badStatuses: [...badStatuses].filter(Boolean) };
}

/**
 * Wiersze, w których jest **więcej komórek niż nagłówków**.
 *
 * Objaw jest zawsze ten sam: nierozdzielony przecinek w komórce pliku
 * rozdzielanego przecinkami — najczęściej w tagach („kardio,newsletter" bez
 * cudzysłowu). Nadmiarowe komórki po prostu znikają, więc import wygląda na
 * udany, a połowa tagów przepada. Liczymy je, żeby dało się to zobaczyć PRZED
 * zapisaniem czegokolwiek, a nie odkryć przy pierwszej wysyłce do segmentu.
 */
function countRaggedRows(rows: string[][]): number {
  if (rows.length < 2) return 0;
  const width = rows[0].length;
  let ragged = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i].length > width) ragged += 1;
  return ragged;
}

export const Route = createFileRoute("/contacts/")({
  head: () => ({
    meta: [
      { title: tr("Kontakty — PRM Core") },
      {
        name: "description",
        content: tr("Zarządzaj kontaktami pacjentów: segmenty, tagi, źródła, kampanie."),
      },
    ],
  }),
  // Both come from the top bar: `q` seeds the filter, `new` opens the dialog.
  // Keeping them in the URL means the search is shareable and survives a reload.
  validateSearch: (search: Record<string, unknown>): { q?: string; new?: boolean } => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    new: search.new === true || search.new === "true" ? true : undefined,
  }),
  component: ContactsPage,
});

type SortKey = "name" | "contact" | "source" | "created" | "status";

/**
 * Kiedy kontakt trafił do bazy, najdokładniej jak się da.
 *
 * `createdAt` to sama data, bez godziny — a przy imporcie albo dniu z kilkoma
 * zapisami z rejestracji cała paczka ma tę samą. Identyfikatory nadawane przez
 * system niosą milisekundę powstania (`book-1786044396388`), więc rozstrzygają
 * remis wewnątrz dnia. Kontakty z pierwszego zasiewu mają identyfikatory
 * porządkowe („7”, „8”) i po prostu zostają na końcu swojego dnia.
 */
function createdRank(c: Contact): number {
  const ms = /-(\d{13})(?:-|$)/.exec(c.id)?.[1];
  if (ms) return Number(ms);
  const day = Date.parse(c.createdAt);
  return Number.isNaN(day) ? 0 : day;
}

/** Kolejność cyklu życia pacjenta. Alfabetycznie „Aktywny, Lead, Nieaktywny, Pacjent" nic nie znaczy. */
const STATUS_RANK: Record<ContactStatus, number> = {
  lead: 0,
  active: 1,
  patient: 2,
  inactive: 3,
};

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
        // Czytnik ekranu dostaje kierunek, którego strzałka nie powie na głos.
        aria-sort={active ? (sortDesc ? "descending" : "ascending") : "none"}
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-muted-foreground/60"}`} />
      </button>
    </TableHead>
  );
}

function ContactsPage() {
  const { user } = useRouteContext({ from: "__root__" });
  const podglad = isReadOnlyRole(user?.role);
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [q, setQ] = useState(search.q ?? "");
  // Szukanie chodzi teraz do bazy, więc pytanie przy każdej literze byłoby
  // zapytaniem na literę. 300 ms wystarczy, żeby wpisywanie było płynne,
  // a wynik nadal wyglądał na natychmiastowy.
  const [debouncedQ, setDebouncedQ] = useState(search.q ?? "");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const [status, setStatus] = useState<string>("all");
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<Contact[]>([]);
  const [previewSkipped, setPreviewSkipped] = useState(0);
  const [raggedRows, setRaggedRows] = useState(0);
  const [badStatuses, setBadStatuses] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  /**
   * Domyślnie **włączone**: import to zwykle zaciąganie istniejącej bazy, a nie
   * ludzie, którzy właśnie się zapisali. Odblokowanie automatyzacji przy
   * tysiącach wierszy musi być świadomym kliknięciem, nie domyślką.
   */
  const [silentImport, setSilentImport] = useState(true);
  // Surowe wiersze trzymane obok podglądu: zmiana kierunkowego ma przeliczyć
  // numery bez ponownego wczytywania pliku.
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [diallingCode, setDiallingCode] = useState("+48");
  const [fileName, setFileName] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  // Pola własne placówki — kolumna „Wiek" w arkuszu ma trafić w pole „Wiek"
  // z Ustawień, a nie zostać po cichu zignorowana. Wczytywane raz przy wejściu
  // na stronę, bo lista zmienia się rzadko, a plik może dojść w każdej chwili.
  const [customFieldDefs, setCustomFieldDefs] = useState<ContactFieldDef[]>([]);
  /** Statusy placówki — import musi je znać, inaczej cofa własne wartości do „Lead". */
  const [knownStatuses, setKnownStatuses] = useState<{ key: string; label: string }[]>([]);
  // Komplet definicji — to on jest rejestrem kolumn tabeli. Pola własne
  // (`customFieldDefs`) to jego podzbiór, potrzebny osobno przy imporcie.
  const [allFieldDefs, setAllFieldDefs] = useState<ContactFieldDef[]>([]);

  useEffect(() => {
    getContactFields()
      .then((view) => {
        setAllFieldDefs(view.fields);
        setCustomFieldDefs(view.fields.filter((d) => !d.builtin));
      })
      .catch(() => {
        setAllFieldDefs([]);
        setCustomFieldDefs([]);
      });
    getStatuses()
      .then((rows) => setKnownStatuses(rows.map((r) => ({ key: r.key, label: r.label }))))
      .catch(() => setKnownStatuses([]));
  }, []);

  const columns = useColumnPrefs("prm.columns.contacts", allFieldDefs);
  /** Filtry po polach dodatkowych: klucz definicji → wybrana wartość. */
  const [customFilters, setCustomFilters] = useState<Record<string, string>>({});

  // Parametr `?new=true` otwiera formularz z pominięciem przycisku — konto
  // podglądu ma go nie zobaczyć także tą drogą. Zapis i tak zostałby odrzucony
  // przez serwer, ale formularz, który nie może nic zapisać, to obietnica bez
  // pokrycia.
  const [newContactOpen, setNewContactOpen] = useState(search.new === true && !podglad);
  const [newContact, setNewContact] = useState(emptyNewContact);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [consentOpen, setConsentOpen] = useState(false);
  // Kontakty czekające na potwierdzenie usunięcia. Trzymane w całości, a nie
  // jako id, żeby okno mogło wymienić ludzi po nazwisku.
  const [confirmDelete, setConfirmDelete] = useState<Contact[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function runDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const result = await deleteContacts({ data: { ids: confirmDelete.map((c) => c.id) } });
      if (result.deleted.length > 0) {
        toast.success(
          result.deleted.length === 1
            ? tr("Usunięto kontakt: {v0}", { v0: result.deleted[0] })
            : tr("Usunięto {length} kontaktów.", { length: result.deleted.length }),
        );
      }
      for (const err of result.errors) toast.error(err);
      setSelectedIds([]);
      setConfirmDelete(null);
      await refreshContacts();
    } catch {
      toast.error(tr("Nie udało się usunąć — spróbuj ponownie."));
    } finally {
      setDeleting(false);
    }
  }

  // The top bar navigates here with ?q= / ?new=. Reacting to the params rather
  // than only reading them once means a second click while already on the page
  // still opens the dialog.
  useEffect(() => {
    if (search.q !== undefined) setQ(search.q);
    if (search.new) setNewContactOpen(true);
  }, [search.q, search.new]);

  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Najnowszy kontakt na górze — to jest pytanie, które lista dostaje najczęściej
  // („kto właśnie wpadł?”), więc jest odpowiedzią domyślną.
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDesc, setSortDesc] = useState(true);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc((d) => !d);
      return;
    }
    setSortKey(key);
    // Daty startują od najnowszej, teksty od A — w obu przypadkach to kierunek,
    // którego człowiek się spodziewa po pierwszym kliknięciu.
    setSortDesc(key === "created");
  }

  const sortProps = { sortKey, sortDesc, onSort: toggleSort };

  // ── dane listy: strona z serwera, nie cała tabela ────────────────────────
  //
  // Filtr, sortowanie i stronicowanie liczy SQL. Trzymanie ich w przeglądarce
  // wymagało pobrania wszystkiego, a przy jedenastu tysiącach kontaktów to
  // kilka megabajtów na każde wejście na listę.
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [total, setTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [loadingPage, setLoadingPage] = useState(false);
  const [facets, setFacets] = useState<{
    segments: [string, number][];
    tags: [string, number][];
    statuses: [string, number][];
    custom: Record<string, [string, number][]>;
  }>({ segments: [], tags: [], statuses: [], custom: {} });

  /** Parametry zapytania — jeden obiekt, żeby lista i eksport pytały o to samo. */
  const query = useMemo(
    () => ({
      q: debouncedQ,
      status,
      segments: selectedSegments,
      tag: selectedTag ?? "",
      sortKey,
      sortDesc,
      phoneOnly: false,
      custom: customFilters,
    }),
    [debouncedQ, status, selectedSegments, selectedTag, sortKey, sortDesc, customFilters],
  );

  const refreshContacts = useCallback(async () => {
    setLoadingPage(true);
    try {
      const result = await getContactsPage({
        data: { ...query, offset: page * pageSize, limit: pageSize },
      });
      setAllContacts(result.rows);
      setTotal(result.total);
      setTotalAll(result.totalAll);
      setContactsLoaded(true);
    } finally {
      setLoadingPage(false);
    }
  }, [query, page, pageSize]);

  useEffect(() => {
    void refreshContacts();
  }, [refreshContacts]);

  // Zmiana filtra cofa na pierwszą stronę: zostanie na stronie 7 po zawężeniu
  // wyniku do 30 osób pokazałoby pustkę i wyglądało jak zepsuty filtr.
  useEffect(() => {
    setPage(0);
    setSelectedIds([]);
  }, [debouncedQ, status, selectedSegments, selectedTag, pageSize, customFilters]);

  // Liczniki tagów i segmentów agregatem z całej bazy — strona ich nie widzi.
  const refreshFacets = useCallback(() => {
    getContactFacets({ data: { phoneOnly: false } })
      .then(setFacets)
      .catch(() => setFacets({ segments: [], tags: [], statuses: [], custom: {} }));
  }, []);
  useEffect(() => refreshFacets(), [refreshFacets]);

  const segmentCounts = facets.segments;
  const tagCounts = facets.tags;

  // Serwer oddaje już przefiltrowane i posortowane — te nazwy zostają, bo
  // używa ich cała reszta ekranu (eksport, zaznaczanie, tabela).
  const filtered = allContacts;
  const sorted = allContacts;

  function toggleSegment(segment: string) {
    setSelectedSegments((prev) =>
      prev.includes(segment) ? prev.filter((s) => s !== segment) : [...prev, segment],
    );
  }

  async function handleCreateContact() {
    if (!newContact.firstName.trim() || !newContact.lastName.trim()) {
      toast.error(tr("Podaj imię i nazwisko."));
      return;
    }
    // E-mail ALBO telefon — jeden sposób kontaktu wystarczy. Część pacjentów
    // przychodzi z rejestracji telefonicznej i adresu po prostu nie ma;
    // wymaganie go kończyło się wpisywaniem adresów zmyślonych, a zmyślony
    // adres jest gorszy od pustego pola: trafia do wysyłek.
    if (!newContact.email.trim() && !newContact.phone.trim()) {
      toast.error(
        tr("Podaj e-mail albo numer telefonu — bez żadnego z nich nie ma jak się skontaktować."),
      );
      return;
    }
    const today = warsawToday();
    const contact: Contact = {
      // Added by hand: whoever is typing this in has to record the consent
      // deliberately, on the contact card.
      consentEmail: 0,
      consentSms: 0,
      consentProfiling: 0,
      consentSource: "ręcznie",
      consentUpdatedAt: null,
      customFields: {},
      phoneOnly: 0,
      // Import i ręczne dodanie nie znają systemu rezerwacji; powiązanie nadaje synchronizacja.
      externalPatientId: null,
      externalSyncedAt: null,
      id: `new-${Date.now()}`,
      prmId: `PRM-${String(90000 + Math.floor(Math.random() * 9999)).slice(-5)}`,
      firstName: newContact.firstName.trim(),
      lastName: newContact.lastName.trim(),
      email: newContact.email.trim(),
      phone: newContact.phone.trim(),
      pesel: newContact.pesel.trim(),
      segments: newContact.segments
        .split(/[;,|]/)
        .map((s) => s.trim())
        .filter(Boolean),
      tags: newContact.tags
        .split(/[;,|]/)
        .map((s) => s.trim())
        .filter(Boolean),
      source: newContact.source.trim() || tr("Ręczne dodanie"),
      medium: newContact.medium.trim() || "manual",
      campaign: newContact.campaign.trim() || "—",
      createdAt: today,
      status: newContact.status,
    };
    const result = await createContact({ data: contact });
    if (!result.ok) {
      // Not created, and the dialog stays open with what was typed — the
      // duplicate is offered as a link instead of a dead end.
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
    await refreshContacts();
    toast.success(
      tr("Dodano kontakt: {firstName} {lastName}", {
        firstName: contact.firstName,
        lastName: contact.lastName,
      }),
    );
    setNewContactOpen(false);
    setNewContact(emptyNewContact);
  }

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const rows = parseCSV(text);
        const {
          contacts: parsed,
          skipped,
          badStatuses: bad,
        } = rowsToContacts(rows, diallingCode, customFieldDefs, knownStatuses);
        setBadStatuses(bad);
        setRawRows(rows);
        setPreviewRows(parsed);
        setPreviewSkipped(skipped);
        setRaggedRows(countRaggedRows(rows));
        if (parsed.length === 0) toast.error(tr("Nie znaleziono poprawnych kontaktów w pliku."));
      } catch {
        toast.error(tr("Nie udało się odczytać pliku CSV."));
      }
    };
    reader.readAsText(file, "utf-8");
  }

  /** Zmiana kierunkowego przelicza podgląd z zapamiętanych wierszy — bez ponownego wczytywania pliku. */
  function applyDiallingCode(code: string) {
    setDiallingCode(code);
    if (rawRows.length === 0) return;
    const {
      contacts: parsed,
      skipped,
      badStatuses: bad,
    } = rowsToContacts(rawRows, code, customFieldDefs, knownStatuses);
    setBadStatuses(bad);
    setPreviewRows(parsed);
    setPreviewSkipped(skipped);
    setRaggedRows(countRaggedRows(rawRows));
  }

  /** Ile numerów kierunkowy realnie dotknął — żeby wybór nie był wyborem w ciemno. */
  const phoneStats = useMemo(() => {
    let withPhone = 0;
    let added = 0;
    for (const c of previewRows) {
      if (!c.phone.trim()) continue;
      withPhone += 1;
      if (c.phone.startsWith(diallingCode)) added += 1;
    }
    return { withPhone, added };
  }, [previewRows, diallingCode]);

  /**
   * Wysyłka partiami, a nie jednym żądaniem.
   *
   * Powód jest dwojaki i oba wyszły dopiero na realnym pliku z 8922 wierszami.
   * Po pierwsze **rozmiar**: komplet kontaktów to kilka megabajtów JSON-a
   * w jednym POST, co bywa odbijane przez proxy. Po drugie **czas**: każdy
   * wiersz przechodzi przez matcher scalania, który odpytuje bazę, a wiersze są
   * wstawiane pojedynczo (celowo — patrz `createContacts`), więc pełny import
   * trwa minuty. Jedno żądanie na minuty to żądanie, które zrywa proxy, a
   * z ekranu wygląda jak przycisk, który nic nie robi.
   *
   * Partia po 200: żadna nie trwa dłużej niż kilka sekund, a po każdej widać
   * postęp. Przerwanie w połowie zostawia zaimportowane to, co już weszło —
   * ponowny import pominie je jako duplikaty, więc powtórzenie jest bezpieczne.
   */
  async function confirmImport() {
    const BATCH = 200;
    const all = previewRows;
    setImporting(true);
    setImportProgress({ done: 0, total: all.length });

    let inserted = 0;
    let skipped = 0;
    const reasons: string[] = [];

    try {
      for (let i = 0; i < all.length; i += BATCH) {
        const chunk = all.slice(i, i + BATCH);
        const result = await createContacts({
          data: { contacts: chunk, announce: !silentImport },
        });
        inserted += result.inserted;
        skipped += result.skipped;
        for (const r of result.reasons) if (reasons.length < 20) reasons.push(r);
        setImportProgress({ done: Math.min(i + BATCH, all.length), total: all.length });
      }
    } catch {
      await refreshContacts();
      setImporting(false);
      toast.error(
        tr(
          "Import przerwany po {inserted} kontaktach. Wgraj ten sam plik ponownie — to, co już weszło, zostanie pominięte jako duplikaty.",
          { inserted: inserted },
        ),
        { duration: 12000 },
      );
      return;
    }

    await refreshContacts();
    setImporting(false);
    // Says how many were skipped and why — an import that silently drops rows
    // looks identical to one that worked.
    toast.success(
      skipped > 0
        ? tr("Zaimportowano {inserted}, pominięto {skipped} jako duplikaty.", {
            inserted: inserted,
            skipped: skipped,
          })
        : tr("Zaimportowano {inserted} kontaktów", { inserted: inserted }),
      skipped > 0 && reasons.length > 0
        ? { description: reasons.slice(0, 5).join(" · "), duration: 10000 }
        : undefined,
    );
    setImportOpen(false);
    setPreviewRows([]);
    setPreviewSkipped(0);
    setRaggedRows(0);
    setBadStatuses([]);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  /** Quotes a CSV cell — a segment list or a campaign name may contain the delimiter. */
  function csvCell(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  /**
   * Exports what is on screen (or just the ticked rows), in the same column
   * order the importer reads back. Round-tripping matters more here than a
   * prettier layout: this file is what somebody re-imports after editing.
   */
  async function exportCsv() {
    // Zaznaczenie działa na widocznej stronie; bez zaznaczenia eksport obejmuje
    // **cały wynik filtra**, nie samą stronę. Plik z 100 wierszami po filtrze
    // dającym 3 000 osób byłby cichym okrojeniem eksportu.
    const rows =
      selectedIds.length > 0
        ? sorted.filter((c) => selectedIds.includes(c.id))
        : await getContactsForExport({ data: query });
    if (rows.length === 0) {
      toast.error(tr("Nie ma czego wyeksportować — lista jest pusta."));
      return;
    }
    const header = [
      "prmId",
      "firstName",
      "lastName",
      "email",
      "phone",
      "pesel",
      "segments",
      "tags",
      "source",
      "medium",
      "campaign",
      "status",
      "createdAt",
      "consentEmail",
      "consentSms",
    ];
    const lines = [
      header.join(","),
      ...rows.map((c) =>
        [
          c.prmId,
          c.firstName,
          c.lastName,
          c.email,
          c.phone,
          c.pesel,
          c.segments.join(";"),
          c.tags.join(";"),
          c.source,
          c.medium,
          c.campaign,
          c.status,
          c.createdAt,
          c.consentEmail === 1 ? "tak" : "nie",
          c.consentSms === 1 ? "tak" : "nie",
        ]
          .map((v) => csvCell(String(v ?? "")))
          .join(","),
      ),
    ];
    // BOM so Excel opens Polish characters correctly — without it "Wiśniewska"
    // arrives mangled and somebody "fixes" the data instead of the encoding.
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kontakty-${warsawToday()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(tr("Wyeksportowano {length} kontaktów.", { length: rows.length }));
  }

  /**
   * Szablon budowany na miejscu z aktualnych definicji pól — pole dodane
   * w Ustawieniach pojawia się w nim od razu, bez ruszania kodu. BOM, żeby
   * Excel otworzył polskie znaki poprawnie; parser importu i tak go zdejmuje.
   */
  function downloadTemplate() {
    const tpl = buildImportTemplate(customFieldDefs);
    const blob = new Blob(["﻿" + tpl], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prm-szablon-importu.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(
      customFieldDefs.length > 0
        ? tr("Szablon pobrany — {length} kolumn wbudowanych i {length2} pól własnych.", {
            length: TEMPLATE_BUILTIN.length,
            length2: customFieldDefs.length,
          })
        : tr("Szablon pobrany — {length} kolumn.", { length: TEMPLATE_BUILTIN.length }),
    );
  }

  return (
    <div className="space-y-6">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            setImportOpen(true);
            handleFile(f);
          }
        }}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{tr("Kontakty")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalAll.toLocaleString(intlLocale())} {tr(" kontaktów")}
            {total !== totalAll &&
              tr(" · {v0} po filtrach", { v0: total.toLocaleString(intlLocale()) })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Konto podglądu: bez importu, eksportu, kasowania i zakładania.
              Ukrycie jest wygodą — właściwa odmowa siedzi w bramce funkcji
              serwerowych, bo sam ukryty przycisk niczego nie chroni. */}
          {!podglad && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> {tr(" Import CSV")}
            </Button>
          )}
          {!podglad && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void exportCsv()}
            >
              <Download className="h-4 w-4" />
              {selectedIds.length > 0
                ? tr("Eksport CSV ({length})", { length: selectedIds.length })
                : tr("Eksport CSV{v0}", {
                    v0: total > 0 ? ` (${total.toLocaleString(intlLocale())})` : "",
                  })}
            </Button>
          )}
          {/* Pokazywany dopiero po zaznaczeniu: przycisk kasujący, stale
              widoczny obok eksportu, prosi się o pomyłkę. */}
          {!podglad && selectedIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setConsentOpen(true)}
            >
              <ShieldCheck className="h-4 w-4" /> {tr(" Zgody (")}
              {selectedIds.length})
            </Button>
          )}
          {!podglad && selectedIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmDelete(sorted.filter((c) => selectedIds.includes(c.id)))}
            >
              <Trash2 className="h-4 w-4" /> {tr(" Usuń (")}
              {selectedIds.length})
            </Button>
          )}
          {!podglad && (
            <Button size="sm" className="gap-1.5" onClick={() => setNewContactOpen(true)}>
              <Plus className="h-4 w-4" /> {tr(" Nowy kontakt")}
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={newContactOpen}
        onOpenChange={(o) => {
          setNewContactOpen(o);
          if (!o) {
            setNewContact(emptyNewContact);
            // Drop ?new= on close, otherwise a reload reopens a dialog the user
            // just dismissed.
            if (search.new) {
              navigate({ to: "/contacts", search: { q: search.q }, replace: true });
            }
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr("Nowy kontakt")}</DialogTitle>
            <DialogDescription>
              {tr("Uzupełnij dane, aby dodać kontakt do bazy PRM Core.")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{tr("Imię *")}</Label>
              <Input
                value={newContact.firstName}
                onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })}
                placeholder={tr("Jan")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Nazwisko *")}</Label>
              <Input
                value={newContact.lastName}
                onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })}
                placeholder={tr("Kowalski")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("E-mail")}</Label>
              <Input
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                placeholder="jan.kowalski@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Telefon")}</Label>
              <Input
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                placeholder="+48 600 000 000"
              />
              <p className="text-xs text-muted-foreground">
                {tr("Wystarczy e-mail albo telefon — jedno z dwóch.")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{tr("PESEL")}</Label>
              <Input
                value={newContact.pesel}
                onChange={(e) => setNewContact({ ...newContact, pesel: e.target.value })}
                placeholder="90010112345"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Status")}</Label>
              <Select
                value={newContact.status}
                onValueChange={(v) => setNewContact({ ...newContact, status: v as ContactStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">{tr("Lead")}</SelectItem>
                  <SelectItem value="active">{tr("Aktywny")}</SelectItem>
                  <SelectItem value="patient">{tr("Pacjent")}</SelectItem>
                  <SelectItem value="inactive">{tr("Nieaktywny")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Segmenty")}</Label>
              <Input
                value={newContact.segments}
                onChange={(e) => setNewContact({ ...newContact, segments: e.target.value })}
                placeholder={tr("VIP; Kardiologia")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Tagi")}</Label>
              <Input
                value={newContact.tags}
                onChange={(e) => setNewContact({ ...newContact, tags: e.target.value })}
                placeholder={tr("newsletter; nowy")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Źródło")}</Label>
              <Input
                value={newContact.source}
                onChange={(e) => setNewContact({ ...newContact, source: e.target.value })}
                placeholder={tr("Google")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Kampania")}</Label>
              <Input
                value={newContact.campaign}
                onChange={(e) => setNewContact({ ...newContact, campaign: e.target.value })}
                placeholder="kardio-q1-2026"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewContactOpen(false)}>
              {tr("Anuluj")}
            </Button>
            <Button size="sm" onClick={handleCreateContact}>
              {tr("Dodaj kontakt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(o) => {
          // Zamknięcie w trakcie wysyłki zostawiłoby import bez ekranu, na
          // którym widać postęp — a on i tak leci dalej.
          if (importing) return;
          setImportOpen(o);
          if (!o) {
            setPreviewRows([]);
            setPreviewSkipped(0);
            setRaggedRows(0);
            setBadStatuses([]);
            setFileName("");
            if (fileRef.current) fileRef.current.value = "";
          }
        }}
      >
        {/* `min-w-0` na treści i `overflow-hidden` na oknie: bez tego szeroka
            tabela podglądu (zgody, tagi i N pól własnych) rozpychała okno
            i wychodziła poza jego krawędź zamiast przewijać się w środku. */}
        <DialogContent className="max-w-4xl overflow-hidden">
          <DialogHeader className="min-w-0">
            <DialogTitle>{tr("Import kontaktów z CSV")}</DialogTitle>
            {/* Lista liczona z tego, co importer realnie zna — zaszyta na sztywno
                obiecywała kiedyś mniej, niż kod potrafił, i uczyła formatu bez
                zgód i pól własnych. */}
            <DialogDescription>
              {tr("Obsługiwane kolumny: ")} {TEMPLATE_BUILTIN.map((c) => c.header).join(", ")}
              {customFieldDefs.length > 0 && (
                <>
                  {" "}
                  {tr("oraz pola własne: ")} <b>{customFieldDefs.map((f) => f.label).join(", ")}</b>
                </>
              )}
              {tr(
                ". Wielokrotne wartości (segmenty/tagi) oddziel średnikiem. Najprościej zacząć od „Pobierz szablon” — ma wszystkie kolumny z przykładem.",
              )}
            </DialogDescription>
          </DialogHeader>

          {!fileName ? (
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:bg-muted/30 transition cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">{tr("Kliknij, aby wybrać plik CSV")}</p>
              <p className="text-xs text-muted-foreground mt-1">{tr("lub przeciągnij plik")}</p>
            </div>
          ) : (
            <div className="space-y-3 min-w-0">
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-primary" />
                <span className="font-medium truncate">{fileName}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="inline-flex items-center gap-1.5 text-success">
                  <CheckCircle2 className="h-4 w-4" /> {previewRows.length}{" "}
                  {tr(" kontaktów gotowych do importu")}
                </span>
                {previewSkipped > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-warning-foreground">
                    <AlertCircle className="h-4 w-4" /> {previewSkipped}{" "}
                    {tr(" wierszy pominiętych")}
                  </span>
                )}
              </div>

              {raggedRows > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-[oklch(0.78_0.15_75)]/40 bg-[oklch(0.78_0.15_75)]/10 px-3 py-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.48_0.15_75)]" />
                  <div className="text-xs leading-relaxed text-[oklch(0.38_0.1_75)] dark:text-[oklch(0.85_0.1_75)]">
                    <b>{raggedRows}</b> {raggedRows === 1 ? tr("wiersz ma") : tr("wierszy ma")}{" "}
                    {tr(" więcej kolumn niż nagłówek — nadmiarowe wartości ")}{" "}
                    <b>{tr("przepadną")}</b>
                    {tr(
                      ". Zwykle to nierozdzielony przecinek w komórce, najczęściej w tagach. Wpisz je po średniku (",
                    )}
                    <code>{tr("bariatria;newsletter")}</code>
                    {tr(") albo ujmij komórkę w cudzysłów (")}
                    <code>{tr('"bariatria,newsletter"')}</code>).
                  </div>
                </div>
              )}

              {/* Wartość statusu, której nie rozumiemy, staje się leadem. To musi
                  być widoczne PRZED importem — cicha podmiana statusu jest tym
                  samym rodzajem straty danych co gubione kolumny. */}
              {badStatuses.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-[oklch(0.78_0.15_75)]/40 bg-[oklch(0.78_0.15_75)]/10 px-3 py-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.48_0.15_75)]" />
                  <div className="text-xs leading-relaxed text-[oklch(0.38_0.1_75)] dark:text-[oklch(0.85_0.1_75)]">
                    {tr("Nierozpoznany status: ")}{" "}
                    <b>{badStatuses.map((s) => `„${s}”`).join(", ")}</b>{" "}
                    {tr(" — te wiersze wejdą jako ")} <b>{tr("Lead")}</b>
                    {tr(". Dozwolone wartości:")} {statusesAccepted(knownStatuses).join(", ")}.
                  </div>
                </div>
              )}

              {/* Kierunkowy przelicza podgląd od razu — numer widać PRZED
                  importem, a nie dopiero na karcie pacjenta. */}
              <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/30 p-3">
                <Label className="text-xs">{tr("Kierunkowy dla numerów bez niego")}</Label>
                <div className="flex items-center gap-2">
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
                  <span className="text-xs text-muted-foreground">
                    {phoneStats.added > 0
                      ? tr("dopisany do {added} z {withPhone} numerów", {
                          added: phoneStats.added,
                          withPhone: phoneStats.withPhone,
                        })
                      : phoneStats.withPhone > 0
                        ? tr("wszystkie numery mają już kierunkowy")
                        : tr("w pliku nie ma numerów")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {tr(
                    "Numery zapisane już międzynarodowo (np. +49…) zostają bez zmian — mieszana baza nie zamieni się w polską.",
                  )}
                </p>
              </div>
              {/* Bez tego 8922 nowych kontaktów emituje 8922 zdarzeń
                  `contact.created`, a każda aktywna automatyzacja z wyzwalaczem
                  „Nowy kontakt" wysyła im wszystkim powitanie. */}
              <label className="flex items-start gap-2.5 rounded-md border border-border/60 bg-muted/30 p-3">
                <Checkbox
                  checked={silentImport}
                  onCheckedChange={(v) => setSilentImport(v === true)}
                  className="mt-0.5"
                />
                <span className="text-xs leading-relaxed">
                  <b>{tr("Nie uruchamiaj automatyzacji dla tych kontaktów")}</b>{" "}
                  {tr(" — zalecane przy zaciąganiu istniejącej bazy.")}
                  <span className="block text-muted-foreground">
                    {tr(
                      "Odznaczenie sprawi, że każdy zaimportowany wiersz zostanie zgłoszony jako nowy kontakt i uruchomi aktywne automatyzacje z wyzwalaczem „Nowy kontakt” albo „Dodanie tagu” — przy ",
                    )}{" "}
                    {previewRows.length.toLocaleString(intlLocale())} {tr(" wierszach to")}{" "}
                    {previewRows.length.toLocaleString(intlLocale())}{" "}
                    {tr(" przebiegów i tyle samo wysyłek.")}
                  </span>
                </span>
              </label>

              {previewRows.length > 0 && (
                <div className="w-full min-w-0 max-h-64 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      {/* Zgody, tagi i pola własne są w podglądzie celowo:
                          kolumna, która się nie wczytała, ma być widoczna
                          PRZED importem, a nie odkryta po nim przy pierwszej
                          pominiętej wysyłce. */}
                      <TableRow className="bg-muted/40">
                        <TableHead>{tr("Imię i nazwisko")}</TableHead>
                        <TableHead>{tr("Email")}</TableHead>
                        <TableHead>{tr("Telefon")}</TableHead>
                        <TableHead>{tr("Status")}</TableHead>
                        <TableHead>{tr("Zgody")}</TableHead>
                        <TableHead>{tr("Tagi / segmenty")}</TableHead>
                        {customFieldDefs.map((f) => (
                          <TableHead key={f.key}>{f.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.slice(0, 50).map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            {c.firstName} {c.lastName}
                          </TableCell>
                          <TableCell className="text-xs">{c.email}</TableCell>
                          <TableCell className="text-xs">{c.phone}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{c.status}</Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {c.consentEmail === 1 || c.consentSms === 1 ? (
                              <span className="text-success">
                                {[
                                  c.consentEmail === 1 ? "e-mail" : null,
                                  c.consentSms === 1 ? "SMS" : null,
                                  c.consentProfiling === 1 ? "profil." : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">{tr("brak")}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {[...c.segments, ...c.tags].join(", ") || "—"}
                          </TableCell>
                          {customFieldDefs.map((f) => (
                            <TableCell key={f.key} className="text-xs">
                              {c.customFields?.[f.key] || (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" size="sm" onClick={downloadTemplate}>
              {tr("Pobierz szablon")}
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              disabled={importing}
              onClick={() => setImportOpen(false)}
            >
              {tr("Anuluj")}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={previewRows.length === 0 || importing}
              onClick={confirmImport}
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              {importing
                ? tr("Importuję… {v0} z {v1}", {
                    v0: importProgress.done.toLocaleString(intlLocale()),
                    v1: importProgress.total.toLocaleString(intlLocale()),
                  })
                : tr("Importuj {v0}", {
                    v0:
                      previewRows.length > 0
                        ? `(${previewRows.length.toLocaleString(intlLocale())})`
                        : "",
                  })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zgody zaznaczonych — osobne okno, bo decyzja jest inna niż edycja
          pojedynczej karty: dotyczy wielu osób naraz i wymaga podstawy. */}
      <BulkConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        contactIds={selectedIds}
        onDone={() => {
          setSelectedIds([]);
          void refreshContacts();
        }}
      />

      <Dialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {confirmDelete?.length === 1
                ? tr("Usunąć kontakt {firstName} {lastName}?", {
                    firstName: confirmDelete[0].firstName,
                    lastName: confirmDelete[0].lastName,
                  })
                : tr("Usunąć {v0} kontaktów?", { v0: confirmDelete?.length ?? 0 })}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {tr("Usunięcie jest ")} <b>{tr("nieodwracalne")}</b>{" "}
                  {tr(
                    " i obejmuje całą historię pacjenta: notatki, wiadomości, wizyty, zgody, wgrane dokumenty i przebiegi automatyzacji.",
                  )}
                </p>
                <p>
                  {tr(
                    "Historyczne statystyki mogą się o te osoby zmniejszyć — dziennik ich kroków też znika, bo dane pacjenta usuwamy naprawdę, a nie oznaczamy jako usunięte.",
                  )}
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          {confirmDelete && confirmDelete.length > 1 && (
            <div className="max-h-40 overflow-auto rounded-md border bg-muted/20 p-3 text-sm">
              {confirmDelete.slice(0, 50).map((c) => (
                <div key={c.id} className="truncate">
                  {c.firstName} {c.lastName}
                  <span className="text-muted-foreground"> · {c.email || c.phone || c.prmId}</span>
                </div>
              ))}
              {confirmDelete.length > 50 && (
                <div className="pt-1 text-xs text-muted-foreground">
                  {tr("…i ")} {confirmDelete.length - 50} {tr(" więcej.")}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>
              {tr("Anuluj")}
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={runDelete}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}

              {tr("Usuń bezpowrotnie")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-border/60 shadow-[var(--shadow-card)] p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr("Szukaj po imieniu, e-mailu, telefonie, PRM ID…")}
              className="h-9 pl-9 bg-muted/40 border-transparent focus-visible:bg-background"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("Wszystkie statusy")}</SelectItem>
              <SelectItem value="patient">{tr("Pacjent")}</SelectItem>
              <SelectItem value="active">{tr("Aktywny")}</SelectItem>
              <SelectItem value="lead">{tr("Lead")}</SelectItem>
              <SelectItem value="inactive">{tr("Nieaktywny")}</SelectItem>
            </SelectContent>
          </Select>
          {/* Filtry po polach kliniki — pojawiają się same, gdy pole ma dane. */}
          <CustomFieldFilters
            fields={allFieldDefs}
            values={facets.custom}
            selected={customFilters}
            onChange={setCustomFilters}
          />
          <ColumnPicker prefs={columns} />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-9">
                <Filter className="h-4 w-4" /> {tr(" Filtry")}
                {selectedSegments.length > 0 && (
                  <Badge variant="secondary" className="ml-0.5 h-4 px-1 font-normal">
                    {selectedSegments.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80">
              <div className="flex items-start gap-2 mb-3">
                <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  {tr("Dostępne filtry: ")} <b>{tr("segment")}</b> {tr(" (poniżej) oraz ")}{" "}
                  <b>{tr("status")}</b> {tr(" i ")} <b>{tr("tag")}</b>{" "}
                  {tr(
                    " (osobne pola obok). Wybierz kilka segmentów naraz, aby zawęzić listę do kontaktów należących do dowolnego z nich.",
                  )}
                </p>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {segmentCounts.length === 0 && (
                  <p className="text-xs text-muted-foreground">{tr("Brak segmentów w bazie.")}</p>
                )}
                {segmentCounts.map(([segment, count]) => (
                  <label
                    key={segment}
                    className="flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selectedSegments.includes(segment)}
                        onCheckedChange={() => toggleSegment(segment)}
                      />
                      {segment}
                    </span>
                    <span className="text-xs text-muted-foreground">{count}</span>
                  </label>
                ))}
              </div>
              {selectedSegments.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-3 gap-1.5"
                  onClick={() => setSelectedSegments([])}
                >
                  <X className="h-3.5 w-3.5" /> {tr(" Wyczyść filtry segmentów")}
                </Button>
              )}
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-9">
                <TagIcon className="h-4 w-4" /> {tr(" Tagi")}
                {selectedTag && (
                  <Badge variant="secondary" className="ml-0.5 h-4 px-1 font-normal">
                    1
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72">
              <div className="flex items-start gap-2 mb-3">
                <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  {tr(
                    "Dostępne tagi w bazie kontaktów. Kliknij tag, aby zobaczyć tylko kontakty, które go mają.",
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
                {tagCounts.length === 0 && (
                  <p className="text-xs text-muted-foreground">{tr("Brak tagów w bazie.")}</p>
                )}
                {tagCounts.map(([tag, count]) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag((prev) => (prev === tag ? null : tag))}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                      selectedTag === tag
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/40 hover:bg-primary-soft/40"
                    }`}
                  >
                    {tag} <span className="opacity-70">({count})</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {(selectedSegments.length > 0 || selectedTag) && (
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 bg-muted/20">
            <span className="text-xs text-muted-foreground">{tr("Aktywne filtry:")}</span>
            {selectedSegments.map((s) => (
              <Badge key={s} variant="secondary" className="gap-1 font-normal">
                {tr("Segment: ")} {s}
                <button type="button" onClick={() => toggleSegment(s)} className="cursor-pointer">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {selectedTag && (
              <Badge variant="secondary" className="gap-1 font-normal">
                {tr("Tag: ")} {selectedTag}
                <button
                  type="button"
                  onClick={() => setSelectedTag(null)}
                  className="cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10">
                  <Checkbox
                    checked={sorted.length > 0 && selectedIds.length === sorted.length}
                    onCheckedChange={(v) =>
                      setSelectedIds(v === true ? sorted.map((c) => c.id) : [])
                    }
                    aria-label={tr("Zaznacz wszystkie widoczne")}
                  />
                </TableHead>
                {/* Kolumny i ich kolejność ustawia użytkownik — patrz
                    `useColumnPrefs`. Klikalne są tylko te, dla których serwer ma
                    klucz sortowania: segmenty czy tagi to kilka wartości naraz,
                    więc „posortuj po segmencie” nie ma jednej odpowiedzi. */}
                {columns.visible.map((col) => {
                  const sortBy = COLUMN_SORT_KEY[col.key];
                  return sortBy ? (
                    <SortableHead key={col.key} label={col.label} sortBy={sortBy} {...sortProps} />
                  ) : (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!contactsLoaded && (
                <TableRow>
                  <TableCell colSpan={columns.visible.length + 1} className="py-12 text-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((c) => {
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => navigate({ to: "/contacts/$id", params: { id: c.id } })}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(c.id)}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={(v) =>
                          setSelectedIds((prev) =>
                            v === true ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                          )
                        }
                        aria-label={tr("Zaznacz {firstName} {lastName}", {
                          firstName: c.firstName,
                          lastName: c.lastName,
                        })}
                      />
                    </TableCell>
                    {columns.visible.map((col) => (
                      <ContactCell key={col.key} colKey={col.key} contact={c} />
                    ))}
                  </TableRow>
                );
              })}
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
    </div>
  );
}
