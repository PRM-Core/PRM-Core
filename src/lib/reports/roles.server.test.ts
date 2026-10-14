/**
 * The role views from the database: what went out and what it cost, what
 * visits brought and lost; how a campaign did and which split variant won.
 * Own temp database, no network.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-roles-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { financeView, marketingView, saveUnitPrices } = await import("./roles.server");
const { getDb } = await import("../db/client.server");
const {
  appSettings,
  automations,
  campaigns,
  contactVisits,
  contacts,
  emailEvents,
  emailSends,
  engineLog,
  smsSends,
} = await import("../db/schema");

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
    appSettings,
    automations,
    campaigns,
    contactVisits,
    contacts,
    emailEvents,
    emailSends,
    engineLog,
    smsSends,
  ])
    await db.delete(t);
});

const person = (id: string) => ({
  id,
  prmId: `PRM-${id}`,
  firstName: "Anna",
  lastName: id,
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
const visit = (
  id: string,
  contactId: string,
  startsAt: number,
  status: string,
  price: number | null,
  createdAt = startsAt - 5 * DAY,
) => ({
  id,
  contactId,
  externalId: id,
  title: "Konsultacja",
  doctor: "",
  specialization: "",
  startsAt,
  source: "test",
  systemStatus: status,
  createdAt,
  priceGrosze: price,
  systemVisitId: null,
});

describe("financeView", () => {
  test("volumes per channel and source, cost from unit prices, revenue and loss from visits", async () => {
    const db = getDb();
    await db.insert(contacts).values([person("a")]);
    await db.insert(emailSends).values([
      {
        token: "e1",
        toEmail: "a@example.invalid",
        subject: "x",
        campaignId: "c1",
        sentAt: NOW - DAY,
      },
      {
        token: "e2",
        toEmail: "a@example.invalid",
        subject: "x",
        campaignId: null,
        sentAt: NOW - DAY,
      },
      {
        token: "e3",
        toEmail: "a@example.invalid",
        subject: "x",
        campaignId: "c1",
        sentAt: NOW - 40 * DAY,
      },
    ] as never);
    await db.insert(smsSends).values([
      {
        id: "s1",
        contactId: "a",
        toPhone: "+48",
        sender: "X",
        body: "Dzień dobry",
        source: "automation",
        automationId: null,
        sentAt: NOW - DAY,
      },
      {
        id: "s2",
        contactId: "a",
        toPhone: "+48",
        sender: "X",
        body: "a".repeat(200),
        source: "campaign",
        automationId: null,
        sentAt: NOW - DAY,
      },
    ] as never);
    await db.insert(contactVisits).values([
      visit("v1", "a", NOW - 3 * DAY, "completed", 30000),
      visit("v2", "a", NOW - 4 * DAY, "booked", 20000), // past, still booked → no-show
      visit("v3", "a", NOW - 5 * DAY, "completed", null),
      visit("v4", "a", NOW - 40 * DAY, "completed", 10000),
    ] as never);

    const unset = await financeView(NOW);
    expect(unset.totalCost).toBeNull();
    expect(unset.costPerVisit).toBeNull();

    await saveUnitPrices({ smsPartGrosze: 9, emailPer1000Grosze: 400 });
    const f = await financeView(NOW);
    const line = (ch: string, src: string) =>
      f.channels.find((c) => c.channel === ch && c.source === src)!;
    expect(line("email", "campaign")).toMatchObject({ sent: 1, previous: 1 });
    expect(line("email", "other")).toMatchObject({ sent: 1, previous: 0 });
    expect(line("sms", "automation")).toMatchObject({ sent: 1, parts: 1, cost: 9 });
    expect(line("sms", "campaign")).toMatchObject({ sent: 1, parts: 2, cost: 18 });
    expect(f.unicodeSmsShare).toBe(0.5);
    // e-mail: 2 × 4 zł / 1000 = 0.8 gr → rounds to 0 + 1
    expect(f.totalCost).toBe(27 + Math.round((1 * 400) / 1000) * 2);
    expect(f.visits).toMatchObject({
      completed: 2,
      revenue: 30000,
      noShows: 1,
      lostRevenue: 20000,
      unpriced: 1,
      completedPrevious: 1,
      revenuePrevious: 10000,
    });
    expect(f.costPerVisit).toBe(Math.round((f.totalCost as number) / 2));
  });
});

describe("marketingView", () => {
  test("a campaign's rates and the recipients who booked within 14 days", async () => {
    const db = getDb();
    await db.insert(contacts).values([person("a"), person("b"), person("c")]);
    await db.insert(campaigns).values({
      id: "c1",
      kind: "email",
      templateName: "Recall",
      segmentId: "s",
      segmentName: "Recall",
      subject: "Zapraszamy na kontrolę",
      tags: [],
      status: "sent",
      createdAt: NOW - 20 * DAY,
    } as never);
    await db.insert(emailSends).values(
      ["a", "b", "c"].map((id) => ({
        token: `t-${id}`,
        toEmail: `${id}@example.invalid`,
        subject: "x",
        campaignId: "c1",
        sentAt: NOW - 20 * DAY,
      })) as never,
    );
    await db.insert(emailEvents).values([
      { id: "ev1", token: "t-a", kind: "open", occurredAt: NOW - 19 * DAY },
      { id: "ev2", token: "t-a", kind: "open", occurredAt: NOW - 18 * DAY },
      { id: "ev3", token: "t-a", kind: "click", occurredAt: NOW - 19 * DAY },
      { id: "ev4", token: "t-b", kind: "open", occurredAt: NOW - 19 * DAY },
    ] as never);
    await db.insert(contactVisits).values([
      visit("v1", "a", NOW + 2 * DAY, "booked", null, NOW - 15 * DAY), // booked 5 days after
      visit("v2", "b", NOW + 2 * DAY, "booked", null, NOW - 2 * DAY), // 18 days after — outside
    ] as never);
    const m = await marketingView(NOW);
    expect(m.campaigns[0]).toMatchObject({
      name: "Zapraszamy na kontrolę",
      sent: 3,
      opened: 2,
      clicked: 1,
      unsubscribed: 0,
      booked: 1,
    });
  });

  test("a split's variants: who entered, who booked, and no winner on small samples", async () => {
    const db = getDb();
    await db.insert(automations).values({
      id: "auto-1",
      name: "Recall z testem",
      status: "active",
      flow: null,
      updatedAt: "",
    });
    const ids = Array.from({ length: 80 }, (_, i) => `p${i}`);
    await db.insert(contacts).values(ids.map(person));
    const at = NOW - 30 * DAY;
    await db.insert(engineLog).values(
      ids.map((id, i) => ({
        id: `log-${id}`,
        runId: `run-${id}`,
        automationId: "auto-1",
        contactId: id,
        nodeId: "split-1",
        kind: "condition",
        message: "Split",
        detail: { variant: i < 40 ? "A" : "B", weight: "50" },
        createdAt: at,
      })),
    );
    // B books far more often: 5 of 40 in A, 25 of 40 in B
    const booked = [...ids.slice(0, 5), ...ids.slice(40, 65)];
    await db
      .insert(contactVisits)
      .values(
        booked.map((id) =>
          visit(`v-${id}`, id, NOW + 3 * DAY, "booked", null, at + 2 * DAY),
        ) as never,
      );
    const m = await marketingView(NOW);
    expect(m.splits).toHaveLength(1);
    const [a, b] = m.splits[0].variants;
    expect(a).toMatchObject({ label: "A", entered: 40, booked: 5, bookedTest: null });
    expect(b).toMatchObject({ label: "B", entered: 40, booked: 25 });
    expect(b.bookedTest?.significant).toBe(true);
    expect(m.splits[0].automationName).toBe("Recall z testem");
  });
});
