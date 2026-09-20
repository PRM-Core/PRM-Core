import { warsawToday } from "./visits/warsaw-time";
import {
  PanelTop,
  Heading,
  Type,
  ImageIcon,
  RectangleHorizontal,
  Minus,
  MoveVertical,
  Share2,
  PanelBottom,
  Wand2,
  Code2,
  FormInput,
  ListChecks,
  type LucideIcon,
  Paperclip,
  ClipboardList,
  Columns2,
} from "lucide-react";
import { t, localized } from "@/lib/i18n";

export type BlockType =
  | "header"
  | "heading"
  | "text"
  | "html"
  | "image"
  | "button"
  | "divider"
  | "spacer"
  | "social"
  | "footer"
  | "columns"
  | "attachments"
  | "plan"
  | "form"
  | "survey"
  | "personalization";

export interface ContentBlock {
  id: string;
  type: BlockType;
  data: Record<string, string>;
  /**
   * Bloki wewnątrz kolumn — **tylko dla typu `columns`**.
   *
   * Tablica tablic: jedna wewnętrzna na kolumnę. Zagnieżdżenie jest płytkie
   * z rozmysłem — kolumna w kolumnie w kolumnie to układ, którego nie da się
   * ani sensownie edytować, ani przewidywalnie wyrenderować w Outlooku.
   * Jeden poziom pokrywa wszystko, co robi się w mailingu: obraz obok tekstu,
   * trzy kafle usług, dwie kolumny z przyciskami.
   *
   * Trzymane obok `data`, a nie w nim, bo `data` to mapa napisów — trzymanie
   * tam JSON-a z blokami znaczyłoby parsowanie przy każdym renderze i utratę
   * typów.
   */
  columns?: ContentBlock[][];
}

export type BuilderKind = "newsletter" | "email" | "popup" | "sms";

/** Layout of an on-site popup. "modal" = centered overlay, "corner" = small desktop-only box in a bottom corner, "bar" = full-width strip pinned above the page. */
export type PopupFormat = "modal" | "corner" | "bar";
export type PopupCorner = "bottom-right" | "bottom-left";
/** Which viewports the popup may show on. "corner" ignores this and is always desktop-only. */
export type PopupDevices = "all" | "desktop" | "mobile";
/** Capping window: how often the impression counter resets. */
export type PopupCappingMode = "session" | "day";
/** "all" = every page carrying the tracking snippet; "match" = only URLs listed in urlRules. */
export type PopupUrlMode = "all" | "match";

export interface PopupConfig {
  format: PopupFormat;
  corner: PopupCorner;
  /** Max width in px for modal/corner; ignored for "bar" (always full width). Scales down responsively — see the tracker. */
  width: number;
  /** Height in px: fixed bar height for "bar"; for modal/corner 0 means "grow with content". */
  height: number;
  devices: PopupDevices;
  cappingMode: PopupCappingMode;
  /** Max impressions inside the capping window. */
  cappingLimit: number;
  urlMode: PopupUrlMode;
  /** Full URLs or paths, `*` allowed as a wildcard (e.g. "/blog/*"). Only consulted when urlMode === "match". */
  urlRules: string[];

  // ── wygląd ────────────────────────────────────────────────────────────────
  //
  // Tło i kolor tekstu siedzą w konfiguracji, a nie w treści pop-upu, bo są
  // **własnością okna**, nie akapitu: ta sama treść wstawiona w belkę i w okno
  // modalne ma inne tło, a przy zmianie formatu nikt nie chce poprawiać bloków.

  /** Tło pod tekstem — kolor CSS. Puste = białe, jak dotąd. */
  background: string;
  /**
   * Obraz tła (adres URL). Kładziony **pod** kolorem tła jako `background-image`,
   * więc kolor zostaje widoczny, dopóki obraz się nie wczyta — i jest tłem
   * zastępczym, gdy adres okaże się martwy.
   */
  backgroundImage: string;
  /** Kolor tekstu. Puste = nie nadpisujemy tego, co ustawiono w treści. */
  textColor: string;
  /**
   * Przyciemnienie strony za oknem modalnym. Puste = domyślne.
   * Dotyczy wyłącznie formatu „okno modalne" — belka i róg niczego nie zasłaniają.
   */
  overlay: string;

  // ── harmonogram ───────────────────────────────────────────────────────────
  //
  // Czas **lokalny placówki** w formacie `RRRR-MM-DDTGG:MM` — dokładnie to, co
  // oddaje `<input type="datetime-local">`. Świadomie bez strefy: kampania „od
  // poniedziałku 9:00" znaczy dziewiątą w Polsce, a nie UTC, i tak samo czyta to
  // osoba ustawiająca. Porównanie robi serwer, na zegarze warszawskim.

  /** Od kiedy pokazywać. Puste = od razu po opublikowaniu. */
  startsAt: string;
  /** Do kiedy pokazywać. Puste = bezterminowo. */
  endsAt: string;
}

export const DEFAULT_POPUP_CONFIG: PopupConfig = {
  format: "modal",
  corner: "bottom-right",
  width: 480,
  height: 0,
  devices: "all",
  cappingMode: "session",
  cappingLimit: 1,
  urlMode: "all",
  urlRules: [],
  background: "",
  backgroundImage: "",
  textColor: "",
  overlay: "",
  startsAt: "",
  endsAt: "",
};

export const POPUP_FORMAT_LABELS: Record<PopupFormat, { label: string; description: string }> =
  localized(() => ({
    modal: {
      label: t("Okno modalne"),
      description: t("Wyśrodkowane okno na przyciemnionym tle — desktop i mobile."),
    },
    corner: {
      label: t("Mały pop-up w rogu"),
      description: t(
        "Dyskretne okienko w dolnym rogu. Tylko desktop — na mobile się nie pokazuje.",
      ),
    },
    bar: {
      label: t("Belka nad stroną"),
      description: t("Pasek na całą szerokość, nad menu. Widoczny na desktopie i mobile."),
    },
  }));

export interface ContentItem {
  id: string;
  kind: BuilderKind;
  name: string;
  source: "blocks" | "zip" | "html";
  blocks: ContentBlock[];
  /** Plain-text SMS body — only used when kind === "sms" (SMS has no block canvas/HTML). */
  smsBody?: string;
  /** Raw HTML — for ZIP imports and for popups whose markup was pasted/coded elsewhere (source === "html"). */
  html?: string;
  fileNames?: string[];
  /** Display/targeting settings — only used when kind === "popup". */
  popupConfig?: PopupConfig;
  /** Pliki z biblioteki Media doklejane do wiadomości — tylko `kind === "email"`. */
  attachments?: string[];
  /** Nazwa nadawcy dla tej wiadomości. Pusto = domyślna z listy. */
  senderId?: string;
  /**
   * Ustawienia wyglądu wiadomości — zakładka „Style" w Studiu.
   *
   * **Realnie zmieniają wysyłany HTML**, a nie tylko podgląd: szerokość
   * i zaokrąglenie wchodzą do kontenera, kolory do `body` i karty, krój do
   * `font-family` z zamiennikiem systemowym. Trzymane na wiadomości, nie
   * globalnie, bo newsletter i mail transakcyjny wyglądają inaczej z założenia.
   */
  style?: Record<string, string>;
  updatedAt: string;
  status: "draft" | "ready";
}

let counter = 0;
export function blockId(prefix = "block"): string {
  counter += 1;
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface BlockPaletteEntry {
  type: BlockType;
  label: string;
  icon: LucideIcon;
}

// Includes "personalization" for backward compatibility with items saved
// before it was folded into the rich-text editor toolbar (see PERSONALIZATION_FIELDS
// below) — kept here only so paletteEntry() can still label legacy blocks.
const ALL_BLOCKS: BlockPaletteEntry[] = localized(() => [
  { type: "header", label: t("Nagłówek strony"), icon: PanelTop },
  { type: "heading", label: t("Tytuł"), icon: Heading },
  { type: "text", label: t("Tekst"), icon: Type },
  { type: "html", label: t("Blok HTML"), icon: Code2 },
  { type: "personalization", label: t("Personalizacja"), icon: Wand2 },
  { type: "image", label: t("Obraz"), icon: ImageIcon },
  { type: "button", label: t("Przycisk"), icon: RectangleHorizontal },
  { type: "form", label: t("Formularz"), icon: FormInput },
  { type: "survey", label: t("Ankieta"), icon: ListChecks },
  { type: "divider", label: t("Linia"), icon: Minus },
  { type: "spacer", label: t("Odstęp"), icon: MoveVertical },
  { type: "social", label: t("Social media"), icon: Share2 },
  { type: "footer", label: t("Stopka"), icon: PanelBottom },
  { type: "attachments", label: t("Załączniki"), icon: Paperclip },
  { type: "plan", label: t("Plan leczenia"), icon: ClipboardList },
  { type: "columns", label: t("Kolumny"), icon: Columns2 },
]);

export interface FormFieldDef {
  /** Must match the `name` attribute the collector expects — see FORM_ENDPOINT_PATH. */
  name: string;
  label: string;
  type: "text" | "email" | "tel";
  /** Contacts are keyed by e-mail, so that one field can't be switched off. */
  required?: boolean;
}

/** Fields a popup form can collect. The `name` values double as the public contract for hand-coded forms (see the form guide in the Pop-Up section). */
export const FORM_FIELDS: FormFieldDef[] = localized(() => [
  { name: "firstName", label: t("Imię"), type: "text" },
  { name: "lastName", label: t("Nazwisko"), type: "text" },
  { name: "email", label: t("E-mail"), type: "email", required: true },
  { name: "phone", label: t("Telefon"), type: "tel" },
]);

/** Where hand-coded forms post to (and what the tracker intercepts) — kept next to FORM_FIELDS so the docs and the renderer can't drift apart. */
export const FORM_ENDPOINT_PATH = "/api/forms/submit";
/** Marker attribute that makes the tracker script take over a form's submit. */
export const FORM_MARKER_ATTRIBUTE = "data-prm-form";

/** A field as configured on a form block: either one of FORM_FIELDS (maps to a contact column) or a custom one (lands in a note on the contact). */
export interface FormFieldSpec {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea";
  required: boolean;
  /** True for user-added fields — they have no column on `contacts`. */
  custom: boolean;
}

function specFromBuiltin(name: string): FormFieldSpec | null {
  const def = FORM_FIELDS.find((f) => f.name === name);
  if (!def) return null;
  return {
    name: def.name,
    label: def.label,
    type: def.type,
    required: !!def.required,
    custom: false,
  };
}

/**
 * Reads the field list off a form block. `data.fields` holds JSON since custom
 * fields were added; the old comma-separated list of built-in names is still
 * accepted so blocks saved before that keep working.
 */
export function parseFormFields(data: Record<string, string>): FormFieldSpec[] {
  const raw = (data.fields ?? "").trim();
  if (!raw) return [specFromBuiltin("email")!];

  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as FormFieldSpec[];
      const fields = parsed.filter((f) => f && f.name);
      // e-mail identifies the contact — it can never be dropped
      return fields.some((f) => f.name === "email")
        ? fields
        : [...fields, specFromBuiltin("email")!];
    } catch {
      /* malformed — fall through to the legacy path */
    }
  }

  const legacy = raw
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)
    .map(specFromBuiltin)
    .filter((f): f is FormFieldSpec => !!f);
  return legacy.some((f) => f.name === "email") ? legacy : [...legacy, specFromBuiltin("email")!];
}

export function serializeFormFields(fields: FormFieldSpec[]): string {
  return JSON.stringify(fields);
}

/** Turns a label into a payload key for a custom field (diacritics-free, snake-ish). */
export function customFieldName(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug ? `custom_${slug}` : `custom_${Date.now()}`;
}

export type SurveyQuestionType = "text" | "single" | "rating";

export interface SurveyQuestion {
  id: string;
  text: string;
  type: SurveyQuestionType;
  /** Choices for "single"; ignored for the other types. */
  options: string[];
  required: boolean;
}

export const SURVEY_QUESTION_LABELS: Record<SurveyQuestionType, string> = localized(() => ({
  text: t("Odpowiedź otwarta"),
  single: t("Jednokrotny wybór"),
  rating: "Ocena 1–5",
}));

/** Marker attribute the tracker looks for to take over a survey's submit. */
export const SURVEY_MARKER_ATTRIBUTE = "data-prm-survey";
export const SURVEY_ENDPOINT_PATH = "/api/surveys/submit";

export function parseSurveyQuestions(data: Record<string, string>): SurveyQuestion[] {
  const raw = (data.questions ?? "").trim();
  if (!raw.startsWith("[")) return [];
  try {
    return (JSON.parse(raw) as SurveyQuestion[]).filter((q) => q && q.id);
  } catch {
    return [];
  }
}

export function serializeSurveyQuestions(questions: SurveyQuestion[]): string {
  return JSON.stringify(questions);
}

export function makeSurveyQuestion(text = ""): SurveyQuestion {
  return { id: blockId("q"), text, type: "text", options: [], required: false };
}

/** Tags configured on a form/survey block — JSON array, with a single-string fallback for blocks saved before multi-tag support. */
export function parseBlockTags(data: Record<string, string>): string[] {
  const raw = (data.tags ?? data.tag ?? "").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      return (JSON.parse(raw) as string[]).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [raw];
}

// "personalization" isn't draggable as its own block anymore — it's now an
// inline merge-tag you insert from the rich-text toolbar in Tekst/Blok HTML
// (see RichTextEditor). Excluded here, still present in ALL_BLOCKS above so
// legacy saved blocks keep a label.
const DRAGGABLE_BLOCKS = localized(() => ALL_BLOCKS.filter((b) => b.type !== "personalization"));

export const BLOCK_PALETTES: Record<BuilderKind, BlockPaletteEntry[]> = {
  // "form"/"survey" are popup-only on purpose: mail clients strip/refuse to
  // submit forms, so offering one in an email/newsletter would just produce a
  // dead block.
  newsletter: DRAGGABLE_BLOCKS.filter((b) => b.type !== "form" && b.type !== "survey"),
  email: DRAGGABLE_BLOCKS.filter(
    (b) => b.type !== "social" && b.type !== "form" && b.type !== "survey",
  ),
  // Pop-up bez załączników: to okno na cudzej stronie, a nie wiadomość —
  // nie ma dokąd dołączyć pliku ani skąd go pobrać w kontekście wysyłki.
  // **Bez planu leczenia z tego samego powodu, tylko poważniejszego**: pop-up
  // wyświetla się na stronie, a plan leczenia to dane o zdrowiu konkretnej
  // osoby. Miejsce na nie jest w wiadomości do niej, nie w oknie na witrynie.
  popup: DRAGGABLE_BLOCKS.filter((b) =>
    ["heading", "text", "html", "image", "button", "form", "survey", "divider", "spacer"].includes(
      b.type,
    ),
  ),
  // SMS has no block canvas — it uses a plain-text editor instead (see SmsBodyEditor).
  sms: [],
};

export interface PersonalizationField {
  value: string;
  label: string;
  group: string;
  kind: "text" | "link";
}

/** Merge-tag fields available in the Personalization block — deliberately excludes PESEL/national-ID (sensitive health-adjacent data has no place in a marketing email). */
export const PERSONALIZATION_FIELDS: PersonalizationField[] = localized(() => [
  { value: "firstName", label: t("Imię"), group: "Dane kontaktu", kind: "text" },
  { value: "lastName", label: t("Nazwisko"), group: "Dane kontaktu", kind: "text" },
  { value: "fullName", label: t("Imię i nazwisko"), group: "Dane kontaktu", kind: "text" },
  { value: "email", label: t("Adres e-mail"), group: "Dane kontaktu", kind: "text" },
  { value: "phone", label: t("Telefon"), group: "Dane kontaktu", kind: "text" },
  { value: "prmId", label: t("Numer PRM ID"), group: "Dane kontaktu", kind: "text" },
  { value: "segments", label: t("Segmenty"), group: "Dane kontaktu", kind: "text" },
  { value: "tags", label: t("Tagi"), group: "Dane kontaktu", kind: "text" },
  { value: "visitDate", label: t("Data najbliższej wizyty"), group: "Wizyta", kind: "text" },
  { value: "visitTime", label: t("Godzina najbliższej wizyty"), group: "Wizyta", kind: "text" },
  { value: "visitSpecialization", label: t("Specjalizacja"), group: "Wizyta", kind: "text" },
  { value: "visitDoctor", label: t("Lekarz prowadzący"), group: "Wizyta", kind: "text" },
  { value: "clinicName", label: t("Nazwa placówki"), group: "Systemowe", kind: "text" },
  { value: "portalLink", label: t("Link do panelu pacjenta"), group: "Systemowe", kind: "link" },
  {
    value: "unsubscribeLink",
    label: t("Link wypisania z listy"),
    group: "Systemowe",
    kind: "link",
  },
]);

export function personalizationField(value: string): PersonalizationField | undefined {
  return PERSONALIZATION_FIELDS.find((f) => f.value === value);
}

/** Email-safe font stacks — shared between the rich-text toolbar and the simpler per-block typography pickers (heading/footer/button). */
/**
 * Czcionki dostępne w edytorze — **pliki leżą w instalacji** (`public/fonts/`),
 * nie w Google Fonts: ani przeglądarka personelu, ani skrzynka pacjenta nie
 * łączy się przez nie z Google.
 *
 * **Czego to NIE robi.** Outlook (wszystkie wersje na Windows) i Gmail —
 * i w przeglądarce, i w aplikacji — usuwają webfonty z wiadomości. Krój
 * wyświetli się w Apple Mail, w kliencie na iPhonie i w podglądzie tutaj;
 * u większości pacjentów zadziała **fallback**, czyli druga pozycja na liście.
 * Dlatego każda pozycja ma sensowny zamiennik systemowy, a nie samo
 * `sans-serif`: wiadomość ma wyglądać dobrze także wtedy, gdy webfont nie
 * dojedzie — a dojedzie rzadziej, niż się wydaje.
 *
 * **Dlaczego wybór, a nie cały katalog.** Poniżej jest to, co realnie bywa
 * używane w mailingu, z pełnym pokryciem polskich znaków (latin-ext). Nowa
 * rodzina = pliki w `public/fonts/studio/<rodzina>/` i wpis w
 * `public/fonts/studio.css`.
 */
export const STUDIO_FONTS: { family: string; fallback: string }[] = [
  { family: "Inter", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Roboto", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Open Sans", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Lato", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Montserrat", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Poppins", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Raleway", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Nunito", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Nunito Sans", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Work Sans", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Source Sans 3", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Rubik", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Karla", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Manrope", fallback: "Helvetica, Arial, sans-serif" },
  { family: "DM Sans", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Figtree", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Outfit", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Barlow", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Mulish", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Quicksand", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Oswald", fallback: "Impact, Haettenschweiler, sans-serif" },
  { family: "Bebas Neue", fallback: "Impact, Haettenschweiler, sans-serif" },
  { family: "Merriweather", fallback: "Georgia, 'Times New Roman', serif" },
  { family: "Playfair Display", fallback: "Georgia, 'Times New Roman', serif" },
  { family: "Lora", fallback: "Georgia, 'Times New Roman', serif" },
  { family: "PT Serif", fallback: "Georgia, 'Times New Roman', serif" },
  { family: "Source Serif 4", fallback: "Georgia, 'Times New Roman', serif" },
  { family: "Libre Baskerville", fallback: "Georgia, 'Times New Roman', serif" },
  { family: "Crimson Text", fallback: "Georgia, 'Times New Roman', serif" },
  { family: "EB Garamond", fallback: "Garamond, Georgia, serif" },
  { family: "Cormorant Garamond", fallback: "Garamond, Georgia, serif" },
  { family: "Bitter", fallback: "Georgia, 'Times New Roman', serif" },
  { family: "Cabin", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Josefin Sans", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Fira Sans", fallback: "Helvetica, Arial, sans-serif" },
  { family: "IBM Plex Sans", fallback: "Helvetica, Arial, sans-serif" },
  { family: "IBM Plex Serif", fallback: "Georgia, 'Times New Roman', serif" },
  { family: "Space Grotesk", fallback: "Helvetica, Arial, sans-serif" },
  { family: "Dancing Script", fallback: "'Brush Script MT', cursive" },
  { family: "Pacifico", fallback: "'Brush Script MT', cursive" },
  { family: "Caveat", fallback: "'Brush Script MT', cursive" },
  { family: "JetBrains Mono", fallback: "'Courier New', Courier, monospace" },
  { family: "Roboto Mono", fallback: "'Courier New', Courier, monospace" },
];

/** Wartość `font-family` dla rodziny z listy — zawsze z zamiennikiem systemowym. */
export function studioFontStack(family: string): string {
  const found = STUDIO_FONTS.find((f) => f.family === family);
  return `'${family}', ${found?.fallback ?? "Helvetica, Arial, sans-serif"}`;
}

/**
 * Adres arkusza z czcionkami Studia — jeden plik dla wszystkich rodzin.
 * Przeglądarka i klient pocztowy pobierają tylko te kroje, których treść
 * faktycznie używa (`@font-face` ładuje się leniwie), więc jeden arkusz nie
 * kosztuje transferu. Wagi 400 i 700, znaki `latin` i `latin-ext`.
 *
 * `base` pusty — ścieżka względna dla stron aplikacji; w wiadomości
 * `%%BASE_URL%%`, bo klient pocztowy nie zna domeny instalacji.
 */
export function studioFontsHref(families: string[], base = ""): string {
  const used = families.some((f) => STUDIO_FONTS.some((g) => g.family === f));
  return used ? `${base}/fonts/studio.css` : "";
}

/** Systemowe — te działają wszędzie, także w Outlooku. */
const SYSTEM_FONTS: { value: string; label: string }[] = localized(() => [
  { value: "inherit", label: t("Domyślna") },
  { value: "Arial, Helvetica, sans-serif", label: t("Arial") },
  { value: "Georgia, serif", label: t("Georgia") },
  { value: "'Times New Roman', Times, serif", label: t("Times New Roman") },
  { value: "Verdana, sans-serif", label: t("Verdana") },
  { value: "Tahoma, sans-serif", label: t("Tahoma") },
  { value: "'Courier New', Courier, monospace", label: t("Courier New") },
]);

export const FONT_FAMILIES: { value: string; label: string; google?: boolean }[] = localized(() => [
  ...SYSTEM_FONTS,
  ...STUDIO_FONTS.map((f) => ({
    value: studioFontStack(f.family),
    label: f.family,
    google: true,
  })),
]);

export const FONT_SIZES = ["12", "13", "14", "16", "18", "20", "24", "28", "32"];

const MERGE_TAG_CLASS = "pf-merge";
const MERGE_TAG_REGEX =
  /<span[^>]*class="pf-merge"[^>]*data-field="([a-zA-Z0-9]+)"[^>]*>[\s\S]*?<\/span>/g;

export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Wraps a legacy plain-text block value as safe HTML, for the one-time upgrade path when a pre-rich-text block (only `data.text`) is opened in the rich-text editor for the first time. */
export function legacyTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtmlText(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** The little pill chip inserted into rich-text HTML when a merge field is picked from the toolbar. */
export function mergeTagHtml(field: string): string {
  const label = personalizationField(field)?.label ?? field;
  return `<span class="${MERGE_TAG_CLASS}" contenteditable="false" data-field="${field}" style="display:inline-block;padding:1px 6px;border-radius:9999px;background:#eef2ff;color:#4f46e5;font-size:12px;border:1px dashed #c7d2fe;white-space:nowrap;">${escapeHtmlText(label)}</span>`;
}

/**
 * Stand-in for the real unsubscribe address, swapped for a per-send URL by
 * `injectTracking` at send time.
 *
 * It has to be a placeholder rather than a finished link because the address
 * carries the send token, and this module — shared with the browser — has no
 * business knowing tokens or the server's base URL.
 */
export const UNSUBSCRIBE_PLACEHOLDER = "%%PRM_UNSUBSCRIBE%%";

/**
 * Replaces merge-tag chips embedded in rich-text HTML with real values (for a
 * test send / personalized preview), or leaves them as editable chips
 * unchanged when no sample contact is given yet (still editing).
 */
export function resolveMergeTagsInHtml(html: string, sample?: PersonalizationSample): string {
  if (!sample) return html;
  return html.replace(MERGE_TAG_REGEX, (_match, field: string) => {
    const meta = personalizationField(field);
    const resolved = escapeHtmlText(resolvePersonalizationValue(field, sample) || "");
    if (meta?.kind === "link") {
      // The opt-out is the one link that must really work — a dead `href="#"`
      // in a marketing e-mail is not a formality, it is the thing regulators
      // check first. Other link fields stay inert until they have a target.
      const href = field === "unsubscribeLink" ? UNSUBSCRIBE_PLACEHOLDER : "#";
      return `<a href="${href}" style="color:#4f46e5;text-decoration:underline">${resolved}</a>`;
    }
    return resolved;
  });
}

const PLAIN_MERGE_TOKEN_REGEX = /\{\{([a-zA-Z0-9]+)\}\}/g;

/** Plain-text merge-tag token for SMS (no HTML there) — inserted into the textarea when a field is picked from the toolbar. */
export function mergeTagToken(field: string): string {
  return `{{${field}}}`;
}

/** Replaces `{{field}}` tokens in a plain-text SMS body with real values (for a test send), or leaves them unchanged when no sample contact is given yet (still editing). */
export function resolvePersonalizationInText(text: string, sample?: PersonalizationSample): string {
  if (!sample) return text;
  return text.replace(
    PLAIN_MERGE_TOKEN_REGEX,
    (_match, field: string) => resolvePersonalizationValue(field, sample) || "",
  );
}

/**
 * The contact data a merge field can be resolved against. The optional fields
 * are filled in when a real contact is behind the render (engine sends,
 * personalized popups); previews and test sends leave them out and fall back
 * to the sample values below.
 */
export interface PersonalizationSample {
  firstName: string;
  lastName?: string;
  email: string;
  phone?: string;
  prmId?: string;
  segments?: string[];
  tags?: string[];
}

const MOCK_VISIT = {
  date: "28.07.2026",
  time: "10:00",
  specialization: "Kardiologia",
  doctor: "dr Robert Nowak",
};
const CLINIC_NAME = "Klinika ABC";

/** Resolves a merge field to its display value for a preview/test-send using a sample contact + mocked visit data. */
export function resolvePersonalizationValue(
  fieldValue: string,
  sample: PersonalizationSample,
): string {
  const fullName = [sample.firstName, sample.lastName].filter(Boolean).join(" ");
  switch (fieldValue) {
    case "firstName":
      return sample.firstName || "Pacjencie";
    case "lastName":
      return sample.lastName || "";
    case "fullName":
      return fullName || sample.firstName || "Pacjencie";
    case "email":
      return sample.email;
    case "phone":
      return sample.phone ?? "+48 600 000 000";
    case "prmId":
      return sample.prmId ?? "PRM-00231";
    case "segments":
      return sample.segments ? sample.segments.join(", ") : "VIP, Kardiologia";
    case "tags":
      return sample.tags ? sample.tags.join(", ") : "newsletter, aktywny";
    case "visitDate":
      return MOCK_VISIT.date;
    case "visitTime":
      return MOCK_VISIT.time;
    case "visitSpecialization":
      return MOCK_VISIT.specialization;
    case "visitDoctor":
      return MOCK_VISIT.doctor;
    case "clinicName":
      return CLINIC_NAME;
    case "portalLink":
      return t("Przejdź do panelu pacjenta");
    case "unsubscribeLink":
      return t("Wypisz się z tej listy");
    default:
      return "";
  }
}

export function paletteEntry(type: BlockType): BlockPaletteEntry | undefined {
  return ALL_BLOCKS.find((b) => b.type === type);
}

export function defaultBlockData(type: BlockType): Record<string, string> {
  switch (type) {
    case "header":
      return { logoText: "PRM Core", tagline: t("Zdrowie w dobrych rękach"), logoImageUrl: "" };
    case "heading":
      return { text: t("Nagłówek sekcji"), align: "left", fontFamily: "", fontSize: "", color: "" };
    case "text":
      return { html: t("<p>Wpisz treść wiadomości…</p>"), align: "left" };
    case "html":
      return { html: t("<p>Wpisz własny kod HTML…</p>"), align: "left" };
    case "image":
      // `radius` i `href` puste = zachowanie sprzed ich dodania (promień 8 px,
      // brak odnośnika). Studio kreacji ustawia je świadomie przy kadrach.
      return { url: "", alt: "Obraz", radius: "", href: "", width: "" };
    case "button":
      return {
        label: t("Przejdź dalej"),
        url: "https://",
        align: "center",
        fontFamily: "",
        fontSize: "",
      };
    case "divider":
      return {};
    case "spacer":
      return { height: "24" };
    case "social":
      return { facebook: "", instagram: "", linkedin: "" };
    case "columns":
      return {
        /** „2" albo „3". Więcej niż trzy kolumny w mailu to nieczytelne paski. */
        count: "2",
        /** Proporcje szerokości, np. „1:1", „1:2". Muszą pasować do `count`. */
        ratio: "1:1",
        gap: "16",
      };
    case "attachments":
      return {
        // Identyfikatory plików z Media, po przecinku. Blok jest listą
        // odnośników do pobrania, a nie prawdziwym załącznikiem wiadomości —
        // patrz komentarz przy renderowaniu.
        fileIds: "",
        title: t("W załączniku"),
        align: "left",
        /**
         * `"attach"` (domyślnie) = prawdziwe załączniki wiadomości.
         * `"link"` = odnośniki do biblioteki Media, dla plików zbyt ciężkich,
         * żeby wysyłać je osobno do każdego odbiorcy.
         */
        mode: "attach",
      };
    case "plan":
      return {
        // Pusto = plan ostatnio przypisany temu pacjentowi (`%%PLAN%%`).
        // Nazwa = ten sam plan dla wszystkich (`%%PLAN:nazwa%%`).
        planName: "",
        title: t("Twój plan leczenia"),
        align: "left",
      };
    case "footer":
      return {
        text: t("© 2026 Klinika ABC. Wypisz się z newslettera."),
        align: "center",
        imageUrl: "",
        fontFamily: "",
        fontSize: "",
        color: "",
      };
    case "form":
      return {
        fields: "firstName,email",
        submitLabel: t("Zapisz się"),
        successMessage: t("Dziękujemy! Zapisaliśmy Twoje zgłoszenie."),
        consentText: t(
          "Wyrażam zgodę na kontakt w sprawie oferty i przetwarzanie moich danych osobowych.",
        ),
        tag: "popup-lead",
      };
    case "survey":
      return {
        questions: JSON.stringify([
          {
            id: blockId("q"),
            text: t("Jak oceniasz swoją ostatnią wizytę?"),
            type: "rating",
            options: [],
            required: true,
          },
          {
            id: blockId("q"),
            text: t("Co moglibyśmy poprawić?"),
            type: "text",
            options: [],
            required: false,
          },
        ]),
        askEmail: "1",
        submitLabel: t("Wyślij odpowiedzi"),
        successMessage: t("Dziękujemy za wypełnienie ankiety!"),
        tags: JSON.stringify(["ankieta"]),
      };
    case "personalization":
      return { field: "firstName", prefix: t("Cześć "), suffix: "!", fallback: "Pacjencie" };
    default:
      return {};
  }
}

export function makeBlock(type: BlockType, data?: Record<string, string>): ContentBlock {
  const block: ContentBlock = { id: blockId(type), type, data: data ?? defaultBlockData(type) };
  // Kolumny muszą powstać z pustymi przegrodami — inaczej pierwszy blok
  // upuszczony na płótno nie miałby dokąd wejść.
  if (type === "columns") {
    block.columns = Array.from({ length: Number(block.data.count) || 2 }, () => []);
  }
  return block;
}

/**
 * Szerokości kolumn w procentach.
 *
 * Proporcja podana jako „1:2" znaczy „druga dwa razy szersza". Wynik jest
 * zaokrąglany tak, żeby suma dała równo 100 — w tabeli HTML brakujący procent
 * potrafi przesunąć całą kolumnę do następnego wiersza w Outlooku.
 */
export function columnWidths(count: number, ratio: string): number[] {
  const parts = ratio
    .split(":")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  const weights = parts.length === count ? parts : Array.from({ length: count }, () => 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * 100);
  const rounded = raw.map((n) => Math.floor(n));
  // Resztę po zaokrągleniu dokładamy do pierwszej kolumny, żeby suma była 100.
  rounded[0] += 100 - rounded.reduce((a, b) => a + b, 0);
  return rounded;
}

/** Dozwolone proporcje dla danej liczby kolumn — do listy wyboru w panelu. */
export const COLUMN_RATIOS: Record<number, { value: string; label: string }[]> = localized(() => ({
  2: [
    { value: "1:1", label: t("Równe (50/50)") },
    { value: "1:2", label: t("Wąska + szeroka (33/67)") },
    { value: "2:1", label: t("Szeroka + wąska (67/33)") },
    { value: "1:3", label: t("Bardzo wąska + szeroka (25/75)") },
    { value: "3:1", label: t("Szeroka + bardzo wąska (75/25)") },
  ],
  3: [
    { value: "1:1:1", label: t("Równe (33/33/33)") },
    { value: "1:2:1", label: t("Środek szerszy (25/50/25)") },
    { value: "2:1:1", label: t("Pierwsza szersza (50/25/25)") },
  ],
}));

export function newDraftItem(
  kind: BuilderKind,
  name: string,
  blocks: ContentBlock[] = [],
): ContentItem {
  return {
    id: blockId("item"),
    kind,
    name,
    source: "blocks",
    blocks,
    ...(kind === "popup" ? { popupConfig: { ...DEFAULT_POPUP_CONFIG } } : {}),
    updatedAt: warsawToday(),
    status: "draft",
  };
}

/** Popup settings for an item, falling back to defaults — items created before popupConfig existed (or ZIP/HTML imports) have none. */
export function popupConfigOf(item: ContentItem): PopupConfig {
  return { ...DEFAULT_POPUP_CONFIG, ...(item.popupConfig ?? {}) };
}

export const KIND_LABELS: Record<
  BuilderKind,
  { title: string; singular: string; newLabel: string; description: string }
> = localized(() => ({
  newsletter: {
    title: t("Newslettery"),
    singular: t("newsletter"),
    newLabel: t("Nowy newsletter"),
    description: t("Twórz i zarządzaj newsletterami wysyłanymi do segmentów pacjentów."),
  },
  email: {
    title: t("Email"),
    singular: t("wiadomość e-mail"),
    newLabel: t("Nowa wiadomość e-mail"),
    description: t(
      "Twórz wiadomości e-mail — jak w kliencie pocztowym, z własnym nagłówkiem i stopką.",
    ),
  },
  popup: {
    title: t("Pop-Up"),
    singular: t("pop-up"),
    newLabel: t("Nowy pop-up"),
    description: t(
      "Twórz okna pop-up wyświetlane na stronie www (np. zapis do newslettera, rabat powitalny).",
    ),
  },
  sms: {
    title: "SMS",
    singular: t("szablon SMS"),
    newLabel: t("Nowy szablon SMS"),
    description: t("Twórz szablony SMS-ów używane później w Automatyzacji."),
  },
}));

/**
 * Konfiguracja pop-upu uzupełniona o pola, których mógł nie znać zapis
 * sprzed ich dodania.
 *
 * Wiersze w `popup_settings` trzymają konfigurację jako JSON, więc pop-up
 * opublikowany starszą wersją nie ma kluczy `background`, `startsAt` i reszty.
 * Odczyt bez uzupełnienia dawałby `undefined` w miejscach, gdzie kod spodziewa
 * się napisu — a to jest ten rodzaj usterki, który wychodzi dopiero na cudzej
 * stronie.
 */
export function normalizePopupConfig(config: Partial<PopupConfig> | null | undefined): PopupConfig {
  return { ...DEFAULT_POPUP_CONFIG, ...(config ?? {}) };
}

/**
 * Czy pop-up mieści się dziś w swoim oknie czasowym.
 *
 * Puste krańce znaczą „bez ograniczenia", więc pop-up bez harmonogramu jest
 * aktywny zawsze — tak działał, zanim harmonogram istniał.
 *
 * **Rozstrzyga zegar serwera, nie przeglądarki.** Gdyby o tym decydował
 * tracker, wystarczyłoby przestawić zegar na własnym komputerze, żeby zobaczyć
 * kampanię przed startem — a przy promocjach z datą to jest różnica między
 * ofertą a pomyłką. Serwer po prostu nie wysyła pop-upu poza jego oknem.
 */
export function popupWithinSchedule(
  config: Pick<PopupConfig, "startsAt" | "endsAt">,
  nowMs: number,
  toIso: (date: string, time: string) => string,
): boolean {
  const bound = (value: string): number | null => {
    const [date, time] = value.trim().split("T");
    if (!date) return null;
    const iso = toIso(date, time ?? "00:00");
    if (!iso) return null;
    const ms = new Date(iso).getTime();
    return Number.isNaN(ms) ? null : ms;
  };
  const from = bound(config.startsAt);
  const to = bound(config.endsAt);
  if (from !== null && nowMs < from) return false;
  // Koniec **włącznie z minutą** — „do 20:00" znaczy, że o 20:00 jeszcze widać,
  // a nie że zniknął o 19:59. Ludzie czytają to jako domknięty przedział.
  if (to !== null && nowMs > to + 59_999) return false;
  return true;
}
