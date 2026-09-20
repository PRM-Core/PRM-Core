import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "./require-user";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getSessionUser } from "../auth/session.server";
import { getDb } from "../db/client.server";
import { metaConnections } from "../db/schema";
import { metaConfigured } from "../meta/graph.server";
import { startConnect } from "../meta/connect.server";
import { backfillMetaLeads } from "../meta/leads.server";
import { t } from "@/lib/i18n";

/**
 * Integracja z Meta — warstwa RPC.
 *
 * **Token strony nigdy nie opuszcza serwera.** Lista połączeń oddaje nazwy,
 * stan i znaczniki czasu; sam token nie jest w niej zwracany nawet skrócony.
 * Wyciek takiego tokenu to cudzy dostęp do konta reklamowego placówki.
 */

export interface MetaConnectionView {
  pageId: string;
  pageName: string;
  subscribed: boolean;
  lastLeadAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  leadTags: string;
  leadStatus: string;
}

export const getMetaStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async (): Promise<{ configured: boolean; connections: MetaConnectionView[] }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));

    const rows = await getDb().select().from(metaConnections).all();
    return {
      configured: await metaConfigured(),
      connections: rows.map((r) => ({
        pageId: r.pageId,
        pageName: r.pageName,
        subscribed: r.subscribed === 1,
        lastLeadAt: r.lastLeadAt,
        lastError: r.lastError,
        lastErrorAt: r.lastErrorAt,
        leadTags: r.leadTags,
        leadStatus: r.leadStatus,
      })),
    };
  });

/** Adres okna logowania Facebooka — przeglądarka ma tam przejść. */
export const beginMetaConnect = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async (): Promise<{ url: string }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    if (!(await metaConfigured()))
      throw new Error(
        t("Brak App ID albo App Secret Mety — uzupełnij w Integracje → Klucze i dane dostępowe."),
      );
    return { url: await startConnect() };
  });

export const saveMetaPageSettings = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      pageId: z.string().min(1),
      leadTags: z.string().max(300),
      leadStatus: z.string().max(80),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    await getDb()
      .update(metaConnections)
      .set({ leadTags: data.leadTags.trim(), leadStatus: data.leadStatus.trim() })
      .where(eq(metaConnections.pageId, data.pageId));
    return { ok: true };
  });

export const disconnectMetaPage = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ pageId: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    // Kontakty i leady, które już weszły, zostają — odłączenie dotyczy
    // przyszłości, a nie historii pozyskania.
    await getDb().delete(metaConnections).where(eq(metaConnections.pageId, data.pageId));
    return { ok: true };
  });

/** „Pobierz zaległe" — to samo, co robi silnik raz dziennie, na żądanie. */
export const runMetaBackfill = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async (): Promise<{ pages: number; leads: number }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return backfillMetaLeads();
  });
