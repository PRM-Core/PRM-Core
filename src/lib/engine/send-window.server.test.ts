/**
 * The sending window and the limits through the real engine: a message step
 * outside the window waits (and says so once), an automation that opted out
 * sends anyway, and the hourly limit holds the second message back. Own temp
 * database; Twilio's `fetch` replaced, no network. The window is computed
 * from the current Warsaw time, so the test passes at any hour.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-window-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { tick } = await import("./runner.server");
const { getSendSettings } = await import("./settings.server");
const { warsawMinuteOfDay } = await import("../visits/warsaw-time");
const { getDb } = await import("../db/client.server");
const {
  automationRuns,
  automations,
  contacts,
  contentSnapshots,
  engineJobs,
  engineLog,
  engineSettings,
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
afterAll(() => {
  globalThis.fetch = realFetch;
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
  ],
  edges: [{ id: "e1", source: "t1", target: "a1" }],
};

/** "HH:MM" this many minutes from now, Warsaw time. */
function hhmmIn(minutes: number): string {
  const m = (warsawMinuteOfDay(Date.now()) + minutes + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token_test";
  smsCalls = [];
  globalThis.fetch = (async (url: string | URL) => {
    smsCalls.push(String(url));
    return Response.json({ sid: "SM_test", status: "queued" }, { status: 201 });
  }) as unknown as typeof fetch;
  const db = getDb();
  for (const t of [
    automationRuns,
    automations,
    contacts,
    contentSnapshots,
    engineJobs,
    engineLog,
    engineSettings,
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

async function setup(
  settings: Partial<typeof engineSettings.$inferInsert>,
  quietHours: "respect" | "ignore",
  patients: string[],
) {
  const db = getDb();
  await db.insert(engineSettings).values({ baseUrl: "", updatedAt: "", ...settings });
  await db.insert(automations).values({
    id: "auto-1",
    name: "Potwierdzenie wizyty",
    status: "active",
    flow: FLOW,
    updatedAt: "",
    reviewFirst: 0,
    reviewed: 0,
    quietHours,
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
const delayLines = async () =>
  (await getDb().select().from(engineLog)).filter((l) => l.kind === "delay");

describe("automation messages and the sending window", () => {
  test("outside the window: nothing is sent, the step waits for the window and says so once", async () => {
    // A window that opens in two hours — now is always outside it.
    await setup({ sendFrom: hhmmIn(120), sendTo: hhmmIn(180) }, "respect", ["p1"]);
    await tick();
    expect(smsCalls).toHaveLength(0);
    const j = await job("p1");
    expect(j?.status).toBe("pending");
    expect(j?.attempts).toBe(0);
    expect(j!.dueAt).toBeGreaterThan(Date.now() + 100 * 60_000);
    const run = await getDb()
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.id, "run-p1"))
      .get();
    expect(run?.status).toBe("waiting");
    expect(await delayLines()).toHaveLength(1);
    expect((await delayLines())[0].message).toContain("Poza godzinami wysyłki");

    // Due again (as if the clock had moved on but the window were still shut):
    // still waiting, and the log does not repeat itself.
    await getDb()
      .update(engineJobs)
      .set({ dueAt: Date.now() - 1000 })
      .where(eq(engineJobs.id, "job-p1"));
    await tick();
    expect(smsCalls).toHaveLength(0);
    expect(await delayLines()).toHaveLength(1);
  });

  test("inside the window it goes at once and counts toward today", async () => {
    await setup({ sendFrom: hhmmIn(-60), sendTo: hhmmIn(60) }, "respect", ["p1"]);
    await tick();
    expect(smsCalls).toHaveLength(1);
    expect((await job("p1"))?.status).toBe("done");
    expect((await getSendSettings()).sentToday).toBe(1);
  });

  test("an automation that opted out of the window sends now", async () => {
    await setup({ sendFrom: hhmmIn(120), sendTo: hhmmIn(180) }, "ignore", ["p1"]);
    await tick();
    expect(smsCalls).toHaveLength(1);
  });

  test("the hourly limit lets one through and holds the next for its slot", async () => {
    await setup({ perHourLimit: 1 }, "respect", ["p1", "p2"]);
    await tick();
    expect(smsCalls).toHaveLength(1);
    const held = [(await job("p1"))!, (await job("p2"))!].find((j) => j.status === "pending");
    expect(held).toBeDefined();
    expect(held!.dueAt).toBeGreaterThan(Date.now() + 50 * 60_000);
    expect((await delayLines())[0].message).toContain("na godzinę");
  });
});
