import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  agentScores,
  contactVisits,
  contacts,
  emailEvents,
  emailSends,
  inboxMessages,
  inboxThreads,
  smsSends,
} from "../db/schema";
import { outcome } from "./signals.server";
import { preview, summarize, type SummaryFacts } from "./summary";

/**
 * The facts behind the three-sentence summary, from visits and
 * correspondence only: the visit history and what is booked, the patient's
 * last message and whether it was answered, the clinic's last message to
 * them and whether it was opened.
 */
export async function summaryFacts(
  contactId: string,
  now = Date.now(),
): Promise<SummaryFacts | null> {
  const db = getDb();
  const contact = await db.select().from(contacts).where(eq(contacts.id, contactId)).get();
  if (!contact) return null;

  const visits = await db
    .select()
    .from(contactVisits)
    .where(eq(contactVisits.contactId, contactId));
  let completed = 0;
  let noShows = 0;
  let cancelled = 0;
  let firstVisitAt: number | null = null;
  let lastVisit: SummaryFacts["lastVisit"] = null;
  for (const v of visits) {
    if (v.systemStatus === "cancelled") cancelled += 1;
    const o = outcome(v, now);
    if (o === 1) noShows += 1;
    if (o === 0 && v.startsAt !== null) {
      completed += 1;
      if (firstVisitAt === null || v.startsAt < firstVisitAt) firstVisitAt = v.startsAt;
      if (!lastVisit || v.startsAt > lastVisit.at)
        lastVisit = { at: v.startsAt, title: v.title, doctor: v.doctor };
    }
  }
  const upcoming = visits
    .filter((v) => v.startsAt !== null && v.startsAt > now && v.systemStatus !== "cancelled")
    .sort((a, b) => (a.startsAt as number) - (b.startsAt as number))[0];
  let nextVisit: SummaryFacts["nextVisit"] = null;
  if (upcoming) {
    const score = await db
      .select({ score: agentScores.score })
      .from(agentScores)
      .where(and(eq(agentScores.kind, "no-show"), eq(agentScores.visitId, upcoming.id)))
      .get();
    nextVisit = {
      at: upcoming.startsAt as number,
      title: upcoming.title,
      doctor: upcoming.doctor,
      risk: score?.score ?? null,
    };
  }

  const inbound = await db
    .select()
    .from(inboxMessages)
    .where(and(eq(inboxMessages.contactId, contactId), eq(inboxMessages.direction, "in")))
    .orderBy(desc(inboxMessages.createdAt))
    .limit(1)
    .get();
  let lastInbound: SummaryFacts["lastInbound"] = null;
  let openTriage: SummaryFacts["openTriage"] = null;
  if (inbound) {
    const replied = await db
      .select({ id: inboxMessages.id, createdAt: inboxMessages.createdAt })
      .from(inboxMessages)
      .where(and(eq(inboxMessages.threadId, inbound.threadId), eq(inboxMessages.direction, "out")))
      .orderBy(desc(inboxMessages.createdAt))
      .limit(1)
      .get();
    lastInbound = {
      at: inbound.createdAt,
      channel: inbound.channel,
      preview: preview(inbound.body),
      answered: !!replied && replied.createdAt > inbound.createdAt,
    };
    const thread = await db
      .select()
      .from(inboxThreads)
      .where(eq(inboxThreads.id, inbound.threadId))
      .get();
    if (thread && thread.status === "open" && thread.triageUrgency)
      openTriage = { urgency: thread.triageUrgency, topic: thread.triageTopic };
  }

  const email = contact.email
    ? await db
        .select()
        .from(emailSends)
        .where(eq(emailSends.toEmail, contact.email))
        .orderBy(desc(emailSends.sentAt))
        .limit(1)
        .get()
    : undefined;
  const sms = await db
    .select()
    .from(smsSends)
    .where(eq(smsSends.contactId, contactId))
    .orderBy(desc(smsSends.sentAt))
    .limit(1)
    .get();
  let lastOutbound: SummaryFacts["lastOutbound"] = null;
  if (email && (!sms || email.sentAt >= sms.sentAt)) {
    const opened = await db
      .select({ token: emailEvents.token })
      .from(emailEvents)
      .where(and(eq(emailEvents.token, email.token), inArray(emailEvents.kind, ["open", "click"])))
      .limit(1)
      .get();
    lastOutbound = { at: email.sentAt, channel: "email", subject: email.subject, opened: !!opened };
  } else if (sms) {
    lastOutbound = { at: sms.sentAt, channel: "sms", subject: "", opened: null };
  }

  return {
    completed,
    noShows,
    cancelled,
    firstVisitAt,
    lastVisit,
    nextVisit,
    lastInbound,
    openTriage,
    lastOutbound,
  };
}

/** The three sentences, or null when the contact is gone. */
export async function patientSummary(
  contactId: string,
  now = Date.now(),
): Promise<string[] | null> {
  const facts = await summaryFacts(contactId, now);
  return facts ? summarize(facts) : null;
}
