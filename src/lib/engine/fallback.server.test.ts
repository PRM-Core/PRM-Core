/**
 * The channel-fallback step through the real engine: the e-mail goes, an
 * open (or a click) of that e-mail means no SMS, no open by the deadline
 * means one SMS, another e-mail's open does not count, and a patient with no
 * e-mail address gets the SMS at once. Own temp database; SendGrid's and
 * Twilio's `fetch` replaced, provider keys are fakes set for this file only.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-fallback-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { tick } = await import("./runner.server");
const { emitEvent } = await import("./events.server");
const { getDb } = await import("../db/client.server");
const {
  automationRuns,
  automations,
  contacts,
  contentSnapshots,
  emailSenders,
  emailSends,
  engineEvents,
  engineJobs,
  engineLog,
  engineSettings,
  engineWaits,
  smsSends,
  smsSenders,
} = await import("../db/schema");
const { eq } = await import("drizzle-orm");
import type { AutomationGraph } from "../automation-flow";

const ENV_KEYS = ["SENDGRID_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"] as const;
const previousEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;
let sent: { email: number; sms: number } = { email: 0, sms: 0 };

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
});
afterAll(() => {
  globalThis.fetch = realFetch;
  for (const k of ENV_KEYS)
    if (previousEnv[k] === undefined) delete process.env[k];
    else process.env[k] = previousEnv[k];
});

const FLOW: AutomationGraph = {
  nodes: [
    { id: "t1", kind: "trigger", position: { x: 0, y: 0 }, key: "manual" },
    {
      id: "f1",
      kind: "fallback",
      position: { x: 0, y: 0 },
      amount: 24,
      unit: "hours",
      config: {
        emailTemplate: "Zaproszenie",
        smsTemplate: "Zaproszenie SMS",
        sendMode: "Administracyjny",
      },
    },
    {
      id: "a1",
      kind: "action",
      position: { x: 0, y: 0 },
      key: "change_tags",
      config: { tag: "dalej" },
    },
  ],
  edges: [
    { id: "e1", source: "t1", target: "f1" },
    { id: "e2", source: "f1", target: "a1" },
  ],
};

beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  process.env.SENDGRID_API_KEY = "SG.test-only";
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token_test";
  sent = { email: 0, sms: 0 };
  globalThis.fetch = (async (url: string | URL) => {
    if (String(url).includes("sendgrid")) {
      sent.email += 1;
      return new Response(null, { status: 202 });
    }
    sent.sms += 1;
    return Response.json({ sid: "SM_test", status: "queued" }, { status: 201 });
  }) as unknown as typeof fetch;
  const db = getDb();
  for (const t of [
    automationRuns,
    automations,
    contacts,
    contentSnapshots,
    emailSenders,
    emailSends,
    engineEvents,
    engineJobs,
    engineLog,
    engineSettings,
    engineWaits,
    smsSends,
    smsSenders,
  ])
    await db.delete(t);
  await db.insert(engineSettings).values({ baseUrl: "http://localhost:5173", updatedAt: "" });
  await db.insert(emailSenders).values({
    id: "es1",
    name: "Placówka",
    email: "klinika@example.test",
    isDefault: 1,
    createdAt: 0,
  });
  await db.insert(smsSenders).values({
    id: "s1",
    label: "Placówka",
    value: "PRMTEST",
    kind: "alphanumeric",
    isDefault: 1,
    createdAt: 0,
  });
  await db.insert(contentSnapshots).values([
    {
      id: "email:zaproszenie",
      kind: "email",
      name: "Zaproszenie",
      contentItemId: "ci-1",
      html: "<p>Dzień dobry {{firstName}}, zapraszamy na kontrolę.</p>",
      subject: "Zaproszenie na kontrolę",
      smsBody: "",
      updatedAt: 0,
    },
    {
      id: "sms:zaproszenie sms",
      kind: "sms",
      name: "Zaproszenie SMS",
      contentItemId: "ci-2",
      html: "",
      smsBody: "Dzień dobry {{firstName}}, zapraszamy na kontrolę.",
      updatedAt: 0,
    },
  ] as never);
});

async function setup(email = "anna@example.test") {
  const db = getDb();
  await db.insert(automations).values({
    id: "auto-1",
    name: "Zaproszenie",
    status: "active",
    flow: FLOW,
    updatedAt: "",
    reviewFirst: 0,
    reviewed: 0,
  });
  await db.insert(contacts).values({
    id: "p1",
    prmId: "PRM-p1",
    firstName: "Anna",
    lastName: "Testowa",
    email,
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
    id: "run-1",
    automationId: "auto-1",
    contactId: "p1",
    currentNodeId: "f1",
    status: "running",
    path: ["t1"],
    startedAt: Date.now(),
  });
  await db.insert(engineJobs).values({
    id: "job-1",
    runId: "run-1",
    nodeId: "f1",
    dueAt: Date.now() - 1000,
    status: "pending",
    attempts: 0,
    idempotencyKey: "run-1:f1:1",
    createdAt: Date.now(),
  });
}

const tokenSent = async () => (await getDb().select().from(emailSends).get())?.token ?? "";
const tagsOf = async () =>
  (await getDb().select().from(contacts).where(eq(contacts.id, "p1")).get())?.tags ?? [];
const dueNow = async () => {
  const job = (await getDb().select().from(engineJobs)).find((j) =>
    j.idempotencyKey.endsWith(":timeout"),
  );
  await getDb()
    .update(engineJobs)
    .set({ dueAt: Date.now() - 1000 })
    .where(eq(engineJobs.id, job!.id));
};

describe("e-mail, then SMS if it is not opened", () => {
  test("the e-mail goes, and the step waits for its open", async () => {
    await setup();
    await tick();
    expect(sent).toEqual({ email: 1, sms: 0 });
    expect((await getDb().select().from(automationRuns).get())?.status).toBe("waiting");
  });

  test("opened in time: no SMS, the run goes on", async () => {
    await setup();
    await tick();
    await emitEvent({
      type: "email.opened",
      contactId: "p1",
      payload: { token: await tokenSent() },
    });
    await tick();
    expect(sent).toEqual({ email: 1, sms: 0 });
    expect(await tagsOf()).toEqual(["dalej"]);
  });

  test("a click counts as an open", async () => {
    await setup();
    await tick();
    await emitEvent({
      type: "email.clicked",
      contactId: "p1",
      payload: { token: await tokenSent(), url: "https://example.test" },
    });
    await tick();
    expect(sent.sms).toBe(0);
    expect(await tagsOf()).toEqual(["dalej"]);
  });

  test("not opened by the deadline: one SMS, then the run goes on", async () => {
    await setup();
    await tick();
    await dueNow();
    await tick(); // the deadline: the SMS
    await tick(); // the next step
    expect(sent).toEqual({ email: 1, sms: 1 });
    expect(await tagsOf()).toEqual(["dalej"]);
  });

  test("another e-mail's open does not count", async () => {
    await setup();
    await tick();
    await emitEvent({ type: "email.opened", contactId: "p1", payload: { token: "other" } });
    await tick();
    expect((await getDb().select().from(automationRuns).get())?.status).toBe("waiting");
    await dueNow();
    await tick();
    expect(sent.sms).toBe(1);
  });

  test("no e-mail address: the SMS goes at once", async () => {
    await setup("");
    await tick(); // the e-mail is skipped; the SMS is queued for now
    await tick(); // the SMS
    expect(sent).toEqual({ email: 0, sms: 1 });
  });
});
