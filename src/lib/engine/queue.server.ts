import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { automationRuns, automations, contacts, engineJobs } from "../db/schema";
import type { AutomationNode } from "../automation-flow";
import { nodeTitle } from "../automation-catalog";
import { logStep } from "./log.server";
import { t } from "@/lib/i18n";

// The engine's queue as a person sees it: what is scheduled, what waits for
// the sending window or a limit, what waits for an approval, what failed and
// why, and what got stuck mid-step. And one safe way to put a failed step
// back: the same step, for the same run, under the same rules.

/** A step in "processing" this long was cut off mid-run — same threshold as the supervisor's. */
export const STUCK_AFTER_MS = 10 * 60 * 1000;
const LIST_LIMIT = 100;

export type QueueBucket = "scheduled" | "deferred" | "held" | "failed" | "stuck";

export interface QueueItem {
  jobId: string;
  runId: string;
  automationId: string;
  automationName: string;
  contactId: string;
  contactLabel: string;
  stepTitle: string;
  dueAt: number;
  attempts: number;
  /** Why it waits or failed, in a sentence; "" when it is simply scheduled. */
  reason: string;
}

export type Queue = Record<QueueBucket, QueueItem[]> & { counts: Record<QueueBucket, number> };

function deferredReason(lastError: string | null): string {
  if (lastError === "deferred:window") return t("poza godzinami wysyłki");
  if (lastError === "deferred:hour") return t("limit wiadomości na godzinę");
  if (lastError === "deferred:day") return t("dzienny limit wiadomości");
  return "";
}

export async function readQueue(now = Date.now()): Promise<Queue> {
  const db = getDb();
  const live = await db
    .select()
    .from(engineJobs)
    .where(inArray(engineJobs.status, ["pending", "held", "failed", "processing"]))
    .orderBy(desc(engineJobs.dueAt));

  const runIds = [...new Set(live.map((j) => j.runId))];
  const runs = runIds.length
    ? await db.select().from(automationRuns).where(inArray(automationRuns.id, runIds))
    : [];
  const runById = new Map(runs.map((r) => [r.id, r]));
  const autoIds = [...new Set(runs.map((r) => r.automationId))];
  const autos = autoIds.length
    ? await db.select().from(automations).where(inArray(automations.id, autoIds))
    : [];
  const autoById = new Map(autos.map((a) => [a.id, a]));
  const contactIds = [...new Set(runs.map((r) => r.contactId))];
  const people = contactIds.length
    ? await db
        .select({
          id: contacts.id,
          prmId: contacts.prmId,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
        })
        .from(contacts)
        .where(inArray(contacts.id, contactIds))
    : [];
  const personById = new Map(people.map((p) => [p.id, p]));

  const out: Queue = {
    scheduled: [],
    deferred: [],
    held: [],
    failed: [],
    stuck: [],
    counts: { scheduled: 0, deferred: 0, held: 0, failed: 0, stuck: 0 },
  };
  for (const job of live) {
    const run = runById.get(job.runId);
    // A pending job of a run that ended is closed at its next tick — not work.
    if (job.status === "pending" && run && run.status !== "running" && run.status !== "waiting")
      continue;
    let bucket: QueueBucket;
    let reason = "";
    if (job.status === "failed") {
      bucket = "failed";
      reason = job.lastError || run?.lastError || "";
    } else if (job.status === "held") {
      bucket = "held";
      reason = t("czeka na zatwierdzenie w PRM_Agent → Drafty");
    } else if (job.status === "processing") {
      if (job.createdAt > now - STUCK_AFTER_MS) continue; // running right now
      bucket = "stuck";
      reason = t(
        "przerwany w trakcie — mógł zdążyć wysłać wiadomość, dlatego nie jest ponawiany sam",
      );
    } else if (job.lastError?.startsWith("deferred:")) {
      bucket = "deferred";
      reason = deferredReason(job.lastError);
    } else {
      bucket = "scheduled";
    }
    out.counts[bucket] += 1;
    if (out[bucket].length >= LIST_LIMIT) continue;
    const automation = run ? autoById.get(run.automationId) : undefined;
    const node = automation?.flow?.nodes.find((n) => n.id === job.nodeId);
    const person = run ? personById.get(run.contactId) : undefined;
    out[bucket].push({
      jobId: job.id,
      runId: job.runId,
      automationId: run?.automationId ?? "",
      automationName: automation?.name ?? "—",
      contactId: run?.contactId ?? "",
      contactLabel: person
        ? [person.firstName, person.lastName].filter(Boolean).join(" ") || person.prmId
        : "—",
      stepTitle: node ? nodeTitle(node as AutomationNode) : job.nodeId,
      dueAt: job.dueAt,
      attempts: job.attempts,
      reason,
    });
  }
  // Soonest first for what is ahead, latest first for what went wrong.
  for (const b of ["scheduled", "deferred", "held"] as const)
    out[b].sort((a, z) => a.dueAt - z.dueAt);
  return out;
}

export class RetryRefused extends Error {}

/**
 * Puts a failed (or, with `confirmStuck`, a stuck) step back in the queue:
 * the same step, for the same run, now. Refused when the automation is off,
 * the step is gone from it, or the patient is already in another live run of
 * it — the one-live-run rule holds for a retry too. Nothing is sent here; the
 * engine runs the step at its next tick, under the usual rules.
 */
export async function retryJob(
  jobId: string,
  who: string,
  confirmStuck = false,
  now = Date.now(),
): Promise<void> {
  const db = getDb();
  const job = await db.select().from(engineJobs).where(eq(engineJobs.id, jobId)).get();
  if (!job) throw new RetryRefused(t("Tego kroku nie ma już w kolejce."));
  const stuck = job.status === "processing" && job.createdAt <= now - STUCK_AFTER_MS;
  if (job.status !== "failed" && !stuck)
    throw new RetryRefused(t("Ponowić można tylko krok nieudany albo przerwany."));
  if (stuck && !confirmStuck)
    throw new RetryRefused(
      t("Krok przerwany mógł już wysłać wiadomość — potwierdź, że ponowienie jest bezpieczne."),
    );
  const run = await db.select().from(automationRuns).where(eq(automationRuns.id, job.runId)).get();
  if (!run) throw new RetryRefused(t("Przebieg tego kroku już nie istnieje."));
  const automation = await db
    .select()
    .from(automations)
    .where(eq(automations.id, run.automationId))
    .get();
  if (!automation || automation.status !== "active" || !automation.flow)
    throw new RetryRefused(t("Automatyzacja jest wyłączona — włącz ją, zanim ponowisz krok."));
  const node = automation.flow.nodes.find((n) => n.id === job.nodeId);
  if (!node) throw new RetryRefused(t("Tego kroku nie ma już w scenariuszu."));
  const other = await db
    .select({ id: automationRuns.id })
    .from(automationRuns)
    .where(
      and(
        eq(automationRuns.automationId, run.automationId),
        eq(automationRuns.contactId, run.contactId),
        inArray(automationRuns.status, ["running", "waiting"]),
      ),
    )
    .get();
  if (other && other.id !== run.id)
    throw new RetryRefused(t("Pacjent jest już w innym trwającym przebiegu tej automatyzacji."));

  // The failed step was appended to the path when the run failed; running it
  // again appends it once more, so it comes off first.
  const path = [...(run.path ?? [])];
  if (path[path.length - 1] === job.nodeId) path.pop();
  await db
    .update(automationRuns)
    .set({
      status: "running",
      endedAt: null,
      lastError: null,
      currentNodeId: job.nodeId,
      path,
    })
    .where(eq(automationRuns.id, run.id));
  await db
    .update(engineJobs)
    .set({ status: "pending", dueAt: now, lastError: null })
    .where(eq(engineJobs.id, job.id));
  await logStep({
    runId: run.id,
    automationId: run.automationId,
    contactId: run.contactId,
    nodeId: job.nodeId,
    kind: "action",
    message: t("Ponowienie kroku „{step}” — {who}{stuck}.", {
      who,
      step: nodeTitle(node),
      stuck: stuck ? t(" (przerwany — ponowienie potwierdzone)") : "",
    }),
    detail: { retry: job.id },
  });
}
