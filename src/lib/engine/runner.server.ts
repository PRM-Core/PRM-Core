import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { automations, automationRuns, engineJobs } from "../db/schema";
import type { EngineEventRow, EngineEventType, AutomationRunRow } from "../db/schema";
import { pickSplitVariant } from "../automation-flow";
import type { AutomationGraph, AutomationNode, DelayUnit } from "../automation-flow";
import { executeAction, evaluateCondition, evaluatePath } from "./actions.server";
import { runAgentNode } from "./agent.server";
import { logStep } from "./log.server";
import { takeUnprocessedEvents, markEventProcessed } from "./events.server";
import { processDueCampaigns } from "../campaigns/campaigns.server";
import { t } from "@/lib/i18n";

// The heart of the engine: match events to triggers, walk the graph one node
// per job, and never do the same step twice.

/** Trigger catalog key → the event type it subscribes to. Keys absent here have no real event source yet. */
const TRIGGER_EVENT_TYPES: Record<string, EngineEventType> = {
  contact_created: "contact.created",
  visit_scheduled: "visit.scheduled",
  visit_completed: "visit.completed",
  visit_no_show: "visit.no_show",
  visit_cancelled: "visit.cancelled",
  form_submitted: "form.submitted",
  survey_submitted: "survey.submitted",
  email_opened: "email.opened",
  email_clicked: "email.clicked",
  page_visited: "page.visit",
  tag_added: "contact.tag_added",
  segment_joined: "contact.segment_added",
  field_changed: "contact.field_changed",
  chat_message: "contact.message_received",
  stage_changed: "funnel.stage_changed",
};

// (Trigger keys with no event source are flagged per-item via `engineNote` in
// automation-catalog.ts — the stale UNWIRED_TRIGGER_KEYS list that used to
// live here had no consumers and still claimed field_changed was unwired.)

const MAX_STEPS_PER_RUN = 100;
const DELAY_MS: Record<DelayUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

function eq_ci(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Does this trigger node fire for this event? An empty filter field means "any". */
function triggerMatches(node: AutomationNode, event: EngineEventRow): boolean {
  const key = node.key ?? "";
  if (TRIGGER_EVENT_TYPES[key] !== event.type) return false;

  const config = node.config ?? {};
  const payload = event.payload ?? {};
  switch (key) {
    case "contact_created": {
      // Wszystkie trzy filtry muszą pasować naraz — „nowy pacjent z kampanii X”
      // to jedno pytanie, nie trzy osobne. Puste pole nie pyta o nic.
      const wantSource = (config.source ?? "").trim().toLowerCase();
      if (wantSource && !(payload.source ?? "").toLowerCase().includes(wantSource)) return false;

      const wantCampaign = (config.campaign ?? "").trim().toLowerCase();
      if (wantCampaign && !(payload.campaign ?? "").toLowerCase().includes(wantCampaign)) {
        return false;
      }

      // Status porównywany dokładnie: wartości są zamkniętą listą, a fragment
      // pasowałby jednocześnie do „active" i „inactive".
      const wantStatus = (config.status ?? "").trim();
      if (wantStatus && wantStatus !== "dowolny" && !eq_ci(wantStatus, payload.status ?? "")) {
        return false;
      }
      return true;
    }
    case "tag_added": {
      const want = (config.tag ?? "").trim();
      return !want || eq_ci(want, payload.tag ?? "");
    }
    case "segment_joined": {
      const want = (config.segment ?? "").trim();
      return !want || eq_ci(want, payload.segment ?? "");
    }
    case "field_changed": {
      // "dowolne" (and an unset field) mean any column — the trigger then fires
      // on every real change to the contact.
      const want = (config.field ?? "").trim();
      return !want || want === "dowolne" || eq_ci(want, payload.field ?? "");
    }
    case "chat_message": {
      // "dowolny" and an unset field both mean any inbox channel.
      const want = (config.channel ?? "").trim();
      return !want || want === "dowolny" || eq_ci(want, payload.channel ?? "");
    }
    case "visit_scheduled": {
      // Substring match on the booked service, so "kardio" catches
      // "Konsultacja kardiologiczna" without anybody typing it exactly. Empty
      // means any visit.
      const want = (config.service ?? "").trim().toLowerCase();
      return !want || (payload.title ?? "").toLowerCase().includes(want);
    }
    case "visit_completed":
    case "visit_no_show":
    case "visit_cancelled": {
      // Ten sam filtr co przy rezerwacji: fragment nazwy usługi, puste = dowolna.
      const want = (config.service ?? "").trim().toLowerCase();
      return !want || (payload.title ?? "").toLowerCase().includes(want);
    }
    case "form_submitted": {
      // Fragment nazwy wystarczy — „test słuchu” złapie „Test słuchu — RDS”,
      // tak samo jak filtr usługi przy rezerwacji. Puste = dowolny formularz.
      const want = (config.form ?? "").trim().toLowerCase();
      return !want || (payload.form ?? "").toLowerCase().includes(want);
    }
    case "page_visited": {
      // Substring match on the visited URL — a path fragment like "/cennik"
      // is the natural thing to type, and an empty field means any page.
      const want = (config.url ?? "").trim().toLowerCase();
      return !want || (payload.url ?? "").toLowerCase().includes(want);
    }
    default:
      return true;
  }
}

function findNode(graph: AutomationGraph, id: string): AutomationNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

/**
 * The node an edge leads to from the given output handle. Edges built by
 * single-output nodes may carry no handle at all, so "out" also accepts those.
 */
function nextNodeId(graph: AutomationGraph, nodeId: string, handle: string): string | null {
  const edge = graph.edges.find(
    (e) =>
      e.source === nodeId && (e.sourceHandle === handle || (handle === "out" && !e.sourceHandle)),
  );
  return edge?.target ?? null;
}

async function scheduleJob(input: {
  runId: string;
  nodeId: string;
  dueAt: number;
  stepIndex: number;
}): Promise<boolean> {
  const db = getDb();
  try {
    await db.insert(engineJobs).values({
      id: randomUUID(),
      runId: input.runId,
      nodeId: input.nodeId,
      dueAt: input.dueAt,
      status: "pending",
      attempts: 0,
      // Unique in the schema: two overlapping ticks can both try to schedule
      // the same step, and exactly one insert wins. This is what makes "an
      // email is never sent twice" a database guarantee rather than a hope.
      idempotencyKey: `${input.runId}:${input.nodeId}:${input.stepIndex}`,
      lastError: null,
      createdAt: Date.now(),
    });
    return true;
  } catch {
    return false; // already scheduled by another tick
  }
}

async function endRun(
  run: AutomationRunRow,
  status: "completed" | "failed" | "stopped",
  message: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(automationRuns)
    .set({
      status,
      endedAt: Date.now(),
      currentNodeId: null,
      lastError: status === "failed" ? message : null,
    })
    .where(eq(automationRuns.id, run.id));
  await logStep({
    runId: run.id,
    automationId: run.automationId,
    contactId: run.contactId,
    kind: "run_ended",
    message,
    detail: { status },
  });
}

// ── event → run ─────────────────────────────────────────────────────────────

type AutomationRow = typeof automations.$inferSelect;

/**
 * Creates runs for every active automation whose trigger matches this event.
 * `active` is loaded ONCE per tick by the caller: re-reading (and re-parsing
 * the JSON graphs of) every active automation for every event in a burst is
 * where a 50-automation workspace would have spent most of its tick.
 */
async function processEvent(event: EngineEventRow, active: AutomationRow[]): Promise<number> {
  if (!event.contactId) return 0;

  const db = getDb();
  let started = 0;

  for (const automation of active) {
    const graph = automation.flow;
    if (!graph || graph.nodes.length === 0) continue;

    const trigger = graph.nodes.find((n) => n.kind === "trigger" && triggerMatches(n, event));
    if (!trigger) continue;

    // One live run per contact per automation: a second matching event while
    // the first journey is still in flight must not start a parallel copy of
    // it (that is how people get the same email twice).
    const inFlight = await db
      .select()
      .from(automationRuns)
      .where(
        and(
          eq(automationRuns.automationId, automation.id),
          eq(automationRuns.contactId, event.contactId),
          inArray(automationRuns.status, ["running", "waiting"]),
        ),
      )
      .get();
    if (inFlight) {
      await logStep({
        automationId: automation.id,
        contactId: event.contactId,
        kind: "skipped",
        message: t("Zdarzenie {type} pominięte — kontakt jest już w trakcie tej automatyzacji.", {
          type: event.type,
        }),
      });
      continue;
    }

    const runId = randomUUID();
    await db.insert(automationRuns).values({
      id: runId,
      automationId: automation.id,
      contactId: event.contactId,
      currentNodeId: trigger.id,
      status: "running",
      path: [],
      triggerEventId: event.id,
      lastError: null,
      startedAt: Date.now(),
      endedAt: null,
    });
    await logStep({
      runId,
      automationId: automation.id,
      contactId: event.contactId,
      nodeId: trigger.id,
      kind: "run_started",
      message: t("Uruchomiono „{name}” po zdarzeniu {type}.", {
        name: automation.name,
        type: event.type,
      }),
      detail: { trigger: trigger.key ?? "", ...event.payload },
    });

    await scheduleJob({ runId, nodeId: trigger.id, dueAt: Date.now(), stepIndex: 0 });
    started += 1;
  }

  return started;
}

// ── job → step ──────────────────────────────────────────────────────────────

async function runStep(job: typeof engineJobs.$inferSelect): Promise<void> {
  const db = getDb();

  // Claim BEFORE executing, not after. The idempotency key makes scheduling
  // exactly-once, but execution used to be at-least-once: a crash between
  // sending an email and marking the job done would re-send it after restart.
  // Claiming first flips that to at-most-once — a crash leaves a visibly stuck
  // "processing" job (the supervisor reports those) instead of a duplicate
  // message to a patient. The WHERE on status also makes the claim atomic:
  // only one of two racing workers can move pending → processing.
  const claimed = await db
    .update(engineJobs)
    .set({ status: "processing", attempts: job.attempts + 1 })
    .where(and(eq(engineJobs.id, job.id), eq(engineJobs.status, "pending")))
    .returning({ id: engineJobs.id });
  if (claimed.length === 0) return; // someone else took it

  const run = await db.select().from(automationRuns).where(eq(automationRuns.id, job.runId)).get();
  if (!run) {
    await db.update(engineJobs).set({ status: "done" }).where(eq(engineJobs.id, job.id));
    return;
  }
  if (run.status !== "running" && run.status !== "waiting") {
    await db.update(engineJobs).set({ status: "done" }).where(eq(engineJobs.id, job.id));
    return;
  }

  const automation = await db
    .select()
    .from(automations)
    .where(eq(automations.id, run.automationId))
    .get();

  // Switching an automation off stops its journeys at the next step rather
  // than mid-send — deliberate, so "wyłącz" is a safe button to press.
  if (!automation || automation.status !== "active" || !automation.flow) {
    await db.update(engineJobs).set({ status: "done" }).where(eq(engineJobs.id, job.id));
    await endRun(run, "stopped", t("Automatyzacja została wyłączona — przebieg zatrzymany."));
    return;
  }

  const graph = automation.flow;
  const node = findNode(graph, job.nodeId);
  if (!node) {
    await db.update(engineJobs).set({ status: "done" }).where(eq(engineJobs.id, job.id));
    await endRun(
      run,
      "failed",
      t("Krok {nodeId} nie istnieje już w scenariuszu.", { nodeId: job.nodeId }),
    );
    return;
  }

  const path = [...(run.path ?? []), node.id];
  if (path.length > MAX_STEPS_PER_RUN) {
    await db.update(engineJobs).set({ status: "done" }).where(eq(engineJobs.id, job.id));
    await endRun(
      run,
      "failed",
      t("Przekroczono limit {MAX_STEPS_PER_RUN} kroków — możliwa pętla w scenariuszu.", {
        MAX_STEPS_PER_RUN: MAX_STEPS_PER_RUN,
      }),
    );
    return;
  }

  const base = {
    runId: run.id,
    automationId: run.automationId,
    contactId: run.contactId,
    nodeId: node.id,
  };

  let handle = "out";
  let stopRun = false;
  let failure: string | null = null;
  let nextDueAt = Date.now();

  switch (node.kind) {
    case "trigger":
      // Entry point — nothing to execute, the event already happened.
      break;

    case "delay": {
      const amount = node.amount ?? 0;
      const unit = node.unit ?? "hours";
      nextDueAt = Date.now() + amount * DELAY_MS[unit];
      await logStep({
        ...base,
        kind: "delay",
        message: t("Oczekiwanie {amount} {v1}.", {
          amount: amount,
          v1: unit === "minutes" ? "min" : unit === "hours" ? t("godz.") : "dni",
        }),
        detail: { dueAt: new Date(nextDueAt).toISOString() },
      });
      break;
    }

    case "action": {
      const result = await executeAction(node, run.contactId, {
        runId: run.id,
        automationId: run.automationId,
        nodeId: node.id,
      });
      await logStep({
        ...base,
        kind:
          result.status === "error" ? "error" : result.status === "skipped" ? "skipped" : "action",
        message: result.message,
        detail: { action: node.key ?? "", ...(result.detail ?? {}) },
      });
      if (result.status === "error") failure = result.message;
      if (result.stopRun) stopRun = true;
      break;
    }

    case "condition": {
      const result = await evaluateCondition(node, run.contactId);
      handle = result.matched ? "matched" : "unmatched";
      await logStep({
        ...base,
        kind: "condition",
        message: result.message,
        detail: { condition: node.key ?? "", branch: handle },
      });
      break;
    }

    case "path": {
      const result = await evaluatePath(node, run.contactId);
      handle = result.handle;
      await logStep({ ...base, kind: "condition", message: result.message });
      // No branch at all means no outgoing edge to follow — stop rather than
      // silently ending the journey as if it had completed normally.
      if (!handle) failure = result.message;
      break;
    }

    case "split": {
      const variant = pickSplitVariant(node.variants ?? []);
      if (!variant) {
        failure = t("Split nie ma żadnego wariantu — przebieg zatrzymany.");
        break;
      }
      handle = variant.id;
      const total = (node.variants ?? []).reduce((sum, v) => sum + v.weight, 0);
      await logStep({
        ...base,
        kind: "condition",
        message: t("Split: wariant „{label}” ({weight}/{total}).", {
          label: variant.label,
          weight: variant.weight,
          total: total,
        }),
        detail: { variant: variant.label, weight: String(variant.weight) },
      });
      break;
    }

    case "aiAgent": {
      // A failed agent call is deliberately NOT a failed run: it falls back to
      // the first path and says why. An LLM outage or a spent cost limit
      // shouldn't strand a patient halfway through a journey.
      const decision = await runAgentNode(node, run.contactId);
      handle = decision.handle;
      await logStep({
        ...base,
        // Keyed on tokens, not on success: a call that failed after burning
        // tokens still cost money, and the daily limit sums "ai" rows only.
        kind: decision.tokensIn > 0 ? "ai" : "skipped",
        message: decision.message,
        detail: { goal: node.goal ?? "", ...decision.detail },
        tokensIn: decision.tokensIn || undefined,
        tokensOut: decision.tokensOut || undefined,
        costUsd: decision.costUsd || undefined,
      });
      break;
    }
  }

  // attempts was already bumped by the claim above.
  await db
    .update(engineJobs)
    .set({ status: failure ? "failed" : "done", lastError: failure })
    .where(eq(engineJobs.id, job.id));

  if (failure) {
    await db.update(automationRuns).set({ path }).where(eq(automationRuns.id, run.id));
    await endRun({ ...run, path }, "failed", failure);
    return;
  }

  if (stopRun) {
    await db.update(automationRuns).set({ path }).where(eq(automationRuns.id, run.id));
    await endRun({ ...run, path }, "completed", t("Przebieg zakończony."));
    return;
  }

  const nextId = nextNodeId(graph, node.id, handle);
  if (!nextId) {
    await db.update(automationRuns).set({ path }).where(eq(automationRuns.id, run.id));
    await endRun({ ...run, path }, "completed", t("Przebieg zakończony — koniec ścieżki."));
    return;
  }

  const waiting = nextDueAt > Date.now();
  await db
    .update(automationRuns)
    .set({ path, currentNodeId: nextId, status: waiting ? "waiting" : "running" })
    .where(eq(automationRuns.id, run.id));
  await scheduleJob({ runId: run.id, nodeId: nextId, dueAt: nextDueAt, stepIndex: path.length });
}

// ── one tick ────────────────────────────────────────────────────────────────

export interface TickResult {
  events: number;
  runsStarted: number;
  jobs: number;
}

/** One pass: turn new events into runs, then execute every job that has come due. */
export async function tick(): Promise<TickResult> {
  const db = getDb();
  let runsStarted = 0;

  const events = await takeUnprocessedEvents();
  // One read of the active automations for the whole batch — see processEvent.
  const active =
    events.length > 0
      ? await db.select().from(automations).where(eq(automations.status, "active"))
      : [];
  for (const event of events) {
    try {
      runsStarted += await processEvent(event, active);
    } catch (err) {
      await logStep({
        contactId: event.contactId,
        kind: "error",
        message: t("Błąd dopasowania zdarzenia {type}: {v1}", {
          type: event.type,
          v1: String(err),
        }),
      });
    }
    await markEventProcessed(event.id);
  }

  // 200 steps per 4-second tick ≈ 50 steps/s of sustained throughput. The
  // busy-guard means a slow batch (e.g. many real sends) simply stretches the
  // tick instead of overlapping the next one.
  const due = await db
    .select()
    .from(engineJobs)
    .where(and(eq(engineJobs.status, "pending"), lte(engineJobs.dueAt, Date.now())))
    .orderBy(asc(engineJobs.dueAt))
    .limit(200);

  for (const job of due) {
    try {
      await runStep(job);
    } catch (err) {
      await db
        .update(engineJobs)
        .set({ status: "failed", attempts: job.attempts + 1, lastError: String(err) })
        .where(eq(engineJobs.id, job.id));
      await logStep({
        runId: job.runId,
        nodeId: job.nodeId,
        kind: "error",
        message: t("Nieobsłużony błąd kroku: {v0}", { v0: String(err) }),
      });
    }
  }

  // Wysyłki do segmentów jadą na tej samej pętli co automatyzacje — jeden
  // zegar w systemie zamiast drugiego harmonogramu, który mógłby się z nim
  // rozjechać. Błąd kampanii nie może przewrócić tiku, stąd try.
  try {
    await processDueCampaigns();
  } catch (err) {
    await logStep({ kind: "error", message: t("Błąd obsługi wysyłek: {v0}", { v0: String(err) }) });
  }

  return { events: events.length, runsStarted, jobs: due.length };
}
