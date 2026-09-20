import { warsawToday } from "./warsaw-time";
import { randomUUID } from "node:crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contacts, contactVisits } from "../db/schema";
import { ensureSeeded, announceNewContact } from "../contacts.server";
import { setConsents, setContactConsents } from "../consent/consent.server";
import { emitEvent } from "../engine/events.server";
import { normalisePolishPhone } from "../leads/hearing-test.server";
import { findMatchingContact } from "../contacts-match.server";
import { formatActivityDate, newestFirst } from "../activity-date";
import { intlLocale, t } from "@/lib/i18n";
import { bookingSystemName } from "../booking-system/provider";

/**
 * Visits booked online, reported by the clinic's own WordPress booking plugin
 * (`/api/webhooks/booking`).
 *
 * This is what finally gives the "Rejestracja wizyty" trigger an event source —
 * it was one of the last three triggers in the catalogue that could never fire.
 *
 * **What this source can and cannot know.** It sees bookings made on the
 * website. It does not see a visit booked by phone, moved at the desk or
 * cancelled the next morning, because none of those touch the website. A
 * reminder built on it must therefore be worded as a reminder, not as a
 * confirmation — only a connected booking system (see `lib/booking-system`)
 * closes that gap.
 */

export interface BookingInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Consent answers as the booking form collected them — not assumed. */
  consentEmail: boolean;
  consentSms: boolean;
  consentProfiling: boolean;
  source: string;
  medium: string;
  campaign: string;
  /** Full service name as the patient saw it. */
  title: string;
  doctor: string;
  /** Medical speciality — the stable label a segment can be built on. */
  specialization: string;
  /** ISO 8601 with an offset, e.g. 2026-08-20T10:30:00+02:00. */
  visitAt: string;
  /** Price as shown at booking, in PLN. */
  price: number | null;
  /** The booking system's own id — the deduplication key. */
  bookingId: string;
  /**
   * Zapasowy klucz powtórzeń — sprawdzany, gdy pod głównym nic nie ma.
   *
   * **Po co.** Źródło, które dotąd nie wysyłało własnego identyfikatora, miało
   * klucz liczony z samej rezerwacji (telefon + termin + usługa). Gdy zacznie
   * wysyłać `idx_terminu`, klucz się zmienia — i ta sama wizyta, wysłana
   * ponownie po przełączeniu, wyglądałaby na nową. Sprawdzenie obu kluczy
   * sprawia, że dzień przełączenia nie zostawia duplikatów w kartotece.
   */
  altBookingId?: string;
  /**
   * Identyfikator pacjenta z systemu rezerwacji (np. `idx_osoby`) — **jedyne pewne** powiązanie z kartoteką
   * placówki.
   *
   * Bez niego powiązanie zgaduje się z grafiku lekarza po „IMIĘ N" i przy
   * dwóch osobach o tym samym imieniu i inicjale u tego lekarza tego dnia jest
   * **pomijane** — kartoteka pacjenta zostaje wtedy bez historii, PESEL-u
   * i statusów wizyt. Jedna liczba w webhooku zdejmuje całe to zgadywanie.
   */
  externalPatientId?: number | null;
  /** PESEL, jeśli rejestracja go zbiera — inaczej uzupełni go synchronizacja. */
  pesel?: string;
  /**
   * Tagi z systemu rejestracji.
   *
   * **Dokładane, nigdy nie zastępujące.** Kontakt, który ma już „kardiologia"
   * z wcześniejszej wizyty, po rezerwacji u laryngologa ma mieć oba, a nie
   * ostatni. Tag opisuje historię pacjenta, a nie jego bieżącą wizytę.
   */
  tags?: string[];
  /**
   * Zgody z systemu rezerwacji — **treść, którą pacjent faktycznie zaakceptował**
   *. Zapisywane jako odpowiedzi na definicje `erej_regulamin`
   * i `erej_marketing`, osobno od trzech wbudowanych, które bramkują wysyłkę.
   *
   * Rozdział jest celowy: wbudowane odpowiadają na pytanie „czy wolno wysłać",
   * a te dwie na pytanie „pod czym się podpisał" — i tylko one są dowodem
   * w rozumieniu RODO.
   */
  erejRegulamin?: boolean;
  erejMarketing?: boolean;
  /**
   * Czy trzy zgody podstawowe wynikają z trybu rezerwacji, a nie z pól
   * zaznaczonych przez pacjenta. Zmienia wyłącznie opis źródła zapisany przy
   * zgodzie — rejestr zgód ma mówić prawdę o tym, skąd się wzięła.
   */
  zgodyDomniemane?: boolean;
  /**
   * Status z systemu rejestracji. **Ustawiany tylko wtedy, gdy kontakt nie ma
   * jeszcze żadnego** — nadpisanie cofnęłoby ręczną poprawkę recepcji
   * i zamieniło „Pacjent" z powrotem na „Lead" przy kolejnej rezerwacji.
   */
  status?: string;
}

export interface BookingResult {
  ok: boolean;
  created: boolean;
  contactId: string;
  visitId?: string;
  duplicate?: boolean;
  error?: string;
}

/** Money is stored in grosze so no float ever rounds a price on the way in. */
function toGrosze(price: number | null): number | null {
  if (price === null || !Number.isFinite(price)) return null;
  return Math.round(price * 100);
}

function formatPrice(grosze: number | null): string {
  if (grosze === null) return "";
  return t("{v0} zł", { v0: (grosze / 100).toFixed(2).replace(".", ",") });
}

/** Human-readable visit time for the timeline and the engine log. */
function formatVisitAt(ms: number | null): string {
  if (ms === null) return t("termin nieokreślony");
  return new Date(ms).toLocaleString(intlLocale(), {
    // Serwer chodzi w UTC, a termin ma się czytać tak, jak go pacjentowi
    // podano w rejestracji. Bez tej strefy wizyta o 9:30 pisze się 7:30.
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function recordBooking(input: BookingInput): Promise<BookingResult> {
  await ensureSeeded();
  const db = getDb();

  const email = input.email.trim().toLowerCase();
  const phone = normalisePolishPhone(input.phone);
  if (!email && !phone) {
    return {
      ok: false,
      created: false,
      contactId: "",
      error: t("Rezerwacja bez e-maila i bez telefonu — nie ma czym zidentyfikować pacjenta."),
    };
  }
  if (!input.title.trim()) {
    return {
      ok: false,
      created: false,
      contactId: "",
      error: t("Pole „title” (nazwa usługi) jest wymagane."),
    };
  }

  // A retried delivery must not book the same visit twice, nor re-announce it
  // to the engine — a second `visit.scheduled` would send a second reminder.
  const klucze = [input.bookingId, input.altBookingId].filter(
    (k): k is string => !!k && k.length > 0,
  );
  if (klucze.length > 0) {
    const seen = await db
      .select({ id: contactVisits.id, contactId: contactVisits.contactId })
      .from(contactVisits)
      .where(inArray(contactVisits.externalId, klucze))
      .get();
    if (seen) {
      return {
        ok: true,
        created: false,
        contactId: seen.contactId,
        visitId: seen.id,
        duplicate: true,
      };
    }
  }

  // The clinic's shared rule for "same patient" — see contacts-match.server.ts.
  const match = await findMatchingContact({
    firstName: input.firstName,
    lastName: input.lastName,
    email,
    phone,
  });
  const existing = match?.contact ?? null;

  const parsed = Date.parse(input.visitAt);
  const startsAt = Number.isNaN(parsed) ? null : parsed;
  const priceGrosze = toGrosze(input.price);

  let contactId: string;
  let created: boolean;

  if (existing) {
    contactId = existing.id;
    created = false;
    // Fill blanks only. Somebody booking a visit is not a reason to overwrite a
    // name the reception desk corrected by hand.
    const patch: Record<string, string> = {};
    if (!existing.firstName && input.firstName) patch.firstName = input.firstName.trim();
    if (!existing.lastName && input.lastName) patch.lastName = input.lastName.trim();
    if (!existing.email && email) patch.email = email;
    if (!existing.phone && phone) patch.phone = phone;
    if (!existing.pesel && input.pesel) patch.pesel = input.pesel.trim();
    if (!existing.status && input.status) patch.status = input.status;
    if (Object.keys(patch).length > 0) {
      await db.update(contacts).set(patch).where(eq(contacts.id, contactId));
    }
    // Tagi sumujemy — patrz BookingInput.tags. Bez `Set` powtórzona rezerwacja
    // dopisywałaby ten sam tag drugi raz.
    if (input.tags && input.tags.length > 0) {
      const razem = [...new Set([...(existing.tags ?? []), ...input.tags])];
      await db.update(contacts).set({ tags: razem }).where(eq(contacts.id, contactId));
    }

    // Powiązanie z systemem rezerwacji ustawiamy **tylko gdy go jeszcze nie ma**.
    // Nadpisanie istniejącego wpięłoby kartotekę innego pacjenta, a to gorsze
    // niż brak powiązania: pokazałoby cudzą historię leczenia.
    if (input.externalPatientId && !existing.externalPatientId) {
      await db
        .update(contacts)
        .set({ externalPatientId: input.externalPatientId })
        .where(eq(contacts.id, contactId));
    }
    // Consents come from the form's own checkboxes, so they are recorded
    // through the helper: it stamps the source, puts the change on the
    // timeline and emits the event an automation can react to.
    await setConsents({
      contactId,
      email: input.consentEmail,
      sms: input.consentSms,
      profiling: input.consentProfiling,
      source: input.zgodyDomniemane
        ? `${await bookingSystemName()} — warunek rezerwacji`
        : input.source || "rejestracja online",
      note: input.zgodyDomniemane
        ? t(
            "Rezerwacja w systemie rezerwacji placówki. Zgody wynikają z warunków rezerwacji — rejestracja nie przysłała pól ze zgodami.",
          )
        : t("Rezerwacja wizyty online."),
    });
  } else {
    contactId = `book-${Date.now()}`;
    created = true;
    await db.insert(contacts).values({
      id: contactId,
      prmId: `PRM-${String(90000 + Math.floor(Math.random() * 9999)).slice(-5)}`,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email,
      phone,
      pesel: input.pesel?.trim() ?? "",
      // Przyszło z systemu rezerwacji razem z rezerwacją — nie ma czego dopasowywać,
      // historia wizyt zaciągnie się przy najbliższej synchronizacji.
      externalPatientId: input.externalPatientId ?? null,
      segments: [],
      tags: input.tags ?? [],
      source: input.source || "Rejestracja online",
      medium: input.medium || "rejestracja",
      campaign: input.campaign,
      createdAt: warsawToday(),
      // Status przysłany przez rejestrację ma pierwszeństwo; bez niego zostaje
      // „pacjent" — ktoś, kto umówił wizytę, nie jest już leadem do kwalifikacji.
      status: input.status || "patient",
      // Taken from the form, never assumed — unlike the qualification test,
      // a booking form is not itself a marketing consent.
      consentEmail: input.consentEmail ? 1 : 0,
      consentSms: input.consentSms ? 1 : 0,
      consentProfiling: input.consentProfiling ? 1 : 0,
      consentSource: input.zgodyDomniemane
        ? `${await bookingSystemName()} — warunek rezerwacji`
        : input.source || "rejestracja online",
      consentUpdatedAt: Date.now(),
      customFields: {},
    });
  }

  const visitId = randomUUID();
  await db.insert(contactVisits).values({
    id: visitId,
    contactId,
    externalId: input.bookingId || null,
    title: input.title.trim(),
    doctor: input.doctor.trim(),
    specialization: input.specialization.trim(),
    startsAt,
    priceGrosze,
    source: input.source || "rejestracja-www",
    createdAt: Date.now(),
  });

  // Zgody z systemu rezerwacji zapisujemy **tylko wtedy, gdy przyszły** — brak pola
  // znaczy „rejestracja o to nie pytała", a nie „pacjent odmówił".
  const erejZgody: Record<string, boolean> = {};
  if (input.erejRegulamin !== undefined) erejZgody.erej_regulamin = input.erejRegulamin;
  if (input.erejMarketing !== undefined) erejZgody.erej_marketing = input.erejMarketing;
  if (Object.keys(erejZgody).length > 0) {
    await setContactConsents({
      contactId,
      values: erejZgody,
      source: input.zgodyDomniemane
        ? `${await bookingSystemName()} — warunek rezerwacji`
        : await bookingSystemName(),
    });
  }

  if (created) {
    await announceNewContact(contactId, {
      source: input.source || "Rejestracja online",
      medium: input.medium || "rejestracja",
      campaign: input.campaign,
    });
  }

  // The event the "Rejestracja wizyty" trigger listens for. Emitted after the
  // row is written, so an automation reacting to it can already read the visit.
  await emitEvent({
    type: "visit.scheduled",
    contactId,
    payload: {
      title: input.title.trim(),
      doctor: input.doctor.trim(),
      specialization: input.specialization.trim(),
      visitAt: startsAt === null ? "" : new Date(startsAt).toISOString(),
      price: priceGrosze === null ? "" : String(priceGrosze / 100),
      source: input.source || "rejestracja-www",
    },
  });

  return { ok: true, created, contactId, visitId };
}

export interface VisitActivityItem {
  id: string;
  type: "visit";
  title: string;
  description: string;
  /**
   * **Data zarejestrowania aktywności** — to, co widać u dołu wpisu na osi.
   * Termin konsultacji jest osobno, w opisie („Termin: …").
   */
  date: string;
  /**
   * **Termin konsultacji** — wyłącznie do porządkowania osi, nigdy do
   * wyświetlania. Rozdzielone od `date`, bo jedno pole nie może odpowiadać
   * jednocześnie na „kiedy to zapisano" i „kiedy to się dzieje".
   */
  sortDate: string;
}

/**
 * Visits for the contact card timeline. Sorted and formatted like every other
 * source there — the timeline compares these dates as **strings**, so the shape
 * has to match `formatActivityDate` exactly.
 */
export async function visitsForContact(contactId: string): Promise<VisitActivityItem[]> {
  const rows = await getDb()
    .select()
    .from(contactVisits)
    .where(eq(contactVisits.contactId, contactId))
    .orderBy(asc(contactVisits.startsAt));
  const systemName = await bookingSystemName();

  return rows
    .map((v) => {
      // **Trzy różne daty, których nie wolno ze sobą mieszać** (nie zmieniać):
      //
      //   1. `date`      → data **zarejestrowania aktywności** (`createdAt`),
      //                    pokazywana u dołu wpisu na osi.
      //   2. „Termin: …"  → **termin konsultacji** (`startsAt`), w opisie wpisu.
      //   3. `sortDate`  → **termin konsultacji**, wyłącznie do porządkowania.
      //
      // Wcześniej `date` robiło wszystko trzy naraz i dlatego ustawienie osi po
      // terminie po cichu podmieniło datę widoczną na karcie na termin wizyty.
      // Jedno pole nie może odpowiadać jednocześnie na „kiedy to zapisano"
      // i „kiedy to się dzieje".
      //
      // **Świadomy koszt sortowania po terminie**: nadchodzące wizyty stoją na
      // szczycie osi, ponad dzisiejszymi wysyłkami i wejściami na stronę. Dla
      // kartoteki pacjenta jest to czytelniejsze — „co go czeka" widać od razu —
      // ale oś przestaje być wyłącznie historią.
      //
      // Termin bywa pusty (wizyta bez ustalonej godziny), więc do sortowania
      // wchodzi wtedy data zapisu; wpis bez żadnej z nich nie miałby gdzie stanąć.
      const parts = [`Termin: ${formatVisitAt(v.startsAt)}`];
      if (v.specialization) parts.push(v.specialization);
      if (v.doctor) parts.push(v.doctor);
      if (v.priceGrosze !== null) parts.push(formatPrice(v.priceGrosze));
      // Dopisek dostaje **wizyta pochodząca z webhooka rezerwacji** — to on
      // przyjmuje rezerwacje, więc jego wpis oznacza „pacjent umówił się
      // przez system rezerwacji". Pozostałe usługi, znane wyłącznie z odpytania
      // API systemu, dopisku nie dostają: o nich wiemy tylko tyle, że istnieją
      // w systemie placówki, a nie **jak** zostały umówione (recepcja, telefon,
      // rezerwacja online).
      //
      // `source` = nazwa systemu ustawia **wyłącznie** importer
      // `lib/booking-system/visits-import.server.ts` — czyli wiersze pobrane z API. Każde inne
      // źródło pochodzi z webhooka. Po scaleniu ocalały wiersz jest tym
      // z webhooka i zachowuje swoje `source`, więc scalona konsultacja dopisek
      // ma, a jej bliźniak z API już nie istnieje. Stąd **jeden dopisek na
      // konsultację**.
      //
      // **`systemVisitId` celowo nie wchodzi do warunku.** Wizyta z webhooka bywa
      // jeszcze niepotwierdzona przez API (pacjent nie jest powiązany
      // z kartoteką albo synchronizacja jeszcze nie przeszła) — a i tak
      // przyszła z rezerwacji. Wymaganie potwierdzenia gubiło właśnie te
      // najświeższe rezerwacje.
      //
      // Liczone **przy odczycie**, nie zapisane w bazie: zmiana tej linijki
      // działa wstecz na wszystkie wizyty od razu, bez migracji i bez skryptu.
      if (v.source !== systemName) parts.push(`zarejestrowane ${systemName}`);
      return {
        id: `visit-${v.id}`,
        type: "visit" as const,
        title: v.title,
        description: parts.join(" · "),
        date: formatActivityDate(v.createdAt),
        sortDate: formatActivityDate(v.startsAt ?? v.createdAt),
      };
    })
    .sort(newestFirst);
}
