/**
 * The knowledge base as the single source of facts, end to end: an inbox
 * suggestion with a fact the base lacks is flagged and its question kept;
 * an automation's agent that invents a price sends nothing. Own temp
 * database, `fetch` replaced, no network.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-grounding-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { draftInboxReply } = await import("../ai/inbox-assist.server");
const { runAgentNode } = await import("../engine/agent.server");
const { recordInboundMessage } = await import("../inbox/inbox.server");
const { listOpenGaps, recordGap, saveKnowledgeEntry, setGapStatus } =
  await import("../ai/knowledge.server");
const { getDb } = await import("../db/client.server");
const {
  contacts,
  engineLog,
  inboxMessages,
  inboxThreads,
  knowledgeEntries,
  knowledgeGaps,
  smsSends,
  smsSenders,
} = await import("../db/schema");
import type { AutomationNode } from "../automation-flow";

const realFetch = globalThis.fetch;
let replies: unknown[] = [];
let urls: string[] = [];

const content = (text: string) => ({
  choices: [{ message: { content: text }, finish_reason: "stop" }],
  usage: { prompt_tokens: 10, completion_tokens: 10 },
});
const toolCall = (name: string, args: Record<string, unknown>) => ({
  choices: [
    {
      message: {
        content: "",
        tool_calls: [
          {
            id: `call-${name}`,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      },
      finish_reason: "tool_calls",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 10 },
});

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
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token_test";
  replies = [];
  urls = [];
  globalThis.fetch = (async (url: string | URL) => {
    urls.push(String(url));
    if (String(url).includes("twilio")) return Response.json({ sid: "SM" }, { status: 201 });
    return Response.json(replies.shift() ?? content(""));
  }) as unknown as typeof fetch;
  const db = getDb();
  for (const t of [
    contacts,
    engineLog,
    inboxMessages,
    inboxThreads,
    knowledgeEntries,
    knowledgeGaps,
    smsSends,
    smsSenders,
  ])
    await db.delete(t);
  await db.insert(contacts).values({
    id: "c1",
    prmId: "PRM-1",
    firstName: "Anna",
    lastName: "Testowa",
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
    consentSms: 1,
    consentEmail: 1,
  } as never);
  await db.insert(smsSenders).values({
    id: "s1",
    label: "Placówka",
    value: "+48000999888",
    kind: "number",
    isDefault: 1,
    createdAt: 0,
  });
  await saveKnowledgeEntry({ title: "Cennik", content: "Konsultacja ortopedyczna — 250 zł." });
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("the inbox suggestion", () => {
  test("a fact the base lacks is flagged; the question the base cannot answer is kept, and not shown to the patient", async () => {
    const { threadId } = await recordInboundMessage({
      contactId: "c1",
      channel: "sms",
      body: "Ile kosztuje konsultacja i czy przyjmujecie w sobotę?",
      source: "sms",
    });
    replies.push(
      content(
        "Dzień dobry, konsultacja kosztuje 250 zł, w sobotę przyjmujemy do 14:00.\nBRAK W BAZIE: godziny przyjęć w sobotę",
      ),
    );
    const r = await draftInboxReply(threadId);
    expect(r.ok).toBe(true);
    expect(r.text).not.toContain("BRAK W BAZIE");
    expect(r.unverified).toEqual(["14:00"]);
    expect(r.missing).toEqual(["godziny przyjęć w sobotę"]);
    const gaps = await listOpenGaps();
    expect(gaps.map((g) => [g.question, g.source, g.count])).toEqual([
      ["godziny przyjęć w sobotę", "inbox", 1],
    ]);
  });
});

describe("the gap list", () => {
  test("a repeat counts, an answer resolves, a dismissal stays dismissed", async () => {
    await recordGap({ question: "Czy macie USG?", source: "inbox" });
    await recordGap({ question: "czy macie usg", source: "agent" });
    let [gap] = await listOpenGaps();
    expect(gap.count).toBe(2);
    await setGapStatus(gap.id, "resolved");
    expect(await listOpenGaps()).toHaveLength(0);
    // asked again after the answer: open again — the entry did not cover it
    await recordGap({ question: "Czy macie USG?", source: "inbox" });
    [gap] = await listOpenGaps();
    expect(gap.count).toBe(3);
    await setGapStatus(gap.id, "dismissed");
    await recordGap({ question: "Czy macie USG?", source: "inbox" });
    expect(await listOpenGaps()).toHaveLength(0);
  });
});

describe("the automation's agent", () => {
  const node: AutomationNode = {
    id: "ai1",
    kind: "aiAgent",
    position: { x: 0, y: 0 },
    goal: "Zaproś pacjenta na kontrolę",
    paths: [{ id: "p1", label: "Dalej" } as never],
    config: { canWriteMessages: "1" },
  };

  test("an invented price stops the message: nothing is sent, the model is told why, the log says so", async () => {
    replies.push(
      toolCall("send_message", {
        channel: "sms",
        text: "Dzień dobry, zapraszamy na kontrolę — kosztuje tylko 199 zł.",
      }),
      toolCall("choose_path", { pathId: "p1", reasoning: "Zaproszenie bez ceny." }),
    );
    const d = await runAgentNode(node, "c1");
    expect(d.handle).toBe("p1");
    expect(urls.some((u) => u.includes("twilio"))).toBe(false);
    expect(await getDb().select().from(smsSends)).toHaveLength(0);
    const log = await getDb().select().from(engineLog);
    expect(
      log.some((l) => l.detail?.source === "agent-grounding" && l.message.includes("199 zł")),
    ).toBe(true);
  });

  test("a price from the base goes out; the missing-line is cut and kept as a gap", async () => {
    replies.push(
      toolCall("send_message", {
        channel: "sms",
        text: "Dzień dobry, konsultacja ortopedyczna kosztuje 250 zł — zapraszamy.\nBRAK W BAZIE: cena kontroli",
      }),
      toolCall("choose_path", { pathId: "p1", reasoning: "Wysłano zaproszenie." }),
    );
    await runAgentNode(node, "c1");
    // The agent's message is a conversation: it goes through Twilio and into the inbox.
    expect(urls.filter((u) => u.includes("twilio"))).toHaveLength(1);
    const out = (await getDb().select().from(inboxMessages)).filter((m) => m.direction === "out");
    expect(out).toHaveLength(1);
    expect(out[0].body).toContain("250 zł");
    expect(out[0].body).not.toContain("BRAK W BAZIE");
    expect((await listOpenGaps()).map((g) => g.source)).toEqual(["agent"]);
  });

  test("{{firstName}} becomes the patient's name at the last moment; an internal id is never sent", async () => {
    replies.push(
      toolCall("send_message", {
        channel: "sms",
        text: "Dzień dobry #a1b2c3, zapraszamy na kontrolę.",
      }),
      toolCall("send_message", {
        channel: "sms",
        text: "Dzień dobry {{firstName}}, zapraszamy na kontrolę.",
      }),
      toolCall("choose_path", { pathId: "p1", reasoning: "Zaproszenie wysłane." }),
    );
    await runAgentNode(node, "c1");
    const out = (await getDb().select().from(inboxMessages)).filter((m) => m.direction === "out");
    expect(out).toHaveLength(1);
    expect(out[0].body).toBe("Dzień dobry Anna, zapraszamy na kontrolę.");
    expect(urls.filter((u) => u.includes("twilio"))).toHaveLength(1);
  });
});
