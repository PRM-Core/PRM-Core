import { eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contacts } from "../db/schema";
import { enrichContactFromSystem } from "./enrich.server";
import { importVisitsForContact } from "./visits-import.server";
import { activeBookingSystem } from "./provider";

/**
 * Cykliczne odświeżanie pacjentów powiązanych z systemem rezerwacji.
 *
 * **Odświeża wyłącznie kontakty, które mają już `externalPatientId`.** Powiązanie jest
 * decyzją („to ta sama osoba"), a nie efektem ubocznym synchronizacji. Systemy
 * rezerwacji rzadko mają bezpieczne wyszukiwanie po nazwisku albo PESEL-u,
 * a zgadywanie powiązań kończyłoby się pomyłką albo widmowymi kartotekami
 * w bazie placówki. Powiązania zakłada `linkPatients`.
 *
 * Zakładanie powiązań to osobna, jednorazowa operacja (backfill z grafików),
 * uruchamiana świadomie — nie coś, co dzieje się co godzinę samo.
 *
 * **Kolejno, nie równolegle.** Osiemdziesiąt jednoczesnych połączeń to jedyny
 * sposób, żeby serwer placówki nas zauważył; sekwencyjnie kosztuje pół sekundy
 * na pacjenta i nikomu nie przeszkadza.
 */

export interface PatientsSyncResult {
  /** Ilu kontaktów dotyczyła synchronizacja. */
  linked: number;
  /** Ilu udało się odświeżyć. */
  refreshed: number;
  /** Ilu padło — zwykle chwilowa niedostępność systemu rezerwacji. */
  failed: number;
  visitsAdded: number;
  visitsUpdated: number;
  /** Ile wizyt jest zakończonych i ile nieodbytych — po odświeżeniu. */
  completed: number;
  noShow: number;
  /** Wpisy z webhooka rezerwacji scalone z terminem z systemu. */
  merged: number;
  /** Wizyty odwołane albo przełożone. */
  cancelled: number;
  /** Zdarzenia zgłoszone silnikowi (`visit.completed` / `no_show` / `cancelled`). */
  events: number;
}

export async function syncPatients(limit = 500): Promise<PatientsSyncResult> {
  const db = getDb();
  /**
   * **Rotacja, nie ten sam początek tabeli.**
   *
   * Bez `orderBy` SQLite oddawał przy `limit(500)` wciąż te same wiersze, więc
   * przy tysiącach powiązanych pacjentów reszta nie była odświeżana **nigdy** —
   * a dziennik pokazywał „synchronizacja wykonana", bo formalnie była.
   * Sortowanie po dacie ostatniego odświeżenia (puste najpierw) sprawia, że
   * każdy kontakt prędzej czy później dostaje swoją kolej.
   */
  if (!(await activeBookingSystem())) {
    return {
      linked: 0,
      refreshed: 0,
      failed: 0,
      visitsAdded: 0,
      visitsUpdated: 0,
      completed: 0,
      noShow: 0,
      merged: 0,
      cancelled: 0,
      events: 0,
    };
  }
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(isNotNull(contacts.externalPatientId))
    .orderBy(sql`coalesce(${contacts.externalSyncedAt}, 0) asc`)
    .limit(limit);

  const out: PatientsSyncResult = {
    linked: rows.length,
    refreshed: 0,
    failed: 0,
    visitsAdded: 0,
    visitsUpdated: 0,
    completed: 0,
    noShow: 0,
    merged: 0,
    cancelled: 0,
    events: 0,
  };

  for (const row of rows) {
    // Stempel **przed** próbą: kontakt, który wywala się za każdym razem
    // (skasowany w systemie, uszkodzone dane), inaczej stałby na początku
    // kolejki i blokował wszystkich za sobą.
    await db.update(contacts).set({ externalSyncedAt: Date.now() }).where(eq(contacts.id, row.id));
    try {
      // Dane kontaktowe najpierw: uzupełnia wyłącznie puste pola, więc poprawka
      // recepcji nigdy nie jest cofana — patrz `enrichContactFromSystem`.
      await enrichContactFromSystem(row.id);
      const visits = await importVisitsForContact(row.id);
      if (visits.ok) {
        out.visitsAdded += visits.added;
        out.visitsUpdated += visits.updated;
        out.completed += visits.completed;
        out.noShow += visits.noShow;
        out.merged += visits.merged;
        out.cancelled += visits.cancelled;
        out.events += visits.events;
        out.refreshed++;
      } else {
        out.failed++;
      }
    } catch {
      // Jeden pacjent nie może zatrzymać całego przebiegu; wróci za godzinę.
      out.failed++;
    }
  }

  return out;
}
