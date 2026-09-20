import { randomUUID } from "node:crypto";
import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contactVisits, contacts, doctors } from "../db/schema";
import { warsawWallClockToIso } from "../visits/warsaw-time";
import { ensureDoctorsSeeded } from "./doctors.server";
import { emitEvent } from "../engine/events.server";
import { t } from "@/lib/i18n";
import {
  activeBookingSystem,
  systemVisitKey,
  type BookingSystemProvider,
  type ExternalVisit,
} from "./provider";
import { effectiveState, visitLabel } from "./status";

/**
 * Zaciągnięcie wizyt pacjenta z systemu rezerwacji na jego kartę.
 *
 * **Pola medyczne nie są tu nawet czytane.** Dostawca oddaje wyłącznie to,
 * co opisuje `ExternalVisit` — termin, lekarza, usługę, stan i cenę. PRM Core
 * jest systemem marketingowym i wciągnięcie do niego dokumentacji medycznej
 * zmieniłoby to, czym ten zbiór jest, razem z obowiązkami, które z tego
 * wynikają. Filtr jest na wejściu, nie na widoku.
 *
 * **„Zakończona" znaczy, że system rezerwacji tak ją oznaczył** — minięcie
 * terminu niczego nie dowodzi. Wizyta sprzed miesięcy potrafi nadal być
 * „umówiona", bo pacjent się nie pojawił albo rejestracja jej nie zamknęła —
 * i właśnie to jest **brak wizyty pacjenta** (patrz `status.ts`).
 *
 * **Odwołanie** przychodzi na dwa sposoby: system zgłasza stan `cancelled`
 * albo — gdy jego historia jest pełna (`historyIsComplete`) — termin, który
 * znaliśmy, znika z odpowiedzi. Przełożenie wygląda wtedy tak samo (stary
 * termin znika, nowy się pojawia) i tak jest opisane przy wyzwalaczu.
 */

export interface VisitImportResult {
  ok: boolean;
  error?: string;
  added: number;
  updated: number;
  /** Ile wizyt ma stan „zakończona" — odpowiedź na „czy usługa się odbyła". */
  completed: number;
  /** Ile wizyt minęło w stanie „umówiona", czyli pacjent się nie zjawił. */
  noShow: number;
  /** Ile wpisów z webhooka rezerwacji zostało **scalonych** z terminem z systemu. */
  merged: number;
  /** Ile wizyt odwołano albo przełożono. */
  cancelled: number;
  /** Ile zdarzeń zgłoszono silnikowi w tym przebiegu. */
  events: number;
}

const EMPTY: Omit<VisitImportResult, "ok" | "error"> = {
  added: 0,
  updated: 0,
  completed: 0,
  noShow: 0,
  merged: 0,
  cancelled: 0,
  events: 0,
};

/** Cena w groszach; żaden float nie zaokrągli kwoty. */
function toGrosze(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return Math.round(value * 100);
}

/**
 * Lekarz i nazwa usługi z naszej tabeli lekarzy.
 *
 * System oddaje identyfikatory; nazwy są w arkuszu lekarzy. Bez dopasowania
 * zostaje uczciwe „Wizyta (usługa 5056)" zamiast zmyślonej nazwy.
 */
async function serviceLabel(
  serviceId: number | null | undefined,
  doctorId: number | null | undefined,
): Promise<{ title: string; doctor: string; specialization: string }> {
  await ensureDoctorsSeeded();
  const db = getDb();
  const doc = doctorId
    ? await db.select().from(doctors).where(eq(doctors.systemId, doctorId)).get()
    : null;
  const service = doc?.services.find((s) => s.id === serviceId);
  return {
    title:
      service?.name.trim() ||
      (serviceId ? t("Wizyta (usługa {idxWariantu})", { idxWariantu: serviceId }) : t("Wizyta")),
    doctor: doc?.name ?? (doctorId ? `Pracownik ${doctorId}` : ""),
    specialization: doc?.specialization ?? "",
  };
}

export async function importVisitsForContact(contactId: string): Promise<VisitImportResult> {
  const db = getDb();
  const contact = await db.select().from(contacts).where(eq(contacts.id, contactId)).get();
  if (!contact) return { ok: false, error: t("Kontakt nie istnieje."), ...EMPTY };
  if (!contact.externalPatientId) {
    return { ok: false, error: t("Kontakt nie ma powiązania z systemem rezerwacji."), ...EMPTY };
  }
  const system = await activeBookingSystem();
  if (!system) return { ok: false, error: t("Nie podłączono systemu rezerwacji."), ...EMPTY };

  const visits = await system.patientVisits(contact.externalPatientId);
  return applyVisits(system, contactId, visits);
}

/**
 * Zapis wizyt jednego pacjenta — osobno od pobrania, żeby dało się go
 * sprawdzić testem bez żadnego systemu po drugiej stronie.
 */
export async function applyVisits(
  system: Pick<BookingSystemProvider, "id" | "name" | "historyIsComplete">,
  contactId: string,
  visits: ExternalVisit[],
  now: number = Date.now(),
): Promise<VisitImportResult> {
  const db = getDb();
  const out: VisitImportResult = { ok: true, ...EMPTY };
  /** Wizyty, które system wciąż zna — reszta naszych zniknęła. */
  const seen = new Set<number>();

  for (const v of visits) {
    if (!v.id) continue;
    seen.add(v.id);
    const externalId = systemVisitKey(system as BookingSystemProvider, v.id);

    const { title, doctor, specialization } = await serviceLabel(v.serviceId, v.doctorId);
    // Godzina jest lokalna i bez strefy — patrz `warsawWallClockToIso`.
    const iso = warsawWallClockToIso(v.date, v.time.slice(0, 5));
    const startsAt = iso ? Date.parse(iso) : null;
    const state = effectiveState(v.state, startsAt, now);
    if (state === "completed") out.completed++;
    if (state === "no_show") out.noShow++;
    // Stan w tytule, bo oś czasu pokazuje tytuł — inaczej „zakończona"
    // i „umówiona" wyglądałyby na wpisie identycznie.
    const label = visitLabel(v.state, startsAt, v.statusLabel ?? "", now);
    const fullTitle = label ? `${title} — ${label}` : title;

    // Ta sama konsultacja mogła już trafić na kartę webhookiem rezerwacji.
    // Szukamy w dwóch krokach:
    //   1. po identyfikatorze wizyty w systemie — widziana już wcześniej,
    //   2. po **kontakcie, minucie i lekarzu** — ten sam termin z webhooka.
    // Bez kroku 2 pacjent dostawałby **dwa wpisy o jednej wizycie**.
    let existing = await db
      .select({ id: contactVisits.id })
      .from(contactVisits)
      .where(eq(contactVisits.systemVisitId, v.id))
      .get();

    let merged = false;
    if (!existing && startsAt !== null) {
      // **Data, godzina i lekarz muszą się zgadzać.** Pacjent bywa umówiony
      // na tę samą godzinę u dwóch specjalistów. Porównanie z dokładnością do
      // minuty: system potrafi przysłać znacznik z sekundami.
      const sameSlot = await db
        .select({ id: contactVisits.id, doctor: contactVisits.doctor })
        .from(contactVisits)
        .where(
          and(
            eq(contactVisits.contactId, contactId),
            gte(contactVisits.startsAt, minuteFloor(startsAt)),
            lt(contactVisits.startsAt, minuteFloor(startsAt) + 60_000),
          ),
        )
        .all();
      const hit = sameSlot.find((row) => sameDoctor(row.doctor, doctor));
      if (hit) {
        existing = { id: hit.id };
        merged = true;
      }
    }
    if (!existing) {
      existing = await db
        .select({ id: contactVisits.id })
        .from(contactVisits)
        .where(eq(contactVisits.externalId, externalId))
        .get();
    }

    if (existing) {
      // Stan wizyty się zmienia (umówiona → rozpoczęta → zakończona), więc
      // wpis jest aktualizowany, a nie dokładany drugi raz.
      await db
        .update(contactVisits)
        .set({
          // `externalId` zostaje nietknięty — to klucz deduplikacji webhooka.
          systemVisitId: v.id,
          systemStatus: v.state,
          title: fullTitle,
          doctor,
          specialization,
          startsAt,
          priceGrosze: toGrosze(v.price),
        })
        .where(eq(contactVisits.id, existing.id));
      out.events += await announceVisitState(existing.id, contactId, state, fullTitle, v.id);
      if (merged) out.merged++;
      else out.updated++;
      continue;
    }

    const visitId = randomUUID();
    await db.insert(contactVisits).values({
      id: visitId,
      contactId,
      externalId,
      systemVisitId: v.id,
      systemStatus: v.state,
      title: fullTitle,
      doctor,
      specialization,
      startsAt,
      priceGrosze: toGrosze(v.price),
      source: system.name,
      createdAt: now,
    });
    out.events += await announceVisitState(visitId, contactId, state, fullTitle, v.id);
    out.added++;
  }

  // ── odwołania przez zniknięcie ──────────────────────────────────────────
  //
  // Tylko gdy lista jest pełną historią pacjenta: wtedy wszystko, co mamy
  // zapisane z identyfikatorem systemu, a czego w odpowiedzi nie ma, zniknęło.
  // Przy liście niepełnej (np. tylko przyszłe terminy) brak nic nie znaczy.
  if (system.historyIsComplete) {
    const ours = await db
      .select({
        id: contactVisits.id,
        systemVisitId: contactVisits.systemVisitId,
        systemStatus: contactVisits.systemStatus,
      })
      .from(contactVisits)
      .where(eq(contactVisits.contactId, contactId));

    for (const own of ours) {
      if (!own.systemVisitId || seen.has(own.systemVisitId)) continue;
      if (own.systemStatus === "cancelled") continue;
      const r = await markCancelled(own.id, contactId, own.systemVisitId);
      out.cancelled += r.cancelled;
      out.events += r.events;
    }
  }
  // Odwołania zgłoszone wprost przez system liczą się tak samo.
  for (const v of visits) {
    if (v.state === "cancelled") out.cancelled++;
  }

  return out;
}

/** Odwołanie przez zniknięcie: stan, tytuł i jedno zdarzenie. */
async function markCancelled(
  visitRowId: string,
  contactId: string,
  systemVisitId: number,
): Promise<{ cancelled: number; events: number }> {
  const db = getDb();
  const row = await db
    .select({ title: contactVisits.title, sent: contactVisits.stateEventSent })
    .from(contactVisits)
    .where(eq(contactVisits.id, visitRowId))
    .get();
  if (!row) return { cancelled: 0, events: 0 };
  const title = row.title.replace(/ — [^—]*$/, "") + " — " + t("Odwołana");
  await db
    .update(contactVisits)
    .set({ systemStatus: "cancelled", title })
    .where(eq(contactVisits.id, visitRowId));
  if (row.sent !== "cancelled") {
    await emitEvent({
      type: "visit.cancelled",
      contactId,
      payload: { title, visitId: String(systemVisitId) },
    });
    await db
      .update(contactVisits)
      .set({ stateEventSent: "cancelled" })
      .where(eq(contactVisits.id, visitRowId));
    return { cancelled: 1, events: 1 };
  }
  return { cancelled: 1, events: 0 };
}

/**
 * Zgłasza silnikowi stan końcowy wizyty — **raz na wizytę**.
 *
 * `ic_event_sent` pilnuje jednokrotności, bo „brak wizyty pacjenta" nie jest
 * zmianą stanu w systemie, tylko skutkiem upływu czasu: bez znacznika każda
 * kolejna synchronizacja wysyłałaby to samo zdarzenie i pacjent dostawałby tę
 * samą wiadomość co pół godziny.
 *
 * Zwraca liczbę wyemitowanych zdarzeń (0 albo 1).
 */
async function announceVisitState(
  visitRowId: string,
  contactId: string,
  state: string,
  title: string,
  systemVisitId: number,
): Promise<number> {
  const event =
    state === "completed"
      ? "visit.completed"
      : state === "no_show"
        ? "visit.no_show"
        : state === "cancelled"
          ? "visit.cancelled"
          : "";
  if (!event) return 0;

  const db = getDb();
  const row = await db
    .select({ sent: contactVisits.stateEventSent })
    .from(contactVisits)
    .where(eq(contactVisits.id, visitRowId))
    .get();
  if (!row || row.sent === state) return 0;

  await emitEvent({
    type: event,
    contactId,
    payload: { title, visitId: String(systemVisitId) },
  });
  await db
    .update(contactVisits)
    .set({ stateEventSent: state })
    .where(eq(contactVisits.id, visitRowId));
  return 1;
}

/**
 * Czy to ten sam lekarz, mimo różnego zapisu.
 *
 * Webhook rezerwacji przysyła nazwisko tak, jak wpisał je system rejestracji
 * („Anna Przykładowa"), a my trzymamy je z arkusza z tytułem
 * („lek. Anna Przykładowa"). Porównanie znosi tytuł, wielkość liter i polskie
 * znaki — inaczej ta sama osoba nie zmatchuje się sama ze sobą.
 */
function sameDoctor(a: string, b: string): boolean {
  const strip = (s: string) =>
    s
      .replace(/\b(lek|dr|prof|mgr|hab|n|med)\.?\s*/gi, "")
      .trim()
      .toLowerCase()
      .replace(/[ąćęłńóśźż]/g, (ch) => "acelnoszz"["ąćęłńóśźż".indexOf(ch)]);
  const x = strip(a);
  const y = strip(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/** Znacznik ścięty do pełnej minuty — patrz komentarz przy dopasowaniu terminu. */
function minuteFloor(ms: number): number {
  return Math.floor(ms / 60_000) * 60_000;
}

/**
 * Przebieg naprawczy: scala wizyty, które trafiły na kartę **dwiema drogami**
 * (webhookiem i z systemu rezerwacji), zanim scalanie w ogóle powstało.
 *
 * **Zostaje wiersz z webhooka** — to on trzyma `externalId`, czyli klucz
 * deduplikacji systemu rezerwacji. Przejmuje dane z systemu (stan, tytuł,
 * cenę, identyfikator wizyty i znacznik wysłanego zdarzenia), a drugi wiersz
 * znika. Odwrotna kolejność zerwałaby deduplikację webhooka.
 */
export async function mergeDuplicateVisits(): Promise<{
  pairs: number;
  merged: number;
  skippedDifferentDoctor: number;
}> {
  const db = getDb();
  const rows = await db.select().from(contactVisits);
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.startsAt === null) continue;
    const key = `${r.contactId}|${minuteFloor(r.startsAt)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }

  let pairs = 0;
  let merged = 0;
  let skipped = 0;

  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const fromSystem = group.filter((r) => r.systemVisitId);
    const fromWebhook = group.filter((r) => !r.systemVisitId);
    if (fromSystem.length === 0 || fromWebhook.length === 0) continue;

    for (const sys of fromSystem) {
      const twin = fromWebhook.find((w) => sameDoctor(w.doctor, sys.doctor));
      pairs++;
      if (!twin) {
        skipped++;
        continue;
      }
      // **System rezerwacji jest nadrzędny** — to on decyduje o terminie,
      // lekarzu i cenie. Z wiersza z webhooka zostaje `externalId` i `source`.
      // Puste pola z systemu nie kasują tego, co przyszło webhookiem (`||`).
      await db
        .update(contactVisits)
        .set({
          systemVisitId: sys.systemVisitId,
          systemStatus: sys.systemStatus,
          stateEventSent: sys.stateEventSent,
          title: sys.title,
          doctor: sys.doctor || twin.doctor,
          startsAt: sys.startsAt ?? twin.startsAt,
          specialization: sys.specialization || twin.specialization,
          priceGrosze: sys.priceGrosze || twin.priceGrosze,
        })
        .where(eq(contactVisits.id, twin.id));
      await db.delete(contactVisits).where(eq(contactVisits.id, sys.id));
      merged++;
      fromWebhook.splice(fromWebhook.indexOf(twin), 1);
    }
  }

  return { pairs, merged, skippedDifferentDoctor: skipped };
}
