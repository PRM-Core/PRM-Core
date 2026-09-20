import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./require-user";
import {
  bookingSyncPaused,
  bookingWebhookPaused,
  countParkedBookings,
  discardParkedBookings,
  replayParkedBookings,
  setBookingSyncPaused,
  setBookingWebhookPaused,
} from "../booking-system/pause.server";
import { processBooking } from "../visits/booking-intake.server";

/** Stan obu przełączników plus liczba odłożonych rezerwacji. */
export const getBookingPauseState = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async () => ({
    syncPaused: await bookingSyncPaused(),
    webhookPaused: await bookingWebhookPaused(),
    parked: await countParkedBookings(),
  }));

export const setBookingPause = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      /** `sync` = pobieranie danych, `webhook` = przyjmowanie rezerwacji. */
      co: z.enum(["sync", "webhook"]),
      wstrzymane: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    if (data.co === "sync") await setBookingSyncPaused(data.wstrzymane);
    else await setBookingWebhookPaused(data.wstrzymane);
    return { ok: true as const, parked: await countParkedBookings() };
  });

/**
 * Przetworzenie zaległych **aktualnym** kodem webhooka.
 *
 * Świadomie osobne od wznowienia: placówka najpierw wznawia odbiór, potem
 * decyduje, co zrobić z tym, co przyszło w międzyczasie. Automatyczne
 * przetworzenie przy wznowieniu zaskakiwałoby wtedy, gdy zaległości mają
 * zostać odrzucone — a rezerwacji pacjenta nie da się „odzapisać".
 */
export const replayParked = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => {
    const wynik = await replayParkedBookings(async (payload) => {
      const r = await processBooking(payload);
      return { ok: r.ok, error: r.error };
    });
    return { ...wynik, parked: await countParkedBookings() };
  });

export const discardParked = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => ({
    odrzucone: await discardParkedBookings(),
    parked: await countParkedBookings(),
  }));
