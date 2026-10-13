import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  agentDrafts,
  agentScores,
  agentSignals,
  contacts,
  contactVisits,
  type AgentDraftRow,
  type AgentSignalRow,
} from "../db/schema";
import { saveInsights, type InsightDraft } from "../engine/supervisor.server";
import { applySegmentChange } from "../engine/actions.server";
import { ensureLabelSegment } from "../segments/segments.server";
import { createCampaign } from "../campaigns/campaigns.server";
import { getSnapshot } from "../engine/snapshots.server";
import { logStep } from "../engine/log.server";
import { deriveRecommendations, type Recommendation } from "./recommend";
import { t } from "@/lib/i18n";

/**
 * Recommendations and drafts — what the signals layer proposes, and the one
 * place a person's decision is recorded.
 *
 * A recommendation is a supervisor finding (same table, same panel, same
 * bell) with an `agent:` signature. A draft is a campaign waiting for
 * approval: the audience behind a signal, a channel and a message with
 * placeholders. Approval does two things through code that already exists —
 * the audience becomes a label segment, and with a published template the
 * campaign is created by the campaign runner, with its throttle, quiet hours
 * and consent gate. Nothing here sends.
 */

export const HIGH_RISK = 0.3;
const REJECTED_COOLDOWN_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

/** Today's recommendations from today's signals; also keeps the drafts in step with them. */
export async function recommendFromSignals(
  rows: AgentSignalRow[],
  now = Date.now(),
): Promise<Recommendation[]> {
  const db = getDb();
  const high = await db
    .select({ id: agentScores.id })
    .from(agentScores)
    .where(and(eq(agentScores.kind, "no-show"), gte(agentScores.score, HIGH_RISK)));
  const recs = deriveRecommendations(rows, high.length);

  const insights: InsightDraft[] = recs.map((r) => ({
    signature: r.signature,
    kind: "pattern",
    severity: r.severity,
    title: r.title,
    detail: r.detail,
    proposedAction: r.proposedAction,
    evidence: r.evidence,
    automationId: null,
    fromAi: false,
  }));
  await saveInsights(insights);

  for (const r of recs) if (r.draft) await proposeDraft(r, rows, now);
  return recs;
}

async function proposeDraft(r: Recommendation, rows: AgentSignalRow[], now: number): Promise<void> {
  const draft = r.draft!;
  const db = getDb();
  const signal = rows.find((s) => s.key === draft.audienceSignal && s.dimension === "");
  const ids = ((signal?.detail as { contactIds?: string[] } | null)?.contactIds ?? []).slice();
  if (ids.length === 0) return;

  const open = await db
    .select()
    .from(agentDrafts)
    .where(
      and(eq(agentDrafts.audienceSignal, draft.audienceSignal), eq(agentDrafts.status, "proposed")),
    )
    .get();
  if (open) {
    // The same proposal, with today's audience — not a second row.
    await db
      .update(agentDrafts)
      .set({
        audienceCount: Math.round(signal?.value ?? ids.length),
        audienceIds: ids,
        evidence: r.evidence,
        updatedAt: now,
      })
      .where(eq(agentDrafts.id, open.id));
    return;
  }
  // A proposal the clinic rejected does not come back the next morning.
  const rejected = await db
    .select({ decidedAt: agentDrafts.decidedAt })
    .from(agentDrafts)
    .where(
      and(eq(agentDrafts.audienceSignal, draft.audienceSignal), eq(agentDrafts.status, "rejected")),
    )
    .orderBy(desc(agentDrafts.decidedAt))
    .get();
  if (rejected?.decidedAt && now - rejected.decidedAt < REJECTED_COOLDOWN_DAYS * DAY) return;

  await db.insert(agentDrafts).values({
    id: randomUUID(),
    kind: "campaign",
    status: "proposed",
    audienceSignal: draft.audienceSignal,
    title: draft.title,
    channel: draft.channel,
    message: draft.message,
    audienceCount: Math.round(signal?.value ?? ids.length),
    audienceIds: ids,
    evidence: r.evidence,
    createdAt: now,
    updatedAt: now,
  });
}

export async function listDrafts(): Promise<AgentDraftRow[]> {
  return getDb().select().from(agentDrafts).orderBy(desc(agentDrafts.updatedAt)).limit(50);
}

export interface DecideInput {
  id: string;
  decision: "approve" | "reject";
  decidedBy: string;
  /** Final text, if the person edited it. */
  message?: string;
  /** A published template of the draft's channel; without it the draft is approved and the segment is ready, nothing is scheduled. */
  templateName?: string;
  note?: string;
}

/** Record the decision; on approval build the audience segment and, with a template, the campaign. */
export async function decideDraft(
  input: DecideInput,
  now = Date.now(),
): Promise<{ ok: boolean; error?: string; draft?: AgentDraftRow }> {
  const db = getDb();
  const draft = await db.select().from(agentDrafts).where(eq(agentDrafts.id, input.id)).get();
  if (!draft) return { ok: false, error: t("Nie ma takiego draftu.") };
  if (draft.status !== "proposed")
    return { ok: false, error: t("Ten draft został już rozstrzygnięty.") };

  if (input.decision === "reject") {
    await db
      .update(agentDrafts)
      .set({
        status: "rejected",
        decidedBy: input.decidedBy,
        decidedAt: now,
        note: input.note ?? "",
        updatedAt: now,
      })
      .where(eq(agentDrafts.id, draft.id));
    await logStep({
      kind: "agent",
      message: t("Draft odrzucony: {title} ({who}).", { title: draft.title, who: input.decidedBy }),
      detail: { source: "agent-draft", draftId: draft.id, decision: "reject" },
    });
    return { ok: true, draft: { ...draft, status: "rejected" } };
  }

  // The audience becomes a label segment — the thing Campaigns can target.
  const segmentName = `PRM_Agent · ${draft.title} · ${new Date(now).toISOString().slice(0, 10)}`;
  const segment = await ensureLabelSegment({
    name: segmentName,
    description: t("Audytorium draftu PRM_Agent: {title}", { title: draft.title }),
    updatedBy: input.decidedBy,
  });
  const people = draft.audienceIds.length
    ? await db.select().from(contacts).where(inArray(contacts.id, draft.audienceIds))
    : [];
  for (const c of people) await applySegmentChange(c, segmentName, "add");

  let campaignId: string | null = null;
  let status: AgentDraftRow["status"] = "approved";
  const templateName = (input.templateName ?? "").trim();
  if (templateName && segment) {
    const snapshot = await getSnapshot(draft.channel, templateName);
    if (!snapshot)
      return {
        ok: false,
        error: t("Szablon „{name}” nie jest opublikowany.", { name: templateName }),
      };
    const created = await createCampaign({
      kind: draft.channel,
      templateName,
      segmentId: segment.id,
      subject: draft.channel === "email" ? draft.title : "",
      tags: ["prm-agent"],
      scheduledAt: null,
    });
    if (!created.ok) return { ok: false, error: created.error };
    campaignId = created.id ?? null;
    status = "handed_off";
  }

  await db
    .update(agentDrafts)
    .set({
      status,
      message: input.message?.trim() || draft.message,
      segmentName,
      segmentId: segment?.id ?? null,
      templateName,
      campaignId,
      decidedBy: input.decidedBy,
      decidedAt: now,
      note: input.note ?? "",
      updatedAt: now,
    })
    .where(eq(agentDrafts.id, draft.id));
  await logStep({
    kind: "agent",
    message:
      status === "handed_off"
        ? t(
            "Draft zatwierdzony i przekazany do wysyłki: {title} — {n} odbiorców, szablon „{tpl}” ({who}).",
            { title: draft.title, n: people.length, tpl: templateName, who: input.decidedBy },
          )
        : t(
            "Draft zatwierdzony: {title} — segment „{seg}” z {n} kontaktami gotowy w Wysyłkach ({who}).",
            { title: draft.title, seg: segmentName, n: people.length, who: input.decidedBy },
          ),
    detail: {
      source: "agent-draft",
      draftId: draft.id,
      decision: "approve",
      campaignId: campaignId ?? "",
    },
  });
  const updated = await db.select().from(agentDrafts).where(eq(agentDrafts.id, draft.id)).get();
  return { ok: true, draft: updated! };
}

export interface AgentListRow {
  contactId: string;
  patient: string;
  prmId: string;
  phone: string;
  email: string;
  lastVisitAt: number | null;
  nextVisitAt: number | null;
  /** For the risk list: probability and factors. */
  probability?: number;
  factors?: { feature: string; contribution: number }[];
  visitTitle?: string;
  doctor?: string;
}

export const LIST_KEYS = [
  "recall_due",
  "first_visit_no_followup",
  "post_visit_no_reply",
  "drifting",
  "high_risk",
] as const;
export type ListKey = (typeof LIST_KEYS)[number];

/** The contacts behind a signal (or the visits above the risk threshold), for the front desk. */
export async function agentList(key: ListKey, now = Date.now()): Promise<AgentListRow[]> {
  const db = getDb();
  if (key === "high_risk") {
    const scores = await db
      .select()
      .from(agentScores)
      .where(and(eq(agentScores.kind, "no-show"), gte(agentScores.score, HIGH_RISK)))
      .orderBy(desc(agentScores.score))
      .limit(200);
    const visitIds = scores.map((s) => s.visitId).filter((v): v is string => !!v);
    const visits = visitIds.length
      ? await db.select().from(contactVisits).where(inArray(contactVisits.id, visitIds))
      : [];
    const visitOf = new Map(visits.map((v) => [v.id, v]));
    const people = await peopleById([...new Set(scores.map((s) => s.contactId))]);
    return scores.map((s) => {
      const v = s.visitId ? visitOf.get(s.visitId) : undefined;
      const p = people.get(s.contactId);
      return {
        ...base(s.contactId, p),
        nextVisitAt: v?.startsAt ?? null,
        probability: s.score,
        factors: s.factors,
        visitTitle: v?.title,
        doctor: v?.doctor,
      };
    });
  }
  const latest = await db
    .select()
    .from(agentSignals)
    .where(and(eq(agentSignals.key, key), eq(agentSignals.dimension, "")))
    .orderBy(desc(agentSignals.day))
    .limit(1)
    .get();
  const ids = ((latest?.detail as { contactIds?: string[] } | null)?.contactIds ?? []).slice(
    0,
    200,
  );
  if (ids.length === 0) return [];
  const people = await peopleById(ids);
  const visits = await db.select().from(contactVisits).where(inArray(contactVisits.contactId, ids));
  return ids.map((id) => {
    const own = visits.filter((v) => v.contactId === id && v.startsAt !== null);
    const past = own.filter((v) => (v.startsAt as number) <= now).map((v) => v.startsAt as number);
    const future = own
      .filter((v) => (v.startsAt as number) > now && v.systemStatus !== "cancelled")
      .map((v) => v.startsAt as number);
    return {
      ...base(id, people.get(id)),
      lastVisitAt: past.length ? Math.max(...past) : null,
      nextVisitAt: future.length ? Math.min(...future) : null,
    };
  });
}

type Person = {
  id: string;
  firstName: string;
  lastName: string;
  prmId: string;
  phone: string;
  email: string;
};
async function peopleById(ids: string[]): Promise<Map<string, Person>> {
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      prmId: contacts.prmId,
      phone: contacts.phone,
      email: contacts.email,
    })
    .from(contacts)
    .where(inArray(contacts.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}
function base(contactId: string, p: Person | undefined): AgentListRow {
  return {
    contactId,
    patient: p ? `${p.firstName} ${p.lastName}`.trim() || p.prmId : "—",
    prmId: p?.prmId ?? "",
    phone: p?.phone ?? "",
    email: p?.email ?? "",
    lastVisitAt: null,
    nextVisitAt: null,
  };
}
