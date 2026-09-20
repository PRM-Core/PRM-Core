import { recordBooking } from "./visits.server";
import { logStep } from "../engine/log.server";
import { warsawWallClockToIso } from "./warsaw-time";
import { t as tr } from "@/lib/i18n";
import { activeBookingSystem } from "../booking-system/provider";

/**
 * Rozłożenie i zapis rezerwacji z systemu rezerwacji placówki albo z formularza na stronie.
 *
 * **Wydzielone z trasy webhooka**, bo tę samą treść trzeba
 * przetworzyć w dwóch momentach: gdy przychodzi na żywo i gdy przetwarzamy
 * zaległości odłożone na czas wstrzymania odbioru. Dwie kopie tego kodu
 * rozjechałyby się przy pierwszej zmianie mapowania pól — a rozjazd byłby
 * niewidoczny, bo obie ścieżki odpowiadałyby „ok".
 */

/**
 * Polskie znaki na łacińskie + małe litery — klucz porównania **nazw pól**.
 *
 * Ten sam fold, co w webhooku leadów i przy imporcie CSV. Bez niego „Tagi"
 * nie trafiało w `tags`, a wysyłka i tak kończyła się sukcesem — więc nadawca
 * nie miał jak zauważyć, że pole przepadło. Dokładnie to zdarzyło się
 * system rezerwacji wysyłał tagi, webhook odpowiadał „ok", a na karcie
 * pacjenta tagów nie było.
 */
export function foldKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => "acelnoszz"["ąćęłńóśźż".indexOf(ch)])
    .replace(/[\s_-]+/g, "");
}

/** Wartość spod dowolnego z aliasów, niezależnie od wielkości liter i ogonków. */
export function pick(data: Record<string, unknown>, ...aliases: string[]): unknown {
  const wanted = new Set(aliases.map(foldKey));
  for (const [key, value] of Object.entries(data)) {
    if (wanted.has(foldKey(key))) return value;
  }
  return undefined;
}

/**
 * Tagi z tablicy albo z tekstu rozdzielonego przecinkiem, średnikiem lub kreską.
 * Rejestracja przysyła raz jedno, raz drugie i oba są poprawne.
 */
export function tagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((t) => String(t).trim()).filter(Boolean))];
  }
  if (typeof value === "string" && value.trim()) {
    return [
      ...new Set(
        value
          .split(/[;,|]/)
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ];
  }
  return [];
}

export function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Accepts what a form realistically sends for a checkbox: true, "1", "on",
 * "tak", "yes". Anything else — including a missing field — is "no consent",
 * because an unticked box and an absent one mean the same thing.
 */
export function bool(value: unknown): boolean {
  if (value === true) return true;
  const v = text(value).toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "tak" || v === "yes";
}

/**
 * A deduplication key for a source that sends none.
 *
 * Built from the things that identify one appointment — who, when, for what —
 * so a retried delivery lands on the same key and is recognised as the same
 * booking rather than doubling the visit.
 */
export function syntheticBookingId(parts: (string | null)[]): string {
  const seed = parts
    .map((p) => (p ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join("|");
  if (!seed) return "";
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return `auto-${Math.abs(hash).toString(36)}`;
}

/**
 * `idx_osoby` / `idx_terminu` przychodzą raz jako liczba, raz jako tekst.
 *
 * Usuwanie znaków niebędących cyframi obsługuje postać `IDX-42017` i wartości
 * z odstępami. Ma to jednak pułapkę: zjada też **minus**, przez co `-5` stawało
 * się `5`. Dla identyfikatora, po którym wiążemy wizytę z pacjentem, znaczyłoby
 * to podpięcie jej pod inną osobę — cicho, bez śladu w logu. Dlatego wartość
 * zaczynająca się od minusa jest odrzucana, zanim cokolwiek usuniemy. Kreska
 * w środku (`IDX-42017`) jest separatorem i działa dalej.
 */
export function whole(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  if (raw.startsWith("-")) return null;
  const n = Number.parseInt(raw.replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function price(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  // "250,00 zł" and "250.00" both arrive from booking pages.
  const cleaned = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export interface BookingIntakeResult {
  ok: boolean;
  created?: boolean;
  contactId?: string;
  visitId?: string;
  duplicate?: boolean;
  error?: string;
  tagiPrzyjete?: number;
  powiazanieKartoteki?: string;
  /** Tryb próbny: co system zrozumiał z przysłanych pól. */
  tryb?: string;
  braki?: string[];
  zrozumiano?: Record<string, unknown>;
}

/** Czy treść prosi o tryb próbny (`"test": true`). */
export function isTestPayload(d: Record<string, unknown>): boolean {
  return bool(d.test ?? d.tryb_testowy);
}

/** Aliasy nazw pól, pod jakimi realnie przychodzi każda ze zgód. */
const ALIASY_ZGOD = {
  email: ["consentEmail", "consent_email", "zgoda_email", "zgodaEmail"],
  sms: ["consentSms", "consent_sms", "zgoda_sms", "zgodaSms"],
  profilowanie: [
    "consentProfiling",
    "consent_profiling",
    "zgoda_profilowanie",
    "zgodaProfilowanie",
  ],
  regulamin: ["zgodaRegulamin", "zgoda_regulamin", "regulamin", "akceptacjaRegulaminu"],
  marketing: ["zgodaMarketingowa", "zgoda_marketingowa", "marketingConsent", "zgodaMarketing"],
} as const;

export interface ZgodyRezerwacji {
  /** Czy rezerwacja pochodzi z systemu rezerwacji placówki, czy z formularza na stronie. */
  zSystemuRezerwacji: boolean;
  consentEmail: boolean;
  consentSms: boolean;
  consentProfiling: boolean;
  /** `undefined` = nie przysłano i nie ma podstaw do domniemania. */
  erejRegulamin: boolean | undefined;
  /** Marketing nigdy nie jest domniemywany — tylko to, co przyszło. */
  erejMarketing: boolean | undefined;
  /** Czy trzy zgody podstawowe wynikają z trybu rezerwacji, a nie z pól. */
  zgodyDomniemane: boolean;
}

/**
 * Reguły zgód dla rezerwacji — w jednym miejscu, bo to oświadczenia prawne
 * pacjenta i muszą dać się przeczytać bez przekopywania całego zapisu wizyty.
 *
 * **Trzy zasady, w tej kolejności:**
 *
 * 1. **Przysłana wartość zawsze wygrywa.** Także `false`. To, co pacjent
 *    faktycznie zaznaczył, jest ważniejsze od każdego domniemania.
 * 2. **Brak pola przy rezerwacji z systemu rezerwacji znaczy zgodę** na cztery
 *    obowiązkowe: e-mail, SMS, profilowanie i regulamin. Tam bez tego kompletu
 *    rezerwacja nie powstaje. Zapis dostaje
 *    własny opis źródła, żeby w kartotece dało się odróżnić „pacjent zaznaczył"
 *    od „wynika z trybu rezerwacji".
 * 3. **Marketing nie jest domniemywany nigdy.** Jest nieobowiązkowy, więc brak
 *    pola znaczy „nie pytaliśmy" — i taki zostaje, zamiast zamienić się
 *    w odmowę albo w zgodę, której nikt nie wyraził.
 *
 * Do 1.60.0 było inaczej i to jest naprawiany błąd: jedno pole
 * `zgoda_marketingowa` **włączało** e-mail, SMS i profilowanie naraz. Gdy
 * system rezerwacji zacznie wysyłać `zgoda_marketingowa: false` dla pacjenta, który
 * odmówił marketingu, tamta logika skasowałaby mu wszystkie trzy zgody
 * podstawowe — cicho, przy odpowiedzi `ok: true`.
 */
export function rozlozZgody(
  d: Record<string, unknown>,
  ids: { externalPatientId: number | null; systemVisitId: number | null },
  systemSource?: RegExp,
): ZgodyRezerwacji {
  // Rozpoznajemy po identyfikatorach, które wysyła wyłącznie system rezerwacji,
  // albo po źródle, którym ten system się przedstawia (`webhookSource`
  // dostawcy). Ten sam webhook obsługuje też formularz na stronie, gdzie żadnej
  // zgody obowiązkowej nie ma i domniemywać nie wolno.
  const zSystemuRezerwacji =
    ids.externalPatientId !== null ||
    ids.systemVisitId !== null ||
    (!!systemSource && systemSource.test(text(d.source ?? d.utm_source)));

  const przyslano = (aliasy: readonly string[]) => pick(d, ...aliasy) !== undefined;

  /**
   * Domniemanie działa tylko przy **pełnym milczeniu** o zgodach podstawowych.
   *
   * Rejestracja, która przysłała choć jedną z nich, zna te pola — jej milczenie
   * o pozostałych jest odpowiedzią „nie", a nie luką do wypełnienia. Uzupełnianie
   * jej wtedy dopisywałoby pacjentowi oświadczenia, których nie złożył.
   */
  const zgodyDomniemane =
    zSystemuRezerwacji &&
    !przyslano(ALIASY_ZGOD.email) &&
    !przyslano(ALIASY_ZGOD.sms) &&
    !przyslano(ALIASY_ZGOD.profilowanie);

  const podstawowa = (aliasy: readonly string[]): boolean => {
    const surowa = pick(d, ...aliasy);
    return surowa !== undefined ? bool(surowa) : zgodyDomniemane;
  };

  const surowyRegulamin = pick(d, ...ALIASY_ZGOD.regulamin);
  const surowyMarketing = pick(d, ...ALIASY_ZGOD.marketing);

  return {
    zSystemuRezerwacji,
    consentEmail: podstawowa(ALIASY_ZGOD.email),
    consentSms: podstawowa(ALIASY_ZGOD.sms),
    consentProfiling: podstawowa(ALIASY_ZGOD.profilowanie),
    // Regulamin liczony osobno: to odrębne oświadczenie, a nie jedna z trzech
    // zgód marketingowych. Brak pola przy rezerwacji w systemie rezerwacji znaczy
    // zgodę niezależnie od tego, co przyszło w tamtych trzech.
    erejRegulamin:
      surowyRegulamin !== undefined ? bool(surowyRegulamin) : zSystemuRezerwacji ? true : undefined,
    erejMarketing: surowyMarketing === undefined ? undefined : bool(surowyMarketing),
    zgodyDomniemane,
  };
}

/** Opis zgody dla trybu próbnego — mówi też, skąd wartość się wzięła. */
function opisZgody(wartosc: boolean, domniemana: boolean): string {
  if (!wartosc) return "brak zgody";
  return domniemana ? "udzielona (warunek rezerwacji w systemie rezerwacji)" : "udzielona";
}

export async function processBooking(d: Record<string, unknown>): Promise<BookingIntakeResult> {
  const firstName = text(d.firstName ?? d.first_name ?? d.imie);
  const lastName = text(d.lastName ?? d.last_name ?? d.nazwisko);
  const phone = text(d.phone ?? d.telefon);
  const email = text(d.email);
  const title = text(d.title ?? d.service ?? d.usluga);
  const doctor = text(d.doctor ?? d.lekarz);
  const specialization = text(d.specialization ?? d.specjalizacja);

  // Either a ready-made timestamp, or a date and a wall-clock time sent
  // separately — the registration system does the latter.
  const visitAt =
    text(d.visitAt ?? d.visit_at ?? d.termin) ||
    warsawWallClockToIso(
      text(d.data_wizyty ?? d.visitDate ?? d.visit_date),
      text(d.godzina_wizyty ?? d.visitTime ?? d.visit_time),
    );

  // `idx_osoby` — jedna liczba, która zdejmuje całe zgadywanie powiązania
  // (patrz BookingInput.externalPatientId). Przyjmujemy ją pod każdą nazwą,
  // jaką realnie wysyłają: część systemów mówi `idx_osoby`, ich API bywa
  // opisane jako `idOsoby`, a integratorzy piszą `patientId`.
  const externalPatientId = whole(d.idOsoby ?? d.idx_osoby ?? d.patientId ?? d.idPacjenta);
  const systemVisitId = whole(d.idTerminu ?? d.idx_terminu ?? d.visitId ?? d.idWizyty);
  const pesel = text(d.pesel ?? d.PESEL);
  const tags = tagList(pick(d, "tags", "tag", "tagi"));
  const status = text(pick(d, "status", "statuskontaktu"));

  const system = await activeBookingSystem();
  const zgody = rozlozZgody(d, { externalPatientId, systemVisitId }, system?.webhookSource);
  const { zSystemuRezerwacji, consentEmail, consentSms, consentProfiling } = zgody;
  const { erejRegulamin, erejMarketing, zgodyDomniemane } = zgody;

  // Klucz odróżniania powtórek. `idx_terminu` jest do tego stworzony —
  // jeden termin w systemie rezerwacji to jeden wpis u nas, także po ponowieniu
  // i po zmianie danych pacjenta.
  const wyliczony = syntheticBookingId([phone || email, visitAt, title]);
  const bookingId =
    text(d.bookingId ?? d.booking_id ?? d.id) ||
    (systemVisitId ? `${system?.id ?? "booking"}-${systemVisitId}` : "") ||
    wyliczony;
  // Klucz wyliczony sprawdzamy dodatkowo. Źródło, które dotąd nie wysyłało
  // identyfikatora, ma już wizyty zapisane pod nim — a od dnia, w którym
  // zacznie wysyłać `idx_terminu`, klucz się zmienia. Bez tego przełączenie
  // zdublowałoby każdą wizytę wysłaną ponownie.
  const altBookingId = bookingId === wyliczony ? undefined : wyliczony;

  /**
   * **Tryb próbny** — `"test": true` w treści.
   *
   * Sprawdza mapowanie pól i **niczego nie zapisuje**. Powstał po to, żeby
   * deweloperzy systemu rezerwacji mogli dopasować nazwy pól bez zaśmiecania
   * kartoteki placówki testowymi pacjentami, których potem ktoś musi
   * ręcznie kasować. Odpowiedź mówi wprost, co system zrozumiał.
   */
  if (bool(d.test ?? d.tryb_testowy)) {
    const braki: string[] = [];
    if (!email && !phone) braki.push("e-mail albo telefon");
    if (!title) braki.push(tr("nazwa usługi (title)"));
    if (!visitAt) braki.push(tr("termin wizyty (visitAt albo data + godzina)"));

    return {
      ok: braki.length === 0,
      tryb: tr("testowy — nic nie zapisano"),
      braki,
      zrozumiano: {
        pacjent: `${firstName} ${lastName}`.trim() || "(brak imienia i nazwiska)",
        email: email || "(brak)",
        telefon: phone || "(brak)",
        pesel: pesel ? "przekazany" : "(brak)",
        tagi: tags.length > 0 ? tags : "(brak)",
        zrodloRezerwacji: zSystemuRezerwacji
          ? (system?.name ?? "system rezerwacji")
          : "formularz na stronie",
        zgodaEmail: opisZgody(consentEmail, zgodyDomniemane),
        zgodaSms: opisZgody(consentSms, zgodyDomniemane),
        zgodaProfilowanie: opisZgody(consentProfiling, zgodyDomniemane),
        zgodaRegulamin:
          erejRegulamin === undefined
            ? tr("(nie przysłano — nie zapiszemy niczego)")
            : opisZgody(erejRegulamin, zgodyDomniemane),
        zgodaMarketingowa:
          erejMarketing === undefined
            ? tr("(nie przysłano — zapiszemy brak zgody, nie odmowę)")
            : erejMarketing
              ? "udzielona"
              : "odmowa",
        status: status || tr("(brak — kontakt dostanie „pacjent”)"),
        idOsoby: externalPatientId ?? tr("(brak — powiązanie będzie zgadywane z grafiku)"),
        idTerminu: systemVisitId ?? "(brak)",
        usluga: title || "(brak)",
        lekarz: doctor || "(brak)",
        specjalizacja: specialization || "(brak)",
        termin: visitAt || "(brak lub nieczytelny)",
        cena: price(d.price ?? d.cena) ?? "(brak)",
        kluczPowtorzen: bookingId,
      },
    };
  }

  const result = await recordBooking({
    firstName,
    lastName,
    email,
    phone,
    consentEmail,
    consentSms,
    consentProfiling,
    zgodyDomniemane,
    source: text(d.source ?? d.utm_source) || "Rejestracja online",
    medium: text(d.medium ?? d.utm_medium) || "rejestracja",
    campaign: text(d.campaign ?? d.utm_campaign),
    title,
    doctor,
    specialization,
    visitAt,
    price: price(d.price ?? d.cena),
    bookingId,
    altBookingId,
    externalPatientId,
    pesel,
    tags,
    status,
    erejRegulamin,
    erejMarketing,
  });

  if (!result.ok) {
    // The field NAMES that arrived are logged, never the values. A
    // rejected call is almost always a mapping mismatch, and the names
    // are exactly what is needed to fix it — while the values are patient
    // data that has no business sitting in a log.
    const receivedKeys = Object.keys(d).join(", ");
    await logStep({
      kind: "error",
      message: tr("Odrzucono rezerwację — {error} Otrzymane pola: {v1}.", {
        error: result.error,
        v1: receivedKeys || tr("(brak)"),
      }),
      detail: { source: "booking-webhook", receivedKeys },
    });
    return { ...result, error: result.error, receivedKeys } as BookingIntakeResult;
  }

  return {
    ...result,
    tagiPrzyjete: tags.length,
    powiazanieKartoteki: externalPatientId
      ? `ustawione (idx_osoby ${externalPatientId})`
      : tr("brak idOsoby — powiązanie będzie zgadywane z grafiku lekarza"),
  };
}
