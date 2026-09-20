import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { listDoctors, setDoctorActive, type DoctorView } from "../booking-system/doctors.server";
import {
  enrichContactFromSystem,
  linkContactToSystem,
  type EnrichResult,
} from "../booking-system/enrich.server";
import { activeBookingSystem } from "../booking-system/provider";
import { bookingScheduleStatus } from "../booking-system/scheduler.server";
import { syncPatients } from "../booking-system/patients-sync.server";
import { syncDoctorSlots } from "../booking-system/doctors.server";
import { t } from "@/lib/i18n";

// Wyłącznie RPC — reguły siedzą w `lib/booking-system/*.server.ts`.

export type { DoctorView, EnrichResult };

export const getDoctors = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<DoctorView[]> => listDoctors());

export const toggleDoctorActive = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string(), active: z.boolean() }))
  .handler(async ({ data }) => {
    await setDoctorActive(data.id, data.active);
    return { ok: true };
  });

/**
 * Czy podpięto system rezerwacji. **Sam boolean i nazwa** — dane dostępowe
 * zostają na serwerze, jak przy każdym innym kluczu w tym projekcie.
 */
export const getBookingSystemStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async (): Promise<{ configured: boolean; name: string }> => {
    const system = await activeBookingSystem();
    return { configured: system !== null, name: system?.name ?? "" };
  });

export const enrichContact = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ contactId: z.string() }))
  .handler(async ({ data }): Promise<EnrichResult> => enrichContactFromSystem(data.contactId));

export const linkContactWithSystem = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ contactId: z.string(), patientId: z.number().int().positive() }))
  .handler(
    async ({ data }): Promise<EnrichResult> => linkContactToSystem(data.contactId, data.patientId),
  );

/** Stan harmonogramu systemu rezerwacji — do kafelka w panelu PRM Engine. */
export const getBookingSchedule = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async () => bookingScheduleStatus());

/**
 * Ręczne uruchomienie synchronizacji z panelu.
 *
 * Osobne od harmonogramu i **omijające ograniczenie „nie częściej niż"** —
 * człowiek, który klika „Synchronizuj teraz", chce tego teraz, a nie za
 * pięćdziesiąt minut. Cykliczny przebieg i tak pilnuje się sam.
 */
export const runBookingSyncNow = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ what: z.enum(["patients", "slots"]) }))
  .handler(async ({ data }) => {
    if (!(await activeBookingSystem()))
      return { ok: false as const, error: t("Nie podłączono systemu rezerwacji.") };
    try {
      if (data.what === "slots") {
        const month = new Date()
          .toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" })
          .slice(0, 7);
        const r = await syncDoctorSlots(month);
        return {
          ok: true as const,
          message: t("Grafiki: {ok} lekarzy, {failed} błędów.", { ok: r.ok, failed: r.failed }),
        };
      }
      const r = await syncPatients();
      return {
        ok: true as const,
        message: t(
          "Pacjenci: {refreshed}/{linked} odświeżonych · wizyt +{visitsAdded}/~{visitsUpdated} · scalonych {merged} · odwołanych {cancelled} · zdarzeń {events}.",
          {
            refreshed: r.refreshed,
            linked: r.linked,
            visitsAdded: r.visitsAdded,
            visitsUpdated: r.visitsUpdated,
            merged: r.merged,
            cancelled: r.cancelled,
            events: r.events,
          },
        ),
      };
    } catch (err) {
      return { ok: false as const, error: String(err).slice(0, 200) };
    }
  });
