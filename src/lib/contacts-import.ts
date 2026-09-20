/**
 * Wspólne reguły czytania zgód z arkusza.
 *
 * Client-safe (zero `node:*`, zero bazy) — oba importy, w Kontaktach i
 * w Kontaktach telefonicznych, czytają dokładnie ten sam słownik. Dwie kopie
 * rozjechałyby się przy pierwszym nowym wariancie nagłówka, a wtedy ten sam
 * plik zaciągnąłby zgodę w jednym module i pominął w drugim.
 */

import type { ContactStatus } from "./contacts";
import { t as tr, localized } from "@/lib/i18n";

export type ConsentField = "consentEmail" | "consentSms" | "consentProfiling";

/**
 * Status pacjenta z arkusza.
 *
 * **Etykiety polskie są tu równoprawne z kluczami technicznymi**, bo człowiek
 * układający plik przepisuje to, co widzi na karcie kontaktu — a karta pokazuje
 * „Pacjent”, nie `patient`. Wcześniej „Pacjent” nie pasowało do niczego i cicho
 * lądowało jako `lead`, czyli import zmieniał ludziom status bez słowa.
 */
const STATUS_ALIASES: Record<string, ContactStatus> = {
  lead: "lead",
  patient: "patient",
  pacjent: "patient",
  active: "active",
  aktywny: "active",
  aktywna: "active",
  inactive: "inactive",
  nieaktywny: "inactive",
  nieaktywna: "inactive",
};

/** Wszystko, co wolno wpisać w kolumnę „Status" — do pokazania w UI. */
export const STATUS_ACCEPTED = ["Lead", "Pacjent", "Aktywny", "Nieaktywny"];

/**
 * Wszystko, co wolno wpisać w kolumnę „Status" — **razem ze statusami
 * placówki**.
 *
 * Sama stała powyżej opisywała tylko cztery wbudowane i to ona pojawiała się
 * w ostrzeżeniu. Efekt: człowiek, który dopiero co dodał status „Lekarz_Lead",
 * czytał, że dozwolone są wyłącznie cztery inne — czyli komunikat zaprzeczał
 * temu, co przed chwilą zrobił w Ustawieniach.
 */
export function statusesAccepted(known: { label: string }[] = []): string[] {
  const out = [...STATUS_ACCEPTED];
  for (const s of known) {
    if (!out.some((x) => x.toLowerCase() === s.label.toLowerCase())) out.push(s.label);
  }
  return out;
}

/**
 * `recognised: false` znaczy „coś tam było, ale tego nie rozumiemy" — i musi
 * być widoczne. Ciche podstawienie `lead` to dokładnie ten rodzaj cichej straty
 * danych, przez który ten import trzeba było naprawiać cztery razy.
 */
export function parseStatus(
  raw: string,
  /**
   * Statusy zdefiniowane przez placówkę (klucz + etykieta).
   *
   * **Bez nich import cofał każdą własną wartość do „Lead".** Od czasu, gdy
   * statusy są dowolne (`contact_statuses`), zamknięta lista w tym pliku
   * przestała opisywać rzeczywistość: plik ze statusem „Lekarz_Lead" wchodził
   * w całości jako leady, a ostrzeżenie mówiło, że wartość jest nierozpoznana —
   * mimo że w Ustawieniach taki status istniał.
   */
  known: { key: string; label: string }[] = [],
): { status: ContactStatus; recognised: boolean } {
  const value = raw.trim().toLowerCase();
  if (!value) return { status: "lead", recognised: true };

  const builtin = STATUS_ALIASES[value];
  if (builtin) return { status: builtin, recognised: true };

  // Klucz i etykieta są równoprawne — człowiek przepisuje to, co widzi na
  // karcie, a eksport zapisuje klucz.
  const folded = foldStatus(value);
  const match = known.find((s) => foldStatus(s.key) === folded || foldStatus(s.label) === folded);
  return match ? { status: match.key, recognised: true } : { status: "lead", recognised: false };
}

/** Porównanie statusów: bez wielkości liter, polskich znaków, spacji i podkreśleń. */
function foldStatus(value: string): string {
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
  return value
    .trim()
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => map[ch] ?? ch)
    .replace(/[\s_-]+/g, "");
}

/**
 * Nagłówki kolumn ze zgodami.
 *
 * Wariantów jest dużo celowo: plik przychodzi z rejestracji, z Excela albo
 * z innego systemu i nikt nie będzie go przepisywał pod nasz format. Nazwy
 * takie same jak etykiety w aplikacji („Zgoda — marketing e-mail") obok
 * technicznych („zgoda_sms"), bo obie wersje ludzie realnie wpisują.
 */
export const CONSENT_HEADERS: Record<string, ConsentField> = {
  // e-mail
  "zgoda marketing e-mail": "consentEmail",
  "zgoda marketing email": "consentEmail",
  "zgoda — marketing e-mail": "consentEmail",
  "marketing e-mail": "consentEmail",
  "marketing email": "consentEmail",
  "zgoda email": "consentEmail",
  "zgoda e-mail": "consentEmail",
  zgoda_email: "consentEmail",
  // SMS
  "zgoda marketing sms": "consentSms",
  "zgoda — marketing sms": "consentSms",
  "marketing sms": "consentSms",
  "zgoda sms": "consentSms",
  zgoda_sms: "consentSms",
  "zgoda marketingowa": "consentSms",
  // profilowanie
  "zgoda profilowanie": "consentProfiling",
  "zgoda — profilowanie": "consentProfiling",
  zgoda_profilowanie: "consentProfiling",
  profilowanie: "consentProfiling",
};

/** Nagłówki kolumny z podstawą zgody — ślad audytowy, nie ozdoba. */
export const CONSENT_SOURCE_HEADERS = [
  "zgoda zrodlo",
  "zgoda źródło",
  "zgoda_zrodlo",
  "zgoda_źródło",
  "podstawa zgody",
  "źródło zgody",
  "zrodlo zgody",
];

/**
 * Kolumny wbudowane szablonu importu, w kolejności czytania.
 *
 * Nagłówki są **dokładnie takie, jakich szuka importer** — nie ładniejsze.
 * Szablon, który podpowiada nazwę odrzucaną potem przez parser, jest gorszy niż
 * brak szablonu, bo wygląda na źródło prawdy.
 */
export const TEMPLATE_BUILTIN: { header: string; example: string; hint: string }[] = localized(
  () => [
    { header: "Imie", example: tr("Jan"), hint: tr("wymagane razem z nazwiskiem") },
    { header: "Nazwisko", example: tr("Testowy"), hint: tr("wymagane razem z imieniem") },
    {
      header: "Imie i nazwisko",
      example: "",
      hint: tr("zamiennik dwóch powyższych — ostatni wyraz to nazwisko"),
    },
    {
      header: "email",
      example: "jan.testowy@example.com",
      hint: tr("e-mail ALBO telefon musi być"),
    },
    { header: "Telefon", example: "600 000 000", hint: tr("kierunkowy dobierany przy imporcie") },
    { header: "PESEL", example: "", hint: tr("opcjonalny") },
    { header: "Status", example: tr("Pacjent"), hint: STATUS_ACCEPTED.join(" / ") },
    { header: "Segmenty", example: tr("VIP;Kardiologia"), hint: tr("wiele wartości po średniku") },
    { header: "Tagi", example: "newsletter;rds", hint: tr("wiele wartości po średniku") },
    { header: "Źródło pozyskania", example: tr("Google"), hint: "" },
    { header: "Medium pozyskania", example: "cpc", hint: "" },
    { header: "Kampania pozyskania", example: "kardio-q1-2026", hint: "" },
    { header: "zgoda_email", example: "tak", hint: tr("tak / nie") },
    { header: "zgoda_sms", example: "tak", hint: tr("tak / nie") },
    { header: "zgoda_profilowanie", example: "nie", hint: tr("tak / nie") },
    {
      header: "zgoda_zrodlo",
      example: tr("Zgoda papierowa 2026-03-14"),
      hint: tr("podstawa zgody — trafia na oś czasu pacjenta"),
    },
    { header: "Notatka", example: "", hint: tr("treść trafia do notatki pacjenta") },
    {
      header: "Notatka: Skad trafil",
      example: "",
      hint: tr("dowolna kolumna „Notatka: …” dopisuje linię do tej samej notatki"),
    },
  ],
);

/**
 * Nagłówki kolumny z imieniem i nazwiskiem **razem**.
 *
 * Bazy z rejestracji, z arkuszy recepcji i z większości systemów zewnętrznych
 * mają jedno pole „Pacjent" albo „Imię i nazwisko", a nie dwa. Dopóki importer
 * znał wyłącznie osobne kolumny, taki plik wchodził z pustym imieniem
 * i nazwiskiem — czyli z kontaktami, których nie da się nazwać ani dopasować
 * przy scalaniu duplikatów.
 */
export const FULL_NAME_HEADERS = [
  "imie i nazwisko",
  "imię i nazwisko",
  "imie nazwisko",
  "imię nazwisko",
  "nazwa",
  "pacjent",
  "full name",
  "fullname",
  "name",
];

/**
 * Tytuły i grzecznościowe zwroty spotykane przed nazwiskiem.
 *
 * Porównywane bez kropek, bez wielkości liter i bez polskich znaków, więc
 * „Dr", „dr.", „DR" i „lek. med." wpadają w te same wpisy. Lista jest krótka
 * celowo — każdy dopisany wpis to ryzyko, że komuś zniknie prawdziwe nazwisko.
 */
const NAME_TITLES = new Set([
  "dr",
  "hab",
  "prof",
  "doc",
  "docent",
  "lek",
  "med",
  "n",
  "mgr",
  "inz",
  "ks",
  "pan",
  "pani",
  // Samo „p" NIE jest tytułem, choć bywa skrótem od „pan". Inicjał drugiego
  // imienia jest częstszy i ważniejszy: przy „p" na liście „Jan P Kowalski"
  // wychodził jako „Jan Kowalski", czyli import kasował część nazwiska.
  "mr",
  "mrs",
  "ms",
]);

/** Do porównania z listą tytułów: bez kropek, małymi literami, bez ogonków. */
function foldTitle(token: string): string {
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
  return token
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/[ąćęłńóśźż]/g, (ch) => map[ch] ?? ch);
}

/**
 * Jeden wyraz nazwiska w formacie standardowym.
 *
 * **Wielkość liter poprawiana TYLKO wtedy, gdy wyraz jest w całości wielkimi
 * albo w całości małymi literami.** Wyraz zapisany mieszanie zostaje nietknięty,
 * bo to jedyny sygnał, że ktoś napisał go świadomie: „McDonald", „van Dijk"
 * czy „DiCaprio" po naszej „poprawce" wyszłyby gorzej niż weszły.
 *
 * Człony po myślniku i po apostrofie dostają wielką literę osobno —
 * „kowalska-nowak" to „Kowalska-Nowak", nie „Kowalska-nowak".
 */
function fixCase(word: string): string {
  const hasLower = /\p{Ll}/u.test(word);
  const hasUpper = /\p{Lu}/u.test(word);
  // „aLEKSANDRA", „wOJTKOWSKI", „zYTA" — caps lock puszczony o literę za późno.
  // Formalnie zapis mieszany, w rzeczywistości ewidentna pomyłka, więc jedyny
  // wyjątek od reguły „mieszane zostawiamy": pierwsza litera mała, cała reszta
  // wielka. Prawdziwe nazwiska tak nie wyglądają.
  const capsLockSlip = /^\p{Ll}\p{Lu}+$/u.test(word);
  if (hasLower && hasUpper && !capsLockSlip) return word;
  return word
    .toLowerCase()
    .replace(/(^|[-'’])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Imię i nazwisko sprowadzone do formatu standardowego.
 *
 * „JAN KOWALSKI", „jan kowalski" i „dr Jan Kowalski" dają to samo:
 * **„Jan Kowalski"**. Powód jest praktyczny — baza sklejana z kilku źródeł
 * ma wszystkie trzy warianty naraz, a wersalikami zapisane nazwisko wygląda
 * w mailu jak krzyk („Dzień dobry, ANNA").
 *
 * Sam tytuł bez nazwiska daje pusty wynik — wiersz zostanie wtedy odrzucony
 * albo trafi do podglądu jako niekompletny, zamiast założyć kartotekę pacjenta
 * o imieniu „Dr".
 */
export function normalizePersonName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter((t) => t !== "" && !NAME_TITLES.has(foldTitle(t)))
    .map(fixCase)
    .join(" ");
}

/**
 * Rozbicie „Anna Maria Kowalska-Nowak" na imię i nazwisko.
 *
 * **Ostatni wyraz jest nazwiskiem, reszta imieniem.** Reguła jest niedoskonała
 * przy nazwiskach dwuczłonowych pisanych ze spacją („Kowalska Nowak"), ale
 * każda inna jest gorsza: nazwiska dwuczłonowe zapisuje się w Polsce z myślnikiem,
 * a drugie imię jest częstsze niż nazwisko ze spacją. Ważniejsze, że reguła jest
 * **przewidywalna** — człowiek widzi wynik w podglądzie przed importem i może
 * poprawić plik, zanim cokolwiek wejdzie do bazy.
 */
export function splitFullName(raw: string): { firstName: string; lastName: string } {
  const parts = normalizePersonName(raw).split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/** Nagłówki kolumny, której zawartość idzie do notatki w całości. */
export const NOTE_HEADERS = ["notatka", "notatki", "uwagi", "note", "notes", "komentarz"];

/**
 * Przedrostek kolumny dopisywanej do notatki z etykietą.
 *
 * `Notatka: Preferowany lekarz` → w notatce linia „Preferowany lekarz: Kowalski".
 * Dzięki temu kilka luźnych rzeczy z arkusza — których nie warto robić polami
 * karty, bo dotyczą pojedynczych osób — ląduje w jednej czytelnej notatce
 * zamiast ginąć przy imporcie.
 */
export const NOTE_PREFIX = "notatka:";

/** Czy ten nagłówek ma trafić do notatki, i pod jaką etykietą. */
export function noteColumn(header: string): { label: string } | null {
  const h = header.trim().toLowerCase();
  if (NOTE_HEADERS.includes(h)) return { label: "" };
  if (h.startsWith(NOTE_PREFIX)) {
    const label = header.trim().slice(NOTE_PREFIX.length).trim();
    return { label: label || "" };
  }
  return null;
}

/**
 * Notatka złożona z kolumn arkusza.
 *
 * Kolumny bez etykiety idą w całości, kolumny z etykietą jako „Etykieta:
 * wartość", każda w osobnej linii. Puste komórki są pomijane — notatka
 * z samymi nagłówkami i niczym za nimi to śmieć w kartotece.
 */
export function buildNote(parts: { label: string; value: string }[]): string {
  return parts
    .filter((p) => p.value.trim() !== "")
    .map((p) => (p.label ? `${p.label}: ${p.value.trim()}` : p.value.trim()))
    .join("\n");
}

/** Jedna komórka CSV — cudzysłowy podwajane, przecinki i nowe linie w cudzysłowie. */
export function csvCell(value: string): string {
  return /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Szablon importu: kolumny wbudowane plus **wszystkie pola własne placówki**.
 *
 * Budowany z żywych definicji, nie z listy wpisanej w kod — pole dodane jutro
 * w Ustawieniach ma się pojawić w szablonie samo. Poprzedni szablon był
 * zaszytym stringiem bez zgód i bez pól własnych, więc uczył ludzi formatu,
 * którego import nie umiał wczytać w całości.
 */
export function buildImportTemplate(
  customFields: { label: string; type: string; options: string[] }[],
): string {
  const headers = [...TEMPLATE_BUILTIN.map((c) => c.header), ...customFields.map((f) => f.label)];
  const example = [
    ...TEMPLATE_BUILTIN.map((c) => c.example),
    ...customFields.map((f) => {
      if (f.type === "select") return f.options[0] ?? "";
      if (f.type === "number") return "42";
      if (f.type === "boolean") return "tak";
      if (f.type === "date") return "2026-01-31";
      return "";
    }),
  ];
  return [headers.map(csvCell).join(","), example.map(csvCell).join(",")].join("\n") + "\n";
}

/** „tak", „1", „x" — tak ludzie zaznaczają zgodę w arkuszu. Cokolwiek innego znaczy „nie". */
export function csvBool(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    v === "1" ||
    v === "tak" ||
    v === "yes" ||
    v === "true" ||
    v === "prawda" ||
    v === "x" ||
    v === "t"
  );
}
