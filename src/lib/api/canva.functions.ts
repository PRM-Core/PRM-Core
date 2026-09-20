import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "./require-user";
import process from "node:process";
import { getSessionUser } from "../auth/session.server";
import { disconnectCanva, getConnection } from "../canva/oauth.server";
import { startCanvaConnect } from "../canva/connect.server";
import { importCanvaDesignToMedia, listCanvaDesigns } from "../canva/designs.server";
import { z } from "zod";
import { getCredentials } from "@/lib/credentials/store.server";
import { t } from "@/lib/i18n";

/**
 * Stan integracji z Canvą.
 *
 * **Na razie mówi wyłącznie, czy instalacja ma klucze** — bo tylko tyle jest
 * prawdą. Pobieranie projektów wymaga OAuth (Authorization Code + PKCE),
 * a ten powstaje osobno; do czasu jego ukończenia panel w Studiu ma pokazywać
 * „niepodłączona", a nie przycisk, który wygląda na działający i kończy się
 * niczym.
 *
 * Klucze czytamy ze **środowiska**, nie z bazy: to sekrety instalacji, tak samo
 * jak SendGrid i Twilio, i nie mają czego szukać w kopii bazy ani w paczce
 * wdrożeniowej.
 */
export interface CanvaStatus {
  /** Czy `.env` ma komplet: identyfikator i sekret integracji. */
  configured: boolean;
  /** Czego brakuje — do wypisania wprost, zamiast ogólnego „błąd konfiguracji". */
  missing: string[];
}

export const getCanvaStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async (): Promise<CanvaStatus> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));

    const missing: string[] = [];
    const c = await getCredentials("CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET");
    if (!c.CANVA_CLIENT_ID) missing.push("CANVA_CLIENT_ID");
    if (!c.CANVA_CLIENT_SECRET) missing.push("CANVA_CLIENT_SECRET");

    return { configured: missing.length === 0, missing };
  });

/** Stan połączenia do pokazania na karcie integracji. */
export const getCanvaConnection = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async () => {
    const row = await getConnection();
    return {
      connected: !!row,
      accountName: row?.accountName ?? "",
      scopes: row?.scopes ?? "",
      connectedAt: row?.connectedAt ?? null,
      lastError: row?.lastError ?? null,
      lastErrorAt: row?.lastErrorAt ?? null,
    };
  });

/**
 * Adres, pod który ma pójść przeglądarka, żeby zalogować się do Canvy.
 *
 * Oddajemy **adres**, a nie przekierowanie: przekierowanie z funkcji serwerowej
 * kończy się w warstwie RPC, a nie w oknie przeglądarki, więc użytkownik
 * zobaczyłby, że „nic się nie stało".
 */
export const startCanva = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => ({ url: await startCanvaConnect() }));

export const disconnectCanvaAccount = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => {
    await disconnectCanva();
    return { ok: true as const };
  });

/** Lista projektów z Canvy — stronicowana tokenem `continuation`. */
export const getCanvaDesigns = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({ continuation: z.string().optional(), query: z.string().max(120).optional() }),
  )
  .handler(async ({ data }) => listCanvaDesigns(data.continuation, data.query));

/**
 * Projekt z Canvy → plik w Media, gotowy dla PRM_Agenta.
 *
 * Zwracamy `mediaId` i adres publiczny, a nie gotowe klocki: kodowaniem zajmuje
 * się ta sama rozmowa z agentem co przy „zakoduj z grafiki", więc placówka może
 * mu od razu powiedzieć, co poprawić — zamiast dostać jeden wynik bez odwołania.
 */
export const importCanvaDesign = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      designId: z.string().min(1),
      title: z.string().default("Projekt Canva"),
      folder: z.enum(["email", "newsletter", "popup", "inne"]).default("email"),
    }),
  )
  .handler(async ({ data }) => importCanvaDesignToMedia(data.designId, data.title, data.folder));
