import { createServerFn } from "@tanstack/react-start";
import { desc, eq, inArray, like } from "drizzle-orm";
import { z } from "zod";
import { allowReporter, requireUser } from "./require-user";
import type { DirectionKey } from "../db/schema";
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
  /** Directions of development waiting for the administrator. */
  directionsPending: number;
}

async function overview(): Promise<AgentOverview> {
  const { getDb } = await import("../db/client.server");
  const { agentModels, agentScores, contactVisits, contacts } = await import("../db/schema");
  const { latestSignals } = await import("../agent/signals.server");
  const { countDirections } = await import("../agent/directions.server");
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
    directionsPending: (await countDirections()).pending,
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
  "no_phone",
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
  templateMessage: string;
  textSource: "template" | "model";
  updatedAt: number;
  /** "campaign" — the agent's proposal; "automation_message" — a held message of an automation on trial. */
  kind: string;
  /** For a held automation message: who it is for. */
  contact: { id: string; name: string } | null;
}

export const getAgentDrafts = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(
    async (): Promise<{
      drafts: AgentDraftView[];
      templates: Record<"sms" | "email", string[]>;
      language: LanguageState;
    }> => {
      const { listDrafts } = await import("../agent/drafts.server");
      const { listSnapshots } = await import("../engine/snapshots.server");
      const [rows, snapshots] = await Promise.all([listDrafts(), listSnapshots()]);
      const { getDb } = await import("../db/client.server");
      const { contacts } = await import("../db/schema");
      const personIds = [
        ...new Set(
          rows.filter((r) => r.kind === "automation_message").map((r) => r.audienceIds[0] ?? ""),
        ),
      ].filter(Boolean);
      const people = personIds.length
        ? await getDb()
            .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
            .from(contacts)
            .where(inArray(contacts.id, personIds))
        : [];
      const nameOf = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]));
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
          templateMessage: r.templateMessage,
          textSource: r.textSource,
          updatedAt: r.updatedAt,
          kind: r.kind,
          contact:
            r.kind === "automation_message" && r.audienceIds[0]
              ? { id: r.audienceIds[0], name: nameOf.get(r.audienceIds[0]) ?? "—" }
              : null,
        })),
        templates,
        language: await languageState("drafts_by_model"),
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
    const who = await requireEditor();
    const { decideDraft } = await import("../agent/drafts.server");
    return decideDraft({ ...data, decidedBy: who });
  });

// ── the language layer ──────────────────────────────────────────────────────

/** Whether a model inside the perimeter can rewrite text right now, and why not. */
export interface LanguageState {
  available: boolean;
  mode: "off" | "local";
  reason: string;
}

async function languageState(capability?: DirectionKey): Promise<LanguageState> {
  const { modelGate } = await import("../agent/language.server");
  const { aiMode } = await import("../ai/boundary.server");
  const gate = await modelGate(capability);
  return { available: gate.ok, mode: aiMode(), reason: gate.ok ? "" : gate.reason };
}

async function requireEditor(): Promise<string> {
  const { getSessionUser } = await import("../auth/session.server");
  const { isReadOnlyRole } = await import("../auth/roles");
  const user = await getSessionUser();
  if (!user || isReadOnlyRole(user.role))
    throw new Error(t("Decyzję o drafcie może podjąć osoba z prawem do zmian."));
  return `${user.firstName} ${user.lastName}`.trim() || user.email;
}

export const rewriteAgentDraft = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string().max(80) }))
  .handler(async ({ data }) => {
    await requireEditor();
    const { rewriteDraftText } = await import("../agent/drafts.server");
    const r = await rewriteDraftText(data.id);
    return {
      ok: r.ok,
      error: r.error,
      message: r.draft?.message ?? "",
      templateMessage: r.draft?.templateMessage ?? "",
    };
  });

// ── the brief ───────────────────────────────────────────────────────────────

export interface AgentBriefView {
  day: string;
  text: string;
  polished: string;
  model: string;
  language: LanguageState;
}

export const getAgentBrief = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<AgentBriefView | null> => {
    const { composeBrief, latestBrief } = await import("../agent/brief.server");
    // Stored by the nightly run; composed live until the first run after
    // the update stores one.
    const stored = await latestBrief();
    const brief = stored ?? (await composeBrief());
    if (!brief) return null;
    return {
      day: brief.day,
      text: brief.text,
      polished: stored?.polished ?? "",
      model: stored?.model ?? "",
      language: await languageState("brief_by_model"),
    };
  });

export const polishAgentBrief = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => {
    await requireEditor();
    const { latestBrief, polishLatestBrief, storeBrief } = await import("../agent/brief.server");
    // Nothing stored yet (the first day after the update): store today's first.
    if (!(await latestBrief())) await storeBrief();
    const r = await polishLatestBrief();
    return {
      ok: r.ok,
      error: r.error ?? "",
      polished: r.brief?.polished ?? "",
      model: r.brief?.model ?? "",
    };
  });

// ── directions of development ───────────────────────────────────────────────

export interface AgentDirectionView {
  key: DirectionKey;
  title: string;
  what: string;
  why: string;
  status: "proposed" | "enabled" | "declined";
  evidence: Record<string, string>;
  proposedAt: number;
  decidedBy: string;
  decidedAt: number | null;
  note: string;
}

export const getAgentDirections = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<AgentDirectionView[]> => {
    const { listDirections } = await import("../agent/directions.server");
    const { DIRECTIONS } = await import("../agent/directions");
    return (await listDirections()).map((r) => ({
      key: r.key,
      ...DIRECTIONS[r.key],
      status: r.status,
      evidence: r.evidence ?? {},
      proposedAt: r.proposedAt,
      decidedBy: r.decidedBy,
      decidedAt: r.decidedAt,
      note: r.note,
    }));
  });

export const decideAgentDirection = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      key: z.enum([
        "drafts_by_model",
        "brief_by_model",
        "triage_by_model",
        "learn_from_approvals",
        "collect_phones",
      ]),
      decision: z.enum(["enable", "decline"]),
      note: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { getSessionUser } = await import("../auth/session.server");
    const user = await getSessionUser();
    if (!user || user.role !== "admin")
      throw new Error(t("Kierunki rozwoju agenta ustala administrator."));
    const { decideDirection } = await import("../agent/directions.server");
    const who = `${user.firstName} ${user.lastName}`.trim() || user.email;
    return decideDirection({ ...data, decidedBy: who });
  });

// ── the evaluation harness ──────────────────────────────────────────────────

export interface AgentEvaluationView {
  runAt: number;
  model: string;
  total: number;
  passed: number;
  startedBy: string;
  byFeature: Record<string, { total: number; passed: number }>;
  failed: { id: string; feature: string; title: string; reason: string; output: string }[];
}

function evaluationView(row: import("../db/schema").AgentEvaluationRow): AgentEvaluationView {
  const byFeature: Record<string, { total: number; passed: number }> = {};
  for (const r of row.report) {
    byFeature[r.feature] ??= { total: 0, passed: 0 };
    byFeature[r.feature].total += 1;
    if (r.ok) byFeature[r.feature].passed += 1;
  }
  return {
    runAt: row.runAt,
    model: row.model,
    total: row.total,
    passed: row.passed,
    startedBy: row.startedBy,
    byFeature,
    failed: row.report
      .filter((r) => !r.ok)
      .map((r) => ({
        id: r.id,
        feature: r.feature,
        title: r.title,
        reason: r.reason,
        output: r.output,
      })),
  };
}

export const getAgentEvaluation = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(
    async (): Promise<{
      last: AgentEvaluationView | null;
      cases: number;
      language: LanguageState;
    }> => {
      const { latestEvaluation } = await import("../agent/eval/run.server");
      const { EVAL_CASES } = await import("../agent/eval/cases");
      const last = await latestEvaluation();
      return {
        last: last ? evaluationView(last) : null,
        cases: EVAL_CASES.length,
        language: await languageState(),
      };
    },
  );

export const runAgentEvaluation = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => {
    const { getSessionUser } = await import("../auth/session.server");
    const user = await getSessionUser();
    if (!user || user.role !== "admin")
      throw new Error(t("Sprawdzian modelu uruchamia administrator."));
    const { runEvaluation } = await import("../agent/eval/run.server");
    const who = `${user.firstName} ${user.lastName}`.trim() || user.email;
    const r = await runEvaluation({ startedBy: who });
    if (!r.ok) return { ok: false as const, error: r.error };
    // The score is the evidence on every model direction — refresh it now, not tonight.
    const { proposeDirections } = await import("../agent/directions.server");
    await proposeDirections();
    return { ok: true as const, result: evaluationView(r.row) };
  });

// ── automations on trial ────────────────────────────────────────────────────

/** Approve every held message of one automation — the team trusts it now. */
export const approveAutomationMessages = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ automationId: z.string().max(80) }))
  .handler(async ({ data }) => {
    const who = await requireEditor();
    const { getDb } = await import("../db/client.server");
    const { agentDrafts } = await import("../db/schema");
    const { and, eq } = await import("drizzle-orm");
    const { decideDraft } = await import("../agent/drafts.server");
    const held = await getDb()
      .select({ id: agentDrafts.id })
      .from(agentDrafts)
      .where(
        and(
          eq(agentDrafts.kind, "automation_message"),
          eq(agentDrafts.status, "proposed"),
          eq(agentDrafts.audienceSignal, `automation:${data.automationId}`),
        ),
      );
    let approved = 0;
    for (const d of held)
      if ((await decideDraft({ id: d.id, decision: "approve", decidedBy: who })).ok) approved += 1;
    return { ok: true as const, approved };
  });
