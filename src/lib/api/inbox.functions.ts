import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contacts, emailSettings, inboxMessages, inboxThreads, users } from "../db/schema";
import type { InboxChannel, InboxDirection, InboxThreadStatus } from "../db/schema";
import { getSessionUser } from "../auth/session.server";
import { getEventWebhookSecret } from "../email/event-webhook.server";
import {
  getInboundEmailSecret,
  markThreadRead,
  openThreadForContact,
  recordOutboundMessage,
  rotateInboundEmailSecret,
} from "../inbox/inbox.server";
import { sendEmail, SendGridError } from "../email/sendgrid.server";
import { sendSms, TwilioError } from "../sms/twilio.server";
import { listSmsSenders, resolveReplySmsSender } from "../sms/senders.server";
import {
  createTrackedSend,
  deleteTrackedSend,
  injectTracking,
} from "../email/email-tracking.server";
import { getBaseUrl } from "../engine/settings.server";
import { escapeHtmlText } from "../content-builder";
import { checkConsent } from "../consent/consent.server";
import { DNC_TAG } from "../engine/actions.server";
import { draftInboxReply } from "../ai/inbox-assist.server";
import { formatActivityDate as formatDate } from "@/lib/activity-date";
import { t as tr } from "@/lib/i18n";

// RPC for the omnichannel inbox. Only `createServerFn` lives here — the write
// helpers it calls are in inbox.server.ts, because a plain exported function in
// a *.functions.ts file survives into the client bundle and drags node:crypto
// with it (the gotcha this codebase has now hit five times).

export interface InboxThreadSummary {
  id: string;
  contactId: string;
  contactName: string;
  channel: InboxChannel;
  subject: string;
  lastPreview: string;
  lastDirection: InboxDirection;
  /** "YYYY-MM-DD HH:mm" — same shape the activity timeline uses. */
  lastMessageAt: string;
  unreadCount: number;
  status: InboxThreadStatus;
  assignedUserId: string | null;
  assignedName: string;
}

export interface InboxMessageView {
  id: string;
  direction: InboxDirection;
  channel: InboxChannel;
  subject: string;
  body: string;
  source: string;
  sentByName: string;
  createdAt: string;
}

export interface InboxThreadDetail {
  thread: InboxThreadSummary;
  messages: InboxMessageView[];
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    tags: string[];
    /** True when the contact carries the do-not-contact tag — replies are blocked. */
    dnc: boolean;
  } | null;
}

/** Names for a set of user ids in one query rather than one per row. */
async function userNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, `${r.firstName} ${r.lastName}`.trim()]));
}

export const listInboxThreads = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(
    z.object({
      search: z.string().optional(),
      channel: z.string().optional(),
      onlyUnread: z.boolean().optional(),
      includeClosed: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }): Promise<InboxThreadSummary[]> => {
    const db = getDb();
    const rows = await db
      .select()
      .from(inboxThreads)
      .where(data.includeClosed ? undefined : eq(inboxThreads.status, "open"))
      .orderBy(desc(inboxThreads.lastMessageAt))
      .limit(200);

    const contactRows =
      rows.length > 0
        ? await db
            .select({
              id: contacts.id,
              firstName: contacts.firstName,
              lastName: contacts.lastName,
              email: contacts.email,
            })
            .from(contacts)
            .where(inArray(contacts.id, [...new Set(rows.map((r) => r.contactId))]))
        : [];
    const byContact = new Map(contactRows.map((c) => [c.id, c]));
    const names = await userNames(rows.map((r) => r.assignedUserId ?? ""));

    const search = (data.search ?? "").trim().toLowerCase();
    return rows
      .map((r) => {
        const c = byContact.get(r.contactId);
        const contactName = c
          ? `${c.firstName} ${c.lastName}`.trim() || c.email
          : tr("Kontakt usunięty");
        return {
          id: r.id,
          contactId: r.contactId,
          contactName,
          channel: r.channel,
          subject: r.subject,
          lastPreview: r.lastPreview,
          lastDirection: r.lastDirection,
          lastMessageAt: formatDate(r.lastMessageAt),
          unreadCount: r.unreadCount,
          status: r.status,
          assignedUserId: r.assignedUserId,
          assignedName: r.assignedUserId ? (names.get(r.assignedUserId) ?? "—") : "",
        };
      })
      .filter((t) => {
        if (data.onlyUnread && t.unreadCount === 0) return false;
        if (data.channel && data.channel !== "all" && t.channel !== data.channel) return false;
        if (!search) return true;
        return (
          t.contactName.toLowerCase().includes(search) ||
          t.lastPreview.toLowerCase().includes(search) ||
          t.subject.toLowerCase().includes(search)
        );
      });
  });

export const getInboxThread = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ threadId: z.string() }))
  .handler(async ({ data }): Promise<InboxThreadDetail | null> => {
    const db = getDb();
    const thread = await db
      .select()
      .from(inboxThreads)
      .where(eq(inboxThreads.id, data.threadId))
      .get();
    if (!thread) return null;

    const messages = await db
      .select()
      .from(inboxMessages)
      .where(eq(inboxMessages.threadId, thread.id))
      .orderBy(asc(inboxMessages.createdAt));

    const contact = await db.select().from(contacts).where(eq(contacts.id, thread.contactId)).get();
    const names = await userNames([
      thread.assignedUserId ?? "",
      ...messages.map((m) => m.sentByUserId ?? ""),
    ]);

    return {
      thread: {
        id: thread.id,
        contactId: thread.contactId,
        contactName: contact
          ? `${contact.firstName} ${contact.lastName}`.trim() || contact.email
          : tr("Kontakt usunięty"),
        channel: thread.channel,
        subject: thread.subject,
        lastPreview: thread.lastPreview,
        lastDirection: thread.lastDirection,
        lastMessageAt: formatDate(thread.lastMessageAt),
        unreadCount: thread.unreadCount,
        status: thread.status,
        assignedUserId: thread.assignedUserId,
        assignedName: thread.assignedUserId ? (names.get(thread.assignedUserId) ?? "—") : "",
      },
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        channel: m.channel,
        subject: m.subject,
        body: m.body,
        source: m.source,
        sentByName: m.sentByUserId ? (names.get(m.sentByUserId) ?? "") : "",
        createdAt: formatDate(m.createdAt),
      })),
      contact: contact
        ? {
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            phone: contact.phone,
            tags: contact.tags ?? [],
            dnc: (contact.tags ?? []).some((t) => t.toLowerCase() === DNC_TAG),
          }
        : null,
    };
  });

export const markInboxThreadRead = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ threadId: z.string() }))
  .handler(async ({ data }) => {
    await markThreadRead(data.threadId);
    return { ok: true };
  });

/** Total unread across every open thread — the sidebar badge. */
export const getInboxUnreadCount = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<number> => {
    const db = getDb();
    const row = await db
      .select({ total: sql<number>`coalesce(sum(${inboxThreads.unreadCount}), 0)` })
      .from(inboxThreads)
      .where(eq(inboxThreads.status, "open"))
      .get();
    return Number(row?.total ?? 0);
  });

export const assignInboxThread = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ threadId: z.string(), userId: z.string().nullable() }))
  .handler(async ({ data }) => {
    const db = getDb();
    await db
      .update(inboxThreads)
      .set({ assignedUserId: data.userId })
      .where(eq(inboxThreads.id, data.threadId));
    return { ok: true };
  });

export const setInboxThreadStatus = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ threadId: z.string(), status: z.enum(["open", "closed"]) }))
  .handler(async ({ data }) => {
    const db = getDb();
    await db
      .update(inboxThreads)
      .set({ status: data.status })
      .where(eq(inboxThreads.id, data.threadId));
    return { ok: true };
  });

/**
 * Sends a human's reply and records it on the thread.
 *
 * The do-not-contact tag is enforced here, server-side, for the same reason the
 * PRM_Agent's own send checks it: consent must not depend on a button being
 * hidden in the UI.
 */
export const sendInboxReply = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      threadId: z.string(),
      channel: z.enum(["email", "sms"]),
      subject: z.string().optional(),
      text: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: tr("Sesja wygasła — zaloguj się ponownie.") };

    const db = getDb();
    const thread = await db
      .select()
      .from(inboxThreads)
      .where(eq(inboxThreads.id, data.threadId))
      .get();
    if (!thread) return { ok: false, error: tr("Nie znaleziono rozmowy.") };

    const contact = await db.select().from(contacts).where(eq(contacts.id, thread.contactId)).get();
    if (!contact) return { ok: false, error: tr("Kontakt nie istnieje już w bazie.") };
    // A reply to somebody who wrote to us is 1:1 correspondence, not marketing,
    // so it runs in administrative mode — it does not need a marketing consent.
    // The hard do-not-contact tag still stops it.
    const consent = checkConsent(contact, data.channel, "administrative");
    if (!consent.allowed) {
      return { ok: false, error: consent.reason };
    }

    if (data.channel === "sms") {
      if (!contact.phone) return { ok: false, error: tr("Pacjent nie ma numeru telefonu.") };
      // A reply is the one message the patient is most likely to answer, so it
      // goes from a number when one is configured — an alphanumeric sender
      // would hand them a message they cannot respond to.
      const sender = await resolveReplySmsSender();
      if (!sender) {
        return {
          ok: false,
          error: tr("Brak skonfigurowanego nadawcy SMS — dodaj go w Integracje → SMS API."),
        };
      }
      try {
        await sendSms({ to: contact.phone, fromNumber: sender.value, body: data.text });
      } catch (err) {
        return {
          ok: false,
          error: err instanceof TwilioError ? err.message : String(err),
        };
      }
      await recordOutboundMessage({
        contactId: contact.id,
        channel: "sms",
        subject: "SMS",
        body: data.text,
        source: "manual",
        sentByUserId: user.id,
      });
      return { ok: true };
    }

    if (!contact.email) return { ok: false, error: tr("Pacjent nie ma adresu e-mail.") };
    const settings = await db.select().from(emailSettings).get();
    const subject = (data.subject ?? "").trim() || thread.subject || tr("Wiadomość z kliniki");
    const baseUrl = await getBaseUrl();
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;font-size:14px;color:#111;white-space:pre-wrap">${escapeHtmlText(data.text)}</div></body></html>`;

    // Tracked like any other outgoing mail, so a reply's opens and clicks show
    // up on the patient's timeline next to campaign sends.
    const token = await createTrackedSend({ toEmail: contact.email, subject });
    try {
      await sendEmail({
        to: contact.email,
        fromEmail: settings?.fromEmail ?? "",
        fromName: settings?.fromName ?? "",
        subject,
        html: injectTracking(html, token, baseUrl),
      });
    } catch (err) {
      await deleteTrackedSend(token);
      return { ok: false, error: err instanceof SendGridError ? err.message : String(err) };
    }

    await recordOutboundMessage({
      contactId: contact.id,
      channel: "email",
      subject,
      body: data.text,
      html,
      source: "manual",
      sentByUserId: user.id,
      sendToken: token,
    });
    return { ok: true };
  });

/**
 * Opens (or starts) the conversation with one contact on one channel — what the
 * "Email" and "SMS" buttons on a contact card do. Returns the thread id so the
 * caller can navigate straight to it.
 */
export const startInboxThread = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ contactId: z.string(), channel: z.enum(["email", "sms"]) }))
  .handler(async ({ data }): Promise<{ ok: boolean; threadId?: string; error?: string }> => {
    const contact = await getDb()
      .select()
      .from(contacts)
      .where(eq(contacts.id, data.contactId))
      .get();
    if (!contact) return { ok: false, error: tr("Kontakt nie istnieje.") };
    if (data.channel === "email" && !contact.email) {
      return { ok: false, error: tr("Ten kontakt nie ma adresu e-mail.") };
    }
    if (data.channel === "sms" && !contact.phone) {
      return { ok: false, error: tr("Ten kontakt nie ma numeru telefonu.") };
    }
    // The same gate the reply itself runs through, checked here so the user
    // finds out before typing a message that would be refused on send.
    const consent = checkConsent(contact, data.channel, "administrative");
    if (!consent.allowed) return { ok: false, error: consent.reason };

    const threadId = await openThreadForContact({
      contactId: data.contactId,
      channel: data.channel,
    });
    return { ok: true, threadId };
  });

/** Draft a reply with the model. Costs money, so it is a button, never automatic. */
export const suggestInboxReply = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ threadId: z.string() }))
  .handler(async ({ data }): Promise<{ ok: boolean; text?: string; error?: string }> => {
    return draftInboxReply(data.threadId);
  });

export interface ContactMessage {
  id: string;
  threadId: string;
  direction: InboxDirection;
  channel: InboxChannel;
  subject: string;
  body: string;
  source: string;
  date: string;
}

/**
 * Every message exchanged with one patient. Feeds both the "Wiadomości" tab on
 * the contact card and that card's activity timeline — one query, because they
 * are two views of the same rows.
 */
export const getInboxMessagesForContact = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ contactId: z.string() }))
  .handler(async ({ data }): Promise<ContactMessage[]> => {
    const db = getDb();
    const rows = await db
      .select()
      .from(inboxMessages)
      .where(eq(inboxMessages.contactId, data.contactId))
      .orderBy(desc(inboxMessages.createdAt))
      .limit(100);
    return rows.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      direction: m.direction,
      channel: m.channel,
      subject: m.subject,
      body: m.body,
      source: m.source,
      date: formatDate(m.createdAt),
    }));
  });

/** Inbound-channel setup shown on the Integrations page. */
export const getInboundChannelStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(
    async (): Promise<{
      emailSecret: string;
      eventSecret: string;
      smsConfigured: boolean;
      baseUrl: string;
    }> => {
      const senders = await listSmsSenders();
      return {
        emailSecret: await getInboundEmailSecret(),
        // Sekret Event Webhooka — doręczenia, odbicia i zgłoszenia spamu.
        // Bez niego raporty nie mają skąd wziąć bounce rate.
        eventSecret: await getEventWebhookSecret(),
        // The inbound SMS webhook authenticates with the Twilio auth token from
        // .env; a configured sender number is what tells us the account is set up
        // at all. The token itself never leaves the server.
        smsConfigured: senders.length > 0,
        baseUrl: await getBaseUrl(),
      };
    },
  );

export const rotateInboundEmailWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async (): Promise<{ secret: string }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(tr("Brak sesji."));
    return { secret: await rotateInboundEmailSecret() };
  });

/** Users offered in the "assign to" picker. */
export const listInboxAssignees = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<{ id: string; name: string }[]> => {
    const db = getDb();
    const rows = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(users);
    return rows.map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`.trim() }));
  });
