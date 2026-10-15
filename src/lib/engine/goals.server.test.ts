/**
 * Goals through the real engine: reaching the goal ends the run when asked
 * to (its pending step closed with it), not when not asked, not for an event
 * from before the run; and the report counts conversions from the event bus
 * with the goal's filters. Own temp database, no network.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-goal-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { tick } = await import("./runner.server");
const { goalReportFor } = await import("./goals.server");
const { getDb } = await import("../db/client.server");
const { automationRuns, automations, contacts, engineEvents, engineJobs, engineLog } =
  await import("../db/schema");
const { eq } = await import("drizzle-orm");
import type { AutomationGoal, AutomationGraph } from "../automation-flow";

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
});

const DAY = 86_400_000;
// Trigger → wait three days → a reminder to book (a tag stands in for it).
const FLOW: AutomationGraph = {
  nodes: [
    { id: "t1", kind: "trigger", position: { x: 0, y: 0 }, key: "manual" },
    { id: "d1", kind: "delay", position: { x: 0, y: 0 }, amount: 3, unit: "days" },
    {
      id: "a1",
      kind: "action",
      position: { x: 0, y: 0 },
      key: "change_tags",
      config: { tag: "przypomnienie" },
    },
  ],
  edges: [
    { id: "e1", source: "t1", target: "d1" },
    { id: "e2", source: "d1", target: "a1" },
  ],
};

const db = () => getDb();

async function setup(goal: AutomationGoal | null, startedAgo = 0, ids = ["p1"]) {
  await db().insert(automations).values({
    id: "auto-1",
    name: "Zaproszenie na kontrolę",
    status: "active",
    flow: FLOW,
    updatedAt: "",
    reviewFirst: 0,
    reviewed: 0,
    goal,
  });
  for (const id of ids) {
    await db()
      .insert(contacts)
      .values({
        id,
        prmId: `PRM-${id}`,
        firstName: id,
        lastName: "Testowa",
        email: "",
        phone: "",
        segments: [],
        tags: [],
        source: "test",
        medium: "",
        campaign: "",
        createdAt: "2025-01-01",
        status: "patient",
        customFields: {},
      });
    await db()
      .insert(automationRuns)
      .values({
        id: `run-${id}`,
        automationId: "auto-1",
        contactId: id,
        currentNodeId: "a1",
        status: "waiting",
        path: ["t1", "d1"],
        startedAt: Date.now() - startedAgo,
      });
    await db()
      .insert(engineJobs)
      .values({
        id: `job-${id}`,
        runId: `run-${id}`,
        nodeId: "a1",
        dueAt: Date.now() + 3 * DAY,
        status: "pending",
        attempts: 0,
        idempotencyKey: `run-${id}:a1:2`,
        createdAt: Date.now(),
      });
  }
}

const booked = (contactId: string, title: string, occurredAt = Date.now()) =>
  db()
    .insert(engineEvents)
    .values({
      id: `ev-${contactId}-${occurredAt}-${title}`,
      type: "visit.scheduled",
      contactId,
      payload: { title },
      occurredAt,
      processedAt: null,
    });
const runOf = (id = "p1") =>
  db()
    .select()
    .from(automationRuns)
    .where(eq(automationRuns.id, `run-${id}`))
    .get();

beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  for (const t of [automationRuns, automations, contacts, engineEvents, engineJobs, engineLog])
    await db().delete(t);
});

const GOAL: AutomationGoal = { key: "visit_scheduled", config: {}, days: 14, exit: true };

describe("reaching the goal", () => {
  test("ends the run when asked to — the reminder to book never goes", async () => {
    await setup(GOAL);
    await booked("p1", "Kontrola");
    await tick();
    const run = await runOf();
    expect(run?.status).toBe("completed");
    expect(
      (await db().select().from(engineJobs).where(eq(engineJobs.id, "job-p1")).get())?.status,
    ).toBe("done");
    const ended = (await db().select().from(engineLog)).find((l) => l.kind === "run_ended");
    expect(ended?.message).toContain("Cel osiągnięty");
  });

  test("does not end it when the goal only measures", async () => {
    await setup({ ...GOAL, exit: false });
    await booked("p1", "Kontrola");
    await tick();
    expect((await runOf())?.status).toBe("waiting");
  });

  test("an event from before the run, or one the filter rules out, does not end it", async () => {
    await setup({ ...GOAL, config: { service: "kardio" } }, DAY);
    await booked("p1", "Konsultacja kardiologiczna", Date.now() - 2 * DAY);
    await booked("p1", "Dermatolog");
    await tick();
    expect((await runOf())?.status).toBe("waiting");
  });
});

describe("the report", () => {
  test("counts conversions from the event bus, with the goal's filters and window", async () => {
    await setup({ ...GOAL, exit: false, config: { service: "kardio" } }, 20 * DAY, [
      "p1",
      "p2",
      "p3",
    ]);
    const start = Date.now() - 20 * DAY;
    await booked("p1", "Konsultacja kardiologiczna", start + 2 * DAY); // in time
    await booked("p2", "Konsultacja kardiologiczna", start + 16 * DAY); // too late
    await booked("p3", "Dermatolog", start + 2 * DAY); // not this service
    const automation = (await db().select().from(automations).get())!;
    const report = await goalReportFor(automation);
    expect(report).toMatchObject({ entered: 3, converted: 1, pending: 0 });
    expect(report?.rate).toBeCloseTo(1 / 3);
  });

  test("no goal, no report", async () => {
    await setup(null);
    const automation = (await db().select().from(automations).get())!;
    expect(await goalReportFor(automation)).toBeNull();
  });
});
