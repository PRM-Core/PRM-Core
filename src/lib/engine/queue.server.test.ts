/**
 * The queue view and the retry, against a temp database: each kind of step
 * lands in its list (and what is not real work stays out), a failed step put
 * back runs once more through the engine without a doubled path, and every
 * refusal holds. No network.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-queue-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { readQueue, retryJob, RetryRefused, STUCK_AFTER_MS } = await import("./queue.server");
const { tick } = await import("./runner.server");
const { getDb } = await import("../db/client.server");
const { automationRuns, automations, contacts, engineJobs, engineLog } =
  await import("../db/schema");
const { eq } = await import("drizzle-orm");
import type { AutomationGraph } from "../automation-flow";

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
});

const FLOW: AutomationGraph = {
  nodes: [
    { id: "t1", kind: "trigger", position: { x: 0, y: 0 }, key: "manual" },
    {
      id: "a1",
      kind: "action",
      position: { x: 0, y: 0 },
      key: "change_tags",
      config: { tag: "po-ponowieniu" },
    },
  ],
  edges: [{ id: "e1", source: "t1", target: "a1" }],
};

const NOW = Date.now();
const db = () => getDb();

beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  for (const t of [automationRuns, automations, contacts, engineJobs, engineLog])
    await db().delete(t);
  await db().insert(automations).values({
    id: "auto-1",
    name: "Przypomnienie",
    status: "active",
    flow: FLOW,
    updatedAt: "",
    reviewFirst: 0,
    reviewed: 0,
  });
});

async function patientRun(
  id: string,
  run: { status: "running" | "waiting" | "failed" | "completed"; path?: string[] },
  job: {
    status: "pending" | "held" | "failed" | "processing";
    dueAt?: number;
    lastError?: string | null;
    createdAt?: number;
  },
) {
  await db()
    .insert(contacts)
    .values({
      id,
      prmId: `PRM-${id}`,
      firstName: `Anna-${id}`,
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
      status: run.status,
      path: run.path ?? ["t1"],
      startedAt: NOW - 1000,
      lastError: job.status === "failed" ? "Twilio: 503" : null,
    });
  await db()
    .insert(engineJobs)
    .values({
      id: `job-${id}`,
      runId: `run-${id}`,
      nodeId: "a1",
      dueAt: job.dueAt ?? NOW,
      status: job.status,
      attempts: 1,
      idempotencyKey: `run-${id}:a1:1`,
      lastError: job.lastError ?? null,
      createdAt: job.createdAt ?? NOW,
    });
}

describe("the queue view", () => {
  test("each step in its list, with a reason; ended runs and running steps left out", async () => {
    await patientRun("sch", { status: "waiting" }, { status: "pending", dueAt: NOW + 3_600_000 });
    await patientRun(
      "def",
      { status: "waiting" },
      { status: "pending", dueAt: NOW + 3_600_000, lastError: "deferred:window" },
    );
    await patientRun("hel", { status: "waiting" }, { status: "held" });
    await patientRun(
      "fai",
      { status: "failed", path: ["t1", "a1"] },
      { status: "failed", lastError: "Twilio: 503" },
    );
    await patientRun(
      "stu",
      { status: "running" },
      { status: "processing", createdAt: NOW - STUCK_AFTER_MS - 1000 },
    );
    await patientRun("now", { status: "running" }, { status: "processing", createdAt: NOW });
    await patientRun("end", { status: "completed" }, { status: "pending" });

    const q = await readQueue(NOW);
    expect(q.counts).toEqual({ scheduled: 1, deferred: 1, held: 1, failed: 1, stuck: 1 });
    expect(q.failed[0]).toMatchObject({
      automationName: "Przypomnienie",
      contactLabel: "Anna-fai Testowa",
      reason: "Twilio: 503",
    });
    expect(q.deferred[0].reason).toContain("godzinami wysyłki");
    expect(q.stuck[0].reason).toContain("mógł zdążyć wysłać");
  });
});

describe("retry", () => {
  test("a failed step runs once more, the path not doubled, and the log says who", async () => {
    await patientRun(
      "fai",
      { status: "failed", path: ["t1", "a1"] },
      { status: "failed", lastError: "Twilio: 503" },
    );
    await retryJob("job-fai", "Admin");
    const run = await db()
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.id, "run-fai"))
      .get();
    expect(run).toMatchObject({ status: "running", lastError: null, path: ["t1"] });
    await tick();
    const after = await db()
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.id, "run-fai"))
      .get();
    expect(after?.status).toBe("completed");
    expect(after?.path).toEqual(["t1", "a1"]);
    const tags = (await db().select().from(contacts).where(eq(contacts.id, "fai")).get())?.tags;
    expect(tags).toEqual(["po-ponowieniu"]);
    const line = (await db().select().from(engineLog)).find((l) =>
      l.message.includes("Ponowienie kroku"),
    );
    expect(line?.message).toContain("Admin");
  });

  test("a stuck step only with confirmation — it may have sent already", async () => {
    await patientRun(
      "stu",
      { status: "running" },
      { status: "processing", createdAt: NOW - STUCK_AFTER_MS - 1000 },
    );
    await expect(retryJob("job-stu", "Admin", false, NOW)).rejects.toBeInstanceOf(RetryRefused);
    await retryJob("job-stu", "Admin", true, NOW);
    expect((await db().select().from(engineJobs).get())?.status).toBe("pending");
  });

  test("refused: automation off, step gone, another live run, or not a failed step", async () => {
    await patientRun(
      "fai",
      { status: "failed", path: ["t1", "a1"] },
      { status: "failed", lastError: "x" },
    );
    await db().update(automations).set({ status: "inactive" });
    await expect(retryJob("job-fai", "Admin")).rejects.toThrow(/wyłączona/);

    await db()
      .update(automations)
      .set({ status: "active", flow: { ...FLOW, nodes: FLOW.nodes.slice(0, 1), edges: [] } });
    await expect(retryJob("job-fai", "Admin")).rejects.toThrow(/scenariuszu/);

    await db().update(automations).set({ flow: FLOW });
    await db()
      .insert(automationRuns)
      .values({
        id: "run-live",
        automationId: "auto-1",
        contactId: "fai",
        currentNodeId: "a1",
        status: "waiting",
        path: ["t1"],
        startedAt: NOW,
      });
    await expect(retryJob("job-fai", "Admin")).rejects.toThrow(/innym trwającym/);

    await patientRun("sch", { status: "waiting" }, { status: "pending" });
    await expect(retryJob("job-sch", "Admin")).rejects.toThrow(/nieudany albo przerwany/);
  });
});
