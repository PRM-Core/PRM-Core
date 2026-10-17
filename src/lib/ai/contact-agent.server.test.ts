/**
 * PRM_Agent on the contact card against a fake model: own temp database,
 * `fetch` replaced, no network. What matters: the summary is kept and shown
 * without a model, it goes out of date when the facts change (not when the
 * clock does), the background pass picks today's and tomorrow's patients one
 * at a time, and the cached summary goes with the patient.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-card-agent-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const agent = await import("./contact-agent.server");
const { purgeSummaries, readSummary, SUMMARY_RETENTION_DAYS } =
  await import("./summary-cache.server");
const { deleteContactCompletely } = await import("../contacts.server");
const { executeAction } = await import("../engine/actions.server");
const { getDb } = await import("../db/client.server");
const { aiSettings, contactNotes, contactSummaries, contactVisits, contacts, engineLog } =
  await import("../db/schema");

const realFetch = globalThis.fetch;
let calls: { system: string; maxTokens: number }[] = [];
let reply = "**Kim jest** — stała pacjentka.";
let replyTokens = 40;

const DAY = 86_400_000;
// 2026-03-10 10:00 in Warsaw (UTC+1 in March) — a fixed clock, no DST nearby.
const NOW = Date.parse("2026-03-10T09:00:00Z");

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
});

beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  process.env.PRM_AI_MODE = "local";
  process.env.PRM_AI_LOCAL_URL = "http://127.0.0.1:11434/v1";
  process.env.PRM_AI_LOCAL_MODEL = "bielik";
  delete process.env.PRM_AI_LOCAL_ADAPTER_MODEL;
  calls = [];
  reply = "**Kim jest** — stała pacjentka.";
  replyTokens = 40;
  globalThis.fetch = (async (_url: string | URL, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as {
      messages: { role: string; content: string }[];
      max_tokens: number;
    };
    calls.push({
      system: body.messages.find((m) => m.role === "system")?.content ?? "",
      maxTokens: body.max_tokens,
    });
    return Response.json({
      choices: [{ message: { content: reply }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1000, completion_tokens: replyTokens },
    });
  }) as unknown as typeof fetch;
  const db = getDb();
  for (const t of [contacts, contactVisits, contactNotes, contactSummaries, engineLog, aiSettings])
    await db.delete(t);
});

afterAll(() => {
  globalThis.fetch = realFetch;
  delete process.env.PRM_AI_MODE;
  fs.rmSync(dir, { recursive: true, force: true });
});

async function addContact(id: string, firstName = "Zofia") {
  await getDb()
    .insert(contacts)
    .values({
      id,
      prmId: `PRM-${id}`,
      firstName,
      lastName: "Testowa",
      email: `${id}@example.test`,
      segments: [],
      tags: [],
      createdAt: new Date(NOW - 400 * DAY).toISOString(),
      status: "patient",
    });
}

async function addVisit(contactId: string, startsAt: number, systemStatus = "booked") {
  await getDb()
    .insert(contactVisits)
    .values({
      id: `${contactId}-${startsAt}`,
      contactId,
      title: "Konsultacja",
      startsAt,
      systemStatus,
      createdAt: NOW - DAY,
    } as typeof contactVisits.$inferInsert);
}

async function addNote(contactId: string, text: string, createdAt = NOW) {
  await getDb()
    .insert(contactNotes)
    .values({ id: `${contactId}-${createdAt}-${text.length}`, contactId, text, createdAt });
}

describe("cached summary", () => {
  test("a summary is kept, shown without a model and goes out of date with the facts", async () => {
    await addContact("c1");
    await addNote("c1", "Prosi o kontakt po 16:00.", NOW - 5 * DAY);
    const result = await agent.summariseContact("c1", NOW);
    expect(result.ok).toBe(true);
    expect(result.createdAt).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
    // The patient's name never reaches the model; the pseudonym does.
    expect(calls[0].system).not.toContain("Zofia");
    expect(calls[0].maxTokens).toBe(400);

    const cached = await agent.cachedSummary("c1", NOW);
    expect(cached?.text).toBe("**Kim jest** — stała pacjentka.");
    expect(cached?.source).toBe("card");
    expect(cached?.stale).toBe(false);
    expect(calls).toHaveLength(1);

    // A later hour of the same record: the clock alone changes nothing.
    expect((await agent.cachedSummary("c1", NOW + 3 * 3600_000))?.stale).toBe(false);

    await addNote("c1", "Zmiana numeru telefonu.", NOW + 60_000);
    expect((await agent.cachedSummary("c1", NOW + 120_000))?.stale).toBe(true);
  });

  test("another model makes the summary out of date", async () => {
    await addContact("c2");
    await agent.summariseContact("c2", NOW);
    expect((await agent.cachedSummary("c2", NOW))?.stale).toBe(false);
    process.env.PRM_AI_LOCAL_MODEL = "inny-model";
    expect((await agent.cachedSummary("c2", NOW))?.stale).toBe(true);
  });

  test("no cached summary for an unknown patient, and a failed call stores nothing", async () => {
    expect(await agent.cachedSummary("nobody", NOW)).toBeNull();
    await addContact("c3");
    globalThis.fetch = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    const result = await agent.summariseContact("c3", NOW);
    expect(result.ok).toBe(false);
    expect(await readSummary("c3")).toBeNull();
  });

  test("an answer cut at the token cap keeps its whole sentences", async () => {
    await addContact("c4");
    reply = "**Kim jest** — stała pacjentka. Bywa co miesiąc.\n\n**Na co uważać** — brak zg";
    replyTokens = 400;
    const result = await agent.summariseContact("c4", NOW);
    expect(result.text).toBe("**Kim jest** — stała pacjentka. Bywa co miesiąc.");
    expect((await readSummary("c4"))?.text).toBe(result.text!);
  });
});

describe("facts", () => {
  test("long lists are cut to the newest few, with the totals beside them", async () => {
    await addContact("c5");
    for (let i = 0; i < 12; i++) await addNote("c5", `Notatka numer ${i}.`, NOW - i * DAY);
    for (let i = 0; i < 9; i++) await addVisit("c5", NOW - (i + 1) * 30 * DAY, "completed");
    const facts = (await agent.contactFacts("c5", NOW))!;
    expect(facts).toContain("NOTATKI — 5 najnowszych z 12:");
    expect(facts).toContain("Notatka numer 4.");
    expect(facts).not.toContain("Notatka numer 5.");
    expect(facts).toContain("WIZYTY MINIONE — 5 najnowszych z 9:");
    // Today's date is not part of the facts — the prompt adds it at the end.
    expect(facts).not.toMatch(/^DZIŚ|TODAY/m);
  });

  test("wholeSentences leaves a finished answer alone", () => {
    expect(agent.wholeSentences("Całe zdanie.")).toBe("Całe zdanie.");
    expect(agent.wholeSentences("Pierwsze. Drug")).toBe("Pierwsze.");
    expect(agent.wholeSentences("**Krok** — zadzwonić")).toBe("**Krok** — zadzwonić");
    expect(agent.wholeSentences("**Kim jest** (do 15 słów)\nStała pacjentka.")).toBe(
      "**Kim jest**\nStała pacjentka.",
    );
  });
});

describe("summaries ahead of the visit", () => {
  test("today's and tomorrow's patients, nearest first, not cancelled", async () => {
    for (const id of ["later-today", "tomorrow", "day-after", "cancelled", "this-morning"])
      await addContact(id);
    await addVisit("tomorrow", NOW + 26 * 3600_000); // 11 March, 12:00
    await addVisit("later-today", NOW + 4 * 3600_000); // 10 March, 14:00
    await addVisit("day-after", NOW + 50 * 3600_000); // 12 March, 12:00
    await addVisit("cancelled", NOW + 28 * 3600_000, "cancelled");
    await addVisit("this-morning", NOW - 2 * 3600_000);
    expect(await agent.summaryCandidates(NOW)).toEqual(["later-today", "tomorrow"]);
  });

  test("one summary per pass, only where the facts changed", async () => {
    await addContact("a");
    await addContact("b");
    await addVisit("a", NOW + 2 * 3600_000);
    await addVisit("b", NOW + 3 * 3600_000);

    expect(await agent.prefetchNextSummary(NOW)).toBe("a");
    expect(calls).toHaveLength(1);
    expect((await readSummary("a"))?.source).toBe("background");
    expect(await agent.prefetchNextSummary(NOW)).toBe("b");
    expect(await agent.prefetchNextSummary(NOW)).toBeNull();
    expect(calls).toHaveLength(2);

    // A new note on "b": only "b" is written again.
    await addNote("b", "Pyta o wyniki.", NOW + 1000);
    expect(await agent.prefetchNextSummary(NOW + 2000)).toBe("b");
    expect(calls).toHaveLength(3);
    // Background runs count against the daily limit like any other.
    const logged = await getDb().select().from(engineLog);
    expect(logged.filter((l) => l.kind === "ai")).toHaveLength(3);
  });

  test("nothing without a model, and nothing past the background's share of the limit", async () => {
    await addContact("a");
    await addVisit("a", NOW + 2 * 3600_000);

    process.env.PRM_AI_MODE = "off";
    expect(await agent.prefetchNextSummary(NOW)).toBeNull();
    process.env.PRM_AI_MODE = "local";
    delete process.env.PRM_AI_LOCAL_URL;
    expect(await agent.prefetchNextSummary(NOW)).toBeNull();
    process.env.PRM_AI_LOCAL_URL = "http://127.0.0.1:11434/v1";

    // 8 of 10 runs used today: the remaining two are left for people.
    await getDb().delete(aiSettings);
    await getDb().insert(aiSettings).values({
      provider: "local",
      model: "",
      dailyLimitUsd: 5,
      dailyCallLimit: 10,
      updatedAt: new Date().toISOString(),
    });
    for (let i = 0; i < 8; i++)
      await getDb()
        .insert(engineLog)
        .values({ id: `ai-${i}`, kind: "ai", message: "x", createdAt: Date.now() });
    expect(await agent.prefetchNextSummary(NOW)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("erasure", () => {
  test("deleting the patient deletes the summary", async () => {
    await addContact("gone");
    await agent.summariseContact("gone", NOW);
    expect(await readSummary("gone")).not.toBeNull();
    expect((await deleteContactCompletely("gone")).ok).toBe(true);
    expect(await readSummary("gone")).toBeNull();
  });

  test("the automation's delete_contact step deletes the summary too", async () => {
    await addContact("auto");
    await agent.summariseContact("auto", NOW);
    const result = await executeAction(
      { id: "n1", kind: "action", key: "delete_contact", position: { x: 0, y: 0 } },
      "auto",
    );
    expect(result.status).toBe("ok");
    expect(await readSummary("auto")).toBeNull();
  });

  test("the sweep drops summaries past retention and those of patients gone by other paths", async () => {
    await addContact("kept");
    await addContact("old");
    await agent.summariseContact("kept", NOW);
    await agent.summariseContact("old", NOW);
    await getDb()
      .insert(contactSummaries)
      .values({ contactId: "orphan", text: "x", fingerprint: "f", createdAt: Date.now() });
    const later = Date.now() + (SUMMARY_RETENTION_DAYS + 1) * DAY;
    // "old" is past retention at `later`; "kept" is refreshed just before.
    await getDb()
      .update(contactSummaries)
      .set({ createdAt: later - DAY })
      .where(eq(contactSummaries.contactId, "kept"));
    expect(await purgeSummaries(later)).toBe(2);
    expect(await readSummary("kept")).not.toBeNull();
    expect(await readSummary("old")).toBeNull();
    expect(await readSummary("orphan")).toBeNull();
  });
});
