/**
 * Drafts: proposed from the signals, decided by a person. Own temp database,
 * no network. Approval builds the label segment; with a published template it
 * hands the campaign to the runner — which is checked here by the campaign
 * row it leaves behind, not by sending anything.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-drafts-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { recommendFromSignals, decideDraft, listDrafts, agentList } =
  await import("./drafts.server");
const { getDb } = await import("../db/client.server");
const {
  agentDrafts,
  agentInsights,
  agentScores,
  agentSignals,
  campaigns,
  contacts,
  contentSnapshots,
  segments,
} = await import("../db/schema");

const NOW = Date.parse("2026-10-13T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function person(id: string) {
  return {
    id,
    prmId: `PRM-${id}`,
    firstName: "Anna",
    lastName: "Testowa",
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
  };
}
const signalRow = (key: string, value: number, ids: string[]) => ({
  id: key,
  day: "2026-10-13",
  key,
  dimension: "",
  value,
  previous: null,
  count: value,
  detail: { contactIds: ids },
  computedAt: NOW,
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
  const db = getDb();
  for (const t of [
    agentDrafts,
    agentInsights,
    agentScores,
    agentSignals,
    campaigns,
    contacts,
    contentSnapshots,
    segments,
  ])
    await db.delete(t);
});

describe("recommendFromSignals", () => {
  test("a recall audience becomes one open draft; the next night updates it instead of adding a second", async () => {
    const db = getDb();
    const ids = Array.from({ length: 12 }, (_, i) => `c${i}`);
    await db.insert(contacts).values(ids.map(person));
    const rows = [signalRow("recall_due", 12, ids)];
    await db.insert(agentSignals).values(rows);
    const recs = await recommendFromSignals(rows as never, NOW);
    expect(recs.map((r) => r.signature)).toContain("agent:recall-due");
    expect(await listDrafts()).toHaveLength(1);
    // same finding tomorrow, one more patient
    const rows2 = [signalRow("recall_due", 13, [...ids, "c99"])];
    await recommendFromSignals(rows2 as never, NOW + DAY);
    const drafts = await listDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].audienceCount).toBe(13);
    // and it is also a finding on the supervisor's panel
    const insights = await db.select().from(agentInsights);
    expect(insights.map((i) => i.signature)).toContain("agent:recall-due");
  });

  test("a rejected proposal does not come back the next morning", async () => {
    const db = getDb();
    const ids = Array.from({ length: 12 }, (_, i) => `c${i}`);
    await db.insert(contacts).values(ids.map(person));
    const rows = [signalRow("recall_due", 12, ids)];
    await recommendFromSignals(rows as never, NOW);
    const [draft] = await listDrafts();
    const r = await decideDraft(
      { id: draft.id, decision: "reject", decidedBy: "Anna Demo", note: "nie teraz" },
      NOW,
    );
    expect(r.ok).toBe(true);
    await recommendFromSignals(rows as never, NOW + DAY);
    expect((await listDrafts()).filter((d) => d.status === "proposed")).toHaveLength(0);
  });
});

describe("decideDraft — approve", () => {
  test("without a template: the audience gets a label segment, nothing is scheduled", async () => {
    const db = getDb();
    const ids = ["c1", "c2", "c3"];
    await db.insert(contacts).values(ids.map(person));
    await db.insert(agentDrafts).values({
      id: "d1",
      kind: "campaign",
      status: "proposed",
      audienceSignal: "recall_due",
      title: "Recall",
      channel: "sms",
      message: "Dzień dobry {{firstName}}",
      audienceCount: 3,
      audienceIds: ids,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const r = await decideDraft(
      {
        id: "d1",
        decision: "approve",
        decidedBy: "Anna Demo",
        message: "Dzień dobry {{firstName}}, zapraszamy.",
      },
      NOW,
    );
    expect(r.ok).toBe(true);
    expect(r.draft?.status).toBe("approved");
    expect(r.draft?.segmentName).toMatch(/^PRM_Agent · Recall · 2026-10-13$/);
    const seg = await db.select().from(segments);
    expect(seg.map((s) => s.name)).toContain(r.draft!.segmentName);
    const people = await db.select().from(contacts);
    expect(people.every((p) => (p.segments ?? []).includes(r.draft!.segmentName))).toBe(true);
    expect(await db.select().from(campaigns)).toHaveLength(0);
    expect(r.draft?.message).toBe("Dzień dobry {{firstName}}, zapraszamy.");
    // decided once
    expect((await decideDraft({ id: "d1", decision: "reject", decidedBy: "x" }, NOW)).ok).toBe(
      false,
    );
  });

  test("with a published template: the campaign exists, created by the campaign runner's own code", async () => {
    const db = getDb();
    await db.insert(contacts).values([person("c1")]);
    await db.insert(contentSnapshots).values({
      id: "sms:recall sms",
      kind: "sms",
      name: "Recall SMS",
      contentItemId: "ci-1",
      html: "",
      smsBody: "Dzień dobry {{firstName}}",
      updatedAt: NOW,
    } as never);
    await db.insert(agentDrafts).values({
      id: "d2",
      kind: "campaign",
      status: "proposed",
      audienceSignal: "recall_due",
      title: "Recall",
      channel: "sms",
      message: "x",
      audienceCount: 1,
      audienceIds: ["c1"],
      createdAt: NOW,
      updatedAt: NOW,
    });
    const r = await decideDraft(
      { id: "d2", decision: "approve", decidedBy: "Anna Demo", templateName: "Recall SMS" },
      NOW,
    );
    expect(r.ok).toBe(true);
    expect(r.draft?.status).toBe("handed_off");
    const camps = await db.select().from(campaigns);
    expect(camps).toHaveLength(1);
    expect(camps[0].kind).toBe("sms");
    expect(camps[0].templateName).toBe("Recall SMS");
    expect(r.draft?.campaignId).toBe(camps[0].id);
  });

  test("an unpublished template is refused and the draft stays proposed", async () => {
    const db = getDb();
    await db.insert(contacts).values([person("c1")]);
    await db.insert(agentDrafts).values({
      id: "d3",
      kind: "campaign",
      status: "proposed",
      audienceSignal: "drifting",
      title: "Reaktywacja",
      channel: "email",
      message: "x",
      audienceCount: 1,
      audienceIds: ["c1"],
      createdAt: NOW,
      updatedAt: NOW,
    });
    const r = await decideDraft(
      { id: "d3", decision: "approve", decidedBy: "Anna Demo", templateName: "Nie ma" },
      NOW,
    );
    expect(r.ok).toBe(false);
    expect((await listDrafts())[0].status).toBe("proposed");
  });
});

describe("agentList", () => {
  test("the list behind a signal, with last and next visit", async () => {
    const db = getDb();
    await db.insert(contacts).values([person("c1"), person("c2")]);
    await db.insert(agentSignals).values([signalRow("recall_due", 2, ["c1", "c2"])]);
    const list = await agentList("recall_due", NOW);
    expect(list.map((r) => r.contactId).sort()).toEqual(["c1", "c2"]);
    expect(list[0].patient).toBe("Anna Testowa");
    expect(await agentList("high_risk", NOW)).toEqual([]);
  });
});
