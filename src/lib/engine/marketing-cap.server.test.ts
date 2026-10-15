/**
 * The weekly cap on marketing messages per patient, through the real engine:
 * at the cap a marketing step is skipped and the run goes on, last week's
 * messages do not count, administrative messages are never capped or
 * counted, and a sent marketing message is recorded against the automation.
 * Own temp database; Twilio's `fetch` replaced, no network.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-cap-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { tick } = await import("./runner.server");
const { recordMarketingTouch, marketingThisWeek, WEEK_MS } = await import("./marketing-cap.server");
const { getDb } = await import("../db/client.server");
const {
  automationRuns,
  automations,
  contacts,
  contentSnapshots,
  engineJobs,
  engineLog,
  engineSettings,
  marketingTouches,
  smsSends,
  smsSenders,
} = await import("../db/schema");
const { eq } = await import("drizzle-orm");
import type { AutomationGraph } from "../automation-flow";

const realFetch = globalThis.fetch;
let smsCalls = 0;

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

const flow = (sendMode: string): AutomationGraph => ({
  nodes: [
    { id: "t1", kind: "trigger", position: { x: 0, y: 0 }, key: "manual" },
    {
      id: "a1",
      kind: "action",
      position: { x: 0, y: 0 },
      key: "send_sms",
      config: { template: "Promocja", sendMode },
    },
    {
      id: "a2",
      kind: "action",
      position: { x: 0, y: 0 },
      key: "change_tags",
      config: { tag: "dalej" },
    },
  ],
  edges: [
    { id: "e1", source: "t1", target: "a1" },
    { id: "e2", source: "a1", target: "a2" },
  ],
});

beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token_test";
  smsCalls = 0;
  globalThis.fetch = (async () => {
    smsCalls += 1;
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
    marketingTouches,
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
    id: "sms:promocja",
    kind: "sms",
    name: "Promocja",
    contentItemId: "ci-1",
    html: "",
    smsBody: "Dzień dobry {{firstName}}, zapraszamy na badania profilaktyczne.",
    updatedAt: 0,
  } as never);
});

async function setup(cap: number | null, sendMode = "Marketingowy") {
  const db = getDb();
  await db.insert(engineSettings).values({ baseUrl: "", updatedAt: "", marketingPerWeek: cap });
  await db.insert(automations).values({
    id: "auto-1",
    name: "Profilaktyka",
    status: "active",
    flow: flow(sendMode),
    updatedAt: "",
    reviewFirst: 0,
    reviewed: 0,
  });
  await db.insert(contacts).values({
    id: "p1",
    prmId: "PRM-p1",
    firstName: "Anna",
    lastName: "Testowa",
    email: "",
    phone: "+48000100200",
    consentSms: 1,
    segments: [],
    tags: [],
    source: "test",
    medium: "",
    campaign: "",
    createdAt: "2025-01-01",
    status: "patient",
    customFields: {},
  } as never);
  await db.insert(automationRuns).values({
    id: "run-1",
    automationId: "auto-1",
    contactId: "p1",
    currentNodeId: "a1",
    status: "running",
    path: ["t1"],
    startedAt: Date.now(),
  });
  await db.insert(engineJobs).values({
    id: "job-1",
    runId: "run-1",
    nodeId: "a1",
    dueAt: Date.now() - 1000,
    status: "pending",
    attempts: 0,
    idempotencyKey: "run-1:a1:1",
    createdAt: Date.now(),
  });
}

const tagsOf = async () =>
  (await getDb().select().from(contacts).where(eq(contacts.id, "p1")).get())?.tags ?? [];
const runTwice = async () => {
  await tick();
  await tick();
};

describe("the weekly marketing cap", () => {
  test("at the cap, the marketing step is skipped and the run goes on", async () => {
    await setup(2);
    await recordMarketingTouch({ contactId: "p1", channel: "email", source: "campaign" });
    await recordMarketingTouch({ contactId: "p1", channel: "sms", source: "automation" });
    await runTwice();
    expect(smsCalls).toBe(0);
    expect(await tagsOf()).toEqual(["dalej"]);
    const skipped = (await getDb().select().from(engineLog)).find((l) => l.kind === "skipped");
    expect(skipped?.message).toContain("limit 2");
  });

  test("last week's messages do not count", async () => {
    await setup(2);
    const old = Date.now() - WEEK_MS - 60_000;
    await recordMarketingTouch({ contactId: "p1", channel: "email", source: "campaign", at: old });
    await recordMarketingTouch({ contactId: "p1", channel: "sms", source: "automation", at: old });
    await runTwice();
    expect(smsCalls).toBe(1);
  });

  test("a sent marketing message counts, against this automation — and so does its SMS record", async () => {
    await setup(5);
    await runTwice();
    expect(smsCalls).toBe(1);
    expect(await marketingThisWeek("p1")).toBe(1);
    const [touch] = await getDb().select().from(marketingTouches);
    expect(touch).toMatchObject({ source: "automation", channel: "sms", automationId: "auto-1" });
    const [sms] = await getDb().select().from(smsSends);
    expect(sms.automationId).toBe("auto-1");
  });

  test("an administrative message is never capped and never counted", async () => {
    await setup(1, "Administracyjny");
    await recordMarketingTouch({ contactId: "p1", channel: "sms", source: "campaign" });
    await runTwice();
    expect(smsCalls).toBe(1);
    expect(await marketingThisWeek("p1")).toBe(1);
  });

  test("with no cap set, nothing is held back", async () => {
    await setup(null);
    for (let i = 0; i < 5; i++)
      await recordMarketingTouch({ contactId: "p1", channel: "email", source: "campaign" });
    await runTwice();
    expect(smsCalls).toBe(1);
  });
});
