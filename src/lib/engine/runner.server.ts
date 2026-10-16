import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, like, lte } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { automations, automationRuns, engineJobs, engineWaits } from "../db/schema";
import type { EngineEventRow, EngineEventType, AutomationRunRow } from "../db/schema";
import { fallbackPart, pickSplitVariant } from "../automation-flow";
import { triggerLabel } from "../automation-catalog";
import type { AutomationGraph, AutomationNode, DelayUnit } from "../automation-flow";
import {
  executeAction,
  evaluateCondition,
  evaluatePath,
  isMessageAction,
  marketingChannel,
  type ActionResult,
} from "./actions.server";
import { overMarketingCap, recordMarketingTouch } from "./marketing-cap.server";
import { runAgentNode } from "./agent.server";
import { logStep } from "./log.server";
import { gateAutomationMessage, recordMessageSent } from "./settings.server";
import { deferralMessage } from "./send-window";
import { formatActivityDate } from "../activity-date";
import { takeUnprocessedEvents, markEventProcessed } from "./events.server";
import { scanTimeTriggers } from "./time-triggers.server";
import { processDueCampaigns } from "../campaigns/campaigns.server";
import { t } from "@/lib/i18n";

// The heart of the engine: match events to triggers, walk the graph one node
// per job, and never do the same step twice.

/** Trigger catalog key → the event type it subscribes to. Keys absent here have no real event source yet. */
export const TRIGGER_EVENT_TYPES: Record<string, EngineEventType> = {
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
  visit_months_ago: "time.visit_months_ago",
  birthday: "time.birthday",
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

/**
 * Does this event match a catalog key with these filters? The same matcher
 * triggers, waits and goals use, so "visit booked, service contains kardio"
 * means one thing everywhere.
 */
export function eventMatches(
  key: string,
  config: Record<string, string> | undefined,
  event: EngineEventRow,
): boolean {
  return triggerMatches(
    { id: "", kind: "trigger", position: { x: 0, y: 0 }, key, config: config ?? {} },
    event,
  );
}

/** Does this trigger node fire for this event? An empty filter field means "any". */
function triggerMatches(node: AutomationNode, event: EngineEventRow): boolean {
  const key = node.key ?? "";
  if (TRIGGER_EVENT_TYPES[key] !== event.type) return false;

  const config = node.config ?? {};
  const payload = event.payload ?? {};
  switch (key) {
    // A time event is fired for one automation by the scan, which already
    // applied that trigger's settings — see time-triggers.server.ts.
    case "visit_months_ago":
    case "birthday":
      return true;
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
  /** Tells apart a second job for the same step — the timeout of a wait. */
  suffix?: string;
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
      idempotencyKey: `${input.runId}:${input.nodeId}:${input.stepIndex}${input.suffix ?? ""}`,
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

    if (event.type.startsWith("time.") && event.payload?.automationId !== automation.id) continue;
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

// ── the goal reached ────────────────────────────────────────────────────────

/**
 * Ends the runs this event completes: an automation whose goal it is, with
 * "end the run at the goal" on, for this patient, after the run began and
 * within the goal's window. The patient who booked stops getting reminders
 * to book. Pending steps and open waits of the run are closed with it.
 */
async function exitOnGoal(event: EngineEventRow): Promise<number> {
  if (!event.contactId) return 0;
  const db = getDb();
  const live = await db
    .select()
    .from(automationRuns)
    .where(
      and(
        eq(automationRuns.contactId, event.contactId),
        inArray(automationRuns.status, ["running", "waiting"]),
      ),
    );
  let ended = 0;
  for (const run of live) {
    const automation = await db
      .select()
      .from(automations)
      .where(eq(automations.id, run.automationId))
      .get();
    const goal = automation?.goal;
    if (!goal || !goal.exit || TRIGGER_EVENT_TYPES[goal.key] !== event.type) continue;
    if (event.occurredAt < run.startedAt) continue;
    if (event.occurredAt > run.startedAt + Math.max(1, goal.days) * DELAY_MS.days) continue;
    if (!eventMatches(goal.key, goal.config, event)) continue;

    await db
      .update(engineJobs)
      .set({ status: "done" })
      .where(and(eq(engineJobs.runId, run.id), inArray(engineJobs.status, ["pending", "held"])));
    await db
      .update(engineWaits)
      .set({ resolvedAt: Date.now(), outcome: "event" })
      .where(and(eq(engineWaits.runId, run.id), isNull(engineWaits.resolvedAt)));
    await endRun(
      run,
      "completed",
      t("Cel osiągnięty: {goal} — przebieg zakończony.", {
        goal: triggerLabel({
          nodes: [
            {
              id: "",
              kind: "trigger",
              position: { x: 0, y: 0 },
              key: goal.key,
              config: goal.config,
            },
          ],
          edges: [],
        }),
      }),
    );
    ended += 1;
  }
  return ended;
}

// ── waiting for an event ────────────────────────────────────────────────────

const TIMEOUT_SUFFIX = ":timeout";
/** What a channel-fallback step waits for: an open or a click of the one e-mail it sent. */
const EMAIL_ENGAGED = "email_engaged";

/** "Pacjent odpisał", "Wizyta zarezerwowana: kardio" — what a wait step waits for. */
function waitLabel(node: AutomationNode): string {
  return triggerLabel({ nodes: [{ ...node, kind: "trigger" }], edges: [] });
}

/**
 * Closes every open wait this event answers: the patient's own event, of the
 * kind waited for, matching its filters, after the wait began. The run goes
 * on down the "event" path at once, and the timeout job is cancelled. Claimed
 * with a conditional update, so an event and a deadline at the same moment
 * close it exactly once.
 */
async function resolveWaits(event: EngineEventRow): Promise<number> {
  if (!event.contactId) return 0;
  const db = getDb();
  const open = await db
    .select()
    .from(engineWaits)
    .where(and(eq(engineWaits.contactId, event.contactId), isNull(engineWaits.resolvedAt)));
  let resolved = 0;
  for (const w of open) {
    if (event.occurredAt < w.since) continue;
    if (w.eventKey === EMAIL_ENGAGED) {
      // The fallback's own e-mail, opened or clicked — not any e-mail.
      if (event.type !== "email.opened" && event.type !== "email.clicked") continue;
      if (!w.config.token || event.payload?.token !== w.config.token) continue;
    } else {
      if (TRIGGER_EVENT_TYPES[w.eventKey] !== event.type) continue;
      const probe: AutomationNode = {
        id: w.nodeId,
        kind: "trigger",
        position: { x: 0, y: 0 },
        key: w.eventKey,
        config: w.config,
      };
      if (!triggerMatches(probe, event)) continue;
    }
    const claimed = await db
      .update(engineWaits)
      .set({ resolvedAt: Date.now(), outcome: "event" })
      .where(and(eq(engineWaits.id, w.id), isNull(engineWaits.resolvedAt)))
      .returning({ id: engineWaits.id });
    if (claimed.length === 0) continue;
    await db
      .update(engineJobs)
      .set({ status: "done" })
      .where(
        and(
          eq(engineJobs.runId, w.runId),
          eq(engineJobs.nodeId, w.nodeId),
          eq(engineJobs.status, "pending"),
          like(engineJobs.idempotencyKey, `%${TIMEOUT_SUFFIX}`),
        ),
      );

    const run = await db.select().from(automationRuns).where(eq(automationRuns.id, w.runId)).get();
    if (!run || run.status !== "waiting") continue;
    const automation = await db
      .select()
      .from(automations)
      .where(eq(automations.id, run.automationId))
      .get();
    if (!automation || automation.status !== "active" || !automation.flow) {
      await endRun(run, "stopped", t("Automatyzacja została wyłączona — przebieg zatrzymany."));
      continue;
    }
    const node = findNode(automation.flow, w.nodeId);
    const path = [...(run.path ?? []), w.nodeId];
    const fallback = node?.kind === "fallback";
    await logStep({
      runId: run.id,
      automationId: run.automationId,
      contactId: run.contactId,
      nodeId: w.nodeId,
      kind: "condition",
      message: fallback
        ? t("E-mail otwarty — SMS nie jest potrzebny.")
        : t("Doczekano się „{label}” — ścieżka „zdarzenie”.", {
            label: node ? waitLabel(node) : w.eventKey,
          }),
      detail: { event: w.eventKey, branch: fallback ? "out" : "event", eventType: event.type },
    });
    const next = nextNodeId(automation.flow, w.nodeId, fallback ? "out" : "event");
    if (!next) {
      await db.update(automationRuns).set({ path }).where(eq(automationRuns.id, run.id));
      await endRun({ ...run, path }, "completed", t("Przebieg zakończony — koniec ścieżki."));
      continue;
    }
    await db
      .update(automationRuns)
      .set({ path, currentNodeId: next, status: "running" })
      .where(eq(automationRuns.id, run.id));
    await scheduleJob({ runId: run.id, nodeId: next, dueAt: Date.now(), stepIndex: path.length });
    resolved += 1;
  }
  return resolved;
}

// ── one action step ─────────────────────────────────────────────────────────

/**
 * Runs one action — for a message, everything around the send: a rejected
 * approval, the weekly marketing cap, the trial hold, the sending window,
 * and the counters after. "parked" means the job was held or deferred and
 * the step must not move on; null means it was skipped and logged; otherwise
 * the action's own result. Shared by the action step and both halves of the
 * channel-fallback step, so every send obeys the same rules.
 */
async function performAction(
  job: typeof engineJobs.$inferSelect,
  run: AutomationRunRow,
  automation: AutomationRow,
  node: AutomationNode,
  base: { runId: string; automationId: string; contactId: string; nodeId: string },
): Promise<ActionResult | null | "parked"> {
  const db = getDb();
  // A message step of an automation still in its trial waits for a person.
  if (isMessageAction(node) && job.review === "rejected") {
    await logStep({
      ...base,
      kind: "skipped",
      message: t("Wiadomość odrzucona przy zatwierdzaniu — krok pominięty, przebieg idzie dalej."),
      detail: { action: node.key ?? "", review: "rejected" },
    });
    return null;
  }
  // The weekly cap on marketing, across every automation and campaign:
  // past it, the step is skipped (not postponed — a backlog would only
  // arrive later in one burst) and the run goes on. Checked before the
  // trial hold, so nobody is asked to approve a message that cannot go.
  const marketing = marketingChannel(node);
  if (marketing) {
    const over = await overMarketingCap(run.contactId);
    if (over) {
      await logStep({
        ...base,
        kind: "skipped",
        message: t(
          "Pominięto — pacjent dostał już {sent} wiadomości marketingowych w ciągu 7 dni (limit {cap}). Przebieg idzie dalej.",
          { sent: over.sent, cap: over.cap },
        ),
        detail: { action: node.key ?? "", cap: String(over.cap) },
      });
      return null;
    }
  }
  if (
    isMessageAction(node) &&
    job.review !== "approved" &&
    automation.reviewed < automation.reviewFirst
  ) {
    const { holdForReview } = await import("../agent/automation-review.server");
    const held = await holdForReview({ automation, run, jobId: job.id, node });
    if (held) {
      await db.update(engineJobs).set({ status: "held" }).where(eq(engineJobs.id, job.id));
      await db
        .update(automationRuns)
        .set({ status: "waiting", currentNodeId: node.id })
        .where(eq(automationRuns.id, run.id));
      await logStep({
        ...base,
        kind: "agent",
        message: t(
          "Wiadomość czeka na zatwierdzenie — automatyzacja w okresie próbnym ({done} z {all} zatwierdzonych).",
          { done: automation.reviewed, all: automation.reviewFirst },
        ),
        detail: { action: node.key ?? "", draftId: held },
      });
      return "parked";
    }
  }
  // The sending window and the limits — the campaigns' rules, for
  // automations too. A message that may not go now waits for its moment:
  // the job goes back to pending with a later due time, and the claim
  // above does not count as an attempt.
  let gate: Awaited<ReturnType<typeof gateAutomationMessage>> | null = null;
  if (isMessageAction(node)) {
    gate = await gateAutomationMessage(automation.quietHours === "ignore");
    if (!gate.send) {
      const message = deferralMessage(gate, gate, formatActivityDate(gate.nextAt));
      await db
        .update(engineJobs)
        .set({
          status: "pending",
          dueAt: gate.nextAt,
          attempts: job.attempts,
          lastError: `deferred:${gate.blockedBy}`,
        })
        .where(eq(engineJobs.id, job.id));
      await db
        .update(automationRuns)
        .set({ status: "waiting", currentNodeId: node.id })
        .where(eq(automationRuns.id, run.id));
      // One line per reason, not one per tick: a queue held back by the
      // hourly pace would otherwise write the same sentence every slot.
      if (job.lastError !== `deferred:${gate.blockedBy}`)
        await logStep({
          ...base,
          kind: "delay",
          message,
          detail: { action: node.key ?? "", dueAt: new Date(gate.nextAt).toISOString() },
        });
      return "parked";
    }
  }
  const result = await executeAction(node, run.contactId, {
    runId: run.id,
    automationId: run.automationId,
    nodeId: node.id,
  });
  if (gate && result.status === "ok") await recordMessageSent(gate);
  if (marketing && result.status === "ok")
    await recordMarketingTouch({
      contactId: run.contactId,
      channel: marketing,
      source: "automation",
      automationId: run.automationId,
    });
  await logStep({
    ...base,
    kind: result.status === "error" ? "error" : result.status === "skipped" ? "skipped" : "action",
    message: result.message,
    detail: { action: node.key ?? "", ...(result.detail ?? {}) },
  });
  return result;
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
      const done = await performAction(job, run, automation, node, base);
      if (done === "parked") return;
      if (done?.status === "error") failure = done.message;
      if (done?.stopRun) stopRun = true;
      break;
    }

    case "fallback": {
      // E-mail first; SMS only if this e-mail is not opened (or clicked) in
      // time — or if no e-mail went at all. Both sends go through
      // performAction, so consent, the cap, the trial and the sending window
      // apply to each exactly as to an ordinary message step.
      const emailStep = fallbackPart(node, "email");
      const smsStep = fallbackPart(node, "sms");
      if (!job.idempotencyKey.endsWith(TIMEOUT_SUFFIX)) {
        const sent = await performAction(job, run, automation, emailStep, base);
        if (sent === "parked") return;
        const token = sent?.status === "ok" ? sent.detail?.token : undefined;
        const now = Date.now();
        const until = token
          ? now + Math.max(1, node.amount ?? 24) * DELAY_MS[node.unit ?? "hours"]
          : now;
        if (token)
          await db.insert(engineWaits).values({
            id: randomUUID(),
            runId: run.id,
            nodeId: node.id,
            contactId: run.contactId,
            eventKey: EMAIL_ENGAGED,
            config: { token },
            since: now,
            until,
          });
        await db.update(engineJobs).set({ status: "done" }).where(eq(engineJobs.id, job.id));
        await db
          .update(automationRuns)
          .set({ status: token ? "waiting" : "running", currentNodeId: node.id })
          .where(eq(automationRuns.id, run.id));
        await scheduleJob({
          runId: run.id,
          nodeId: node.id,
          dueAt: until,
          stepIndex: path.length - 1,
          suffix: TIMEOUT_SUFFIX,
        });
        await logStep({
          ...base,
          kind: "delay",
          message: token
            ? t("E-mail wysłany — jeśli nie zostanie otwarty do {at}, pójdzie SMS.", {
                at: formatActivityDate(until),
              })
            : t("E-mail nie wyszedł — od razu SMS."),
          detail: { fallback: token ? "waiting" : "now" },
        });
        return;
      }
      // The deadline — or no e-mail went. An open that came first wins.
      const last = await db
        .select()
        .from(engineWaits)
        .where(and(eq(engineWaits.runId, run.id), eq(engineWaits.nodeId, node.id)))
        .orderBy(desc(engineWaits.since))
        .limit(1)
        .get();
      if (last && last.resolvedAt === null) {
        const closed = await db
          .update(engineWaits)
          .set({ resolvedAt: Date.now(), outcome: "timeout" })
          .where(and(eq(engineWaits.id, last.id), isNull(engineWaits.resolvedAt)))
          .returning({ id: engineWaits.id });
        if (closed.length === 0) {
          await db.update(engineJobs).set({ status: "done" }).where(eq(engineJobs.id, job.id));
          return;
        }
      } else if (last?.outcome === "event") {
        await db.update(engineJobs).set({ status: "done" }).where(eq(engineJobs.id, job.id));
        return;
      }
      const sms = await performAction(job, run, automation, smsStep, base);
      if (sms === "parked") return;
      if (sms?.status === "error") failure = sms.message;
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

    case "wait": {
      const label = waitLabel(node);
      if (!job.idempotencyKey.endsWith(TIMEOUT_SUFFIX)) {
        // Arrival: park the run and set the alarm for the deadline.
        const since = Date.now();
        const until = since + Math.max(1, node.amount ?? 1) * DELAY_MS[node.unit ?? "days"];
        await db.insert(engineWaits).values({
          id: randomUUID(),
          runId: run.id,
          nodeId: node.id,
          contactId: run.contactId,
          eventKey: node.key ?? "",
          config: node.config ?? {},
          since,
          until,
        });
        await db.update(engineJobs).set({ status: "done" }).where(eq(engineJobs.id, job.id));
        await db
          .update(automationRuns)
          .set({ status: "waiting", currentNodeId: node.id })
          .where(eq(automationRuns.id, run.id));
        await scheduleJob({
          runId: run.id,
          nodeId: node.id,
          dueAt: until,
          stepIndex: path.length - 1,
          suffix: TIMEOUT_SUFFIX,
        });
        await logStep({
          ...base,
          kind: "delay",
          message: t("Czeka na „{label}” najdłużej do {at}.", {
            label,
            at: formatActivityDate(until),
          }),
          detail: { event: node.key ?? "", until: new Date(until).toISOString() },
        });
        return;
      }
      // The deadline: the wait closes down "timeout", unless the event won.
      const closed = await db
        .update(engineWaits)
        .set({ resolvedAt: Date.now(), outcome: "timeout" })
        .where(
          and(
            eq(engineWaits.runId, run.id),
            eq(engineWaits.nodeId, node.id),
            isNull(engineWaits.resolvedAt),
          ),
        )
        .returning({ id: engineWaits.id });
      if (closed.length === 0) {
        await db.update(engineJobs).set({ status: "done" }).where(eq(engineJobs.id, job.id));
        return;
      }
      handle = "timeout";
      await logStep({
        ...base,
        kind: "condition",
        message: t("Nie doczekano się „{label}” — ścieżka „czas minął”.", { label }),
        detail: { event: node.key ?? "", branch: "timeout" },
      });
      break;
    }

    case "aiAgent": {
      // A failed agent call is deliberately NOT a failed run: it falls back to
      // the first path and says why. An LLM outage or a spent cost limit
      // shouldn't strand a patient halfway through a journey.
      const decision = await runAgentNode(node, run.contactId, run.automationId);
      handle = decision.handle;
      await logStep({
        ...base,
        // Keyed on tokens, not on success: a call that failed after burning
        // tokens still cost money, and the daily limit sums "ai" rows only.
        kind: (decision.calls ?? 0) > 0 || decision.tokensIn > 0 ? "ai" : "skipped",
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

  // Dates that came since the last look become events first, so the runs
  // they start are picked up in this same tick. A scan failure must not stop
  // the engine — the next scan retries.
  try {
    await scanTimeTriggers();
  } catch (err) {
    await logStep({
      kind: "error",
      message: t("Błąd wyzwalaczy czasowych: {v0}", { v0: String(err) }),
    });
  }

  const events = await takeUnprocessedEvents();
  // One read of the active automations for the whole batch — see processEvent.
  const active =
    events.length > 0
      ? await db.select().from(automations).where(eq(automations.status, "active"))
      : [];
  for (const event of events) {
    try {
      await exitOnGoal(event);
      await resolveWaits(event);
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
