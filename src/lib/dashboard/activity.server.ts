import { and, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contacts } from "../db/schema";
import { listStatuses } from "../fields/statuses.server";
import { warsawOffset } from "../visits/warsaw-time";
import {
  buildActivity,
  dayLocator,
  daysBetween,
  fetchStart,
  normalStatus,
  shiftDay,
  type ActivityResult,
  type TouchRow,
} from "./activity";

/**
 * Dane karty „Aktywność pacjentów" — zapytania. Liczenie jest w `activity.ts`.
 */

const HOUR_MS = 60 * 60 * 1000;
/** SQLite ogranicza liczbę parametrów w jednym zapytaniu. */
const IN_CHUNK = 400;

export interface StatusOption {
  key: string;
  label: string;
  /** Pusty, gdy placówka nie ustawiła barwy — ekran dobiera wtedy własną. */
  color: string;
}

export interface PatientActivity extends ActivityResult {
  /** Wszystkie statusy do wyboru w filtrze — także te bez kontaktów w zakresie. */
  statusOptions: StatusOption[];
}

/**
 * Północ danego dnia czasu warszawskiego jako znacznik czasu.
 *
 * **Offset brany z dnia poprzedniego, nie z tego samego.** Zegary przestawia
 * się o 2:00–3:00, więc w dniu zmiany czasu północ ma jeszcze stary offset,
 * a południe już nowy. Offset z południa dnia poprzedniego jest zawsze tym,
 * który obowiązuje o północy — między jednym a drugim zegar się nie zmienia.
 */
export function warsawMidnight(day: string): number {
  const offset = warsawOffset(Date.parse(`${shiftDay(day, -1)}T12:00:00Z`));
  return Date.parse(`${day}T00:00:00${offset}`);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function loadPatientActivity(input: {
  from: string;
  to: string;
  statuses: string[];
}): Promise<PatientActivity> {
  const db = getDb();
  const start = fetchStart(input.from, input.to);
  // Granice wszystkich dób raz, z góry — patrz `dayLocator`.
  const fetchedDays = daysBetween(start, input.to);
  const starts = [...fetchedDays, shiftDay(input.to, 1)].map(warsawMidnight);
  const dayOf = dayLocator(fetchedDays, starts);
  const startMs = starts[0];
  const endMs = starts[starts.length - 1];

  const [contactRows, touchBuckets, defined] = await Promise.all([
    // `created_at` kontaktu to już data warszawska `RRRR-MM-DD` — porównanie
    // tekstowe jest tu porównaniem dat.
    db
      .select({ createdAt: contacts.createdAt, status: contacts.status })
      .from(contacts)
      .where(and(gte(contacts.createdAt, start), lte(contacts.createdAt, input.to))),

    /**
     * Kto był aktywny — pogrupowane do pełnych godzin już w bazie.
     *
     * Przy rocznym zakresie dziennik silnika to setki tysięcy wierszy, a nas
     * interesuje tylko „ta osoba, ten dzień". Godzina jest najmniejszym
     * kubełkiem, który mapuje się na dobę warszawską **dokładnie**: offset
     * Warszawy to zawsze pełne godziny, więc żadna godzina nie wypada na
     * granicy dwóch dób. Dobę dla godziny wyznacza niżej `dayLocator`.
     */
    db.all<{ c: string; h: number }>(sql`
      select contact_id as c, created_at / ${HOUR_MS} as h from engine_log
        where contact_id is not null and created_at >= ${startMs} and created_at < ${endMs}
        group by c, h
      union
      select contact_id as c, created_at / ${HOUR_MS} as h from inbox_messages
        where created_at >= ${startMs} and created_at < ${endMs}
        group by c, h
    `),

    listStatuses(),
  ]);

  // Godzina → doba warszawska, z odsianiem powtórek „ta sama osoba, ten sam dzień".
  const seen = new Set<string>();
  const pairs: { contactId: string; day: string }[] = [];
  for (const row of touchBuckets ?? []) {
    const day = dayOf(Number(row.h) * HOUR_MS);
    if (day === null) continue;
    const key = `${row.c}|${day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ contactId: row.c, day });
  }

  // Bieżący status aktywnych kontaktów — filtr „tylko pacjenci" dotyczy też ich.
  const statusById = new Map<string, string>();
  const ids = [...new Set(pairs.map((p) => p.contactId))];
  for (const part of chunk(ids, IN_CHUNK)) {
    const rows = await db
      .select({ id: contacts.id, status: contacts.status })
      .from(contacts)
      .where(inArray(contacts.id, part));
    for (const r of rows) statusById.set(r.id, r.status);
  }

  const touches: TouchRow[] = [];
  for (const p of pairs) {
    // Wpis w dzienniku kontaktu, którego już nie ma (usunięty, scalony) —
    // nie ma statusu i nie ma kogo policzyć.
    const status = statusById.get(p.contactId);
    if (status === undefined) continue;
    touches.push({ ...p, status });
  }

  const result = buildActivity({
    from: input.from,
    to: input.to,
    statuses: input.statuses,
    contacts: contactRows,
    touches,
  });

  // Filtr ma pokazywać wszystkie zdefiniowane statusy, a do tego te, które
  // siedzą w kontaktach bez definicji (np. po imporcie) — inaczej takich
  // kontaktów nie dałoby się wybrać.
  const statusOptions: StatusOption[] = defined.map((s) => ({
    key: s.key,
    label: s.label,
    color: s.color,
  }));
  const known = new Set(statusOptions.map((s) => s.key));
  const inData = await db.all<{ status: string }>(sql`select distinct status from contacts`);
  for (const row of inData ?? []) {
    const key = normalStatus(row.status);
    if (known.has(key)) continue;
    known.add(key);
    statusOptions.push({ key, label: key, color: "" });
  }

  return { ...result, statusOptions };
}
