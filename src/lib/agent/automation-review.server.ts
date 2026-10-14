import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  agentDrafts,
  automationRuns,
  automations,
  engineJobs,
  type AgentDraftRow,
} from "../db/schema";
import type { AutomationNode } from "../automation-flow";
import { previewMessage } from "../engine/actions.server";
import { logStep } from "../engine/log.server";
import { t } from "@/lib/i18n";

/**
 * A new automation's trial: its first messages wait for a person.
 *
 * The runner holds a message step of an automation whose approved count is
 * below its `reviewFirst`, and this module turns the step into a draft in
 * the same queue as the agent's campaign drafts. Approving releases the
 * job — the message then goes out through the ordinary send code, consent
 * gate included; rejecting releases it to skip the step, and the run goes
 * on. When `reviewed` reaches `reviewFirst`, the automation sends on its own.
 */

/** Default trial length for an automation created in the editor. */
export const DEFAULT_REVIEW_FIRST = 5;

export const AUTOMATION_MESSAGE = "automation_message";

type AutomationRow = typeof automations.$inferSelect;
type RunRow = typeof automationRuns.$inferSelect;

/** Draft the message this step would send. The draft's id, or null when there is nothing to approve. */
export async function holdForReview(input: {
  automation: AutomationRow;
  run: RunRow;
  jobId: string;
  node: AutomationNode;
  now?: number;
}): Promise<string | null> {
  const preview = await previewMessage(input.node, input.run.contactId);
  if (!preview.ok) return null;
  const now = input.now ?? Date.now();
  const id = randomUUID();
  const stepLabel = preview.template;
  await getDb()
    .insert(agentDrafts)
    .values({
      id,
      kind: AUTOMATION_MESSAGE,
      status: "proposed",
      audienceSignal: `automation:${input.automation.id}`,
      title: `${input.automation.name} — ${stepLabel}`,
      channel: preview.channel,
      message: preview.text,
      audienceCount: 1,
      audienceIds: [input.run.contactId],
      evidence: {
        automationId: input.automation.id,
        automationName: input.automation.name,
        runId: input.run.id,
        jobId: input.jobId,
        nodeId: input.node.id,
        template: preview.template,
        subject: preview.subject,
      },
      templateName: preview.template,
      createdAt: now,
      updatedAt: now,
    });
  return id;
}

/** Release a held message: approved, it is sent on the next tick; rejected, its step is skipped. */
export async function decideAutomationMessage(input: {
  draft: AgentDraftRow;
  decision: "approve" | "reject";
  decidedBy: string;
  note?: string;
  now?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const now = input.now ?? Date.now();
  const ev = input.draft.evidence ?? {};
  const job = ev.jobId
    ? await db.select().from(engineJobs).where(eq(engineJobs.id, ev.jobId)).get()
    : undefined;
  if (!job || job.status !== "held")
    return { ok: false, error: t("Ta wiadomość nie czeka już na decyzję.") };

  const review = input.decision === "approve" ? "approved" : "rejected";
  await db
    .update(engineJobs)
    .set({ status: "pending", review, dueAt: now })
    .where(and(eq(engineJobs.id, job.id), eq(engineJobs.status, "held")));
  await db
    .update(automationRuns)
    .set({ status: "running" })
    .where(and(eq(automationRuns.id, job.runId), eq(automationRuns.status, "waiting")));
  await db
    .update(agentDrafts)
    .set({
      status: input.decision === "approve" ? "approved" : "rejected",
      decidedBy: input.decidedBy,
      decidedAt: now,
      note: input.note ?? "",
      updatedAt: now,
    })
    .where(eq(agentDrafts.id, input.draft.id));

  const name = ev.automationName ?? "";
  if (input.decision === "approve" && ev.automationId) {
    await db
      .update(automations)
      .set({ reviewed: sql`${automations.reviewed} + 1` })
      .where(eq(automations.id, ev.automationId));
    const a = await db
      .select({ reviewed: automations.reviewed, reviewFirst: automations.reviewFirst })
      .from(automations)
      .where(eq(automations.id, ev.automationId))
      .get();
    if (a && a.reviewFirst > 0 && a.reviewed === a.reviewFirst)
      await logStep({
        automationId: ev.automationId,
        kind: "agent",
        message: t(
          "Automatyzacja „{name}” przeszła okres próbny ({n} zatwierdzonych wiadomości) — kolejne wysyła sama.",
          { name, n: a.reviewFirst },
        ),
        detail: { source: "automation-review" },
      });
  }
  await logStep({
    runId: job.runId,
    automationId: ev.automationId ?? null,
    contactId: input.draft.audienceIds[0] ?? null,
    kind: "agent",
    message:
      input.decision === "approve"
        ? t(
            "Wiadomość automatyzacji „{name}” zatwierdzona ({who}) — wychodzi przy najbliższym przebiegu silnika.",
            {
              name,
              who: input.decidedBy,
            },
          )
        : t("Wiadomość automatyzacji „{name}” odrzucona ({who}) — krok zostanie pominięty.", {
            name,
            who: input.decidedBy,
          }),
    detail: { source: "automation-review", draftId: input.draft.id, decision: input.decision },
  });
  return { ok: true };
}

/** How many held messages an automation has waiting. */
export async function heldCount(automationId: string): Promise<number> {
  const row = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(agentDrafts)
    .where(
      and(
        eq(agentDrafts.kind, AUTOMATION_MESSAGE),
        eq(agentDrafts.status, "proposed"),
        eq(agentDrafts.audienceSignal, `automation:${automationId}`),
      ),
    )
    .get();
  return row?.n ?? 0;
}
