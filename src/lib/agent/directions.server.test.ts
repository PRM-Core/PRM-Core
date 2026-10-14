/**
 * Directions against the database: the nightly proposal, the decision, and
 * the gate the language layer asks before it starts anything. Own temp DB,
 * `fetch` replaced, no network.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-directions-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { proposeDirections, decideDirection, isEnabled, listDirections, rememberExample } =
  await import("./directions.server");
const { modelGate, writeDraftText } = await import("./language.server");
const { agentList } = await import("./drafts.server");
const { getDb } = await import("../db/client.server");
const { agentDirections, agentDrafts, agentExamples, contacts, engineLog } =
  await import("../db/schema");

const realFetch = globalThis.fetch;
let sent: string[] = [];

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
  delete process.env.PRM_AI_LOCAL_URL;
  delete process.env.PRM_AI_LOCAL_MODEL;
  sent = [];
  globalThis.fetch = (async (_u: string | URL, init: RequestInit) => {
    sent.push(String(init.body));
    return Response.json({
      choices: [
        {
          message: { content: "Dzień dobry {{firstName}}, zapraszamy na kontrolę." },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    });
  }) as unknown as typeof fetch;
  const db = getDb();
  for (const t of [agentDirections, agentDrafts, agentExamples, contacts, engineLog])
    await db.delete(t);
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const person = (id: string, phone: string) => ({
  id,
  prmId: `PRM-${id}`,
  firstName: "Anna",
  lastName: "Testowa",
  email: `${id}@example.invalid`,
  phone,
  segments: [] as string[],
  tags: [] as string[],
  source: "test",
  medium: "",
  campaign: "",
  createdAt: "2025-01-01",
  status: "patient",
  customFields: {},
});
const NOW = Date.parse("2026-10-14T03:00:00Z");

describe("proposeDirections", () => {
  test("nothing proposed without grounds; a model in reach proposes, a decision is kept across nights", async () => {
    expect(await proposeDirections(NOW)).toEqual([]);
    process.env.PRM_AI_LOCAL_URL = "http://127.0.0.1:11434/v1";
    process.env.PRM_AI_LOCAL_MODEL = "bielik";
    expect(await proposeDirections(NOW)).toEqual([
      "drafts_by_model",
      "brief_by_model",
      "triage_by_model",
    ]);
    expect((await listDirections()).every((d) => d.status === "proposed")).toBe(true);
    await decideDirection({
      key: "brief_by_model",
      decision: "enable",
      decidedBy: "Admin",
      now: NOW,
    });
    await decideDirection({
      key: "triage_by_model",
      decision: "decline",
      decidedBy: "Admin",
      now: NOW,
    });
    // The next night proposes nothing new and changes no decision.
    expect(await proposeDirections(NOW + 86_400_000)).toEqual([]);
    const byKey = new Map((await listDirections()).map((d) => [d.key, d.status]));
    expect(byKey.get("brief_by_model")).toBe("enabled");
    expect(byKey.get("triage_by_model")).toBe("declined");
    expect(byKey.get("drafts_by_model")).toBe("proposed");
    expect(await isEnabled("brief_by_model")).toBe(true);
    expect(await isEnabled("drafts_by_model")).toBe(false);
  });

  test("a phone gap proposes collecting phones; enabled, the gap is a list", async () => {
    const db = getDb();
    await db
      .insert(contacts)
      .values(Array.from({ length: 20 }, (_, i) => person(`c${i}`, i < 5 ? "" : "+48000100200")));
    expect(await proposeDirections(NOW)).toEqual(["collect_phones"]);
    expect((await listDirections())[0].evidence).toEqual({ withoutPhone: "5", share: "25%" });
    await decideDirection({
      key: "collect_phones",
      decision: "enable",
      decidedBy: "Admin",
      now: NOW,
    });
    expect((await agentList("no_phone", NOW)).map((r) => r.contactId).sort()).toEqual([
      "c0",
      "c1",
      "c2",
      "c3",
      "c4",
    ]);
  });
});

describe("the gate", () => {
  const facts = {
    title: "Recall",
    channel: "sms" as const,
    audienceSignal: "recall_due",
    audienceCount: 12,
    detail: "rok bez wizyty",
    templateMessage: "Dzień dobry {{firstName}}, zapraszamy.",
  };
  test("a configured model is not enough: the direction must be enabled, and the reason says so", async () => {
    process.env.PRM_AI_LOCAL_URL = "http://127.0.0.1:11434/v1";
    process.env.PRM_AI_LOCAL_MODEL = "bielik";
    expect((await modelGate()).ok).toBe(true);
    const gate = await modelGate("drafts_by_model");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/Kierunki/);
    expect((await writeDraftText(facts)).ok).toBe(false);
    expect(sent).toHaveLength(0);
    await decideDirection({ key: "drafts_by_model", decision: "enable", decidedBy: "Admin" });
    expect((await writeDraftText(facts)).ok).toBe(true);
    expect(sent).toHaveLength(1);
  });

  test("approved texts reach the prompt only with the learning direction enabled", async () => {
    process.env.PRM_AI_LOCAL_URL = "http://127.0.0.1:11434/v1";
    process.env.PRM_AI_LOCAL_MODEL = "bielik";
    await decideDirection({ key: "drafts_by_model", decision: "enable", decidedBy: "Admin" });
    await rememberExample({
      channel: "sms",
      audienceSignal: "recall_due",
      text: "Dzień dobry {{firstName}}, tak piszemy u nas.",
      decidedBy: "Anna Demo",
    });
    await writeDraftText(facts);
    expect(sent[0]).not.toContain("tak piszemy u nas");
    await decideDirection({ key: "learn_from_approvals", decision: "enable", decidedBy: "Admin" });
    await writeDraftText(facts);
    expect(sent[1]).toContain("tak piszemy u nas");
  });
});
