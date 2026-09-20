import { desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contactVisits, contacts, doctors } from "../db/schema";
import { activeBookingSystem } from "./provider";
import { ensureDoctorsSeeded } from "./doctors.server";
import { logStep } from "../engine/log.server";
import { t } from "@/lib/i18n";

/**
 * Znalezienie identyfikatora pacjenta w systemie rezerwacji dla kontaktów,
 * które mają wizytę, a nie mają jeszcze powiązania.
 *
 * **Celowane, nie przemiatające.** Wizyta niesie lekarza i datę, więc
 * rezerwacje tego lekarza z tego dnia zawierają tego pacjenta — wystarczy jedno
 * zapytanie na **parę (lekarz, dzień)**, a nie na kontakt. Przy pacjentach
 * umówionych tego samego dnia do tego samego lekarza jedno zapytanie
 * rozwiązuje kilkunastu naraz.
 *
 * **Kogo dotyczy**: wyłącznie kontakty, które mają wiersz w `contact_visits`.
 * Zaimportowani i leady są poza — nie mają wizyty, więc system rezerwacji i tak
 * by ich nie znał.
 *
 * **Dopasowanie po imieniu i inicjale nazwiska**, bo tyle daje część systemów
 * (np. „ANNA K"). Gdy w tym samym dniu u tego samego lekarza pasuje **więcej
 * niż jeden** pacjent, powiązanie jest **pomijane** — przypisanie cudzej
 * kartoteki jest gorsze niż jej brak, a takich przypadków jest garść i można je
 * domknąć ręcznie.
 */

const foldPl = (s: string) =>
  s
    .trim()
    .toUpperCase()
    .replace(/[ĄĆĘŁŃÓŚŹŻ]/g, (ch) => "ACELNOSZZ"["ĄĆĘŁŃÓŚŹŻ".indexOf(ch)]);

/**
 * Klucz porównania: **imię w całości plus inicjał nazwiska**, wersalikami,
 * bez polskich znaków („ANNA K"). Gdy system podaje pełne nazwisko, bierzemy
 * z niego pierwszą literę — klucz wychodzi ten sam po obu stronach.
 */
function nameKey(lastName: string, firstName: string): string {
  const fn = foldPl(firstName);
  const li = foldPl(lastName.replace(/^(lek\.|dr|prof\.|mgr)\s*/gi, "")).slice(0, 1);
  return fn ? `${fn} ${li}`.trim() : "";
}

export interface LinkResult {
  /** Kontaktów z wizytą, bez powiązania — czyli ile było do zrobienia. */
  candidates: number;
  /** Ile zapytań poszło do systemu rezerwacji (par lekarz+dzień). */
  queries: number;
  linked: number;
  /** Pominięte, bo w tym dniu u tego lekarza pasowała więcej niż jedna osoba. */
  ambiguous: number;
  /** Pominięte, bo w rezerwacjach nikogo takiego nie było. */
  notFound: number;
  /**
   * Pominięte, bo **lekarza z wizyty nie ma w naszej tabeli lekarzy** — a bez
   * jego identyfikatora nie ma czego zapytać o rezerwacje.
   *
   * Liczone osobno, bo wcześniej taki kontakt wypadał **przed** policzeniem go
   * jako kandydata: dziennik pokazywał „kandydatów 0", a pacjent stał bez
   * historii i bez powodu widocznego z zewnątrz.
   */
  noDoctor: number;
  failed: number;
  /**
   * Czy przebieg **przerwano po osiągnięciu limitu**, zostawiając resztę
   * kandydatów nietkniętych. Bez tego `candidates` i suma przetworzonych nie
   * dawały się porównać, a różnica wyglądała jak zgubione kontakty.
   */
  stoppedAtLimit: boolean;
}

export async function linkPatients(limit = 500): Promise<LinkResult> {
  const out: LinkResult = {
    candidates: 0,
    queries: 0,
    linked: 0,
    ambiguous: 0,
    notFound: 0,
    noDoctor: 0,
    failed: 0,
    stoppedAtLimit: false,
  };
  const system = await activeBookingSystem();
  if (!system) return out;
  await ensureDoctorsSeeded();
  const db = getDb();

  // Kontakty z wizytą i bez powiązania, wraz z lekarzem i dniem tej wizyty.
  const rows = await db
    .select({
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      doctor: contactVisits.doctor,
      startsAt: contactVisits.startsAt,
    })
    .from(contacts)
    .innerJoin(contactVisits, eq(contactVisits.contactId, contacts.id))
    .where(isNull(contacts.externalPatientId))
    /**
     * **Najnowsi najpierw.** Bez porządku SQLite oddawał przy `limit` wciąż ten
     * sam początek tabeli, więc pacjent zarejestrowany dziś nie wchodził do okna
     * nigdy. Kontakty, których nie udało się powiązać dawno temu, schodzą na
     * koniec kolejki — najczęściej nie mają odpowiednika w systemie, a świeża
     * rejestracja ma go na pewno i jest pilna.
     */
    .orderBy(desc(contacts.createdAt))
    .limit(limit * 4);

  const docRows = await db.select().from(doctors);
  const docByName = new Map(
    docRows.map((d) => [foldPl(d.name.replace(/^(lek\.|dr|prof\.|mgr)\s*/i, "")), d.systemId]),
  );

  /** Grupowanie po (lekarz, dzień) — to ono zamienia tysiące zapytań w setki. */
  const groups = new Map<string, { doctorId: number; day: string; people: typeof rows }>();
  /** Nazwiska lekarzy, których nie umiemy dopasować — do dziennika, nie do zgadywania. */
  const unknownDoctors = new Set<string>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.contactId)) continue;
    if (!r.startsAt) continue;
    const bare = foldPl(r.doctor.replace(/^(lek\.|dr|prof\.|mgr)\s*/i, ""));
    let doctorId: number | undefined;
    for (const [name, id] of docByName) {
      if (name.includes(bare) || bare.includes(name)) {
        doctorId = id;
        break;
      }
    }
    if (!doctorId) {
      out.noDoctor++;
      unknownDoctors.add(r.doctor || "(wizyta bez lekarza)");
      continue;
    }
    const day = new Date(r.startsAt).toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
    const key = `${doctorId}|${day}`;
    seen.add(r.contactId);
    out.candidates++;
    const g = groups.get(key) ?? { doctorId, day, people: [] as typeof rows };
    g.people.push(r);
    groups.set(key, g);
  }

  for (const g of groups.values()) {
    let bookings;
    try {
      bookings = await system.doctorDayBookings(g.doctorId, g.day);
      out.queries++;
    } catch {
      out.failed += g.people.length;
      continue;
    }

    // Mapa „IMIĘ N" → zbiór identyfikatorów pacjentów z tego dnia.
    const byName = new Map<string, Set<number>>();
    for (const b of bookings) {
      if (!b.patientId) continue;
      const key = nameKey(b.lastName, b.firstName);
      if (!key) continue;
      const set = byName.get(key) ?? new Set<number>();
      set.add(b.patientId);
      byName.set(key, set);
    }

    for (const p of g.people) {
      const hit = byName.get(nameKey(p.lastName, p.firstName));
      if (!hit || hit.size === 0) {
        out.notFound++;
        continue;
      }
      if (hit.size > 1) {
        // Dwie osoby o tym samym imieniu i inicjale u tego lekarza tego dnia —
        // przypisanie na chybił trafił wpiąłby cudzą kartotekę.
        out.ambiguous++;
        continue;
      }
      await db
        .update(contacts)
        .set({ externalPatientId: [...hit][0] })
        .where(eq(contacts.id, p.contactId));
      out.linked++;
      if (out.linked >= limit) {
        out.stoppedAtLimit = true;
        return out;
      }
    }
  }

  // Nazwiska, których nie dało się dopasować, trafiają do dziennika. Bez tego
  // „pacjent bez historii" nie ma żadnego widocznego powodu, a powód jest
  // prozaiczny: lekarz z rezerwacji nie istnieje w naszej tabeli albo nazywa się
  // tam inaczej.
  if (unknownDoctors.size > 0) {
    await logStep({
      kind: "error",
      message:
        t("Powiązywanie pominęło {noDoctor} kontaktów — nie rozpoznano lekarza: ", {
          noDoctor: out.noDoctor,
        }) +
        `${[...unknownDoctors].slice(0, 8).join("; ")}. ` +
        t(
          "Sprawdź listę lekarzy (Lekarze) — bez ich identyfikatora nie ma czego zapytać o grafik.",
        ),
      detail: { source: "booking-link", lekarze: [...unknownDoctors].slice(0, 20).join("; ") },
    });
  }

  return out;
}

/** Ile kontaktów z wizytą czeka jeszcze na powiązanie — do pokazania przed uruchomieniem. */
export async function countUnlinkedWithVisits(): Promise<number> {
  const row = await getDb()
    .select({ n: sql<number>`count(distinct ${contacts.id})` })
    .from(contacts)
    .innerJoin(contactVisits, eq(contactVisits.contactId, contacts.id))
    .where(isNull(contacts.externalPatientId))
    .get();
  return row?.n ?? 0;
}
