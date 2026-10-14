/** The facts behind the three sentences, from the database. Own temp database, no network. */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-summary-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { summaryFacts, patientSummary } = await import("./summary.server");
const { recordInboundMessage, recordOutboundMessage } = await import("../inbox/inbox.server");
const { getDb } = await import("../db/client.server");
const {
  agentScores,
  contactVisits,
  contacts,
  emailEvents,
  emailSends,
  inboxMessages,
  inboxThreads,
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
    agentScores,
    contactVisits,
    contacts,
    emailEvents,
    emailSends,
    inboxMessages,
    inboxThreads,
    smsSends,
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
  });
});

const visit = (id: string, startsAt: number, status: string, title = "Kontrola") => ({
  id,
  contactId: "c1",
  externalId: id,
  title,
  doctor: "lek. Jan Kowalski",
  specialization: "",
  startsAt,
  source: "test",
  systemStatus: status,
  createdAt: startsAt - 10 * DAY,
  priceGrosze: null,
  systemVisitId: null,
});

describe("summaryFacts", () => {
  test("visits, the next one with its risk, the waiting message and the clinic's last e-mail", async () => {
    const db = getDb();
    await db.insert(contactVisits).values([
      visit("v1", NOW - 300 * DAY, "completed"),
      visit("v2", NOW - 30 * DAY, "completed", "USG"),
      visit("v3", NOW - 10 * DAY, "booked"), // past and still booked: a no-show
      visit("v4", NOW - 5 * DAY, "cancelled"),
      visit("v5", NOW + 7 * DAY, "booked", "Wizyta kontrolna"),
    ] as never);
    await db.insert(agentScores).values({
      id: "no-show:v5",
      kind: "no-show",
      contactId: "c1",
      visitId: "v5",
      score: 0.35,
      factors: [],
      computedAt: NOW,
    });
    const answered = await recordInboundMessage({
      contactId: "c1",
      channel: "email",
      body: "Dziękuję",
      source: "email",
      occurredAt: NOW - 3 * DAY,
    });
    await recordOutboundMessage({
      contactId: "c1",
      channel: "email",
      body: "Proszę bardzo",
      source: "manual",
      occurredAt: NOW - 2 * DAY,
    });
    void answered;
    await recordInboundMessage({
      contactId: "c1",
      channel: "sms",
      body: "Czy mogę przesunąć wizytę na piątek?",
      source: "sms",
      occurredAt: NOW - DAY,
    });
    await db.insert(emailSends).values({
      token: "t1",
      toEmail: "c1@example.invalid",
      subject: "Przypomnienie",
      sentAt: NOW - 4 * DAY,
    } as never);
    await db
      .insert(emailEvents)
      .values({ id: "e1", token: "t1", kind: "open", occurredAt: NOW - 4 * DAY } as never);

    const f = await summaryFacts("c1", NOW);
    expect(f).toMatchObject({
      completed: 2,
      noShows: 1,
      cancelled: 1,
      firstVisitAt: NOW - 300 * DAY,
      lastVisit: { at: NOW - 30 * DAY, title: "USG" },
      nextVisit: { at: NOW + 7 * DAY, title: "Wizyta kontrolna", risk: 0.35 },
      lastInbound: { channel: "sms", answered: false },
      lastOutbound: { channel: "email", subject: "Przypomnienie", opened: true },
    });
    const lines = await patientSummary("c1", NOW);
    expect(lines).toHaveLength(3);
    expect(lines![2]).toMatch(/^Czeka na odpowiedź/);
  });

  test("a contact that is gone has no summary", async () => {
    expect(await patientSummary("nobody", NOW)).toBeNull();
  });
});
