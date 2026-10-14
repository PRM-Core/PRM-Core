/**
 * An automation on trial, through the real engine: its first messages are
 * held as drafts, an approved one goes out through the ordinary send code,
 * a rejected one is skipped and the run goes on, and after N approvals the
 * automation sends on its own. Own temp database; Twilio's `fetch` replaced,
 * no network.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-trial-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { tick } = await import("../engine/runner.server");
const { decideDraft, listDrafts } = await import("./drafts.server");
const { getDb } = await import("../db/client.server");
const {
  agentDrafts,
  automationRuns,
  automations,
  contacts,
  contentSnapshots,
  engineJobs,
  engineLog,
  smsSends,
  smsSenders,
} = await import("../db/schema");
const { eq } = await import("drizzle-orm");
import type { AutomationGraph } from "../automation-flow";

const realFetch = globalThis.fetch;
let smsCalls: string[] = [];

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
      position: { x: 0, y: 100 },
      key: "send_sms",
      config: { template: "Przypomnienie", sendMode: "Administracyjny" },
    },
    {
      id: "a2",
      kind: "action",
      position: { x: 0, y: 200 },
      key: "change_tags",
      config: { tag: "po-przypomnieniu" },
    },
  ],
  edges: [
    { id: "e1", source: "t1", target: "a1" },
    { id: "e2", source: "a1", target: "a2" },
  ],
};

beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token_test";
  smsCalls = [];
  globalThis.fetch = (async (url: string | URL, init: RequestInit) => {
    smsCalls.push(String(url));
    void init;
    return Response.json({ sid: "SM_test", status: "queued" }, { status: 201 });
  }) as unknown as typeof fetch;
  const db = getDb();
  for (const t of [
    agentDrafts,
    automationRuns,
    automations,
    contacts,
    contentSnapshots,
    engineJobs,
    engineLog,
    smsSends,
    smsSenders,
  ])
    await db.delete(t);
  await db.insert(smsSenders).values({
    id: "s1",
    label: "Placówka",
    value: "PRMTEST",
    kind: "alphanumeric",
    isDefault: 1,
    createdAt: 0,
  });
  await db.insert(contentSnapshots).values({
    id: "sms:przypomnienie",
    kind: "sms",
    name: "Przypomnienie",
    contentItemId: "ci-1",
    html: "",
    smsBody: "Dzień dobry {{firstName}}, przypominamy o wizycie.",
    updatedAt: 0,
  } as never);
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

async function setup(reviewFirst: number, patients: string[]) {
  const db = getDb();
  await db.insert(automations).values({
    id: "auto-1",
    name: "Przypomnienie o wizycie",
    status: "active",
    flow: FLOW,
    updatedAt: new Date().toISOString(),
    reviewFirst,
    reviewed: 0,
  });
  for (const id of patients) {
    await db.insert(contacts).values({
      id,
      prmId: `PRM-${id}`,
      firstName: `Anna-${id}`,
      lastName: "Testowa",
      email: "",
      phone: "+48000100200",
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
      id: `run-${id}`,
      automationId: "auto-1",
      contactId: id,
      currentNodeId: "a1",
      status: "running",
      path: ["t1"],
      startedAt: Date.now(),
    });
    await db.insert(engineJobs).values({
      id: `job-${id}`,
      runId: `run-${id}`,
      nodeId: "a1",
      dueAt: Date.now() - 1000,
      status: "pending",
      attempts: 0,
      idempotencyKey: `run-${id}:a1:1`,
      createdAt: Date.now(),
    });
  }
}

const job = async (id: string) =>
  getDb()
    .select()
    .from(engineJobs)
    .where(eq(engineJobs.id, `job-${id}`))
    .get();
const tagsOf = async (id: string) =>
  (await getDb().select().from(contacts).where(eq(contacts.id, id)).get())?.tags ?? [];

describe("an automation on trial", () => {
  test("holds its message as a draft with the text the patient would get, and sends nothing", async () => {
    await setup(2, ["p1"]);
    await tick();
    expect(smsCalls).toHaveLength(0);
    expect((await job("p1"))?.status).toBe("held");
    const [draft] = await listDrafts();
    expect(draft).toMatchObject({
      kind: "automation_message",
      status: "proposed",
      channel: "sms",
      audienceIds: ["p1"],
    });
    expect(draft.message).toBe("Dzień dobry Anna-p1, przypominamy o wizycie.");
    // Held is out of the tick's reach: another tick changes nothing.
    await tick();
    expect(smsCalls).toHaveLength(0);
  });

  test("approved: sent through the ordinary code, the run goes on, the count goes up", async () => {
    await setup(2, ["p1"]);
    await tick();
    const [draft] = await listDrafts();
    expect((await decideDraft({ id: draft.id, decision: "approve", decidedBy: "Admin" })).ok).toBe(
      true,
    );
    await tick(); // the send
    await tick(); // the next step
    expect(smsCalls.filter((u) => u.includes("twilio"))).toHaveLength(1);
    expect(await getDb().select().from(smsSends)).toHaveLength(1);
    expect(await tagsOf("p1")).toContain("po-przypomnieniu");
    const a = await getDb().select().from(automations).where(eq(automations.id, "auto-1")).get();
    expect(a?.reviewed).toBe(1);
  });

  test("rejected: nothing sent, the step skipped, the run goes on, the count stays", async () => {
    await setup(2, ["p1"]);
    await tick();
    const [draft] = await listDrafts();
    await decideDraft({ id: draft.id, decision: "reject", decidedBy: "Admin" });
    await tick();
    await tick();
    expect(smsCalls).toHaveLength(0);
    expect(await tagsOf("p1")).toContain("po-przypomnieniu");
    const a = await getDb().select().from(automations).where(eq(automations.id, "auto-1")).get();
    expect(a?.reviewed).toBe(0);
  });

  test("after N approvals the automation sends on its own", async () => {
    await setup(1, ["p1", "p2"]);
    await tick();
    // both held: the trial counts approvals, not attempts
    expect(await listDrafts()).toHaveLength(2);
    const [first] = await listDrafts();
    await decideDraft({ id: first.id, decision: "approve", decidedBy: "Admin" });
    // a third patient arrives after the trial is over
    await getDb().insert(contacts).values({
      id: "p3",
      prmId: "PRM-p3",
      firstName: "Anna-p3",
      lastName: "Testowa",
      email: "",
      phone: "+48000100200",
      segments: [],
      tags: [],
      source: "test",
      medium: "",
      campaign: "",
      createdAt: "2025-01-01",
      status: "patient",
      customFields: {},
    });
    await getDb()
      .insert(automationRuns)
      .values({
        id: "run-p3",
        automationId: "auto-1",
        contactId: "p3",
        currentNodeId: "a1",
        status: "running",
        path: ["t1"],
        startedAt: Date.now(),
      });
    await getDb()
      .insert(engineJobs)
      .values({
        id: "job-p3",
        runId: "run-p3",
        nodeId: "a1",
        dueAt: Date.now() - 1000,
        status: "pending",
        attempts: 0,
        idempotencyKey: "run-p3:a1:1",
        createdAt: Date.now(),
      });
    await tick();
    expect((await job("p3"))?.status).toBe("done");
    expect(await listDrafts()).toHaveLength(2); // no third draft
    expect(smsCalls.filter((u) => u.includes("twilio"))).toHaveLength(2); // the approved one and p3
  });

  test("an automation created before the trial existed (reviewFirst 0) sends as it always did", async () => {
    await setup(0, ["p1"]);
    await tick();
    expect(await listDrafts()).toHaveLength(0);
    expect(smsCalls.filter((u) => u.includes("twilio"))).toHaveLength(1);
  });

  test("no consent, no draft: there is nothing to approve, the step logs its skip", async () => {
    await setup(2, ["p1"]);
    await getDb()
      .update(automations)
      .set({
        flow: {
          ...FLOW,
          nodes: FLOW.nodes.map((n) =>
            n.id === "a1" ? { ...n, config: { template: "Przypomnienie" } } : n,
          ),
        },
      })
      .where(eq(automations.id, "auto-1"));
    await tick();
    expect(await listDrafts()).toHaveLength(0);
    expect(smsCalls).toHaveLength(0);
    expect((await job("p1"))?.status).toBe("done");
  });
});
