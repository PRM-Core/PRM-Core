import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { automationRuns, automations, engineEvents } from "../db/schema";
import type { AutomationRow } from "../db/schema";
import type { AutomationGoal } from "../automation-flow";
import { eventMatches, TRIGGER_EVENT_TYPES } from "./runner.server";
import { goalReport, type GoalHit, type GoalReport } from "./goals";

// Conversion for automations with a goal, counted from what the system
// already records: the runs (who entered, when, which way they went) and the
// engine's event bus (what the patient did). Nothing new is written to
// measure it, so a goal set today also reports on the last 90 days of runs.

export const GOAL_LOOKBACK_DAYS = 90;
const IN_CHUNK = 400;

export async function goalReportFor(
  automation: AutomationRow,
  now = Date.now(),
  /** The goal to measure, when the screen has one the database may not have yet. */
  override?: AutomationGoal | null,
): Promise<GoalReport | null> {
  const goal = override === undefined ? automation.goal : override;
  const type = goal ? TRIGGER_EVENT_TYPES[goal.key] : undefined;
  if (!goal || !type) return null;
  const db = getDb();
  const since = now - GOAL_LOOKBACK_DAYS * 86_400_000;
  const runs = (
    await db
      .select({
        id: automationRuns.id,
        contactId: automationRuns.contactId,
        startedAt: automationRuns.startedAt,
        path: automationRuns.path,
      })
      .from(automationRuns)
      .where(
        and(eq(automationRuns.automationId, automation.id), gte(automationRuns.startedAt, since)),
      )
  ).map((r) => ({ ...r, path: r.path ?? [] }));

  const contactIds = [...new Set(runs.map((r) => r.contactId))];
  const hits: GoalHit[] = [];
  for (let i = 0; i < contactIds.length; i += IN_CHUNK) {
    const events = await db
      .select()
      .from(engineEvents)
      .where(
        and(
          eq(engineEvents.type, type),
          gte(engineEvents.occurredAt, since),
          inArray(engineEvents.contactId, contactIds.slice(i, i + IN_CHUNK)),
        ),
      );
    for (const e of events)
      if (e.contactId && eventMatches(goal.key, goal.config, e))
        hits.push({ contactId: e.contactId, occurredAt: e.occurredAt });
  }
  return goalReport(runs, hits, automation.flow, Math.max(1, goal.days), now);
}

/** Every automation with a goal, for the Statistics tab. */
export async function goalReports(now = Date.now()): Promise<Record<string, GoalReport>> {
  const rows = await getDb().select().from(automations);
  const out: Record<string, GoalReport> = {};
  for (const a of rows) {
    const report = await goalReportFor(a, now);
    if (report) out[a.id] = report;
  }
  return out;
}
