import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { trackingPings, emailSends } from "../db/schema";
import { formatActivityDate } from "@/lib/activity-date";
import {
  listTrackedDomains,
  saveTrackedDomains,
  checkInstallation,
  collectorBaseUrl,
  trackingTotals,
  type DomainStatus,
  type InstallCheck,
} from "../tracking/tracking.server";
import { t } from "@/lib/i18n";

const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // an event within the last 5 minutes counts as "live"

export const getTrackingStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .inputValidator(z.object({ workspaceId: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const last = await db
      .select()
      .from(trackingPings)
      .where(eq(trackingPings.workspaceId, data.workspaceId))
      .orderBy(desc(trackingPings.receivedAt))
      .limit(1)
      .get();

    const active = !!last && Date.now() - last.receivedAt < ACTIVE_WINDOW_MS;
    return {
      active,
      lastPingAt: last?.receivedAt ?? null,
      lastPingUrl: last?.url ?? null,
    };
  });

export const getRecentPings = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(
    z.object({ workspaceId: z.string(), limit: z.number().min(1).max(50).default(10) }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(trackingPings)
      .where(eq(trackingPings.workspaceId, data.workspaceId))
      .orderBy(desc(trackingPings.receivedAt))
      .limit(data.limit);
    return rows;
  });

export interface PageVisitActivityItem {
  id: string;
  type: "page_visit";
  title: string;
  description: string;
  date: string;
  /** Pełny adres odwiedzonej strony — oś czasu robi z niego odnośnik. */
  url: string;
}

/**
 * Real page visits attributable to a contact — joined through emailSends
 * (by email) rather than a direct contactId FK, same weak-reference pattern
 * as getEmailActivityForContact: a tracking ping's contactToken is the
 * emailSends.token from whichever tracked email the visitor clicked through
 * (see e.click.$token.ts, which stamps ?prm_ct=<token> onto the redirect).
 * Visits with no click-token (anonymous/direct traffic) aren't attributable
 * to any contact and are correctly excluded here.
 */
export const getPageVisitsForContact = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ email: z.string().email() }))
  .handler(async ({ data }): Promise<PageVisitActivityItem[]> => {
    const db = getDb();
    const sends = await db.select().from(emailSends).where(eq(emailSends.toEmail, data.email));
    if (sends.length === 0) return [];

    const tokens = sends.map((s) => s.token);
    const pings = await db
      .select()
      .from(trackingPings)
      .where(inArray(trackingPings.contactToken, tokens));

    return pings
      .map((p) => ({
        id: p.id,
        type: "page_visit" as const,
        // Tytuł strony zamiast stałego napisu: „Cennik — protezy słuchu" mówi
        // recepcjonistce więcej niż „Wizyta na stronie" powtórzone dziesięć razy.
        // Bez tytułu zostaje sam adres, bo lepszy niż nic.
        title: p.title || p.url,
        description: p.title ? p.url : t("Wizyta na stronie"),
        date: formatActivityDate(p.receivedAt),
        url: p.url,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  });

// ── Ustawienia śledzenia ────────────────────────────────────────────────────
// Warstwa RPC nad tracking.server.ts. Cała logika siedzi tam — patrz nota
// w contacts.functions.ts o tym, czemu zwykły eksport w pliku `.functions.ts`
// wciągnąłby kod serwerowy do przeglądarki.

export const getTrackingOverview = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(
    async (): Promise<{
      domains: DomainStatus[];
      baseUrl: string;
      totals: { total: number; identified: number };
    }> => {
      const [domains, baseUrl, totals] = await Promise.all([
        listTrackedDomains(),
        collectorBaseUrl(),
        trackingTotals(),
      ]);
      return { domains, baseUrl, totals };
    },
  );

export const saveTrackingDomains = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      domains: z.array(z.object({ domain: z.string(), label: z.string().default("") })),
    }),
  )
  .handler(async ({ data }) => saveTrackedDomains(data.domains));

export const verifyInstallation = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ domain: z.string().min(1) }))
  .handler(async ({ data }): Promise<InstallCheck> => checkInstallation(data.domain));
