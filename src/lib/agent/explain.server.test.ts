/**
 * Why, from the database: one patient's explanation and the agent's log
 * filtered by who acted. Own temp database, no network.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-explain-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { explainContact, agentLog } = await import("./explain.server");
const { logStep } = await import("../engine/log.server");
const { getDb } = await import("../db/client.server");
const { agentDrafts, agentScores, agentSignals, contactVisits, contacts, engineLog, inboxThreads } =
  await import("../db/schema");

const NOW = Date.parse("2026-10-14T10:00:00Z");
const DAY = 86_400_000;

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
  for (const t of [
    agentDrafts,
    agentScores,
    agentSignals,
    contactVisits,
    contacts,
    engineLog,
    inboxThreads,
  ])
    await db.delete(t);
  await db.insert(contacts).values({
    id: "c1",
    prmId: "PRM-c1",
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
});

describe("explainContact", () => {
  test("the lists, the risk, the drafts, the triage and the log — each with its reason", async () => {
    const db = getDb();
    await db.insert(contactVisits).values([
      {
        id: "v-old",
        contactId: "c1",
        externalId: "v-old",
        title: "Konsultacja",
        doctor: "",
        specialization: "",
        startsAt: NOW - 400 * DAY,
        source: "test",
        systemStatus: "completed",
        createdAt: NOW - 410 * DAY,
        priceGrosze: null,
        systemVisitId: null,
      },
      {
        id: "v-next",
        contactId: "c1",
        externalId: "v-next",
        title: "Kontrola",
        doctor: "",
        specialization: "",
        startsAt: NOW + 5 * DAY,
        source: "test",
        systemStatus: "booked",
        createdAt: NOW - DAY,
        priceGrosze: null,
        systemVisitId: null,
      },
    ] as never);
    await db.insert(agentSignals).values({
      id: "s1",
      day: "2026-10-14",
      key: "recall_due",
      dimension: "",
      value: 1,
      previous: null,
      count: 1,
      detail: { contactIds: ["c1"] },
      computedAt: NOW,
    });
    await db.insert(agentScores).values({
      id: "no-show:v-next",
      kind: "no-show",
      contactId: "c1",
      visitId: "v-next",
      score: 0.41,
      factors: [{ feature: "priorNoShows", contribution: 0.9 }],
      computedAt: NOW,
    });
    await db.insert(agentDrafts).values({
      id: "d1",
      kind: "automation_message",
      status: "proposed",
      audienceSignal: "automation:a1",
      title: "Przypomnienie — Przypomnienie SMS",
      channel: "sms",
      message: "Dzień dobry Anna",
      audienceCount: 1,
      audienceIds: ["c1"],
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(inboxThreads).values({
      id: "th1",
      contactId: "c1",
      channel: "sms",
      lastMessageAt: NOW,
      createdAt: NOW,
      triageUrgency: "high",
      triageTopic: "results",
      triageOwner: "doctor",
      triageReason: "Reguły — słowa: wynik.",
      triageSource: "rules",
    });
    await logStep({
      contactId: "c1",
      kind: "agent",
      message: "Triaż poprawiony przez Rejestrację.",
      detail: { decision: "correct", threadId: "th1" },
    });

    const x = await explainContact("c1", NOW);
    expect(x.lists.map((l) => l.key).sort()).toEqual(["no_phone", "recall_due"]);
    expect(x.lists.find((l) => l.key === "recall_due")?.reason).toMatch(/rok/);
    expect(x.risks).toHaveLength(1);
    expect(x.risks[0].reason).toMatch(/41%.*wcześniejsze nieobecności/);
    expect(x.messages.map((m) => m.id)).toEqual(["d1"]);
    expect(x.triage[0]).toMatchObject({ urgency: "high", owner: "doctor" });
    expect(x.log[0]).toMatchObject({ actor: "person", threadId: "th1" });
  });

  test("a patient the agent has nothing on gets nothing", async () => {
    await getDb().update(contacts).set({ phone: "+48000100200" });
    const x = await explainContact("c1", NOW);
    expect(x).toEqual({ lists: [], risks: [], messages: [], triage: [], log: [] });
  });
});

describe("agentLog", () => {
  test("filters by who acted and names the patient and the automation", async () => {
    await logStep({
      kind: "agent",
      message: "Policzono sygnały.",
      detail: { source: "agent-nightly" },
    });
    await logStep({
      contactId: "c1",
      kind: "agent",
      message: "Draft zatwierdzony.",
      detail: { decision: "approve", draftId: "d1" },
    });
    await logStep({ kind: "ai", message: "Triaż modelem.", detail: { feature: "agent-triage" } });
    await logStep({ kind: "action", message: "Wysłano SMS.", detail: {} });

    const all = await agentLog({ actor: "all" });
    expect(all.map((e) => e.message).sort()).toEqual([
      "Draft zatwierdzony.",
      "Policzono sygnały.",
      "Triaż modelem.",
    ]);
    const people = await agentLog({ actor: "person" });
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ contactName: "Anna Testowa", draftId: "d1" });
    expect((await agentLog({ actor: "model" })).map((e) => e.message)).toEqual(["Triaż modelem."]);
  });
});
