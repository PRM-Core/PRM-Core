import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { appSettings, parkedBookings } from "../db/schema";
import { logStep } from "../engine/log.server";
import { t } from "@/lib/i18n";

/**
 * Wstrzymanie wymiany danych z systemem rezerwacji — dwa niezależne przełączniki.
 *
 * Na czas porządków w dokumentacji po stronie systemu rezerwacji trzeba
 * móc wstrzymać wymianę na kilka dni.
 *
 * **Dwa przełączniki, nie jeden.** To dwa różne kierunki i dwa różne ryzyka:
 * synchronizacja **pobiera** (można ją wyłączyć bez konsekwencji — po włączeniu
 * dociągnie stan), a webhook **przyjmuje** rezerwacje, których nikt drugi raz
 * nie wyśle. Zlanie ich w jeden przełącznik zmuszałoby do wyłączania odbioru
 * tylko dlatego, że wstrzymuje się pobieranie.
 *
 * **Wyłączenie nie kasuje niczego i nie wymaga wdrożenia** — to wiersz
 * w ustawieniach, przestawiany z panelu.
 */

// Klucze zachowują historyczne nazwy — są zapisane w bazach działających
// instalacji i zmiana nazwy po cichu zdjęłaby ustawione wstrzymanie.
const KLUCZ_SYNC = "ic_sync_paused";
const KLUCZ_WEBHOOK = "ic_webhook_paused";

async function flaga(klucz: string): Promise<boolean> {
  const row = await getDb().select().from(appSettings).where(eq(appSettings.key, klucz)).get();
  return row?.value === "1";
}

async function ustawFlage(klucz: string, wstrzymane: boolean): Promise<void> {
  const db = getDb();
  const wartosc = wstrzymane ? "1" : "0";
  const istnieje = await db.select().from(appSettings).where(eq(appSettings.key, klucz)).get();
  if (istnieje) {
    await db.update(appSettings).set({ value: wartosc }).where(eq(appSettings.key, klucz));
  } else {
    await db.insert(appSettings).values({ key: klucz, value: wartosc });
  }
}

export const bookingSyncPaused = () => flaga(KLUCZ_SYNC);
export const bookingWebhookPaused = () => flaga(KLUCZ_WEBHOOK);

export async function setBookingSyncPaused(wstrzymane: boolean): Promise<void> {
  await ustawFlage(KLUCZ_SYNC, wstrzymane);
  await logStep({
    kind: "action",
    message: wstrzymane
      ? t("Synchronizacja z systemem rezerwacji WSTRZYMANA z panelu.")
      : t("Synchronizacja z systemem rezerwacji wznowiona z panelu."),
    detail: { source: "booking-pauza" },
  });
}

export async function setBookingWebhookPaused(wstrzymane: boolean): Promise<void> {
  await ustawFlage(KLUCZ_WEBHOOK, wstrzymane);
  await logStep({
    kind: "action",
    message: wstrzymane
      ? t("Webhook rezerwacji WSTRZYMANY — przychodzące rezerwacje są odkładane, nie odrzucane.")
      : t("Webhook rezerwacji wznowiony."),
    detail: { source: "booking-pauza" },
  });
}

/** Odłożenie surowej treści na później. Zwraca identyfikator wiersza. */
export async function parkBooking(payload: unknown): Promise<string> {
  const id = randomUUID();
  await getDb()
    .insert(parkedBookings)
    .values({
      id,
      receivedAt: Date.now(),
      payload: JSON.stringify(payload),
    });
  return id;
}

export async function countParkedBookings(): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(parkedBookings)
    .where(isNull(parkedBookings.processedAt));
  return rows[0]?.n ?? 0;
}

export interface ReplayResult {
  przetworzone: number;
  odrzucone: number;
  bledy: number;
}

/**
 * Przetworzenie zaległych rezerwacji **aktualnym** kodem.
 *
 * Kolejność chronologiczna: dwie rezerwacje tego samego pacjenta muszą wejść
 * w tej samej kolejności, w jakiej przyszły, bo druga bywa zmianą pierwszej.
 */
export async function replayParkedBookings(
  handler: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>,
): Promise<ReplayResult> {
  const db = getDb();
  const out: ReplayResult = { przetworzone: 0, odrzucone: 0, bledy: 0 };

  const zalegle = await db
    .select()
    .from(parkedBookings)
    .where(isNull(parkedBookings.processedAt))
    .orderBy(parkedBookings.receivedAt);

  for (const wiersz of zalegle) {
    let wynik = "";
    try {
      const payload = JSON.parse(wiersz.payload) as Record<string, unknown>;
      const r = await handler(payload);
      if (r.ok) {
        out.przetworzone++;
        wynik = "ok";
      } else {
        out.odrzucone++;
        wynik = r.error ?? "odrzucone";
      }
    } catch (err) {
      out.bledy++;
      wynik = t("błąd: {v0}", { v0: err instanceof Error ? err.message : String(err) });
    }
    await db
      .update(parkedBookings)
      .set({ processedAt: Date.now(), result: wynik.slice(0, 300) })
      .where(eq(parkedBookings.id, wiersz.id));
  }

  await logStep({
    kind: "action",
    message: t(
      "Zaległe rezerwacje przetworzone: {przetworzone} przyjętych, {odrzucone} odrzuconych, {bledy} błędów.",
      { przetworzone: out.przetworzone, odrzucone: out.odrzucone, bledy: out.bledy },
    ),
    detail: { source: "booking-pauza" },
  });
  return out;
}

/** Odrzucenie zaległych bez przetwarzania — ślad zostaje. */
export async function discardParkedBookings(): Promise<number> {
  const db = getDb();
  const ile = await countParkedBookings();
  await db
    .update(parkedBookings)
    .set({ processedAt: Date.now(), result: "odrzucone ręcznie" })
    .where(and(isNull(parkedBookings.processedAt)));
  await logStep({
    kind: "action",
    message: t("Zaległe rezerwacje odrzucone ręcznie: {ile}.", { ile: ile }),
    detail: { source: "booking-pauza" },
  });
  return ile;
}
