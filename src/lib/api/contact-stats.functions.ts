import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  automationRuns,
  contactVisits,
  contacts,
  emailEvents,
  emailSends,
  inboxMessages,
  trackingPings,
} from "../db/schema";

// Real per-contact numbers, replacing the six invented tiles the Statistics tab
// used to show ("Open rate 68%", "Średni czas sesji 5m 12s" — neither was ever
// measured). Every figure here is a count of rows the system really wrote.

export interface ContactStats {
  emailsSent: number;
  /** Unique messages opened — one open per send, however many times the client fetched the pixel. */
  opens: number;
  clicks: number;
  visitsBooked: number;
  pageVisits: number;
  automationRuns: number;
  messagesFromPatient: number;
  /** True while the tracking pixel points at localhost, where opens can never be recorded. */
  opensUnmeasurable: boolean;
}

export const getContactStats = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ contactId: z.string() }))
  .handler(async ({ data }): Promise<ContactStats> => {
    const db = getDb();
    const contact = await db.select().from(contacts).where(eq(contacts.id, data.contactId)).get();
    if (!contact) {
      return {
        emailsSent: 0,
        opens: 0,
        clicks: 0,
        visitsBooked: 0,
        pageVisits: 0,
        automationRuns: 0,
        messagesFromPatient: 0,
        opensUnmeasurable: false,
      };
    }

    // Sends are joined by address — the same key the contact timeline uses, and
    // the only one `email_sends` carries.
    const email = contact.email.trim().toLowerCase();
    const sends = email
      ? await db
          .select({ token: emailSends.token })
          .from(emailSends)
          .where(sql`lower(trim(${emailSends.toEmail})) = ${email}`)
      : [];
    const tokens = sends.map((s) => s.token);

    const events = tokens.length
      ? await db
          .select({ token: emailEvents.token, kind: emailEvents.kind })
          .from(emailEvents)
          .where(inArray(emailEvents.token, tokens))
      : [];

    const [visits, runs, inbound, pings] = await Promise.all([
      db
        .select({ id: contactVisits.id })
        .from(contactVisits)
        .where(eq(contactVisits.contactId, data.contactId)),
      db
        .select({ id: automationRuns.id })
        .from(automationRuns)
        .where(eq(automationRuns.contactId, data.contactId)),
      db
        .select({ id: inboxMessages.id })
        .from(inboxMessages)
        .where(and(eq(inboxMessages.contactId, data.contactId), eq(inboxMessages.direction, "in"))),
      tokens.length
        ? db
            .select({ id: trackingPings.id })
            .from(trackingPings)
            .where(inArray(trackingPings.contactToken, tokens))
        : Promise.resolve([]),
    ]);

    // The base URL decides whether opens are measurable at all: a pixel pointing
    // at localhost is never fetched by anybody's mail client, so "0 otwarć"
    // would read as poor engagement when it means "not measured".
    const { getBaseUrl } = await import("../engine/settings.server");
    const baseUrl = await getBaseUrl();

    return {
      emailsSent: sends.length,
      opens: new Set(events.filter((e) => e.kind === "open").map((e) => e.token)).size,
      clicks: new Set(events.filter((e) => e.kind === "click").map((e) => e.token)).size,
      visitsBooked: visits.length,
      pageVisits: pings.length,
      automationRuns: runs.length,
      messagesFromPatient: inbound.length,
      opensUnmeasurable: /localhost|127\.0\.0\.1/.test(baseUrl),
    };
  });
