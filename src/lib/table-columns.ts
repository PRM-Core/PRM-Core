import { useCallback, useEffect, useMemo, useState } from "react";
import type { ContactStatus } from "./contacts";
import { t, localized } from "@/lib/i18n";

/**
 * Tyle definicji pola, ile potrzebuje tabela.
 *
 * Celowo **nie** importuję typu z `fields/contact-fields.server.ts`: ten moduł
 * ciągnie za sobą kod serwerowy, a tu potrzebne są dwa napisy. Typ strukturalny
 * pasuje do `ContactFieldDef` bez wiązania się z nim — patrz zasada
 * `*.server.ts` w nagłówku `contacts.server.ts`.
 */
interface FieldLike {
  key: string;
  label: string;
}

/**
 * Które kolumny widać na liście kontaktów i w jakiej kolejności.
 *
 * **Rejestrem kolumn są definicje pól** (`contact_field_defs`), a nie osobna
 * lista w kodzie. Gdyby były dwie listy, dodanie pola w ustawieniach nie
 * pokazywałoby go w tabeli, dopóki ktoś nie dopisałby go w drugim miejscu — a
 * o takim wymogu nikt by nie wiedział, bo nic by się nie zepsuło głośno.
 *
 * **Ustawienie jest zapisywane w przeglądarce**, osobno dla każdej listy.
 * Świadomy wybór: układ kolumn to preferencja osoby patrzącej, a nie ustawienie
 * kliniki — recepcja chce widzieć telefon, marketing zgody. **Koszt**: przy
 * zmianie komputera albo wyczyszczeniu danych przeglądarki układ wraca do
 * domyślnego. Gdyby okazało się to uciążliwe, przeniesienie do tabeli `users`
 * to jedna dodatkowa kolumna JSON i ten sam interfejs.
 */

export interface ColumnDef {
  key: string;
  label: string;
}

/**
 * Kolumny złożone, których nie da się wyprowadzić z jednego pola.
 *
 * `name` łączy imię z nazwiskiem i jest odnośnikiem do karty — dlatego oba pola
 * nie występują osobno. `consents` pokazuje trzy zgody naraz; jako trzy osobne
 * kolumny zajmowałyby pół ekranu, mówiąc to samo.
 */
const VIRTUAL: ColumnDef[] = localized(() => [
  { key: "name", label: t("Imię i nazwisko") },
  { key: "contact", label: t("Kontakt (e-mail + telefon)") },
  { key: "consents", label: t("Zgody") },
]);

/** Pola, które zastępuje kolumna złożona — nie pokazujemy ich drugi raz. */
const REPLACED = new Set(["firstName", "lastName"]);

/** Kolejność domyślna: to, co widok pokazywał, zanim dało się go zmieniać. */
const DEFAULT_ORDER: string[] = ["name", "contact", "segments", "source", "createdAt", "status"];

/** Kolumny domyślnie widoczne w module kontaktów telefonicznych. */
const DEFAULT_PHONE_ORDER: string[] = ["name", "phone", "tags", "source", "createdAt", "status"];

/**
 * Pełna lista kolumn do wyboru — złożone, wbudowane i dodane przez klinikę.
 *
 * Kolejność tutaj jest kolejnością na liście wyboru, nie w tabeli.
 */
export function availableColumns(fields: FieldLike[]): ColumnDef[] {
  const fromFields = fields
    .filter((f) => !REPLACED.has(f.key))
    .map((f) => ({ key: f.key, label: f.label }));
  return [...VIRTUAL, ...fromFields];
}

interface Prefs {
  order: string[];
  hidden: string[];
}

function read(storageKey: string): Prefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.hidden)) return null;
    return { order: parsed.order.map(String), hidden: parsed.hidden.map(String) };
  } catch {
    // Zepsuty wpis (ręczna edycja, zmiana formatu) cofa do domyślnych zamiast
    // wywracać stronę — układ kolumn nie jest wart błędu na całym module.
    return null;
  }
}

export interface ColumnPrefs {
  /** Kolumny widoczne, w kolejności wyświetlania. */
  visible: ColumnDef[];
  /** Wszystkie dostępne, w kolejności ustawionej przez użytkownika. */
  ordered: ColumnDef[];
  isVisible: (key: string) => boolean;
  toggle: (key: string) => void;
  move: (key: string, direction: -1 | 1) => void;
  reset: () => void;
  /** Czy układ różni się od domyślnego — do pokazania „Przywróć domyślne". */
  changed: boolean;
}

export function useColumnPrefs(storageKey: string, fields: FieldLike[]): ColumnPrefs {
  const available = useMemo(() => availableColumns(fields), [fields]);
  const defaults = useMemo(
    () => (storageKey.includes("phone") ? DEFAULT_PHONE_ORDER : DEFAULT_ORDER),
    [storageKey],
  );

  const [prefs, setPrefs] = useState<Prefs>({ order: [], hidden: [] });
  const [loaded, setLoaded] = useState(false);

  // Odczyt dopiero po zamontowaniu: `localStorage` nie istnieje przy renderze na
  // serwerze, a czytanie go w inicjalizatorze stanu rozjeżdżałoby pierwszy render
  // klienta z tym, co przysłał serwer.
  useEffect(() => {
    setPrefs(read(storageKey) ?? { order: [], hidden: [] });
    setLoaded(true);
  }, [storageKey]);

  const save = useCallback(
    (next: Prefs) => {
      setPrefs(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Tryb prywatny albo pełny dysk — układ zadziała do przeładowania strony.
      }
    },
    [storageKey],
  );

  const ordered = useMemo(() => {
    const byKey = new Map(available.map((c) => [c.key, c]));
    const out: ColumnDef[] = [];
    // Najpierw zapisana kolejność, potem kolumny, których zapis nie znał — czyli
    // pola dodane w ustawieniach już po ostatniej zmianie układu. Dochodzą na
    // koniec zamiast znikać.
    for (const key of prefs.order) {
      const col = byKey.get(key);
      if (col) {
        out.push(col);
        byKey.delete(key);
      }
    }
    for (const col of available) if (byKey.has(col.key)) out.push(col);
    return out;
  }, [available, prefs.order]);

  const hidden = useMemo(() => {
    // Dopóki nic nie zapisano, „ukryte" wynika z listy domyślnej. Pole dodane
    // przez klinikę nie wskakuje samo do tabeli — pojawia się do wyboru.
    if (!loaded) return new Set<string>();
    if (prefs.order.length === 0 && prefs.hidden.length === 0) {
      return new Set(available.filter((c) => !defaults.includes(c.key)).map((c) => c.key));
    }
    return new Set(prefs.hidden);
  }, [loaded, prefs, available, defaults]);

  const visible = useMemo(() => ordered.filter((c) => !hidden.has(c.key)), [ordered, hidden]);

  const toggle = useCallback(
    (key: string) => {
      const next = new Set(hidden);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Ostatniej kolumny nie da się schować — pusta tabela wygląda jak awaria.
      if (next.size >= ordered.length) return;
      save({ order: ordered.map((c) => c.key), hidden: [...next] });
    },
    [hidden, ordered, save],
  );

  const move = useCallback(
    (key: string, direction: -1 | 1) => {
      const keys = ordered.map((c) => c.key);
      const from = keys.indexOf(key);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= keys.length) return;
      [keys[from], keys[to]] = [keys[to], keys[from]];
      save({ order: keys, hidden: [...hidden] });
    },
    [ordered, hidden, save],
  );

  const reset = useCallback(() => {
    setPrefs({ order: [], hidden: [] });
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // jak wyżej
    }
  }, [storageKey]);

  const changed = prefs.order.length > 0 || prefs.hidden.length > 0;

  return { visible, ordered, isVisible: (k) => !hidden.has(k), toggle, move, reset, changed };
}

/** Etykieta i kolory statusu — jedno źródło dla obu list. */
export const statusLabel: Record<ContactStatus, { label: string; cls: string }> = localized(() => ({
  active: { label: t("Aktywny"), cls: "bg-success/10 text-success border-success/20" },
  lead: { label: t("Lead"), cls: "bg-warning/15 text-warning-foreground border-warning/30" },
  patient: { label: t("Pacjent"), cls: "bg-primary-soft text-primary border-primary/20" },
  inactive: { label: t("Nieaktywny"), cls: "bg-muted text-muted-foreground border-border" },
}));

/** Po których kolumnach da się sortować — reszta nagłówków jest nieklikalna. */
export const COLUMN_SORT_KEY: Record<string, "name" | "contact" | "source" | "created" | "status"> =
  {
    name: "name",
    contact: "contact",
    email: "contact",
    phone: "contact",
    source: "source",
    createdAt: "created",
    status: "status",
  };

/**
 * Ile wierszy na stronę. 100 domyślnie — mieści się na ekranie po przewinięciu
 * i wystarcza do przejrzenia listy bez skakania po stronach. 10 000 jest
 * w wyborze na życzenie kliniki; to górna granica z rozsądku, nie zaproszenie.
 */
export const PAGE_SIZES = [10, 100, 1000, 10000];
