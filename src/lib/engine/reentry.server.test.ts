/**
 * Re-entry through the real engine: a patient whose run is over enters again
 * under "always", never again under "never", and under "after N days" only
 * once those days have passed. Plus the rule on paper. Own temp database.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DAY_MS, reentryBlocked } from "./reentry";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-reentry-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { tick } = await import("./runner.server");
const { emitEvent } = await import("./events.server");
const { getDb } = await import("../db/client.server");
const { automationRuns, automations, contacts, engineEvents, engineJobs, engineLog } =
  await import("../db/schema");
import type { AutomationGraph } from "../automation-flow";

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
});

describe("the rule", () => {
  const now = 100 * DAY_MS;
  test("no earlier entry, or 'always': in", () => {
    expect(reentryBlocked("never", 30, null, now)).toBeNull();
    expect(reentryBlocked("always", 30, now - 1, now)).toBeNull();
  });
  test("'never' after any entry; 'after' until the days have passed", () => {
    expect(reentryBlocked("never", 30, now - 400 * DAY_MS, now)).toEqual({ rule: "never" });
    expect(reentryBlocked("after", 30, now - 10 * DAY_MS, now)).toEqual({
      rule: "after",
      from: now + 20 * DAY_MS,
    });
    expect(reentryBlocked("after", 30, now - 31 * DAY_MS, now)).toBeNull();
  });
});

const FLOW: AutomationGraph = {
  nodes: [
    { id: "t1", kind: "trigger", position: { x: 0, y: 0 }, key: "tag_added", config: {} },
    {
      id: "a1",
      kind: "action",
      position: { x: 0, y: 0 },
      key: "change_tags",
      config: { tag: "ankieta" },
    },
  ],
  edges: [{ id: "e1", source: "t1", target: "a1" }],
};

beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  for (const t of [automationRuns, automations, contacts, engineEvents, engineJobs, engineLog])
    await getDb().delete(t);
  await getDb().insert(contacts).values({
    id: "p1",
    prmId: "PRM-p1",
    firstName: "Anna",
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
});

async function automation(reentry: "always" | "never" | "after", reentryDays = 30) {
  await getDb().insert(automations).values({
    id: "auto-1",
    name: "Ankieta",
    status: "active",
    flow: FLOW,
    updatedAt: "",
    reviewFirst: 0,
    reviewed: 0,
    reentry,
    reentryDays,
  });
}

/** One trigger event, run to the end of its journey. */
async function enter() {
  await emitEvent({ type: "contact.tag_added", contactId: "p1", payload: { tag: "x" } });
  await tick();
  await tick();
}
const runs = async () => getDb().select().from(automationRuns);

describe("re-entry through the engine", () => {
  test("'always': a patient whose run is over starts again", async () => {
    await automation("always");
    await enter();
    await enter();
    expect(await runs()).toHaveLength(2);
  });

  test("'never': once, ever — and the log says why", async () => {
    await automation("never");
    await enter();
    await enter();
    expect(await runs()).toHaveLength(1);
    const skipped = (await getDb().select().from(engineLog)).find((l) => l.kind === "skipped");
    expect(skipped?.message).toContain("tylko raz");
  });

  test("'after N days': not before, yes after", async () => {
    await automation("after", 30);
    await enter();
    await enter();
    expect(await runs()).toHaveLength(1);
    // The first entry, 31 days back: now the patient may enter again.
    await getDb()
      .update(automationRuns)
      .set({ startedAt: Date.now() - 31 * DAY_MS });
    await enter();
    expect(await runs()).toHaveLength(2);
  });
});
