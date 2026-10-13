/**
 * The signals layer on a known history — own temp database, fixed clock.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-agent-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { computeSignals, deriveSignals, latestSignals, maybeRunAgentNightly, trainAndScoreNoShow } =
  await import("./signals.server");
const { getDb } = await import("../db/client.server");
const {
  agentScores,
  agentSignals,
  appSettings,
  contactVisits,
  contacts,
  emailEvents,
  emailSends,
  inboxMessages,
} = await import("../db/schema");

const DAY = 24 * 60 * 60 * 1000;
// A Thursday at noon Warsaw time, in summer.
const NOW = Date.parse("2026-09-10T10:00:00Z");

function person(
  id: string,
  over: Partial<{
    status: string;
    email: string;
    createdAt: string;
    phone: string;
    consentSms: number;
  }> = {},
) {
  return {
    id,
    prmId: `PRM-${id}`,
    firstName: "Anna",
    lastName: "Testowa",
    email: over.email ?? `${id}@example.invalid`,
    phone: over.phone ?? "+48000100200",
    segments: [],
    tags: [],
    source: "test",
    medium: "",
    campaign: "",
    createdAt: over.createdAt ?? "2025-01-01",
    status: over.status ?? "patient",
    customFields: {},
    consentSms: over.consentSms ?? 1,
  };
}
function visit(
  id: string,
  contactId: string,
  daysFromNow: number,
  status: string,
  over: Partial<{ doctor: string; source: string; createdAt: number }> = {},
) {
  const startsAt = NOW + daysFromNow * DAY;
  return {
    id,
    contactId,
    externalId: id,
    title: "Konsultacja",
    doctor: over.doctor ?? "lek. Jan Kowalski",
    specialization: "Internista",
    startsAt,
    source: over.source ?? "testsys",
    systemStatus: status,
    createdAt: over.createdAt ?? startsAt - 10 * DAY,
    priceGrosze: null,
    systemVisitId: null,
    stateEventSent: "",
  };
}

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
    agentSignals,
    appSettings,
    contactVisits,
    contacts,
    emailEvents,
    emailSends,
    inboxMessages,
  ])
    await db.delete(t);
});

describe("deriveSignals (pure)", () => {
  test("no-show rate for the window and the window before; lists of who needs attention", () => {
    const people = [
      person("a"),
      person("b"),
      person("c"),
      person("d", { createdAt: "2026-09-01" }),
    ];
    const visits = [
      // this window: 2 completed, 1 no-show (booked, long past)
      visit("v1", "a", -5, "completed"),
      visit("v2", "b", -6, "completed"),
      visit("v3", "c", -7, "booked"),
      // previous window: 3 completed, 0 no-show
      visit("v4", "a", -40, "completed"),
      visit("v5", "b", -41, "completed"),
      visit("v6", "c", -42, "completed"),
      visit("v7", "a", -45, "cancelled"),
      // long ago: recall due for d, who has nothing upcoming
      visit("v8", "d", -400, "completed"),
    ];
    const out = deriveSignals({
      now: NOW,
      contacts: people,
      visits,
      sends: [],
      events: [],
      inbound: [],
    });
    const get = (key: string, dim = "") =>
      out.find((s) => s.key === key && (s.dimension ?? "") === dim)!;
    expect(get("visits.completed")).toMatchObject({ value: 2, previous: 3 });
    expect(get("visits.no_show")).toMatchObject({ value: 1, previous: 0 });
    expect(get("visits.cancelled")).toMatchObject({ value: 0, previous: 1 });
    expect(get("no_show_rate").value).toBeCloseTo(1 / 3, 6);
    expect(get("no_show_rate").previous).toBe(0);
    expect(get("no_show_rate").count).toBe(3);
    // the doctor's dimension needs 10 decided visits — not here
    expect(out.filter((s) => s.key === "no_show_rate")).toHaveLength(1);
    expect(get("recall_due")).toMatchObject({ value: 1, detail: { contactIds: ["d"] } });
    // a and b had a visit in the last 7 days with no reply since and nothing booked
    expect(
      (get("post_visit_no_reply").detail as { contactIds: string[] }).contactIds.sort(),
    ).toEqual(["a", "b"]);
  });

  test("e-mail rates count distinct messages; drifting is half a year of silence", () => {
    const people = [person("quiet", { createdAt: "2025-01-01" }), person("active")];
    const sends = [
      { token: "t1", toEmail: "active@example.invalid", sentAt: NOW - 3 * DAY },
      { token: "t2", toEmail: "active@example.invalid", sentAt: NOW - 4 * DAY },
      { token: "t3", toEmail: "quiet@example.invalid", sentAt: NOW - 5 * DAY },
    ];
    const events = [
      { token: "t1", kind: "open", occurredAt: NOW - 2 * DAY },
      { token: "t1", kind: "open", occurredAt: NOW - 1 * DAY },
      { token: "t1", kind: "click", occurredAt: NOW - 1 * DAY },
    ];
    const out = deriveSignals({
      now: NOW,
      contacts: people,
      visits: [],
      sends,
      events,
      inbound: [],
    });
    const get = (key: string) => out.find((s) => s.key === key)!;
    expect(get("email.open_rate")).toMatchObject({ value: 1 / 3, count: 3 });
    expect(get("email.click_rate").value).toBeCloseTo(1 / 3, 6);
    expect(get("drifting")).toMatchObject({ value: 1, detail: { contactIds: ["quiet"] } });
  });
});

describe("computeSignals + trainAndScoreNoShow (database)", () => {
  test("stores the day's rows, keeps yesterday's value as the trend, scores upcoming visits", async () => {
    const db = getDb();
    await db.insert(contacts).values([person("a"), person("b")]);
    await db
      .insert(contactVisits)
      .values([
        visit("v1", "a", -3, "completed"),
        visit("v2", "b", -4, "booked"),
        visit("up1", "a", 3, "booked"),
        visit("up2", "b", 5, "booked"),
        visit("far", "b", 60, "booked"),
      ]);
    // "yesterday" had 7 drifting — today's row must carry it as `previous`
    await db.insert(agentSignals).values({
      id: "y",
      day: "2026-09-09",
      key: "drifting",
      dimension: "",
      value: 7,
      previous: null,
      count: 7,
      detail: null,
      computedAt: NOW - DAY,
    });

    const rows = await computeSignals(NOW);
    expect(rows.find((r) => r.key === "drifting")?.previous).toBe(7);
    const latest = await latestSignals();
    expect(latest?.day).toBe("2026-09-10");
    expect(latest?.rows.find((r) => r.key === "visits.no_show")?.value).toBe(1);

    const model = await trainAndScoreNoShow(NOW);
    expect(model.mode).toBe("prior"); // two decided visits — far below the threshold
    const scores = await db.select().from(agentScores);
    // only the next 30 days are scored; `far` is not
    expect(scores.map((s) => s.visitId).sort()).toEqual(["up1", "up2"]);
    expect(scores[0].score).toBeCloseTo(model.baseRate, 6);
  });

  test("the nightly run happens once a day, after 02:00 Warsaw time", async () => {
    const db = getDb();
    await db.insert(contacts).values([person("a")]);
    const oneAm = Date.parse("2026-09-10T23:30:00Z"); // 01:30 Warsaw on the 11th
    expect(await maybeRunAgentNightly(oneAm)).toBe(false);
    const threeAm = Date.parse("2026-09-11T01:30:00Z"); // 03:30 Warsaw
    expect(await maybeRunAgentNightly(threeAm)).toBe(true);
    expect(await maybeRunAgentNightly(threeAm + 3600_000)).toBe(false);
    expect((await latestSignals())?.day).toBe("2026-09-11");
  });
});
