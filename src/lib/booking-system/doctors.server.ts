import { warsawToday } from "../visits/warsaw-time";
import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contactVisits, doctors, type DoctorRow } from "../db/schema";
import { loadDoctorSeed } from "./doctors-seed.server";
import { activeBookingSystem } from "./provider";

/**
 * Moduł Lekarze / Specjaliści.
 *
 * Lista jest **własną tabelą**, a nie odpytywaniem systemu rezerwacji przy
 * każdym wejściu: placówka ma ją móc edytować (nazwy, ukrywanie
 * nieprzyjmujących), a nie każdy system ma listę pracowników — pierwszy stan
 * daje arkusz z identyfikatorami lekarzy. Zasiew leniwy, wzorem lejków
 * i kontaktów.
 */

export async function ensureDoctorsSeeded(): Promise<void> {
  const db = getDb();
  const existing = await db
    .select({ n: sql<number>`count(*)` })
    .from(doctors)
    .get();
  if ((existing?.n ?? 0) > 0) return;
  const now = Date.now();
  for (const d of loadDoctorSeed()) {
    await db.insert(doctors).values({
      id: randomUUID(),
      systemId: d.systemId,
      name: d.name,
      specialization: d.specialization,
      specKey: d.specKey,
      services: d.services,
      bookingUrl: d.bookingUrl,
      active: 1,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export interface DoctorView extends DoctorRow {
  /**
   * Ilu **różnych pacjentów** ma u niego wizytę — nie ile wizyt. Pytanie
   * brzmi „ilu ludzi się do niego zapisało", a jedna osoba na trzech wizytach
   * to jedna osoba.
   */
  patients: number;
  /** Wszystkie wizyty, łącznie z powtórnymi — druga połowa tej samej odpowiedzi. */
  visits: number;
  /** Wizyty jeszcze przed nami; po tym poznaje się, kto realnie przyjmuje. */
  upcoming: number;
  /** Wolne sloty w miesiącu `slotsMonth` — pojemność minus zajęte. */
  slotsFree: number;
  /** Obłożenie w procentach; `null`, gdy grafiku nie zsynchronizowano. */
  occupancy: number | null;
}

/**
 * Liczby rejestracji liczone z `contact_visits`, czyli z **naszej** bazy.
 *
 * Nie z systemu rezerwacji na żywo: osiemdziesięciu lekarzy to osiemdziesiąt
 * wywołań na każde wejście na listę, a odpowiedź i tak byłaby chwilowa. Wizyty
 * trafiają do nas kolektorami (webhook rezerwacji, synchronizacja z systemem
 * rezerwacji), więc licznik rośnie razem z bazą.
 *
 * **Dopasowanie po nazwisku**, bo tyle przysyła webhook rezerwacji ze strony.
 * To dopasowanie słabsze niż po identyfikatorze i tak jest opisane w UI.
 */
export async function listDoctors(): Promise<DoctorView[]> {
  await ensureDoctorsSeeded();
  const db = getDb();
  const rows = await db.select().from(doctors).orderBy(asc(doctors.name));
  const today = warsawToday();

  const stats = await db
    .select({
      doctor: contactVisits.doctor,
      contactId: contactVisits.contactId,
      startsAt: contactVisits.startsAt,
    })
    .from(contactVisits);

  const fold = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[ąćęłńóśźż]/g, (ch) => "acelnoszz"["ąćęłńóśźż".indexOf(ch)]);

  return rows.map((row) => {
    // Nazwisko z „lek. Jan Kowalski" — webhook przysyła zwykle samo imię
    // i nazwisko, bez tytułu.
    const bare = fold(row.name.replace(/^(lek\.|dr|prof\.|mgr)\s*/i, ""));
    const mine = stats.filter((v) => {
      const d = fold(v.doctor ?? "");
      return d && (d.includes(bare) || bare.includes(d));
    });
    const slotsFree = Math.max(0, row.slotsCapacity - row.slotsBooked);
    return {
      ...row,
      slotsFree,
      occupancy:
        row.slotsCapacity > 0 ? Math.round((row.slotsBooked / row.slotsCapacity) * 100) : null,
      patients: new Set(mine.map((v) => v.contactId)).size,
      visits: mine.length,
      upcoming: mine.filter((v) => (v.startsAt ?? "") >= today).length,
    };
  });
}

/** Ukrycie lekarza, który przestał przyjmować — historia wizyt zostaje. */
export async function setDoctorActive(id: string, active: boolean): Promise<void> {
  await getDb()
    .update(doctors)
    .set({ active: active ? 1 : 0, updatedAt: Date.now() })
    .where(eq(doctors.id, id));
}

/**
 * Odświeżenie obłożenia grafików z systemu rezerwacji.
 *
 * **Jedno wywołanie na lekarza**, więc nie da się tego robić przy wejściu na
 * listę — 80 zapytań i kilka megabajtów na otwarcie ekranu. Stąd zapis do
 * `doctors` i znacznik `slotsSyncedAt`, a ekran mówi wprost, z której chwili
 * są liczby.
 *
 * Pojemność i liczbę zajętych terminów liczy dostawca systemu rezerwacji —
 * każdy system ma inny kształt grafiku. Bez podpiętego systemu nic się nie
 * dzieje.
 */
export async function syncDoctorSlots(month: string): Promise<{ ok: number; failed: number }> {
  const system = await activeBookingSystem();
  if (!system) return { ok: 0, failed: 0 };
  await ensureDoctorsSeeded();
  const db = getDb();
  const rows = await db.select().from(doctors).where(eq(doctors.active, 1));

  let ok = 0;
  let failed = 0;
  for (const doc of rows) {
    try {
      const { capacity, booked } = await system.doctorMonthLoad(doc.systemId, month);
      await db
        .update(doctors)
        .set({
          slotsCapacity: capacity,
          slotsBooked: booked,
          slotsMonth: month,
          slotsSyncedAt: Date.now(),
          updatedAt: Date.now(),
        })
        .where(eq(doctors.id, doc.id));
      ok++;
    } catch {
      // Jeden nieosiągalny lekarz nie może zatrzymać całej synchronizacji —
      // jego liczby zostają z poprzedniego przebiegu, ze starym znacznikiem.
      failed++;
    }
  }
  return { ok, failed };
}
