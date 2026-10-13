import { createServerFn } from "@tanstack/react-start";
import { desc, eq, inArray, like } from "drizzle-orm";
import { z } from "zod";
import { allowReporter, requireUser } from "./require-user";
import { t } from "@/lib/i18n";

/**
 * PRM_Agent for the screens: the latest signals, the upcoming visits most at
 * risk of a no-show, the recommendations, the lists for the front desk, the
 * drafts queue and the brief. Reading is open to the reviewer role; deciding
 * on a draft and recomputing are for people who may change things.
 */

export interface AgentSignalView {
  key: string;
  dimension: string;
  value: number;
  previous: number | null;
  count: number;
}

export interface AgentRiskView {
  visitId: string;
  contactId: string;
  patient: string;
  prmId: string;
  startsAt: number | null;
  title: string;
  doctor: string;
  probability: number;
  factors: { feature: string; contribution: number }[];
}

export interface AgentOverview {
  computed: { day: string; computedAt: number } | null;
  signals: AgentSignalView[];
  risks: AgentRiskView[];
  model: { mode: "trained" | "prior"; samples: number; baseRate: number } | null;
}

async function overview(): Promise<AgentOverview> {
  const { getDb } = await import("../db/client.server");
  const { agentModels, agentScores, contactVisits, contacts } = await import("../db/schema");
  const { latestSignals } = await import("../agent/signals.server");
  const db = getDb();

  const latest = await latestSignals();
  const scores = await db
    .select()
    .from(agentScores)
    .where(eq(agentScores.kind, "no-show"))
    .orderBy(desc(agentScores.score))
    .limit(8);
  const visitIds = scores.map((s) => s.visitId).filter((v): v is string => !!v);
  const visits = visitIds.length
    ? await db.select().from(contactVisits).where(inArray(contactVisits.id, visitIds))
    : [];
  const people = scores.length
    ? await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          prmId: contacts.prmId,
        })
        .from(contacts)
        .where(inArray(contacts.id, [...new Set(scores.map((s) => s.contactId))]))
    : [];
  const visitOf = new Map(visits.map((v) => [v.id, v]));
  const personOf = new Map(people.map((p) => [p.id, p]));
  const model = await db.select().from(agentModels).where(eq(agentModels.id, "no-show")).get();
  const params = (model?.params ?? null) as {
    mode?: "trained" | "prior";
    baseRate?: number;
  } | null;

  return {
    computed: latest ? { day: latest.day, computedAt: latest.computedAt } : null,
    signals: (latest?.rows ?? []).map((r) => ({
      key: r.key,
      dimension: r.dimension,
      value: r.value,
      previous: r.previous,
      count: r.count,
    })),
    risks: scores
      .map((s) => {
        const v = s.visitId ? visitOf.get(s.visitId) : undefined;
        const p = personOf.get(s.contactId);
        return {
          visitId: s.visitId ?? "",
          contactId: s.contactId,
          patient: p ? `${p.firstName} ${p.lastName}`.trim() : "—",
          prmId: p?.prmId ?? "",
          startsAt: v?.startsAt ?? null,
          title: v?.title ?? "",
          doctor: v?.doctor ?? "",
          probability: s.score,
          factors: s.factors,
        };
      })
      .filter((r) => r.visitId),
    model:
      model && params
        ? { mode: params.mode ?? "prior", samples: model.samples, baseRate: params.baseRate ?? 0 }
        : null,
  };
}

export const getAgentOverview = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(overview);

export const runAgentNow = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => {
    const { getSessionUser } = await import("../auth/session.server");
    const user = await getSessionUser();
    if (!user || user.role !== "admin")
      throw new Error(t("Tylko administrator może uruchomić liczenie sygnałów."));
    const { runAgentNightly } = await import("../agent/signals.server");
    const result = await runAgentNightly();
    return {
      ok: true as const,
      signals: result.signals,
      mode: result.model.mode,
      samples: result.model.samples,
      recommendations: result.recommendations,
    };
  });

// ── recommendations ─────────────────────────────────────────────────────────

export interface AgentRecommendationView {
  id: string;
  severity: string;
  title: string;
  detail: string;
  proposedAction: string;
  evidence: Record<string, string>;
  status: string;
  updatedAt: number;
}

export const getAgentRecommendations = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<AgentRecommendationView[]> => {
    const { getDb } = await import("../db/client.server");
    const { agentInsights } = await import("../db/schema");
    const rows = await getDb()
      .select()
      .from(agentInsights)
      .where(like(agentInsights.signature, "agent:%"))
      .orderBy(desc(agentInsights.updatedAt))
      .limit(30);
    return rows
      .filter((r) => r.status !== "dismissed" && r.status !== "resolved")
      .map((r) => ({
        id: r.id,
        severity: r.severity,
        title: r.title,
        detail: r.detail,
        proposedAction: r.proposedAction,
        evidence: r.evidence ?? {},
        status: r.status,
        updatedAt: r.updatedAt,
      }));
  });

// ── lists for the front desk ────────────────────────────────────────────────

const LIST_KEY = z.enum([
  "recall_due",
  "first_visit_no_followup",
  "post_visit_no_reply",
  "drifting",
  "high_risk",
]);

export const getAgentList = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ key: LIST_KEY }))
  .handler(async ({ data }) => {
    const { agentList } = await import("../agent/drafts.server");
    return agentList(data.key);
  });

// ── drafts ──────────────────────────────────────────────────────────────────

export interface AgentDraftView {
  id: string;
  status: string;
  audienceSignal: string;
  title: string;
  channel: "sms" | "email";
  message: string;
  audienceCount: number;
  evidence: Record<string, string>;
  segmentName: string;
  templateName: string;
  campaignId: string | null;
  decidedBy: string;
  decidedAt: number | null;
  note: string;
  updatedAt: number;
}

export const getAgentDrafts = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(
    async (): Promise<{
      drafts: AgentDraftView[];
      templates: Record<"sms" | "email", string[]>;
    }> => {
      const { listDrafts } = await import("../agent/drafts.server");
      const { listSnapshots } = await import("../engine/snapshots.server");
      const [rows, snapshots] = await Promise.all([listDrafts(), listSnapshots()]);
      const templates: Record<"sms" | "email", string[]> = { sms: [], email: [] };
      for (const s of snapshots) {
        if (s.kind === "sms" && s.smsBody) templates.sms.push(s.name);
        if (s.kind === "email" && s.html) templates.email.push(s.name);
      }
      return {
        drafts: rows.map((r) => ({
          id: r.id,
          status: r.status,
          audienceSignal: r.audienceSignal,
          title: r.title,
          channel: r.channel,
          message: r.message,
          audienceCount: r.audienceCount,
          evidence: r.evidence ?? {},
          segmentName: r.segmentName,
          templateName: r.templateName,
          campaignId: r.campaignId,
          decidedBy: r.decidedBy,
          decidedAt: r.decidedAt,
          note: r.note,
          updatedAt: r.updatedAt,
        })),
        templates,
      };
    },
  );

export const decideAgentDraft = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      id: z.string().max(80),
      decision: z.enum(["approve", "reject"]),
      message: z.string().max(2000).optional(),
      templateName: z.string().max(200).optional(),
      note: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { getSessionUser } = await import("../auth/session.server");
    const { isReadOnlyRole } = await import("../auth/roles");
    const user = await getSessionUser();
    if (!user || isReadOnlyRole(user.role))
      throw new Error(t("Decyzję o drafcie może podjąć osoba z prawem do zmian."));
    const { decideDraft } = await import("../agent/drafts.server");
    const who = `${user.firstName} ${user.lastName}`.trim() || user.email;
    return decideDraft({ ...data, decidedBy: who });
  });

// ── the brief ───────────────────────────────────────────────────────────────

export const getAgentBrief = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<{ day: string; text: string } | null> => {
    const o = await overview();
    if (!o.computed) return null;
    const { getDb } = await import("../db/client.server");
    const { agentInsights } = await import("../db/schema");
    const { buildBrief } = await import("../agent/brief");
    const recs = await getDb()
      .select()
      .from(agentInsights)
      .where(like(agentInsights.signature, "agent:%"))
      .orderBy(desc(agentInsights.updatedAt))
      .limit(10);
    const text = buildBrief({
      day: o.computed.day,
      signals: o.signals,
      recommendations: recs
        .filter((r) => r.status !== "dismissed" && r.status !== "resolved")
        .map((r) => ({
          signature: r.signature,
          severity: r.severity,
          title: r.title,
          detail: r.detail,
          proposedAction: r.proposedAction,
          evidence: r.evidence ?? {},
        })),
      risks: o.risks.map((r) => ({
        patient: r.patient,
        startsAt: r.startsAt,
        probability: r.probability,
      })),
      model: o.model ? { mode: o.model.mode, samples: o.model.samples } : null,
    });
    return { day: o.computed.day, text };
  });
