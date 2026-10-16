/**
 * The demo seed and the simulator against a temp database, `fetch` trapped.
 *
 * - The reset refuses a database with real-looking patients.
 * - After a reset every PRM_Agent list has people on it, the no-show model is
 *   trained on at least 40 resolved visits, the recommendations and the
 *   brief exist.
 * - A few simulated hours move data through the real entrances and the real
 *   engine: leads, bookings, visit outcomes, messages in the demo outbox —
 *   and every person in the database is still synthetic.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-demo-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { resetDemo, assertDemoDatabase, DemoResetRefused } = await import("./seed.server");
const { simulateStep } = await import("./simulator.server");
const { listDemoOutbox } = await import("./outbox.server");
const { isSyntheticIdentity, rng } = await import("./synthetic");
const { agentList } = await import("../agent/drafts.server");
const { latestBrief } = await import("../agent/brief.server");
const { tick } = await import("../engine/runner.server");
const { getDb } = await import("../db/client.server");
const { agentInsights, agentModels, appSettings, automationRuns, contacts, contactVisits } =
  await import("../db/schema");
const { eq, like } = await import("drizzle-orm");

const saved = process.env.PRM_DEMO;
const realFetch = globalThis.fetch;
let fetchCalls = 0;

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
  process.env.PRM_DEMO = "1";
  globalThis.fetch = (async () => {
    fetchCalls++;
    throw new Error("network is off in this test");
  }) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
  if (saved === undefined) delete process.env.PRM_DEMO;
  else process.env.PRM_DEMO = saved;
});

const NOW = Date.parse("2026-10-14T10:00:00Z");

describe("the reset", () => {
  test("refuses a database with real-looking patients, and wipes nothing", async () => {
    process.env.DATABASE_URL = dbUrl;
    await getDb().insert(contacts).values({
      id: "real-1",
      prmId: "PRM-1",
      firstName: "Anna",
      lastName: "Nowak",
      email: "anna@clinic-mail.test.invalid",
      phone: "",
      segments: [],
      tags: [],
      createdAt: "2026-01-01",
    });
    await expect(assertDemoDatabase()).rejects.toBeInstanceOf(DemoResetRefused);
    await expect(resetDemo(NOW)).rejects.toBeInstanceOf(DemoResetRefused);
    expect(await getDb().select().from(contacts)).toHaveLength(1);
    await getDb().delete(contacts);
  });

  test("seeds a base on which every PRM_Agent list, the model and the brief have something", async () => {
    process.env.DATABASE_URL = dbUrl;
    const summary = await resetDemo(NOW);
    expect(summary.contacts).toBeGreaterThan(150);
    expect(summary.resolvedVisits).toBeGreaterThanOrEqual(40);

    for (const key of [
      "recall_due",
      "first_visit_no_followup",
      "post_visit_no_reply",
      "drifting",
      "high_risk",
      "no_phone",
    ] as const) {
      const list = await agentList(key, NOW);
      expect({ key, n: list.length }).toEqual({ key, n: expect.any(Number) });
      expect(list.length).toBeGreaterThan(0);
    }

    const model = await getDb()
      .select()
      .from(agentModels)
      .where(eq(agentModels.id, "no-show"))
      .get();
    expect(model?.samples ?? 0).toBeGreaterThanOrEqual(40);
    expect((model?.params as { mode?: string }).mode).toBe("trained");

    const recs = await getDb()
      .select({ signature: agentInsights.signature })
      .from(agentInsights)
      .where(like(agentInsights.signature, "agent:%"));
    const sigs = recs.map((r) => r.signature);
    for (const s of [
      "agent:recall-due",
      "agent:first-visit-no-followup",
      "agent:drifting",
      "agent:post-visit-no-reply",
      "agent:high-risk-visits",
      "agent:no-show-rise:all",
      "agent:open-rate-drop",
      "agent:knowledge-gaps",
    ])
      expect(sigs).toContain(s);

    expect((await latestBrief())?.text.length ?? 0).toBeGreaterThan(50);
    // The database is now marked as the demo's, so the next reset needs no check.
    const marker = await getDb()
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "demo.database"))
      .get();
    expect(marker?.value).toBe("1");
  }, 60_000);
});

describe("the simulator", () => {
  test("hours of simulated traffic go through the engine; nothing leaves; everyone is synthetic", async () => {
    process.env.DATABASE_URL = dbUrl;
    const r = rng(42);
    // Real time for the engine (its jobs are due "now"), simulated time for the
    // clinic: 6 hours in 30-second steps, the engine ticking every 10 steps.
    let now = Date.now();
    await resetDemo(now);
    const total = { leads: 0, bookings: 0, completed: 0, noShows: 0, opens: 0, replies: 0 };
    for (let i = 0; i < 720; i++) {
      const s = await simulateStep(now, r);
      total.leads += s.leads;
      total.bookings += s.bookings;
      total.completed += s.completed;
      total.noShows += s.noShows;
      total.opens += s.opens;
      total.replies += s.replies;
      if (i % 10 === 0) await tick();
      now += 30_000;
    }
    await tick();

    expect(total.leads).toBeGreaterThan(20);
    expect(total.bookings).toBeGreaterThan(20);
    expect(total.completed).toBeGreaterThan(0);
    expect(total.replies).toBeGreaterThan(0);

    // The automations really ran on what the simulator did.
    const runs = await getDb().select().from(automationRuns);
    const by = new Set(runs.map((x) => x.automationId));
    expect(by.has("demo-auto-welcome")).toBe(true);
    expect(by.has("demo-auto-confirm")).toBe(true);
    expect(by.has("demo-auto-survey")).toBe(true);

    const outbox = await listDemoOutbox(1000);
    expect(outbox.some((m) => m.channel === "email")).toBe(true);
    expect(outbox.some((m) => m.channel === "sms")).toBe(true);
    // ...and opens followed what was "sent" — the tracking path, not a shortcut.
    expect(total.opens).toBeGreaterThan(0);
    expect(fetchCalls).toBe(0);

    for (const c of await getDb().select().from(contacts))
      expect({ id: c.id, ok: isSyntheticIdentity(c) }).toEqual({ id: c.id, ok: true });
    for (const m of outbox) {
      if (m.channel === "email") expect(m.to.endsWith("@example.test")).toBe(true);
      if (m.channel === "sms") expect(m.to.startsWith("+48000")).toBe(true);
    }
    const visits = await getDb().select().from(contactVisits);
    expect(visits.some((v) => v.source === "Rejestracja online")).toBe(true);
  }, 180_000);
});

describe("demoResetHour", () => {
  test("empty, as .env.example ships it, is the default 3:00 — not midnight", async () => {
    const { demoResetHour } = await import("./mode.server");
    const before = process.env.PRM_DEMO_RESET_HOUR;
    try {
      process.env.PRM_DEMO_RESET_HOUR = "";
      expect(demoResetHour()).toBe(3);
      process.env.PRM_DEMO_RESET_HOUR = "0";
      expect(demoResetHour()).toBe(0);
      process.env.PRM_DEMO_RESET_HOUR = "25";
      expect(demoResetHour()).toBe(3);
    } finally {
      if (before === undefined) delete process.env.PRM_DEMO_RESET_HOUR;
      else process.env.PRM_DEMO_RESET_HOUR = before;
    }
  });
});
