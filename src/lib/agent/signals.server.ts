import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  agentModels,
  agentScores,
  agentSignals,
  appSettings,
  contactVisits,
  contacts,
  emailEvents,
  emailSends,
  inboxMessages,
  type AgentSignalRow,
  type ContactVisitRow,
} from "../db/schema";
import { effectiveState } from "../booking-system/status";
import { warsawDay, warsawMinuteOfDay } from "../visits/warsaw-time";
import { logStep } from "../engine/log.server";
import { scoreNoShow, trainNoShow, type NoShowModel, type VisitFeatures } from "./predict/no-show";
import { recommendFromSignals } from "./drafts.server";
import { t } from "@/lib/i18n";

/**
 * PRM_Agent — the signals layer. Reads what the installation already holds
 * (visits, sends, replies) and answers the questions the agent is for:
 * how are patients responding, who is drifting, who is due, who is at risk
 * of not showing up. No model is involved; the no-show score comes from a
 * small regression trained here on the same data.
 *
 * Runs once a night on the engine clock (`maybeRunAgentNightly`) and on
 * demand from the dashboard. Everything it computes is a row in
 * `agent_signals` or `agent_scores`, so a screen reads a number instead of
 * recomputing it, and the number and the list behind it are the same thing.
 */

const DAY = 24 * 60 * 60 * 1000;
export const WINDOW_DAYS = 30;
export const RECALL_DAYS = 365;
export const DRIFT_DAYS = 180;
export const FOLLOW_UP_DAYS = 7;
const LIST_CAP = 200;
const KEEP_DAYS = 90;
const NIGHTLY_HOUR = 2;
const MARKER_KEY = "agent.nightly.day";

export type SignalKey =
  | "visits.completed"
  | "visits.no_show"
  | "visits.cancelled"
  | "no_show_rate"
  | "email.open_rate"
  | "email.click_rate"
  | "inbox.inbound"
  | "recall_due"
  | "first_visit_no_followup"
  | "post_visit_no_reply"
  | "drifting";

interface SignalDraft {
  key: SignalKey;
  dimension?: string;
  value: number;
  previous?: number | null;
  count?: number;
  detail?: Record<string, unknown>;
}

/** A visit that happened or did not — cancelled and unknown ones are neither. */
function outcome(v: ContactVisitRow, now: number): 0 | 1 | null {
  if (v.startsAt === null) return null;
  const state = effectiveState(v.systemStatus, v.startsAt, now);
  if (state === "no_show") return 1;
  if (state === "completed" || state === "started" || state === "waiting") return 0;
  return null;
}

const isUpcoming = (v: ContactVisitRow, now: number) =>
  v.startsAt !== null && v.startsAt > now && v.systemStatus !== "cancelled";

const warsawParts = (ms: number) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "numeric",
    weekday: "short",
    hour12: false,
  }).formatToParts(new Date(ms));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 12) % 24;
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Wed";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return { hour, weekday: weekday < 0 ? 3 : weekday };
};

/** The features of one visit, from the contact and the contact's earlier visits. */
export function visitFeatures(
  v: ContactVisitRow,
  contact: { phone: string; consentSms: number; createdAt: string },
  earlier: ContactVisitRow[],
  now: number,
): VisitFeatures {
  const startsAt = v.startsAt ?? now;
  const decided = earlier
    .filter((e) => e.startsAt !== null && e.startsAt < startsAt)
    .map((e) => outcome(e, now))
    .filter((o): o is 0 | 1 => o !== null);
  const created = Date.parse(contact.createdAt) || v.createdAt;
  const { hour, weekday } = warsawParts(startsAt);
  return {
    leadDays: Math.max(0, (startsAt - v.createdAt) / DAY),
    hour,
    weekday,
    priorVisits: decided.length,
    priorNoShows: decided.filter((o) => o === 1).length,
    bookedOnline: /www|online|webhook|form|rezerwacj/i.test(v.source),
    hasPhone: !!contact.phone,
    consentSms: contact.consentSms === 1,
    daysInBase: Math.max(0, (v.createdAt - created) / DAY),
  };
}

const rate = (num: number, den: number) => (den > 0 ? num / den : 0);

/** Compute every signal for `now`. Pure over the rows it is given — testable without the clock. */
export function deriveSignals(input: {
  now: number;
  contacts: { id: string; status: string; email: string; createdAt: string }[];
  visits: ContactVisitRow[];
  sends: { token: string; toEmail: string; sentAt: number }[];
  events: { token: string; kind: string; occurredAt: number }[];
  inbound: { contactId: string; createdAt: number }[];
}): SignalDraft[] {
  const { now, contacts: people, visits, sends, events, inbound } = input;
  const windowStart = now - WINDOW_DAYS * DAY;
  const prevStart = windowStart - WINDOW_DAYS * DAY;
  const out: SignalDraft[] = [];

  // ── visits in the window, and the window before ──────────────────────────
  const inWindow = (v: ContactVisitRow, from: number, to: number) =>
    v.startsAt !== null && v.startsAt >= from && v.startsAt < to;
  const tally = (from: number, to: number, pick: (v: ContactVisitRow) => boolean) =>
    visits.filter((v) => inWindow(v, from, to) && pick(v)).length;
  const completedNow = tally(windowStart, now, (v) => outcome(v, now) === 0);
  const completedPrev = tally(prevStart, windowStart, (v) => outcome(v, now) === 0);
  const noShowNow = tally(windowStart, now, (v) => outcome(v, now) === 1);
  const noShowPrev = tally(prevStart, windowStart, (v) => outcome(v, now) === 1);
  const cancelledNow = tally(windowStart, now, (v) => v.systemStatus === "cancelled");
  const cancelledPrev = tally(prevStart, windowStart, (v) => v.systemStatus === "cancelled");
  out.push({ key: "visits.completed", value: completedNow, previous: completedPrev });
  out.push({ key: "visits.no_show", value: noShowNow, previous: noShowPrev });
  out.push({ key: "visits.cancelled", value: cancelledNow, previous: cancelledPrev });
  out.push({
    key: "no_show_rate",
    value: rate(noShowNow, noShowNow + completedNow),
    previous: noShowPrev + completedPrev > 0 ? rate(noShowPrev, noShowPrev + completedPrev) : null,
    count: noShowNow + completedNow,
  });

  // By doctor and by specialisation — only where the sample means something.
  for (const dim of ["doctor", "specialization"] as const) {
    const names = new Set(visits.map((v) => v[dim]).filter(Boolean));
    for (const name of names) {
      const pick = (v: ContactVisitRow) => v[dim] === name;
      const ns = tally(windowStart, now, (v) => pick(v) && outcome(v, now) === 1);
      const ok = tally(windowStart, now, (v) => pick(v) && outcome(v, now) === 0);
      if (ns + ok < 10) continue;
      const nsPrev = tally(prevStart, windowStart, (v) => pick(v) && outcome(v, now) === 1);
      const okPrev = tally(prevStart, windowStart, (v) => pick(v) && outcome(v, now) === 0);
      out.push({
        key: "no_show_rate",
        dimension: `${dim}:${name}`,
        value: rate(ns, ns + ok),
        previous: nsPrev + okPrev >= 10 ? rate(nsPrev, nsPrev + okPrev) : null,
        count: ns + ok,
      });
    }
  }

  // ── e-mail response ──────────────────────────────────────────────────────
  const emailRate = (kind: "open" | "click", from: number, to: number) => {
    const tokens = new Set(
      sends.filter((s) => s.sentAt >= from && s.sentAt < to).map((s) => s.token),
    );
    if (tokens.size === 0) return null;
    const hit = new Set(
      events.filter((e) => e.kind === kind && tokens.has(e.token)).map((e) => e.token),
    );
    return { value: hit.size / tokens.size, count: tokens.size };
  };
  for (const kind of ["open", "click"] as const) {
    const cur = emailRate(kind, windowStart, now);
    const prev = emailRate(kind, prevStart, windowStart);
    out.push({
      key: kind === "open" ? "email.open_rate" : "email.click_rate",
      value: cur?.value ?? 0,
      previous: prev?.value ?? null,
      count: cur?.count ?? 0,
    });
  }
  out.push({
    key: "inbox.inbound",
    value: inbound.filter((m) => m.createdAt >= windowStart && m.createdAt < now).length,
    previous: inbound.filter((m) => m.createdAt >= prevStart && m.createdAt < windowStart).length,
  });

  // ── who needs attention ──────────────────────────────────────────────────
  const byContact = new Map<string, ContactVisitRow[]>();
  for (const v of visits) {
    const list = byContact.get(v.contactId) ?? [];
    list.push(v);
    byContact.set(v.contactId, list);
  }
  const lastInbound = new Map<string, number>();
  for (const m of inbound)
    lastInbound.set(m.contactId, Math.max(lastInbound.get(m.contactId) ?? 0, m.createdAt));

  const recallDue: string[] = [];
  const firstNoFollowUp: string[] = [];
  const postVisitNoReply: string[] = [];
  for (const [contactId, list] of byContact) {
    const completed = list.filter((v) => outcome(v, now) === 0 && v.startsAt !== null);
    if (completed.length === 0) continue;
    const upcoming = list.some((v) => isUpcoming(v, now));
    if (upcoming) continue;
    const last = Math.max(...completed.map((v) => v.startsAt as number));
    if (now - last >= RECALL_DAYS * DAY) recallDue.push(contactId);
    if (completed.length === 1 && now - last >= 30 * DAY && now - last < RECALL_DAYS * DAY) {
      firstNoFollowUp.push(contactId);
    }
    if (now - last < FOLLOW_UP_DAYS * DAY && (lastInbound.get(contactId) ?? 0) < last) {
      postVisitNoReply.push(contactId);
    }
  }
  const listSignal = (key: SignalKey, ids: string[]): SignalDraft => ({
    key,
    value: ids.length,
    count: ids.length,
    detail: { contactIds: ids.slice(0, LIST_CAP) },
  });
  out.push(listSignal("recall_due", recallDue));
  out.push(listSignal("first_visit_no_followup", firstNoFollowUp));
  out.push(listSignal("post_visit_no_reply", postVisitNoReply));

  // Drifting: a patient with no sign of life in half a year.
  const lastEmailActivity = new Map<string, number>();
  const tokenToEmail = new Map(sends.map((s) => [s.token, s.toEmail.toLowerCase()]));
  for (const e of events) {
    if (e.kind !== "open" && e.kind !== "click") continue;
    const email = tokenToEmail.get(e.token);
    if (!email) continue;
    lastEmailActivity.set(email, Math.max(lastEmailActivity.get(email) ?? 0, e.occurredAt));
  }
  const drifting: string[] = [];
  for (const c of people) {
    if (c.status !== "patient" && c.status !== "active") continue;
    const visitsOf = byContact.get(c.id) ?? [];
    const lastVisit = Math.max(0, ...visitsOf.map((v) => v.startsAt ?? 0).filter((s) => s <= now));
    const lastSeen = Math.max(
      lastVisit,
      lastInbound.get(c.id) ?? 0,
      lastEmailActivity.get(c.email.toLowerCase()) ?? 0,
      Date.parse(c.createdAt) || 0,
    );
    if (now - lastSeen >= DRIFT_DAYS * DAY) drifting.push(c.id);
  }
  out.push(listSignal("drifting", drifting));

  return out;
}

async function loadInputs(now: number) {
  const db = getDb();
  const since = now - (RECALL_DAYS + 30) * DAY;
  const [people, visits, sends, inbound] = await Promise.all([
    db
      .select({
        id: contacts.id,
        status: contacts.status,
        email: contacts.email,
        createdAt: contacts.createdAt,
        phone: contacts.phone,
        consentSms: contacts.consentSms,
      })
      .from(contacts),
    db.select().from(contactVisits),
    db
      .select({ token: emailSends.token, toEmail: emailSends.toEmail, sentAt: emailSends.sentAt })
      .from(emailSends)
      .where(gte(emailSends.sentAt, since)),
    db
      .select({ contactId: inboxMessages.contactId, createdAt: inboxMessages.createdAt })
      .from(inboxMessages)
      .where(and(eq(inboxMessages.direction, "in"), gte(inboxMessages.createdAt, since))),
  ]);
  const tokens = sends.map((s) => s.token);
  const events: { token: string; kind: string; occurredAt: number }[] = [];
  for (let i = 0; i < tokens.length; i += 500) {
    const part = tokens.slice(i, i + 500);
    events.push(
      ...(await db
        .select({
          token: emailEvents.token,
          kind: emailEvents.kind,
          occurredAt: emailEvents.occurredAt,
        })
        .from(emailEvents)
        .where(inArray(emailEvents.token, part))),
    );
  }
  return { people, visits, sends, inbound, events };
}

/** Compute and store today's signals. Returns what was stored. */
export async function computeSignals(now = Date.now()): Promise<AgentSignalRow[]> {
  const db = getDb();
  const day = warsawDay(now);
  const { people, visits, sends, inbound, events } = await loadInputs(now);
  const drafts = deriveSignals({ now, contacts: people, visits, sends, events, inbound });

  // Yesterday's lists give the trend for counts that have no window.
  const yesterday = await db
    .select()
    .from(agentSignals)
    .where(and(lt(agentSignals.day, day), eq(agentSignals.dimension, "")))
    .orderBy(desc(agentSignals.day))
    .limit(50);
  const prevOf = new Map<string, number>();
  for (const row of yesterday) if (!prevOf.has(row.key)) prevOf.set(row.key, row.value);

  await db.delete(agentSignals).where(eq(agentSignals.day, day));
  await db.delete(agentSignals).where(lt(agentSignals.day, warsawDay(now - KEEP_DAYS * DAY)));
  const rows = drafts.map((d) => ({
    id: randomUUID(),
    day,
    key: d.key,
    dimension: d.dimension ?? "",
    value: d.value,
    previous: d.previous === undefined ? (prevOf.get(d.key) ?? null) : d.previous,
    count: d.count ?? Math.round(d.value),
    detail: d.detail ?? null,
    computedAt: now,
  }));
  if (rows.length > 0) await db.insert(agentSignals).values(rows);
  return rows;
}

/** Train the no-show model on decided visits and score the upcoming ones. */
export async function trainAndScoreNoShow(now = Date.now()): Promise<NoShowModel> {
  const db = getDb();
  const [visits, people] = await Promise.all([
    db.select().from(contactVisits),
    db
      .select({
        id: contacts.id,
        phone: contacts.phone,
        consentSms: contacts.consentSms,
        createdAt: contacts.createdAt,
      })
      .from(contacts),
  ]);
  const byContact = new Map<string, ContactVisitRow[]>();
  for (const v of visits) byContact.set(v.contactId, [...(byContact.get(v.contactId) ?? []), v]);
  const person = new Map(people.map((p) => [p.id, p]));

  const examples: { features: VisitFeatures; label: 0 | 1 }[] = [];
  for (const v of visits) {
    const label = outcome(v, now);
    const c = person.get(v.contactId);
    if (label === null || !c) continue;
    examples.push({ features: visitFeatures(v, c, byContact.get(v.contactId) ?? [], now), label });
  }
  const model = trainNoShow(examples);
  await db
    .insert(agentModels)
    .values({
      id: "no-show",
      trainedAt: now,
      samples: examples.length,
      params: model as unknown as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: agentModels.id,
      set: {
        trainedAt: now,
        samples: examples.length,
        params: model as unknown as Record<string, unknown>,
      },
    });

  await db.delete(agentScores).where(eq(agentScores.kind, "no-show"));
  const horizon = now + WINDOW_DAYS * DAY;
  const scores = visits
    .filter(
      (v) => isUpcoming(v, now) && (v.startsAt as number) <= horizon && person.has(v.contactId),
    )
    .map((v) => {
      const s = scoreNoShow(
        model,
        visitFeatures(v, person.get(v.contactId)!, byContact.get(v.contactId) ?? [], now),
      );
      return {
        id: `no-show:${v.id}`,
        kind: "no-show",
        contactId: v.contactId,
        visitId: v.id,
        score: s.probability,
        factors: s.factors,
        computedAt: now,
      };
    });
  for (let i = 0; i < scores.length; i += 200)
    await db.insert(agentScores).values(scores.slice(i, i + 200));
  return model;
}

/** The whole nightly run: signals, then the model and the scores. */
export async function runAgentNightly(
  now = Date.now(),
): Promise<{ signals: number; model: NoShowModel; recommendations: number }> {
  const rows = await computeSignals(now);
  const model = await trainAndScoreNoShow(now);
  // Recommendations read the scores, so they come after the model.
  const recs = await recommendFromSignals(rows, now);
  await logStep({
    kind: "agent",
    message: t(
      "PRM_Agent policzył sygnały: {n} wskaźników, model nieobecności z {m} wizyt ({mode}).",
      {
        n: rows.length,
        m: model.samples,
        mode:
          model.mode === "trained" ? t("nauczony") : t("sama częstość bazowa — za mało historii"),
      },
    ),
    detail: { source: "agent-nightly", dzien: warsawDay(now), mode: model.mode },
  });
  return { signals: rows.length, model, recommendations: recs.length };
}

/** On the engine clock: once a day, after 02:00 Warsaw time. Never throws. */
export async function maybeRunAgentNightly(now = Date.now()): Promise<boolean> {
  if (warsawMinuteOfDay(now) < NIGHTLY_HOUR * 60) return false;
  const db = getDb();
  const today = warsawDay(now);
  const marker = await db.select().from(appSettings).where(eq(appSettings.key, MARKER_KEY)).get();
  if (marker?.value === today) return false;
  await db
    .insert(appSettings)
    .values({ key: MARKER_KEY, value: today })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: today } });
  try {
    await runAgentNightly(now);
  } catch (err) {
    await logStep({
      kind: "error",
      message: t("PRM_Agent: nocne liczenie sygnałów nie powiodło się: {err}", {
        err: String(err),
      }),
      detail: { source: "agent-nightly", dzien: today },
    });
  }
  return true;
}

/** The latest computed day's signals, grouped for a screen. */
export async function latestSignals(): Promise<{
  day: string;
  computedAt: number;
  rows: AgentSignalRow[];
} | null> {
  const db = getDb();
  const last = await db
    .select({ day: agentSignals.day })
    .from(agentSignals)
    .orderBy(desc(agentSignals.day))
    .limit(1)
    .get();
  if (!last) return null;
  const rows = await db.select().from(agentSignals).where(eq(agentSignals.day, last.day));
  return { day: last.day, computedAt: Math.max(...rows.map((r) => r.computedAt)), rows };
}
