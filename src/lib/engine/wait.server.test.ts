/**
 * "Wait for an event, with a timeout" through the real engine: the patient's
 * event takes the "event" path at once, the deadline takes "timeout", an
 * event from before the wait does not count, a stranger's event or the wrong
 * kind does not count, the filters apply, and a late timeout after the event
 * changes nothing. Own temp database, no network.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-wait-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { tick } = await import("./runner.server");
const { emitEvent } = await import("./events.server");
const { getDb } = await import("../db/client.server");
const { automationRuns, automations, contacts, engineEvents, engineJobs, engineLog, engineWaits } =
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

function flow(key: string, config: Record<string, string> = {}): AutomationGraph {
  const tag = (id: string, value: string) => ({
    id,
    kind: "action" as const,
    position: { x: 0, y: 0 },
    key: "change_tags",
    config: { tag: value },
  });
  return {
    nodes: [
      { id: "t1", kind: "trigger", position: { x: 0, y: 0 }, key: "manual" },
      { id: "w1", kind: "wait", position: { x: 0, y: 0 }, key, config, amount: 2, unit: "days" },
      tag("yes", "odpisal"),
      tag("no", "brak-odpowiedzi"),
    ],
    edges: [
      { id: "e1", source: "t1", target: "w1" },
      { id: "e2", source: "w1", target: "yes", sourceHandle: "event" },
      { id: "e3", source: "w1", target: "no", sourceHandle: "timeout" },
    ],
  };
}

async function setup(graph: AutomationGraph, ids: string[] = ["p1"]) {
  const db = getDb();
  await db.insert(automations).values({
    id: "auto-1",
    name: "Potwierdzenie wizyty",
    status: "active",
    flow: graph,
    updatedAt: "",
    reviewFirst: 0,
    reviewed: 0,
  });
  for (const id of ids)
    await db.insert(contacts).values({
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
  await db.insert(automationRuns).values({
    id: "run-1",
    automationId: "auto-1",
    contactId: ids[0],
    currentNodeId: "w1",
    status: "running",
    path: ["t1"],
    startedAt: Date.now(),
  });
  await db.insert(engineJobs).values({
    id: "job-arrive",
    runId: "run-1",
    nodeId: "w1",
    dueAt: Date.now() - 1000,
    status: "pending",
    attempts: 0,
    idempotencyKey: "run-1:w1:1",
    createdAt: Date.now(),
  });
}

const db = () => getDb();
const tagsOf = async (id: string) =>
  (await db().select().from(contacts).where(eq(contacts.id, id)).get())?.tags ?? [];
const run = async () =>
  db().select().from(automationRuns).where(eq(automationRuns.id, "run-1")).get();
const waits = async () => db().select().from(engineWaits);
const timeoutJob = async () =>
  (await db().select().from(engineJobs)).find((j) => j.idempotencyKey.endsWith(":timeout"));
const replied = (contactId = "p1") =>
  emitEvent({ type: "contact.message_received", contactId, payload: { channel: "sms" } });

beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  for (const t of [
    automationRuns,
    automations,
    contacts,
    engineEvents,
    engineJobs,
    engineLog,
    engineWaits,
  ])
    await db().delete(t);
});

describe("wait for an event", () => {
  test("arrival parks the run and sets the deadline", async () => {
    await setup(flow("chat_message"));
    await tick();
    expect((await run())?.status).toBe("waiting");
    const [w] = await waits();
    expect(w).toMatchObject({ eventKey: "chat_message", resolvedAt: null, outcome: "" });
    expect(w.until - w.since).toBe(2 * 86_400_000);
    expect((await timeoutJob())?.dueAt).toBe(w.until);
  });

  test("the patient replies: the “event” path at once, the deadline cancelled", async () => {
    await setup(flow("chat_message"));
    await tick();
    await replied();
    await tick();
    expect(await tagsOf("p1")).toEqual(["odpisal"]);
    expect((await waits())[0].outcome).toBe("event");
    expect((await timeoutJob())?.status).toBe("done");
    expect((await run())?.path).toEqual(["t1", "w1", "yes"]);
  });

  test("nothing happens: the deadline takes the “timeout” path", async () => {
    await setup(flow("chat_message"));
    await tick();
    await db()
      .update(engineJobs)
      .set({ dueAt: Date.now() - 1000 })
      .where(eq(engineJobs.id, (await timeoutJob())!.id));
    await tick(); // the deadline: the wait closes, the next step is queued
    await tick(); // the next step
    expect(await tagsOf("p1")).toEqual(["brak-odpowiedzi"]);
    expect((await waits())[0].outcome).toBe("timeout");
  });

  test("an event from before the wait began does not count", async () => {
    await setup(flow("chat_message"));
    // Emitted first; the tick handles events before jobs, so the wait does
    // not exist yet when this event is read.
    await replied();
    await tick();
    await tick();
    expect((await run())?.status).toBe("waiting");
    expect(await tagsOf("p1")).toEqual([]);
  });

  test("another patient's event, or another kind of event, does not count", async () => {
    await setup(flow("chat_message"), ["p1", "p2"]);
    await tick();
    await replied("p2");
    await emitEvent({ type: "email.opened", contactId: "p1", payload: {} });
    await tick();
    expect((await run())?.status).toBe("waiting");
  });

  test("the event's filters apply — a visit of the named service only", async () => {
    await setup(flow("visit_scheduled", { service: "kardio" }));
    await tick();
    await emitEvent({ type: "visit.scheduled", contactId: "p1", payload: { title: "Dermatolog" } });
    await tick();
    expect((await run())?.status).toBe("waiting");
    await emitEvent({
      type: "visit.scheduled",
      contactId: "p1",
      payload: { title: "Konsultacja kardiologiczna" },
    });
    await tick();
    expect(await tagsOf("p1")).toEqual(["odpisal"]);
  });

  test("a late timeout job after the event changes nothing", async () => {
    await setup(flow("chat_message"));
    await tick();
    const late = (await timeoutJob())!;
    await replied();
    await tick();
    await db()
      .update(engineJobs)
      .set({ status: "pending", dueAt: Date.now() - 1000 })
      .where(eq(engineJobs.id, late.id));
    await tick();
    expect(await tagsOf("p1")).toEqual(["odpisal"]);
    expect((await run())?.path).toEqual(["t1", "w1", "yes"]);
  });

  test("switching the automation off while waiting stops the run when the event comes", async () => {
    await setup(flow("chat_message"));
    await tick();
    await db().update(automations).set({ status: "inactive" });
    await replied();
    await tick();
    expect((await run())?.status).toBe("stopped");
    expect(await tagsOf("p1")).toEqual([]);
  });
});
