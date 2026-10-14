/**
 * Learning from the team's decisions: a corrected triage and a dismissed
 * recommendation. Own temp database, `fetch` replaced, no network.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-learning-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { correctTriage, triageThread, triageDueThreads } = await import("./triage.server");
const { recommendFromSignals } = await import("./drafts.server");
const { decideDirection, developmentState, listDismissals, rememberDismissal } =
  await import("./directions.server");
const { recordInboundMessage } = await import("../inbox/inbox.server");
const { setInsightStatus } = await import("../engine/supervisor.server");
const { getDb } = await import("../db/client.server");
const {
  agentDirections,
  agentDrafts,
  agentExamples,
  agentInsights,
  contacts,
  engineLog,
  inboxMessages,
  inboxThreads,
} = await import("../db/schema");
const { eq } = await import("drizzle-orm");

const realFetch = globalThis.fetch;
let sent: string[] = [];
const NOW = Date.parse("2026-10-14T10:00:00Z");
const DAY = 86_400_000;

const person = (id: string) => ({
  id,
  prmId: `PRM-${id}`,
  firstName: "Anna",
  lastName: "Kowalska",
  email: `${id}@example.invalid`,
  phone: "+48000100200",
  segments: [] as string[],
  tags: [] as string[],
  source: "test",
  medium: "",
  campaign: "",
  createdAt: "2025-01-01",
  status: "patient",
  customFields: {},
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
  sent = [];
  globalThis.fetch = (async (_u: string | URL, init: RequestInit) => {
    sent.push(String(init.body));
    return Response.json({
      choices: [
        {
          message: {
            content: '{"urgency":"normal","topic":"other","owner":"reception","reason":"x"}',
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    });
  }) as unknown as typeof fetch;
  const db = getDb();
  for (const t of [
    agentDirections,
    agentDrafts,
    agentExamples,
    agentInsights,
    contacts,
    engineLog,
    inboxMessages,
    inboxThreads,
  ])
    await db.delete(t);
  await db.insert(contacts).values([person("c1")]);
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("a corrected triage", () => {
  test("stands on the thread until the patient writes again, and is kept without the patient's name", async () => {
    const { threadId } = await recordInboundMessage({
      contactId: "c1",
      channel: "sms",
      body: "Tu Anna Kowalska, anna@example.invalid — proszę o fakturę za wizytę.",
      source: "sms",
      occurredAt: NOW,
    });
    await triageThread(threadId, NOW);
    const r = await correctTriage({
      threadId,
      triage: { urgency: "low", topic: "billing", owner: "billing" },
      decidedBy: "Rejestracja Demo",
      now: NOW + 1,
    });
    expect(r.ok).toBe(true);
    const db = getDb();
    const thread = await db.select().from(inboxThreads).where(eq(inboxThreads.id, threadId)).get();
    expect(thread).toMatchObject({ triageSource: "person", triageOwner: "billing" });
    const [example] = await db.select().from(agentExamples);
    expect(example).toMatchObject({ kind: "triage", label: "low/billing/billing" });
    for (const secret of ["Anna", "Kowalsk", "anna@example.invalid"])
      expect(example.text).not.toContain(secret);
    // The engine's sweep does not overwrite the person's verdict.
    expect(await triageDueThreads(10, NOW + 2)).toBe(0);
    // It counts as a decision the agent can learn from.
    expect((await developmentState()).approvals).toBe(1);
  });

  test("reaches the model's prompt only with learning enabled", async () => {
    await decideDirection({ key: "triage_by_model", decision: "enable", decidedBy: "Admin" });
    const db = getDb();
    await db.insert(agentExamples).values({
      id: "e1",
      kind: "triage",
      channel: "",
      audienceSignal: "",
      text: "Proszę o fakturę za ostatnią wizytę.",
      label: "low/billing/billing",
      decidedBy: "Rejestracja Demo",
      createdAt: NOW,
    });
    const { threadId } = await recordInboundMessage({
      contactId: "c1",
      channel: "sms",
      body: "Kiedy dostanę rachunek?",
      source: "sms",
      occurredAt: NOW,
    });
    await triageThread(threadId, NOW);
    expect(sent.at(-1)).not.toContain("low/billing/billing");
    await decideDirection({ key: "learn_from_approvals", decision: "enable", decidedBy: "Admin" });
    await triageThread(threadId, NOW + 1);
    expect(sent.at(-1)).toContain("low/billing/billing");
  });
});

describe("a dismissed recommendation", () => {
  const recall = (n: number) => [
    {
      id: "recall_due",
      day: "2026-10-14",
      key: "recall_due",
      dimension: "",
      value: n,
      previous: null,
      count: n,
      detail: { contactIds: ["c1"] },
      computedAt: NOW,
    },
  ];
  const status = async () =>
    (await getDb().select().from(agentInsights)).find((i) => i.signature === "agent:recall-due")
      ?.status;

  test("stays away at the same level and comes back, as new, when clearly worse", async () => {
    await decideDirection({ key: "learn_from_approvals", decision: "enable", decidedBy: "Admin" });
    await recommendFromSignals(recall(20) as never, NOW);
    const [row] = await getDb().select().from(agentInsights);
    // what the API does on "Odrzuć"
    await setInsightStatus(row.id, "dismissed");
    await rememberDismissal({
      signature: row.signature,
      evidence: row.evidence ?? {},
      decidedBy: "Admin",
    });

    await recommendFromSignals(recall(24) as never, NOW + DAY);
    expect(await status()).toBe("dismissed");

    await recommendFromSignals(recall(31) as never, NOW + 2 * DAY);
    expect(await status()).toBe("new");
    expect(await listDismissals()).toEqual([]);
    const log = await getDb().select().from(engineLog);
    expect(log.some((l) => l.detail?.source === "agent-learning")).toBe(true);
  });

  test("without learning, the old behaviour: a dismissal is final unless it turns critical", async () => {
    await recommendFromSignals(recall(20) as never, NOW);
    const [row] = await getDb().select().from(agentInsights);
    await setInsightStatus(row.id, "dismissed");
    await rememberDismissal({
      signature: row.signature,
      evidence: row.evidence ?? {},
      decidedBy: "Admin",
    });
    await recommendFromSignals(recall(60) as never, NOW + DAY);
    expect(await status()).toBe("dismissed");
  });
});
