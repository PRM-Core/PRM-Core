import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  agentDrafts,
  agentScores,
  agentSignals,
  automations,
  contactVisits,
  contacts,
  engineLog,
  inboxThreads,
} from "../db/schema";
import { actorOf, listReason, type Actor } from "./explain";
import type { ListKey } from "./drafts.server";

/**
 * Why — the database side. Two readings of the same facts: one patient,
 * everything the agent thinks and did about them; and the agent's log,
 * every decision with who took it — a person, the agent's rules, or a
 * model.
 */

const SIGNAL_LISTS: ListKey[] = [
  "recall_due",
  "first_visit_no_followup",
  "post_visit_no_reply",
  "drifting",
];

export interface ContactExplanation {
  lists: { key: ListKey; reason: string }[];
  risks: {
    visitId: string;
    startsAt: number | null;
    title: string;
    probability: number;
    reason: string;
  }[];
  messages: {
    id: string;
    kind: string;
    status: string;
    title: string;
    channel: string;
    decidedBy: string;
    updatedAt: number;
  }[];
  triage: {
    threadId: string;
    channel: string;
    urgency: string;
    topic: string;
    owner: string;
    reason: string;
    source: string;
  }[];
  log: LogEntry[];
}

/** Everything the agent holds about one patient, each item with its reason. */
export async function explainContact(
  contactId: string,
  now = Date.now(),
): Promise<ContactExplanation> {
  const db = getDb();
  const contact = await db.select().from(contacts).where(eq(contacts.id, contactId)).get();
  const visits = await db
    .select()
    .from(contactVisits)
    .where(eq(contactVisits.contactId, contactId));
  const starts = visits.map((v) => v.startsAt).filter((s): s is number => s !== null);
  const lastVisitAt = starts.filter((s) => s <= now).sort((a, b) => b - a)[0] ?? null;
  const nextVisitAt =
    visits
      .filter((v) => v.startsAt !== null && v.startsAt > now && v.systemStatus !== "cancelled")
      .map((v) => v.startsAt as number)
      .sort((a, b) => a - b)[0] ?? null;

  // The lists of the latest night: a contact is on a list when its id is in the signal's detail.
  const latestDay = await db
    .select({ day: agentSignals.day })
    .from(agentSignals)
    .orderBy(desc(agentSignals.day))
    .limit(1)
    .get();
  const lists: ContactExplanation["lists"] = [];
  if (latestDay) {
    const rows = await db
      .select()
      .from(agentSignals)
      .where(
        and(
          eq(agentSignals.day, latestDay.day),
          eq(agentSignals.dimension, ""),
          inArray(agentSignals.key, SIGNAL_LISTS),
        ),
      );
    for (const r of rows) {
      const ids = (r.detail as { contactIds?: string[] } | null)?.contactIds ?? [];
      if (ids.includes(contactId))
        lists.push({
          key: r.key as ListKey,
          reason: listReason(r.key as ListKey, { lastVisitAt, nextVisitAt }),
        });
    }
  }
  if (contact && !(contact.phone ?? "").trim())
    lists.push({ key: "no_phone", reason: listReason("no_phone", { lastVisitAt, nextVisitAt }) });

  const scores = await db
    .select()
    .from(agentScores)
    .where(and(eq(agentScores.kind, "no-show"), eq(agentScores.contactId, contactId)));
  const visitOf = new Map(visits.map((v) => [v.id, v]));
  const risks = scores
    .map((s) => {
      const v = s.visitId ? visitOf.get(s.visitId) : undefined;
      return {
        visitId: s.visitId ?? "",
        startsAt: v?.startsAt ?? null,
        title: v?.title ?? "",
        probability: s.score,
        reason: listReason("high_risk", {
          lastVisitAt,
          nextVisitAt: v?.startsAt ?? null,
          probability: s.score,
          factors: s.factors,
        }),
      };
    })
    .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0));

  // Drafts that name this patient: a held automation message, or a campaign audience.
  const drafts = await db
    .select()
    .from(agentDrafts)
    .where(like(agentDrafts.audienceIds, `%"${contactId}"%`))
    .orderBy(desc(agentDrafts.updatedAt))
    .limit(20);
  const messages = drafts
    .filter((d) => d.audienceIds.includes(contactId))
    .map((d) => ({
      id: d.id,
      kind: d.kind,
      status: d.status,
      title: d.title,
      channel: d.channel,
      decidedBy: d.decidedBy,
      updatedAt: d.updatedAt,
    }));

  const threads = await db
    .select()
    .from(inboxThreads)
    .where(and(eq(inboxThreads.contactId, contactId), sql`${inboxThreads.triageUrgency} != ''`));
  const triage = threads.map((th) => ({
    threadId: th.id,
    channel: th.channel,
    urgency: th.triageUrgency,
    topic: th.triageTopic,
    owner: th.triageOwner,
    reason: th.triageReason,
    source: th.triageSource,
  }));

  const log = await agentLog({ contactId, limit: 30 });
  return { lists, risks, messages, triage, log };
}

export interface LogEntry {
  id: string;
  createdAt: number;
  actor: Actor;
  message: string;
  contactId: string | null;
  contactName: string;
  automationId: string | null;
  automationName: string;
  /** Where to look next: a draft, a direction, a conversation. */
  draftId: string;
  directionKey: string;
  threadId: string;
}

/** The agent's log: its own entries and its model calls, newest first, with who and where. */
export async function agentLog(
  input: {
    actor?: Actor | "all";
    contactId?: string;
    limit?: number;
  } = {},
): Promise<LogEntry[]> {
  const db = getDb();
  const limit = Math.min(input.limit ?? 200, 500);
  const conditions = [
    or(
      eq(engineLog.kind, "agent"),
      eq(engineLog.kind, "ai"),
      like(engineLog.detail, '%"review":"rejected"%'),
    ),
  ];
  if (input.contactId) conditions.push(eq(engineLog.contactId, input.contactId));
  // Filtering by actor in SQL would mean parsing JSON there; the log is read
  // in pages of a few hundred, so a wider page filtered here costs nothing.
  const rows = await db
    .select()
    .from(engineLog)
    .where(and(...conditions))
    .orderBy(desc(engineLog.createdAt))
    .limit(input.actor && input.actor !== "all" ? limit * 4 : limit);
  const picked = rows
    .filter(
      (r) => !input.actor || input.actor === "all" || actorOf(r.kind, r.detail) === input.actor,
    )
    .slice(0, limit);

  const contactIds = [...new Set(picked.map((r) => r.contactId).filter((x): x is string => !!x))];
  const automationIds = [
    ...new Set(
      picked
        .map((r) => r.automationId ?? r.detail?.automationId ?? "")
        .filter((x): x is string => !!x),
    ),
  ];
  const people = contactIds.length
    ? await db
        .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(inArray(contacts.id, contactIds))
    : [];
  const autos = automationIds.length
    ? await db
        .select({ id: automations.id, name: automations.name })
        .from(automations)
        .where(inArray(automations.id, automationIds))
    : [];
  const nameOf = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]));
  const autoOf = new Map(autos.map((a) => [a.id, a.name]));

  return picked.map((r) => {
    const automationId = r.automationId ?? r.detail?.automationId ?? null;
    return {
      id: r.id,
      createdAt: r.createdAt,
      actor: actorOf(r.kind, r.detail),
      message: r.message,
      contactId: r.contactId,
      contactName: r.contactId ? (nameOf.get(r.contactId) ?? "") : "",
      automationId,
      automationName: automationId ? (autoOf.get(automationId) ?? "") : "",
      draftId: r.detail?.draftId ?? "",
      directionKey: r.detail?.source === "agent-direction" ? (r.detail?.key ?? "") : "",
      threadId: r.detail?.threadId ?? "",
    };
  });
}
