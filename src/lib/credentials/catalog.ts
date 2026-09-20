import { t, localized, refreshLocalized } from "@/lib/i18n";
import { docplannerHost } from "../docplanner/config";

/**
 * Katalog danych dostępowych integracji — jedyne źródło prawdy o tym, co da się
 * ustawić w panelu Integracje → Klucze i dane dostępowe.
 *
 * **Plik czysty, bez kodu serwera** — importuje go też ekran. Nie ma tu żadnej
 * wartości, tylko opis pól.
 *
 * **Nazwa pola = nazwa zmiennej w `.env`.** Panel ma pierwszeństwo, a gdy w nim
 * nic nie wpisano, system czyta tę samą nazwę z `.env`. Dzięki temu instalacja
 * sprzed panelu działa bez zmian, a klucze przenosi się po jednym.
 *
 * **Czego tu celowo nie ma** (zostaje wyłącznie w `.env`): adres bazy i adres
 * publiczny (bez nich system nie wstanie), klucz główny `PRM_SECRETS_KEY` (nie
 * można trzymać klucza obok tego, co nim zamknięto), awaryjny wyłącznik 2FA
 * (musi działać, gdy nie da się zalogować do panelu) i zmienne `VITE_*`
 * (wkompilowywane przy budowaniu).
 */

const CORE_CREDENTIAL_NAMES = [
  "SENDGRID_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "META_APP_ID",
  "META_APP_SECRET",
  "META_VERIFY_TOKEN",
  "CANVA_CLIENT_ID",
  "CANVA_CLIENT_SECRET",
  "DOCPLANNER_DOMAIN",
  "DOCPLANNER_CLIENT_ID",
  "DOCPLANNER_CLIENT_SECRET",
  "PRM_MCP_TOKEN",
] as const;

/**
 * A credential name. The product's own names are listed above; a booking
 * system provider adds its own through `booking-system/providers/*.catalog.ts`
 * (see `EXTENSIONS` below), hence the open `string` side of the type.
 */
export type CredentialName = (typeof CORE_CREDENTIAL_NAMES)[number] | (string & {});

export function isCredentialName(value: string): value is CredentialName {
  return (CREDENTIAL_NAMES as readonly string[]).includes(value);
}

export interface CredentialField {
  name: CredentialName;
  label: string;
  /** Jedno zdanie: skąd wziąć wartość. */
  help: string;
  /**
   * `true` — wartość nigdy nie wraca do przeglądarki; panel pokazuje tylko
   * „ustawiony, kończy się na …abcd". `false` — identyfikator albo adres, który
   * trzeba umieć odczytać (np. żeby wkleić go po drugiej stronie), więc panel
   * pokazuje go w całości.
   */
  secret: boolean;
  /** `flag` — przełącznik zapisywany jako "1" / "0". */
  kind: "text" | "flag";
  placeholder?: string;
  /** `url` — sprawdzany jako adres http(s) przed zapisem. */
  format?: "url";
  /** Spacja na początku albo końcu jest częścią wartości (hasło), a nie pomyłką. */
  allowEdgeSpaces?: boolean;
}

export type IntegrationId =
  | "sendgrid"
  | "twilio"
  | "anthropic"
  | "openai"
  | "google"
  | "meta"
  | "canva"
  | "docplanner"
  | "mcp"
  // A booking system provider's own integration (see `EXTENSIONS`).
  | (string & {});

export interface IntegrationDef {
  id: IntegrationId;
  name: string;
  /** Do czego system tego używa — po ludzku. */
  purpose: string;
  fields: CredentialField[];
  /**
   * Czy jest „Sprawdź połączenie". Tylko tam, gdzie da się to zrobić
   * zapytaniem, które niczego nie wysyła i nie zmienia po drugiej stronie.
   */
  checkable: boolean;
  /** Gdy nie ma sprawdzenia — kiedy okaże się, że dane są dobre. */
  checkNote?: string;
  /** Pola, bez których integracja nie działa wcale. */
  required: CredentialName[];
  /** Można wygenerować wartość w panelu (token MCP). */
  generate?: CredentialName;
}

/**
 * Integrations contributed by booking system providers — files
 * `src/lib/booking-system/providers/*.catalog.ts` exporting `integration` (an
 * `IntegrationDef`, or a function returning one so its texts are translated
 * per request). Loaded by Vite at build time; outside Vite (unit tests) none.
 * An installation adds its provider there without editing this file.
 */
export type CatalogExtension = { integration: IntegrationDef | (() => IntegrationDef) };
const EXTENSIONS: CatalogExtension[] = (() => {
  try {
    // Rewritten by Vite at build time; absent at runtime outside Vite.
    return Object.values(
      import.meta.glob<CatalogExtension>("../booking-system/providers/*.catalog.ts", {
        eager: true,
      }),
    ).filter((m) => m && m.integration);
  } catch {
    return [];
  }
})();

export const CREDENTIAL_NAMES: [CredentialName, ...CredentialName[]] = [
  ...CORE_CREDENTIAL_NAMES,
  ...EXTENSIONS.flatMap((m) =>
    (typeof m.integration === "function" ? m.integration() : m.integration).fields.map(
      (f) => f.name,
    ),
  ),
];

const definitionOf = (m: CatalogExtension): IntegrationDef =>
  typeof m.integration === "function" ? m.integration() : m.integration;

/**
 * Register an integration from code — for providers not placed in
 * `booking-system/providers/` and for tests.
 */
export function registerCatalogExtension(extension: CatalogExtension): void {
  const def = definitionOf(extension);
  if (INTEGRATIONS.some((i) => i.id === def.id)) return;
  EXTENSIONS.push(extension);
  for (const f of def.fields) if (!CREDENTIAL_NAMES.includes(f.name)) CREDENTIAL_NAMES.push(f.name);
  refreshLocalized(INTEGRATIONS);
}

export const INTEGRATIONS: IntegrationDef[] = localized(() => [
  {
    id: "sendgrid",
    name: "SendGrid",
    purpose: t(
      "E-maile: kampanie, automatyzacje, Skrzynka, kody logowania i raport bezpieczeństwa.",
    ),
    fields: [
      {
        name: "SENDGRID_API_KEY",
        label: t("Klucz API"),
        help: t("SendGrid → Settings → API Keys. Wystarczy uprawnienie „Mail Send”."),
        secret: true,
        kind: "text",
        placeholder: t("SG.…"),
      },
    ],
    checkable: true,
    required: ["SENDGRID_API_KEY"],
  },
  {
    id: "twilio",
    name: "Twilio",
    purpose: t("SMS wychodzące i przychodzące oraz kody logowania SMS."),
    fields: [
      {
        name: "TWILIO_ACCOUNT_SID",
        label: t("Account SID"),
        help: t(
          "Twilio Console → Account Info. Zaczyna się od AC (nie od SK — to SID klucza API).",
        ),
        secret: false,
        kind: "text",
        placeholder: t("AC…"),
      },
      {
        name: "TWILIO_AUTH_TOKEN",
        label: t("Auth Token"),
        help: t(
          "Twilio Console → Account Info. Tym samym tokenem Twilio podpisuje SMS-y przychodzące.",
        ),
        secret: true,
        kind: "text",
      },
    ],
    checkable: true,
    required: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    purpose: t("PRM_Agent, Copilot i kroki AI — gdy w Ustawieniach → PRM_Agent wybrano Anthropic."),
    fields: [
      {
        name: "ANTHROPIC_API_KEY",
        label: t("Klucz API"),
        help: t("console.anthropic.com → API Keys."),
        secret: true,
        kind: "text",
        placeholder: "sk-ant-…",
      },
    ],
    checkable: true,
    required: ["ANTHROPIC_API_KEY"],
  },
  {
    id: "openai",
    name: "OpenAI",
    purpose: t("PRM_Agent, Copilot i kroki AI — gdy w Ustawieniach → PRM_Agent wybrano OpenAI."),
    fields: [
      {
        name: "OPENAI_API_KEY",
        label: t("Klucz API"),
        help: t("platform.openai.com → API keys."),
        secret: true,
        kind: "text",
        placeholder: "sk-…",
      },
    ],
    checkable: true,
    required: ["OPENAI_API_KEY"],
  },
  {
    id: "google",
    name: "Google Gemini",
    purpose: t("PRM_Agent, Copilot i kroki AI — gdy w Ustawieniach → PRM_Agent wybrano Google."),
    fields: [
      {
        name: "GOOGLE_API_KEY",
        label: t("Klucz API"),
        help: t("aistudio.google.com → Get API key."),
        secret: true,
        kind: "text",
      },
    ],
    checkable: true,
    required: ["GOOGLE_API_KEY"],
  },
  {
    id: "meta",
    name: "Meta Lead Ads",
    purpose: t("Leady z formularzy reklam na Facebooku i Instagramie."),
    fields: [
      {
        name: "META_APP_ID",
        label: t("Identyfikator aplikacji (App ID)"),
        help: t("developers.facebook.com → Twoja aplikacja → Ustawienia → Podstawowe."),
        secret: false,
        kind: "text",
      },
      {
        name: "META_APP_SECRET",
        label: t("Klucz tajny aplikacji (App Secret)"),
        help: t(
          "To samo miejsce. Służy też do sprawdzania podpisu leadów przysyłanych przez Metę.",
        ),
        secret: true,
        kind: "text",
      },
      {
        name: "META_VERIFY_TOKEN",
        label: t("Token weryfikacji webhooka"),
        help: t(
          "Dowolny ciąg, który wpisujesz tu i w ustawieniach webhooka aplikacji Meta — muszą być identyczne.",
        ),
        secret: false,
        kind: "text",
      },
    ],
    checkable: true,
    required: ["META_APP_ID", "META_APP_SECRET"],
  },
  {
    id: "canva",
    name: "Canva",
    purpose: t("Pobieranie projektów z Canvy do Studia."),
    fields: [
      {
        name: "CANVA_CLIENT_ID",
        label: t("Client ID"),
        help: t("canva.com/developers → Your integrations → Configuration."),
        secret: false,
        kind: "text",
      },
      {
        name: "CANVA_CLIENT_SECRET",
        label: t("Client secret"),
        help: t("To samo miejsce — „Generate secret”. Canva pokazuje go tylko raz."),
        secret: true,
        kind: "text",
      },
    ],
    checkable: true,
    required: ["CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET"],
  },
  {
    id: "docplanner",
    name: "Docplanner – Integration",
    purpose: t(
      "Integrations API serwisów Docplanner (ZnanyLekarz, Doctoralia): lekarze, terminy i rezerwacje z kalendarza placówki.",
    ),
    fields: [
      {
        name: "DOCPLANNER_DOMAIN",
        label: t("Serwis"),
        help: t(
          "Domena serwisu w kraju placówki, bez https:// — np. www.znanylekarz.pl albo www.doctoralia.es. Puste = www.znanylekarz.pl.",
        ),
        secret: false,
        kind: "text",
        placeholder: "www.znanylekarz.pl",
      },
      {
        name: "DOCPLANNER_CLIENT_ID",
        label: t("Client ID"),
        help: t("Wydaje Docplanner po przyjęciu do programu integracji (Integrations API)."),
        secret: false,
        kind: "text",
      },
      {
        name: "DOCPLANNER_CLIENT_SECRET",
        label: t("Client secret"),
        help: t("Przekazywany razem z Client ID. Wklej dokładnie tak, jak go otrzymałeś."),
        secret: true,
        kind: "text",
      },
    ],
    checkable: true,
    required: ["DOCPLANNER_CLIENT_ID", "DOCPLANNER_CLIENT_SECRET"],
  },
  {
    id: "mcp",
    name: "MCP (asystenci AI)",
    purpose: t(
      "Dostęp zewnętrznych asystentów AI do narzędzi systemu. Bez tokenu dostęp jest wyłączony.",
    ),
    fields: [
      {
        name: "PRM_MCP_TOKEN",
        label: t("Token dostępu"),
        help: t("Wygeneruj w panelu i wklej w konfiguracji klienta MCP. Pokazuje się tylko raz."),
        secret: true,
        kind: "text",
      },
    ],
    checkable: false,
    checkNote: t("Token sprawdza klient MCP przy pierwszym połączeniu."),
    required: ["PRM_MCP_TOKEN"],
    generate: "PRM_MCP_TOKEN",
  },
  ...EXTENSIONS.map(definitionOf),
]);

export function integrationOf(name: CredentialName): IntegrationDef {
  const found = INTEGRATIONS.find((i) => i.fields.some((f) => f.name === name));
  if (!found) throw new Error(t("Pole {name} nie należy do żadnej integracji.", { name: name }));
  return found;
}

export function fieldOf(name: CredentialName): CredentialField {
  return integrationOf(name).fields.find((f) => f.name === name)!;
}

/** Najdłuższa przyjmowana wartość — klucze API mają do ~200 znaków. */
export const MAX_CREDENTIAL_LENGTH = 2000;

/**
 * Sprawdzenie formatu przed zapisem. Łapie pomyłki, które inaczej wyszłyby
 * dopiero przy pierwszej wysyłce: wklejony SID klucza zamiast SID konta,
 * spacja z kopiowania, adres bez https.
 */
export function credentialProblem(name: CredentialName, value: string): string | null {
  const field = fieldOf(name);
  if (value.length > MAX_CREDENTIAL_LENGTH) return t("Wartość jest za długa.");
  if (field.kind === "flag") {
    return value === "1" || value === "0"
      ? null
      : t("Dozwolone wartości: włączone albo wyłączone.");
  }
  if (!value) return t("Wartość nie może być pusta — żeby usunąć, użyj „Usuń”.");
  if (/[\r\n\t]/.test(value)) return t("Wartość zawiera znak nowej linii albo tabulator.");
  // Hasło może zaczynać się albo kończyć spacją; klucz API i identyfikator — nie.
  if (!field.allowEdgeSpaces && value !== value.trim()) {
    return t("Na początku albo na końcu jest spacja — pewnie z kopiowania.");
  }
  if (field.format === "url") {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:")
        return t("Adres musi zaczynać się od https://.");
    } catch {
      return t("To nie jest poprawny adres.");
    }
  }
  switch (name) {
    case "TWILIO_ACCOUNT_SID":
      if (/^SK/i.test(value))
        return t("To SID klucza API (SK…). Potrzebny jest Account SID (AC…).");
      if (!/^AC[0-9a-f]{32}$/i.test(value))
        return t("Account SID to „AC” i 32 znaki szesnastkowe.");
      return null;
    case "SENDGRID_API_KEY":
      return value.startsWith("SG.") ? null : t("Klucz SendGrid zaczyna się od „SG.”.");
    case "ANTHROPIC_API_KEY":
      return value.startsWith("sk-ant-") ? null : t("Klucz Anthropic zaczyna się od „sk-ant-”.");
    case "DOCPLANNER_DOMAIN":
      return docplannerHost(value)
        ? null
        : t("Wpisz samą domenę serwisu, np. www.znanylekarz.pl — bez https:// i bez ścieżki.");
    case "META_APP_ID":
      return /^\d+$/.test(value) ? null : t("App ID składa się z samych cyfr.");
    case "PRM_MCP_TOKEN":
      return value.length >= 32
        ? null
        : t("Token musi mieć co najmniej 32 znaki — najlepiej wygeneruj go w panelu.");
    default:
      return null;
  }
}

/**
 * Co panel może pokazać o zapisanej wartości. Sekret: 4 ostatnie znaki, i to
 * tylko gdy wartość jest na tyle długa, że 4 znaki nic nie zdradzają. Pole
 * jawne: całość.
 */
export function credentialHint(name: CredentialName, value: string): string {
  const field = fieldOf(name);
  if (!field.secret) return value;
  return value.length >= 16 ? value.slice(-4) : "";
}

export type CredentialSource = "panel" | "env" | "none";

/** Stan jednego pola tak, jak widzi go panel — bez wartości sekretów. */
export interface CredentialStatus {
  name: CredentialName;
  source: CredentialSource;
  /** Patrz `credentialHint`. Dla wartości z `.env` też liczony. */
  hint: string;
  updatedAt: number | null;
  updatedBy: string;
  /**
   * Wpis w panelu istnieje, ale nie da się go odczytać — system używa wtedy
   * `.env` (albo niczego). `key-missing`: brak `PRM_SECRETS_KEY`;
   * `key-mismatch`: zapisano innym kluczem głównym; `corrupt`: uszkodzony wpis.
   */
  problem: "key-missing" | "key-mismatch" | "corrupt" | null;
}

export type IntegrationState = "ready" | "partial" | "missing" | "problem";

/** Podsumowanie integracji na belkę panelu. */
export function integrationState(
  def: IntegrationDef,
  statuses: CredentialStatus[],
): IntegrationState {
  const byName = new Map(statuses.map((s) => [s.name, s]));
  const fields = def.fields.map((f) => byName.get(f.name));
  if (fields.some((s) => s?.problem)) return "problem";
  const present = def.required.filter((n) => (byName.get(n)?.source ?? "none") !== "none").length;
  if (present === def.required.length) return "ready";
  return present === 0 ? "missing" : "partial";
}
