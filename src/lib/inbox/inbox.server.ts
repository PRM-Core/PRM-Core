import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contacts, inboxMessages, inboxThreads, inboxWebhookSettings } from "../db/schema";
import type { ContactRow, InboxChannel, InboxThreadRow } from "../db/schema";
import { emitEvent } from "../engine/events.server";

// The omnichannel inbox's write side. Every conversation with a patient —
// whatever channel carried it — lands here, and this is the only module that
// creates threads or appends messages.
//
// Server-only (`.server.ts`): `randomUUID` from node:crypto blows up the page
// if it reaches the client bundle. This is the
// fifth module to need the split, so it starts on the right side of it.

/** How much of a message the thread list shows before the reader opens it. */
const PREVIEW_LIMIT = 140;

export interface RecordMessageInput {
  contactId: string;
  channel: InboxChannel;
  /** Plain text. Callers holding only HTML should pass it through `htmlToText` first. */
  body: string;
  html?: string | null;
  subject?: string;
  /** "form" | "survey" | "sms" | "email" | "agent" | "manual" */
  source: string;
  /** Provider id (Twilio MessageSid, SendGrid message id) — makes webhook retries idempotent. */
  externalId?: string | null;
  sentByUserId?: string | null;
  sendToken?: string | null;
  occurredAt?: number;
}

export interface RecordMessageResult {
  threadId: string;
  messageId: string;
  /** True when `externalId` had already been recorded — the caller should not act again. */
  duplicate: boolean;
}

function preview(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LIMIT ? `${flat.slice(0, PREVIEW_LIMIT - 1)}…` : flat;
}

/**
 * Strips tags well enough for a preview and for feeding an AI draft. This is
 * deliberately not a parser: the original HTML is stored alongside, so nothing
 * is lost if this gets a message wrong.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * An e-mail reply carries the whole previous message quoted underneath. Showing
 * that in a thread that already contains the original is noise, so the common
 * quote markers cut it off. Anything unrecognised is left alone — truncating a
 * patient's actual words would be far worse than showing a quote.
 */
export function stripQuotedReply(text: string): string {
  const markers = [
    /^-{2,}\s*Original Message\s*-{2,}$/im,
    /^_{5,}$/m,
    /^On .+ wrote:$/im,
    /^(W dniu|Dnia) .+ (napisał|napisała|pisze).*:$/im,
    /^Od:\s.+$/im,
    /^From:\s.+$/im,
  ];
  let cut = text.length;
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match && match.index < cut) cut = match.index;
  }
  const head = text.slice(0, cut).trim();
  // A reply that is *only* a quote (no new text above it) keeps the original —
  // an empty bubble tells the receptionist nothing.
  return head.length > 0 ? head : text.trim();
}

/**
 * The open thread for this contact on this channel, creating one if needed.
 * An inbound message reopens a closed conversation: the patient writing again
 * is precisely the event that makes it live.
 */
async function ensureThread(input: {
  contactId: string;
  channel: InboxChannel;
  subject: string;
  at: number;
}): Promise<InboxThreadRow> {
  const db = getDb();
  const existing = await db
    .select()
    .from(inboxThreads)
    .where(
      and(eq(inboxThreads.contactId, input.contactId), eq(inboxThreads.channel, input.channel)),
    )
    .orderBy(desc(inboxThreads.lastMessageAt))
    .get();
  if (existing) return existing;

  const row = {
    id: randomUUID(),
    contactId: input.contactId,
    channel: input.channel,
    subject: input.subject,
    lastPreview: "",
    lastDirection: "in" as const,
    lastMessageAt: input.at,
    unreadCount: 0,
    status: "open" as const,
    assignedUserId: null,
    createdAt: input.at,
  };
  await db.insert(inboxThreads).values(row);
  return row;
}

/**
 * The thread to open when somebody presses "Email"/"SMS" on a contact card.
 *
 * Reuses the conversation if there is one, and starts an empty one if there is
 * not — the alternative was two buttons that did nothing until the patient
 * wrote first, which is backwards for an office that wants to reach out.
 */
export async function openThreadForContact(input: {
  contactId: string;
  channel: InboxChannel;
}): Promise<string> {
  const thread = await ensureThread({
    contactId: input.contactId,
    channel: input.channel,
    subject: "",
    at: Date.now(),
  });
  return thread.id;
}

async function appendMessage(
  input: RecordMessageInput,
  direction: "in" | "out",
): Promise<RecordMessageResult> {
  const db = getDb();
  const at = input.occurredAt ?? Date.now();

  // Dedup before anything else: a retried webhook must not bump the thread,
  // raise the unread count, or emit a second engine event.
  if (input.externalId) {
    const seen = await db
      .select({ id: inboxMessages.id, threadId: inboxMessages.threadId })
      .from(inboxMessages)
      .where(eq(inboxMessages.externalId, input.externalId))
      .get();
    if (seen) return { threadId: seen.threadId, messageId: seen.id, duplicate: true };
  }

  const thread = await ensureThread({
    contactId: input.contactId,
    channel: input.channel,
    subject: input.subject ?? "",
    at,
  });

  const messageId = randomUUID();
  await db.insert(inboxMessages).values({
    id: messageId,
    threadId: thread.id,
    contactId: input.contactId,
    direction,
    channel: input.channel,
    subject: input.subject ?? "",
    body: input.body,
    html: input.html ?? null,
    source: input.source,
    externalId: input.externalId ?? null,
    sentByUserId: input.sentByUserId ?? null,
    sendToken: input.sendToken ?? null,
    createdAt: at,
    // Our own outgoing messages are never "unread" — nobody has to open what
    // this office just sent.
    readAt: direction === "out" ? at : null,
  });

  await db
    .update(inboxThreads)
    .set({
      lastPreview: preview(input.body),
      lastDirection: direction,
      lastMessageAt: at,
      subject: thread.subject || (input.subject ?? ""),
      status: "open",
      unreadCount:
        direction === "in" ? sql`${inboxThreads.unreadCount} + 1` : inboxThreads.unreadCount,
    })
    .where(eq(inboxThreads.id, thread.id));

  return { threadId: thread.id, messageId, duplicate: false };
}

/**
 * A patient wrote to us. Also puts `contact.message_received` on the engine bus,
 * which is what finally gives the "Wiadomość od pacjenta" trigger a real source.
 */
export async function recordInboundMessage(
  input: RecordMessageInput,
): Promise<RecordMessageResult> {
  const result = await appendMessage(input, "in");
  if (!result.duplicate) {
    await emitEvent({
      type: "contact.message_received",
      contactId: input.contactId,
      payload: {
        channel: input.channel,
        source: input.source,
        threadId: result.threadId,
        preview: preview(input.body),
      },
    });
  }
  return result;
}

/**
 * We wrote to the patient. Deliberately NOT called by the engine's campaign
 * actions (`send_email`, `send_newsletter`, `send_sms`): a newsletter going out
 * to everyone is not a conversation, and dropping every blast into the inbox
 * would bury the handful of threads that actually need a human reply. Replies
 * typed here and messages the PRM_Agent writes to one patient do belong.
 */
export async function recordOutboundMessage(
  input: RecordMessageInput,
): Promise<RecordMessageResult> {
  return appendMessage(input, "out");
}

export async function markThreadRead(threadId: string): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db
    .update(inboxMessages)
    .set({ readAt: now })
    .where(and(eq(inboxMessages.threadId, threadId), isNull(inboxMessages.readAt)));
  await db.update(inboxThreads).set({ unreadCount: 0 }).where(eq(inboxThreads.id, threadId));
}

// ── contact matching ────────────────────────────────────────────────────────

/**
 * Compares phone numbers by their last 9 digits. Polish mobiles are 9 digits and
 * the same person shows up as "+48 600 123 456", "600123456" and "0048600123456"
 * depending on who typed it — matching on the raw string would strand half the
 * replies as unknown senders.
 */
function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-9);
}

/** The phone column with the separators people actually type stripped out, in SQL. */
const strippedPhone = sql`replace(replace(replace(replace(replace(${contacts.phone}, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')`;

export async function findContactByPhone(phone: string): Promise<ContactRow | null> {
  const key = phoneKey(phone);
  if (key.length < 9) return null;
  const db = getDb();
  const row = await db
    .select()
    .from(contacts)
    .where(sql`${strippedPhone} LIKE ${`%${key}`}`)
    .get();
  return row ?? null;
}

export async function findContactByEmail(email: string): Promise<ContactRow | null> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return null;
  const db = getDb();
  const row = await db
    .select()
    .from(contacts)
    .where(sql`lower(trim(${contacts.email})) = ${normalised}`)
    .get();
  return row ?? null;
}

/**
 * Pulls the bare address out of a From header — inbound mail arrives as
 * `Anna Kowalska <anna@example.com>` far more often than as a plain address.
 */
export function parseEmailAddress(raw: string): string {
  const angled = /<([^>]+)>/.exec(raw);
  return (angled ? angled[1] : raw).trim().toLowerCase();
}

// ── webhook secret ──────────────────────────────────────────────────────────

export async function getInboundEmailSecret(): Promise<string> {
  const db = getDb();
  const row = await db.select().from(inboxWebhookSettings).get();
  if (row) return row.emailSecret;

  const secret = randomUUID().replace(/-/g, "");
  await db
    .insert(inboxWebhookSettings)
    .values({ emailSecret: secret, updatedAt: new Date().toISOString() });
  return secret;
}

export async function rotateInboundEmailSecret(): Promise<string> {
  const db = getDb();
  const secret = randomUUID().replace(/-/g, "");
  const existing = await db.select().from(inboxWebhookSettings).get();
  if (existing) {
    await db
      .update(inboxWebhookSettings)
      .set({ emailSecret: secret, updatedAt: new Date().toISOString() })
      .where(eq(inboxWebhookSettings.id, existing.id));
  } else {
    await db
      .insert(inboxWebhookSettings)
      .values({ emailSecret: secret, updatedAt: new Date().toISOString() });
  }
  return secret;
}
