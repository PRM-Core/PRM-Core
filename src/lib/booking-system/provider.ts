/**
 * The clinic's booking system (practice management system) — the contract.
 *
 * PRM Core does not keep the clinic's calendar; the booking system does. What
 * PRM Core does with it is the same whichever system that is: link contacts to
 * patient records, fill empty contact fields, import the visit history with
 * its states, infer no-shows, detect cancellations, merge visits that also
 * came through the booking webhook, emit `visit.completed` / `visit.no_show` /
 * `visit.cancelled` once per visit, and count doctors' schedule occupancy.
 * That mechanism lives in this directory and does not change per system.
 *
 * **A system is plugged in as a provider** — files in `./providers/`, loaded
 * automatically (see `./providers/README.md`). The product ships without one;
 * an installation adds its own there without editing any product file, so
 * product updates never conflict with it. With no provider configured, every
 * part of the mechanism stays idle and the screens say so.
 */

/** Patient details the system can give us. Every field optional — fill what you have. */
export interface ExternalPatient {
  /** National personal ID (in Poland: PESEL). Age and sex are derived from it when valid. */
  nationalId?: string | null;
  email?: string | null;
  /** E.164 when possible. */
  phone?: string | null;
  city?: string | null;
}

/**
 * Visit state in PRM Core terms. A provider maps its own statuses onto these.
 *
 * `booked` is the only state from which a **no-show** is inferred: still booked
 * more than two hours after the start means the patient did not come.
 */
export type VisitState = "booked" | "waiting" | "started" | "completed" | "cancelled" | "other";

export interface ExternalVisit {
  /** The system's visit ID — stable, numeric. */
  id: number;
  patientId: number;
  /** The system's ID of the doctor (`doctors.system_id`). */
  doctorId?: number | null;
  /** The system's ID of the service — matched against the doctor's services. */
  serviceId?: number | null;
  /** Local wall-clock date and time of the clinic: `YYYY-MM-DD`, `HH:MM`. */
  date: string;
  time: string;
  state: VisitState;
  /** Shown when `state` is `other`. */
  statusLabel?: string;
  /** Price for the patient in the main currency unit (e.g. 150.00). */
  price?: number | null;
}

/** A booking in a doctor's day — used to find which patient record a contact is. */
export interface DayBooking {
  patientId: number;
  /** As much of the name as the system gives; the last name may be only an initial. */
  firstName: string;
  lastName: string;
}

export interface BookingSystemProvider {
  /** Short, stable identifier — prefix of visit keys (`<id>-<visit id>`). */
  id: string;
  /** Shown to users, e.g. on visits ("source") and in the engine panel. */
  name: string;
  /** Credentials present? Say nothing more — values never leave the server. */
  configured(): Promise<boolean>;
  getPatient(patientId: number): Promise<ExternalPatient | null>;
  /**
   * The patient's visits. With `historyIsComplete` the list is the whole
   * history, so a visit we know that is missing from it was cancelled.
   */
  patientVisits(patientId: number): Promise<ExternalVisit[]>;
  /** Does `patientVisits` return the complete history (see above)? */
  historyIsComplete: boolean;
  /** Bookings of one doctor on one day — for linking contacts to patient records. */
  doctorDayBookings(doctorId: number, day: string): Promise<DayBooking[]>;
  /** Schedule capacity and booked slots of one doctor in a month (`YYYY-MM`). */
  doctorMonthLoad(doctorId: number, month: string): Promise<{ capacity: number; booked: number }>;
  /**
   * How the system names itself in the booking webhook's `source` field, when
   * it sends bookings there. A match marks the booking as made in the booking
   * system (see `rozlozZgody` in `visits/booking-intake.server.ts`).
   */
  webhookSource?: RegExp;
  /**
   * The integration in the credentials catalog (`<system>.catalog.ts`) that
   * holds this system's keys. Defaults to `id`; set it when the two differ —
   * `id` is baked into stored visit keys, so it cannot follow a rename.
   */
  integrationId?: string;
  /** Optional connection test for Integrations → Keys and credentials. */
  checkConnection?(): Promise<{ ok: boolean; message: string }>;
}

export class BookingSystemError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BookingSystemError";
  }
}

type ProviderModule = { provider?: BookingSystemProvider };

/**
 * Providers found in `./providers/*.server.ts`. `import.meta.glob` is resolved
 * by Vite at build time; outside Vite (unit tests run by Bun) there are none.
 */
function discovered(): BookingSystemProvider[] {
  let modules: Record<string, ProviderModule>;
  try {
    // Vite rewrites this call at build time; `import.meta.glob` itself never
    // exists at runtime, so it cannot be feature-tested — only tried.
    modules = import.meta.glob<ProviderModule>("./providers/*.server.ts", { eager: true });
  } catch {
    return [];
  }
  return Object.values(modules)
    .map((m) => m.provider)
    .filter((p): p is BookingSystemProvider => !!p);
}

const registered: BookingSystemProvider[] = [];

/** For tests and for providers registered from code rather than from `./providers/`. */
export function registerBookingSystem(provider: BookingSystemProvider): void {
  if (!registered.some((p) => p.id === provider.id)) registered.push(provider);
}

export function bookingSystems(): BookingSystemProvider[] {
  const all = [...discovered(), ...registered];
  return all.filter((p, i) => all.findIndex((q) => q.id === p.id) === i);
}

/**
 * The provider to use: the first one with credentials. One clinic has one
 * booking system; if two were configured, the first found wins.
 */
export async function activeBookingSystem(): Promise<BookingSystemProvider | null> {
  for (const provider of bookingSystems()) {
    if (await provider.configured()) return provider;
  }
  return null;
}

/**
 * The connected system's name as stored in visit and consent sources. Stored
 * values stay in Polish (like every stored value), so the fallback is Polish.
 */
export async function bookingSystemName(): Promise<string> {
  return (await activeBookingSystem())?.name ?? "system rezerwacji";
}

/** Visit key for `contact_visits.external_id`, kept apart from other collectors' keys. */
export const systemVisitKey = (provider: BookingSystemProvider, visitId: number) =>
  `${provider.id}-${visitId}`;
