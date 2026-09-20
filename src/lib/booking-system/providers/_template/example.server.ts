/**
 * TEMPLATE — a booking system provider for a fictional REST API.
 *
 * Copy the three `example.*` files one level up (to `providers/`), rename
 * `example` to your system's name, and replace the endpoints and mapping.
 * Files in this `_template/` folder are never loaded.
 *
 * Everything else — linking contacts, visit history, no-shows, cancellations,
 * `visit.*` events, schedules — is done by PRM Core. A provider only answers
 * the questions in `BookingSystemProvider` (`../../provider.ts`).
 */
import { getCredentials } from "../../../credentials/store.server";
import { t } from "@/lib/i18n";
import {
  BookingSystemError,
  type BookingSystemProvider,
  type ExternalVisit,
  type VisitState,
} from "../../provider";

// ── the system's API (fictional) ─────────────────────────────────────────────

interface ApiPatient {
  national_id?: string;
  email?: string;
  mobile?: string;
  city?: string;
}
interface ApiAppointment {
  id: number;
  patient_id: number;
  practitioner_id?: number;
  service_id?: number;
  starts_at: string; // "2026-09-16T10:30" — clinic's local time
  status: string;
  status_name?: string;
  price?: number;
  patient_first_name?: string;
  patient_last_name?: string;
}

async function config() {
  const c = await getCredentials("EXAMPLE_API_URL", "EXAMPLE_API_TOKEN");
  const url = c.EXAMPLE_API_URL.trim().replace(/\/+$/, "");
  return url && c.EXAMPLE_API_TOKEN ? { url, token: c.EXAMPLE_API_TOKEN } : null;
}

async function get<T>(path: string): Promise<T> {
  const c = await config();
  if (!c) throw new BookingSystemError(t("Nie podłączono systemu rezerwacji."));
  const res = await fetch(`${c.url}${path}`, {
    headers: { Authorization: `Bearer ${c.token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404) return null as T;
  // Never put the token or the response body with patient data into the message.
  if (!res.ok) throw new BookingSystemError(`Example API: HTTP ${res.status}`, res.status);
  return (await res.json()) as T;
}

// ── mapping onto PRM Core terms ─────────────────────────────────────────────

/** The system's statuses → PRM Core visit states. Unknown ones become `other`. */
const STATES: Record<string, VisitState> = {
  scheduled: "booked",
  arrived: "waiting",
  in_progress: "started",
  completed: "completed",
  cancelled: "cancelled",
};

export function toVisit(a: ApiAppointment): ExternalVisit {
  const state = STATES[a.status] ?? "other";
  return {
    id: a.id,
    patientId: a.patient_id,
    doctorId: a.practitioner_id ?? null,
    serviceId: a.service_id ?? null,
    date: a.starts_at.slice(0, 10),
    time: a.starts_at.slice(11, 16),
    state,
    statusLabel: state === "other" ? a.status_name || a.status : undefined,
    price: a.price ?? null,
  };
}

// ── the provider ────────────────────────────────────────────────────────────

export const provider: BookingSystemProvider = {
  /** Baked into stored visit keys (`example-<id>`) — never change it later. */
  id: "example",
  name: "Example System",
  /** `/patients/{id}/appointments` returns the full history, past and future. */
  historyIsComplete: true,

  async configured() {
    return (await config()) !== null;
  },

  async getPatient(patientId) {
    const p = await get<ApiPatient | null>(`/patients/${patientId}`);
    if (!p) return null;
    return {
      nationalId: p.national_id ?? null,
      email: p.email?.trim().toLowerCase() || null,
      phone: p.mobile ?? null,
      city: p.city ?? null,
    };
  },

  async patientVisits(patientId) {
    const rows = await get<ApiAppointment[] | null>(`/patients/${patientId}/appointments`);
    return (rows ?? []).map(toVisit);
  },

  async doctorDayBookings(doctorId, day) {
    const rows = await get<ApiAppointment[] | null>(
      `/practitioners/${doctorId}/appointments?date=${day}`,
    );
    return (rows ?? []).map((a) => ({
      patientId: a.patient_id,
      firstName: a.patient_first_name ?? "",
      lastName: a.patient_last_name ?? "",
    }));
  },

  async doctorMonthLoad(doctorId, month) {
    const load = await get<{ slots: number; booked: number } | null>(
      `/practitioners/${doctorId}/load?month=${month}`,
    );
    return { capacity: load?.slots ?? 0, booked: load?.booked ?? 0 };
  },

  /** Read-only: asks who we are, changes nothing on the other side. */
  async checkConnection() {
    const c = await config();
    if (!c) return { ok: false, message: t("Nie podłączono systemu rezerwacji.") };
    const res = await fetch(`${c.url}/me`, {
      headers: { Authorization: `Bearer ${c.token}` },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok
      ? { ok: true, message: `Example API: OK` }
      : { ok: false, message: `Example API: HTTP ${res.status}` };
  },
};
