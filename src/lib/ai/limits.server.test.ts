/**
 * Daily model-run limits: the installation's and each automation's. A local
 * model costs nothing per token, so the limit counts runs — the model's
 * time. Own temp database, `fetch` replaced, no network.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-limits-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { automationOverLimit, getCallsToday, isOverDailyLimit, saveDailyCallLimit } =
  await import("./settings.server");
const { runAgentNode } = await import("../engine/agent.server");
const { modelGate } = await import("../agent/language.server");
const { logStep } = await import("../engine/log.server");
const { getDb } = await import("../db/client.server");
const { aiSettings, automations, contacts, engineLog } = await import("../db/schema");
import type { AutomationNode } from "../automation-flow";

const realFetch = globalThis.fetch;
let calls = 0;

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
});
beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  delete process.env.PRM_AI_MODE;
  process.env.PRM_AI_LOCAL_URL = "http://127.0.0.1:11434/v1";
  process.env.PRM_AI_LOCAL_MODEL = "bielik";
  calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({
      choices: [{ message: { content: "" }, finish_reason: "stop" }],
      usage: {},
    });
  }) as unknown as typeof fetch;
  const db = getDb();
  for (const t of [aiSettings, automations, contacts, engineLog]) await db.delete(t);
  await db.insert(contacts).values({
    id: "c1",
    prmId: "PRM-1",
    firstName: "Anna",
    lastName: "Testowa",
    email: "c1@example.invalid",
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
  await db.insert(automations).values({
    id: "auto-1",
    name: "Recall z agentem",
    status: "active",
    flow: null,
    updatedAt: "",
    aiCallsPerDay: 2,
  });
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const node: AutomationNode = {
  id: "ai1",
  kind: "aiAgent",
  position: { x: 0, y: 0 },
  goal: "Zdecyduj",
  paths: [{ id: "p1", label: "Pierwsza" } as never, { id: "p2", label: "Druga" } as never],
  config: {},
};
const run = (automationId: string | null = null) =>
  logStep({ automationId, kind: "ai", message: "model", detail: {} });

describe("counting", () => {
  test("model runs today, for the installation and for one automation", async () => {
    await run("auto-1");
    await run(null);
    await logStep({ automationId: "auto-1", kind: "action", message: "SMS", detail: {} });
    expect(await getCallsToday()).toBe(2);
    expect(await getCallsToday("auto-1")).toBe(1);
  });
});

describe("the automation's limit", () => {
  test("reached: the node takes the first path without asking the model, and the log says so once", async () => {
    await run("auto-1");
    await run("auto-1");
    const first = await runAgentNode(node, "c1", "auto-1");
    expect(first).toMatchObject({ handle: "p1", failed: true });
    expect(first.message).toContain("Recall z agentem");
    expect(calls).toBe(0);
    await runAgentNode(node, "c1", "auto-1");
    const budget = (await getDb().select().from(engineLog)).filter(
      (l) => l.detail?.source === "agent-budget",
    );
    expect(budget).toHaveLength(1);
  });

  test("0 means the automation never uses the model, and that is not an alarm", async () => {
    await getDb().update(automations).set({ aiCallsPerDay: 0 });
    const s = await automationOverLimit("auto-1");
    expect(s).toMatchObject({ over: true, limit: 0 });
    expect(s.reason).toMatch(/limit 0/);
    expect((await getDb().select().from(engineLog)).length).toBe(0);
  });

  test("below the limit the model is asked", async () => {
    await runAgentNode(node, "c1", "auto-1");
    expect(calls).toBeGreaterThan(0);
  });
});

describe("the installation's limit", () => {
  test("reached: every model step stops, with the reason", async () => {
    await saveDailyCallLimit(1);
    await run(null);
    const s = await isOverDailyLimit();
    expect(s).toMatchObject({ over: true, used: 1, limit: 1 });
    const gate = await modelGate();
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/1 \/ 1/);
    const d = await runAgentNode(node, "c1", null);
    expect(d).toMatchObject({ handle: "p1", failed: true });
    expect(calls).toBe(0);
  });
});
