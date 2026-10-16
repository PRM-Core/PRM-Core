/**
 * The training-set export against the database, and the script that writes
 * it. Synthetic examples in an own temp database; no network, no model.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-training-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { exportTrainingSet } = await import("./training.server");
const { getDb } = await import("../db/client.server");
const { agentDrafts, agentExamples, contacts } = await import("../db/schema");

const NOW = Date.parse("2026-10-14T10:00:00Z");
const MIN = 20;

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
});
beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  const db = getDb();
  for (const t of [agentDrafts, agentExamples, contacts]) await db.delete(t);
  await db.insert(contacts).values({
    id: "c1",
    prmId: "PRM-1",
    firstName: "Testa",
    lastName: "Przykładowska",
    email: "c1@example.invalid",
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
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** An approved draft and the example stored with it, as `decideDraft` leaves them. */
async function approvedDraft(i: number, text: string) {
  const at = NOW + i;
  const db = getDb();
  await db.insert(agentDrafts).values({
    id: `d${i}`,
    status: "approved",
    audienceSignal: `signal.${i}`,
    title: "Zaproszenie na wizytę kontrolną",
    channel: "sms",
    message: text,
    audienceCount: 30,
    evidence: { detail: "ostatnia wizyta ponad rok temu" },
    templateMessage: "Dzień dobry {{firstName}}, zapraszamy na kontrolę.",
    decidedBy: "Test",
    decidedAt: at,
    createdAt: at,
    updatedAt: at,
  });
  await db.insert(agentExamples).values({
    id: `e${i}`,
    kind: "draft",
    channel: "sms",
    audienceSignal: `signal.${i}`,
    text,
    decidedBy: "Test",
    createdAt: at,
  });
}

async function correctedTriage(i: number, text: string) {
  await getDb()
    .insert(agentExamples)
    .values({
      id: `t${i}`,
      kind: "triage",
      channel: "",
      audienceSignal: "",
      text,
      label: "normal/appointment/reception",
      decidedBy: "Test",
      createdAt: NOW + 1000 + i,
    });
}

const SMS = "Dzień dobry {{firstName}}, zapraszamy na wizytę kontrolną. Prosimy o kontakt.";

async function fill(n: number) {
  for (let i = 0; i < n; i++)
    if (i % 2 === 0) await approvedDraft(i, SMS);
    else await correctedTriage(i, "Chciałabym umówić wizytę w przyszłym tygodniu.");
}

describe("the export", () => {
  test("pairs an approved text with its draft and refuses a line with a contact's surname", async () => {
    await fill(MIN);
    await correctedTriage(900, "Tu Przykładowskiej mama, proszę o termin.");
    await correctedTriage(901, "Proszę oddzwonić na +48 000 100 200.");
    // An example whose draft is gone has no prompt to pair with.
    await getDb()
      .insert(agentExamples)
      .values({
        id: "orphan",
        kind: "draft",
        channel: "sms",
        audienceSignal: "signal.gone",
        text: SMS,
        createdAt: NOW - 1,
      });
    // A dismissal is numbers, not a text to learn from.
    await getDb().insert(agentExamples).values({
      id: "dismissal",
      kind: "dismissal",
      channel: "",
      audienceSignal: "sig",
      text: "{}",
      createdAt: NOW,
    });
    const set = await exportTrainingSet(MIN);
    expect(set.ok).toBe(true);
    expect(set.counts).toEqual({ draft: MIN / 2, triage: MIN / 2, total: MIN });
    expect(set.refused).toEqual({ identifier: 2, rules: 0, label: 0, context: 1 });
    const all = JSON.stringify([...set.train, ...set.valid]);
    expect(all).not.toContain("Przykładowsk");
    expect(all).not.toContain("000 100 200");
    expect(all).toContain("Zaproszenie na wizytę kontrolną");
  });

  test("below the minimum gives nothing to write", async () => {
    await fill(MIN - 1);
    const set = await exportTrainingSet(MIN);
    expect(set.ok).toBe(false);
    expect(set.train).toEqual([]);
  });
});

describe("the script", () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ["scripts/agent-export-training.ts", ...args], {
      env: { ...process.env, DATABASE_URL: dbUrl },
      encoding: "utf8",
    });

  test("writes train.jsonl, valid.jsonl and a manifest, readable only by the owner", async () => {
    await fill(MIN);
    const out = path.join(dir, "set");
    const r = run("--out", out, "--min", String(MIN));
    expect(r.status).toBe(0);
    const train = fs.readFileSync(path.join(out, "train.jsonl"), "utf8").trim().split("\n");
    const valid = fs.readFileSync(path.join(out, "valid.jsonl"), "utf8").trim().split("\n");
    expect(train.length + valid.length).toBe(MIN);
    expect(JSON.parse(train[0]).messages[0].role).toBe("system");
    const manifest = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
    expect(manifest.counts.total).toBe(MIN);
    expect(JSON.stringify(manifest)).not.toContain("Dzień dobry");
    for (const f of ["train.jsonl", "valid.jsonl", "manifest.json"])
      expect(fs.statSync(path.join(out, f)).mode & 0o777).toBe(0o600);
  });

  test("refuses below the minimum and writes nothing", async () => {
    await fill(MIN - 1);
    const out = path.join(dir, "short");
    const r = run("--out", out, "--min", String(MIN));
    expect(r.status).toBe(1);
    expect(fs.existsSync(path.join(out, "train.jsonl"))).toBe(false);
  });

  test("refuses to write inside the application directory", async () => {
    await fill(MIN);
    const r = run("--out", "./training-set", "--min", String(MIN));
    expect(r.status).toBe(2);
    expect(fs.existsSync("./training-set")).toBe(false);
  });
});
