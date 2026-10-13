/**
 * Triage against the database and a fake model: own temp DB, `fetch`
 * replaced, no network. The rules answer with the AI off; with a model the
 * patient's name must not leave the process; a malformed answer falls back.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-triage-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { triageThread, triageDueThreads } = await import("./triage.server");
const { recordInboundMessage, recordOutboundMessage } = await import("../inbox/inbox.server");
const { getDb } = await import("../db/client.server");
const { contacts, engineLog, inboxMessages, inboxThreads } = await import("../db/schema");
const { eq } = await import("drizzle-orm");

const realFetch = globalThis.fetch;
let reply = "";
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
  process.env.PRM_AI_MODE = "off";
  process.env.PRM_AI_LOCAL_URL = "http://127.0.0.1:11434/v1";
  process.env.PRM_AI_LOCAL_MODEL = "bielik";
  sent = [];
  globalThis.fetch = (async (_u: string | URL, init: RequestInit) => {
    sent.push(String(init.body));
    return Response.json({
      choices: [{ message: { content: reply }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    });
  }) as unknown as typeof fetch;
  const db = getDb();
  for (const t of [contacts, engineLog, inboxMessages, inboxThreads]) await db.delete(t);
  await db.insert(contacts).values({
    id: "c1",
    prmId: "PRM-1",
    firstName: "Anna",
    lastName: "Kowalska",
    email: "anna@example.invalid",
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
  globalThis.fetch = realFetch;
});

async function inbound(body: string, at: number) {
  return recordInboundMessage({
    contactId: "c1",
    channel: "sms",
    body,
    source: "sms",
    occurredAt: at,
  });
}
const NOW = Date.parse("2026-10-13T10:00:00Z");

describe("triageThread", () => {
  test("AI off: the rules answer and the thread carries it", async () => {
    const { threadId } = await inbound("Po zabiegu krwawi, co robić?", NOW);
    const r = await triageThread(threadId, NOW);
    expect(r).toMatchObject({ urgency: "high", source: "rules" });
    const row = await getDb()
      .select()
      .from(inboxThreads)
      .where(eq(inboxThreads.id, threadId))
      .get();
    expect(row?.triageUrgency).toBe("high");
    expect(row?.triageAt).toBe(NOW);
    expect(sent).toHaveLength(0);
  });

  test("with a model: its verdict wins, the patient's name never leaves, the call is in the log", async () => {
    delete process.env.PRM_AI_MODE;
    reply = '{"urgency":"low","topic":"other","owner":"reception","reason":"Podziękowanie."}';
    const { threadId } = await inbound("Dziękuję, Anna Kowalska, anna@example.invalid", NOW);
    const r = await triageThread(threadId, NOW);
    expect(r).toMatchObject({ urgency: "low", source: "model", reason: "Podziękowanie." });
    expect(sent).toHaveLength(1);
    for (const secret of ["Anna", "Kowalsk", "anna@example.invalid"])
      expect(sent[0]).not.toContain(secret);
    const log = await getDb().select().from(engineLog);
    expect(log.map((l) => l.kind)).toEqual(["ai"]);
  });

  test("a malformed model answer falls back to the rules", async () => {
    delete process.env.PRM_AI_MODE;
    reply = "Trudno powiedzieć.";
    const { threadId } = await inbound("Chcę odwołać wizytę", NOW);
    const r = await triageThread(threadId, NOW);
    expect(r).toMatchObject({ topic: "cancellation", source: "rules" });
  });
});

describe("triageDueThreads", () => {
  test("only open threads whose latest message is inbound and newer than the last look", async () => {
    const a = await inbound("Pilne, boli", NOW);
    const b = await inbound("Dziękuję", NOW + 1);
    // b is the same contact and channel → same thread; make a second contact.
    expect(b.threadId).toBe(a.threadId);
    expect(await triageDueThreads(10, NOW + 2)).toBe(1);
    // Nothing new: nothing to do.
    expect(await triageDueThreads(10, NOW + 3)).toBe(0);
    // We replied: still nothing — the last word is ours.
    await recordOutboundMessage({
      contactId: "c1",
      channel: "sms",
      body: "Już dzwonimy.",
      source: "manual",
      occurredAt: NOW + 4,
    });
    expect(await triageDueThreads(10, NOW + 5)).toBe(0);
    // The patient wrote again: one more look.
    await inbound("Nikt nie dzwoni!", NOW + 6);
    expect(await triageDueThreads(10, NOW + 7)).toBe(1);
  });
});
