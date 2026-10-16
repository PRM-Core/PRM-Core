import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  agentDirections,
  agentDrafts,
  agentExamples,
  contacts,
  type AgentDirectionRow,
  type AgentExampleRow,
  type DirectionKey,
} from "../db/schema";
import { localEndpoint, aiMode } from "../ai/boundary.server";
import { logStep } from "../engine/log.server";
import { deriveDirections, DIRECTIONS, type DevelopmentState } from "./directions";
import { latestEvaluation, latestEvaluationOf } from "./eval/run.server";
import { adapterGate, gateEvidence, type AdapterGate, type EvalScore } from "./adapter";
import type { Recommendation } from "./recommend";
import { t } from "@/lib/i18n";

/**
 * Directions — the database side. The nightly run proposes what the state
 * supports; a person enables or declines; the rest of the agent asks
 * `isEnabled` before it starts anything new. The agent never enables a
 * direction itself.
 */

export async function developmentState(): Promise<DevelopmentState> {
  const db = getDb();
  const e = localEndpoint();
  const [approvals, otherDecisions, people] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(agentDrafts)
      .where(inArray(agentDrafts.status, ["approved", "handed_off"]))
      .get(),
    db
      .select({ n: sql<number>`count(*)` })
      .from(agentExamples)
      .where(inArray(agentExamples.kind, ["triage", "dismissal"]))
      .get(),
    db
      .select({
        n: sql<number>`count(*)`,
        withoutPhone: sql<number>`sum(case when trim(coalesce(${contacts.phone}, '')) = '' then 1 else 0 end)`,
      })
      .from(contacts)
      .get(),
  ]);
  const evaluation = await latestEvaluation();
  const comparison = e.adapterModel ? await adapterComparison() : null;
  const score = (s: EvalScore | null) => (s ? { passed: s.passed, total: s.total } : null);
  return {
    localModel: aiMode() === "local" && !!e.url && !!e.model && e.hostClass !== "public",
    evaluation: evaluation ? { passed: evaluation.passed, total: evaluation.total } : null,
    adapter: comparison
      ? { base: score(comparison.gate.base), tuned: score(comparison.gate.tuned) }
      : null,
    approvals: (approvals?.n ?? 0) + (otherDecisions?.n ?? 0),
    contacts: people?.n ?? 0,
    withoutPhone: people?.withoutPhone ?? 0,
  };
}

// ── the tuned model: the base model with this installation's adapter ────────

export interface AdapterComparison {
  /** A model with the adapter is named in .env (PRM_AI_LOCAL_ADAPTER_MODEL). */
  configured: boolean;
  baseModel: string;
  tunedModel: string;
  gate: AdapterGate;
}

const asScore = (r: Awaited<ReturnType<typeof latestEvaluationOf>>): EvalScore | null =>
  r
    ? {
        model: r.model,
        passed: r.passed,
        total: r.total,
        runAt: r.runAt,
        caseIds: r.report.map((c) => c.id),
      }
    : null;

/** The last run of the harness against each model, and whether the tuned one may be used. */
export async function adapterComparison(): Promise<AdapterComparison> {
  const e = localEndpoint();
  const [base, tuned] = await Promise.all([
    e.model ? latestEvaluationOf(`local/${e.model}`) : null,
    e.adapterModel ? latestEvaluationOf(`local/${e.adapterModel}`) : null,
  ]);
  return {
    configured: !!e.adapterModel,
    baseModel: e.model,
    tunedModel: e.adapterModel,
    gate: adapterGate(asScore(base), asScore(tuned)),
  };
}

/**
 * A newer run can show the tuned model worse than the base — a retrained
 * adapter, a new set of cases. Then the agent goes back to the base model
 * by itself: returning is always allowed, only enabling waits for a person.
 */
async function recheckTunedModel(now: number): Promise<void> {
  if (!(await isEnabled("tuned_model"))) return;
  const c = await adapterComparison();
  if (!c.configured || c.gate.ok) return;
  await getDb()
    .update(agentDirections)
    .set({
      status: "declined",
      evidence: gateEvidence(c.gate),
      decidedBy: "PRM_Agent",
      decidedAt: now,
      note: c.gate.reason,
      updatedAt: now,
    })
    .where(eq(agentDirections.key, "tuned_model"));
  await logStep({
    kind: "agent",
    message: t("PRM_Agent wraca do modelu bazowego: {reason}", { reason: c.gate.reason }),
    detail: { source: "agent-direction", key: "tuned_model", ...gateEvidence(c.gate) },
  });
}

/** Propose what tonight's state supports; refresh the evidence of what still waits. Decided rows are left alone. */
export async function proposeDirections(now = Date.now()): Promise<DirectionKey[]> {
  await recheckTunedModel(now);
  const db = getDb();
  const wanted = deriveDirections(await developmentState());
  const existing = new Map(
    (await db.select().from(agentDirections)).map((r) => [r.key, r] as const),
  );
  const proposed: DirectionKey[] = [];
  for (const w of wanted) {
    const row = existing.get(w.key);
    if (!row) {
      await db.insert(agentDirections).values({
        key: w.key,
        status: "proposed",
        evidence: w.evidence,
        proposedAt: now,
        updatedAt: now,
      });
      proposed.push(w.key);
      await logStep({
        kind: "agent",
        message: t("PRM_Agent proponuje kierunek: {title} — czeka na decyzję administratora.", {
          title: DIRECTIONS[w.key].title,
        }),
        detail: { source: "agent-direction", key: w.key, ...w.evidence },
      });
    } else if (row.status === "proposed") {
      await db
        .update(agentDirections)
        .set({ evidence: w.evidence, updatedAt: now })
        .where(eq(agentDirections.key, w.key));
    }
  }
  return proposed;
}

export async function listDirections(): Promise<AgentDirectionRow[]> {
  return getDb().select().from(agentDirections).orderBy(desc(agentDirections.updatedAt));
}

export async function decideDirection(input: {
  key: DirectionKey;
  decision: "enable" | "decline";
  decidedBy: string;
  note?: string;
  now?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const now = input.now ?? Date.now();
  if (!(input.key in DIRECTIONS)) return { ok: false, error: t("Nie ma takiego kierunku.") };
  const status = input.decision === "enable" ? "enabled" : "declined";
  // The tuned model is enabled only through the gate, and the decision
  // keeps both scores it was taken on.
  let evidence: Record<string, string> | undefined;
  if (input.key === "tuned_model" && status === "enabled") {
    const c = await adapterComparison();
    if (!c.configured)
      return {
        ok: false,
        error: t(
          "Nie ma modelu z adapterem — ustaw PRM_AI_LOCAL_ADAPTER_MODEL (docs/AGENT.md, sekcja 12).",
        ),
      };
    if (!c.gate.ok) return { ok: false, error: c.gate.reason };
    evidence = gateEvidence(c.gate);
  }
  await db
    .insert(agentDirections)
    .values({
      key: input.key,
      status,
      evidence: evidence ?? null,
      proposedAt: now,
      decidedBy: input.decidedBy,
      decidedAt: now,
      note: input.note ?? "",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: agentDirections.key,
      set: {
        status,
        ...(evidence ? { evidence } : {}),
        decidedBy: input.decidedBy,
        decidedAt: now,
        note: input.note ?? "",
        updatedAt: now,
      },
    });
  await logStep({
    kind: "agent",
    message:
      status === "enabled"
        ? t("Kierunek włączony: {title} ({who}).", {
            title: DIRECTIONS[input.key].title,
            who: input.decidedBy,
          })
        : t("Kierunek odrzucony: {title} ({who}).", {
            title: DIRECTIONS[input.key].title,
            who: input.decidedBy,
          }),
    detail: { source: "agent-direction", key: input.key, decision: input.decision },
  });
  return { ok: true };
}

export async function isEnabled(key: DirectionKey): Promise<boolean> {
  const row = await getDb()
    .select({ status: agentDirections.status })
    .from(agentDirections)
    .where(eq(agentDirections.key, key))
    .get();
  return row?.status === "enabled";
}

export async function countDirections(): Promise<{ pending: number; enabled: number }> {
  const rows = await getDb().select({ status: agentDirections.status }).from(agentDirections);
  return {
    pending: rows.filter((r) => r.status === "proposed").length,
    enabled: rows.filter((r) => r.status === "enabled").length,
  };
}

// ── examples: what the team approved ────────────────────────────────────────

export async function rememberExample(input: {
  channel: "sms" | "email";
  audienceSignal: string;
  text: string;
  decidedBy: string;
  now?: number;
}): Promise<void> {
  const text = input.text.trim();
  if (!text) return;
  await getDb()
    .insert(agentExamples)
    .values({
      id: randomUUID(),
      kind: "draft",
      channel: input.channel,
      audienceSignal: input.audienceSignal,
      text,
      decidedBy: input.decidedBy,
      createdAt: input.now ?? Date.now(),
    });
}

/** The latest approved texts for a channel, the same audience first. Empty unless the direction is enabled. */
export async function examplesFor(
  channel: "sms" | "email",
  audienceSignal: string,
  limit = 3,
): Promise<AgentExampleRow[]> {
  if (!(await isEnabled("learn_from_approvals"))) return [];
  const db = getDb();
  const same = await db
    .select()
    .from(agentExamples)
    .where(
      and(
        eq(agentExamples.kind, "draft"),
        eq(agentExamples.channel, channel),
        eq(agentExamples.audienceSignal, audienceSignal),
      ),
    )
    .orderBy(desc(agentExamples.createdAt))
    .limit(limit);
  if (same.length >= limit) return same;
  const others = await db
    .select()
    .from(agentExamples)
    .where(and(eq(agentExamples.kind, "draft"), eq(agentExamples.channel, channel)))
    .orderBy(desc(agentExamples.createdAt))
    .limit(limit * 2);
  const seen = new Set(same.map((e) => e.id));
  return [...same, ...others.filter((e) => !seen.has(e.id))].slice(0, limit);
}

/**
 * The front desk re-triaged a message: keep the message — pseudonymised
 * before it is stored — with the team's verdict, "urgency/topic/owner".
 */
export async function rememberTriage(input: {
  text: string;
  label: string;
  decidedBy: string;
  now?: number;
}): Promise<void> {
  const text = input.text.trim();
  if (!text) return;
  await getDb()
    .insert(agentExamples)
    .values({
      id: randomUUID(),
      kind: "triage",
      channel: "",
      audienceSignal: "",
      text: text.slice(0, 1000),
      label: input.label,
      decidedBy: input.decidedBy,
      createdAt: input.now ?? Date.now(),
    });
}

/** The latest re-triaged messages with the team's verdicts. Empty unless the direction is enabled. */
export async function triageExamples(limit = 5): Promise<{ text: string; label: string }[]> {
  if (!(await isEnabled("learn_from_approvals"))) return [];
  const rows = await getDb()
    .select({ text: agentExamples.text, label: agentExamples.label })
    .from(agentExamples)
    .where(eq(agentExamples.kind, "triage"))
    .orderBy(desc(agentExamples.createdAt))
    .limit(limit);
  return rows;
}

/**
 * The team dismissed a recommendation: keep the numbers it was dismissed at.
 * One row per signature — a later dismissal replaces the earlier baseline.
 */
export async function rememberDismissal(input: {
  signature: string;
  evidence: Record<string, string>;
  decidedBy: string;
  now?: number;
}): Promise<void> {
  const db = getDb();
  await db
    .delete(agentExamples)
    .where(
      and(eq(agentExamples.kind, "dismissal"), eq(agentExamples.audienceSignal, input.signature)),
    );
  await db.insert(agentExamples).values({
    id: randomUUID(),
    kind: "dismissal",
    channel: "",
    audienceSignal: input.signature,
    text: JSON.stringify(input.evidence ?? {}),
    decidedBy: input.decidedBy,
    createdAt: input.now ?? Date.now(),
  });
}

export async function listDismissals(): Promise<
  { signature: string; evidence: Record<string, string> }[]
> {
  const rows = await getDb()
    .select({ signature: agentExamples.audienceSignal, text: agentExamples.text })
    .from(agentExamples)
    .where(eq(agentExamples.kind, "dismissal"));
  return rows.map((r) => {
    let evidence: Record<string, string> = {};
    try {
      evidence = JSON.parse(r.text) as Record<string, string>;
    } catch {
      // A row that does not parse is a baseline of nothing: the next number wins.
    }
    return { signature: r.signature, evidence };
  });
}

export async function forgetDismissal(signature: string): Promise<void> {
  await getDb()
    .delete(agentExamples)
    .where(and(eq(agentExamples.kind, "dismissal"), eq(agentExamples.audienceSignal, signature)));
}

export async function countExamples(): Promise<number> {
  const row = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(agentExamples)
    .get();
  return row?.n ?? 0;
}

// ── what an enabled direction adds to the recommendations ───────────────────

/** Recommendations that exist only because a direction is enabled. */
export async function recommendationsFromDirections(): Promise<Recommendation[]> {
  const out: Recommendation[] = [];
  if (await isEnabled("collect_phones")) {
    const row = await getDb()
      .select({ n: sql<number>`count(*)` })
      .from(contacts)
      .where(or(isNull(contacts.phone), eq(sql`trim(${contacts.phone})`, "")))
      .get();
    const n = row?.n ?? 0;
    if (n >= 1)
      out.push({
        signature: "agent:collect-phones",
        severity: "info",
        title: t("{n} pacjentów bez numeru telefonu", { n }),
        detail: t(
          "Bez telefonu nie ma SMS-a, przypomnienia tuż przed wizytą ani szybkiego kontaktu z rejestracji; model ryzyka liczy to jako czynnik nieobecności.",
        ),
        proposedAction: t(
          "Rejestracja dopyta o numer przy najbliższym kontakcie — lista w PRM_Agent → Listy → Bez telefonu.",
        ),
        evidence: { patients: String(n) },
      });
  }
  return out;
}
