/**
 * The language layer against a fake model: own temp database, `fetch`
 * replaced, no network. What matters is what gets through — a rewrite that
 * keeps the numbers, a draft that keeps the rules — and that with the AI
 * off nothing is called and the template text stands.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-lang-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { polishBrief, writeDraftText } = await import("./language.server");
const { storeBrief, latestBrief } = await import("./brief.server");
const { recommendFromSignals, listDrafts } = await import("./drafts.server");
const { getDb } = await import("../db/client.server");
const {
  agentBriefs,
  agentDirections,
  agentDrafts,
  agentInsights,
  agentSignals,
  contacts,
  engineLog,
} = await import("../db/schema");

const realFetch = globalThis.fetch;
let reply = "";
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
    calls++;
    return Response.json({
      choices: [{ message: { content: reply }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    });
  }) as unknown as typeof fetch;
  const db = getDb();
  for (const t of [
    agentBriefs,
    agentDirections,
    agentDrafts,
    agentInsights,
    agentSignals,
    contacts,
    engineLog,
  ])
    await db.delete(t);
  // The administrator has enabled the language directions; this file tests what happens next.
  await db.insert(agentDirections).values(
    (["drafts_by_model", "brief_by_model"] as const).map((key) => ({
      key,
      status: "enabled" as const,
      proposedAt: 0,
      updatedAt: 0,
    })),
  );
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const BRIEF = "Brief — 2026-10-13\n- Nieobecności: 18% z 40 wizyt.\n- Recall: 12.";

describe("polishBrief", () => {
  test("a rewrite that keeps every number is accepted and paid for in the log", async () => {
    reply =
      "W tygodniu do 13.10.2026 nieobecności to 18% przy 40 wizytach; 12 osób czeka na recall.";
    const r = await polishBrief(BRIEF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.model).toBe("local/bielik");
    const log = await getDb().select().from(engineLog);
    expect(log.map((l) => l.kind)).toEqual(["ai"]);
    expect(log[0].tokensIn).toBe(10);
  });

  test("a rewrite that changes a number is refused, and the log says which", async () => {
    reply = "Nieobecności 18% z 40 wizyt w 2026-10-13; recall dla 21 osób.";
    const r = await polishBrief(BRIEF);
    expect(r.ok).toBe(false);
    const log = await getDb().select().from(engineLog);
    const agent = log.find((l) => l.kind === "agent");
    expect(agent?.detail?.invented).toBe("21");
  });

  test("AI off: no call, honest reason", async () => {
    process.env.PRM_AI_MODE = "off";
    const r = await polishBrief(BRIEF);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/PRM_AI_MODE=off/);
    expect(calls).toBe(0);
  });
});

describe("writeDraftText", () => {
  const facts = {
    title: "Recall",
    channel: "sms" as const,
    audienceSignal: "recall_due",
    audienceCount: 12,
    detail: "rok bez wizyty",
    templateMessage: "Dzień dobry {{firstName}}, zapraszamy.",
  };
  test("a message that follows the rules is accepted", async () => {
    reply =
      "Dzień dobry {{firstName}}, minął rok od ostatniej wizyty — zapraszamy na kontrolę. Wystarczy odpowiedzieć TAK.";
    const r = await writeDraftText(facts);
    expect(r.ok).toBe(true);
  });
  test("a link, a phone number or a missing field is refused", async () => {
    reply = "Dzień dobry {{firstName}}, zapisy pod 600 100 200.";
    expect((await writeDraftText(facts)).ok).toBe(false);
    reply = "Dzień dobry, zapraszamy.";
    expect((await writeDraftText(facts)).ok).toBe(false);
  });
});

describe("in the nightly run", () => {
  test("the draft carries the model's text with the template kept; the brief is stored twice", async () => {
    const db = getDb();
    const ids = Array.from({ length: 12 }, (_, i) => `c${i}`);
    await db.insert(contacts).values(
      ids.map((id) => ({
        id,
        prmId: `PRM-${id}`,
        firstName: "Anna",
        lastName: "Testowa",
        email: `${id}@example.invalid`,
        phone: "",
        segments: [],
        tags: [],
        source: "test",
        medium: "",
        campaign: "",
        createdAt: "2025-01-01",
        status: "patient",
        customFields: {},
      })),
    );
    const now = Date.parse("2026-10-13T03:00:00Z");
    const rows = [
      {
        id: "recall_due",
        day: "2026-10-13",
        key: "recall_due",
        dimension: "",
        value: 12,
        previous: null,
        count: 12,
        detail: { contactIds: ids },
        computedAt: now,
      },
    ];
    await db.insert(agentSignals).values(rows);
    reply = "Dzień dobry {{firstName}}, minął rok od ostatniej wizyty — zapraszamy na kontrolę.";
    await recommendFromSignals(rows as never, now);
    const [draft] = await listDrafts();
    expect(draft.textSource).toBe("model");
    expect(draft.message).toContain("minął rok");
    expect(draft.templateMessage).toContain("{{firstName}}");

    // The brief: the fake model echoes the template, so the numbers survive.
    globalThis.fetch = (async (_u: string | URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        messages: { role: string; content: string }[];
      };
      const user = body.messages.find((m) => m.role === "user")?.content ?? "";
      return Response.json({
        choices: [{ message: { content: "Szanowni Państwo,\n" + user }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      });
    }) as unknown as typeof fetch;
    const stored = await storeBrief(now);
    expect(stored?.day).toBe("2026-10-13");
    expect(stored?.text).toContain("Recall do zrobienia: 12");
    expect(stored?.polished.startsWith("Szanowni Państwo,")).toBe(true);
    expect(stored?.model).toBe("local/bielik");
    expect((await latestBrief())?.day).toBe("2026-10-13");

    // AI off: the same run keeps the template text and stores no polished version.
    process.env.PRM_AI_MODE = "off";
    const again = await storeBrief(now + 1);
    expect(again?.polished).toBe("");
  });
});
