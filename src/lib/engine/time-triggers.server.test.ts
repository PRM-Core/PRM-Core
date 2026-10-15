/**
 * Time-based triggers through the real engine: the scan finds who is due,
 * the tick starts their journeys, and a second scan starts none. Own temp
 * database, no network; PESEL numbers generated with a valid checksum.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-time-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { tick } = await import("./runner.server");
const { scanTimeTriggers, resetTimeScan } = await import("./time-triggers.server");
const { addMonths } = await import("./time-triggers");
const { warsawDay, warsawWallClockToIso } = await import("../visits/warsaw-time");
const { getDb } = await import("../db/client.server");
const {
  automationRuns,
  automations,
  contactVisits,
  contacts,
  engineEvents,
  engineJobs,
  engineLog,
  engineTimeFires,
} = await import("../db/schema");
import type { AutomationGraph } from "../automation-flow";

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
});

const DAY = 86_400_000;
const today = () => warsawDay(Date.now());
/** Noon, Warsaw time, on a calendar day. */
const noon = (day: string) => new Date(warsawWallClockToIso(day, "12:00")).getTime();

function peselFor(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const head = `${p2(y % 100)}${p2(m + (y >= 2000 ? 20 : 0))}${p2(d)}0001`;
  const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const sum = head.split("").reduce((acc, c, i) => acc + Number(c) * w[i], 0);
  return head + String((10 - (sum % 10)) % 10);
}

function flow(key: string, config: Record<string, string> = {}): AutomationGraph {
  return {
    nodes: [
      { id: "t1", kind: "trigger", position: { x: 0, y: 0 }, key, config },
      {
        id: "a1",
        kind: "action",
        position: { x: 0, y: 100 },
        key: "change_tags",
        config: { tag: "zaproszony" },
      },
    ],
    edges: [{ id: "e1", source: "t1", target: "a1" }],
  };
}

async function automation(id: string, graph: AutomationGraph) {
  await getDb().insert(automations).values({
    id,
    name: id,
    status: "active",
    flow: graph,
    updatedAt: "",
    reviewFirst: 0,
    reviewed: 0,
  });
}

async function patient(id: string, pesel = "") {
  await getDb()
    .insert(contacts)
    .values({
      id,
      prmId: `PRM-${id}`,
      firstName: id,
      lastName: "Testowa",
      email: "",
      phone: "",
      pesel,
      segments: [],
      tags: [],
      source: "test",
      medium: "",
      campaign: "",
      createdAt: "2020-01-01",
      status: "patient",
      customFields: {},
    } as never);
}

async function visit(contactId: string, at: number, status: string, title = "Kontrola") {
  await getDb()
    .insert(contactVisits)
    .values({
      id: `v-${contactId}-${at}`,
      contactId,
      externalId: `ext-${contactId}-${at}`,
      title,
      startsAt: at,
      systemStatus: status,
      createdAt: at,
    } as never);
}

const runsOf = async (automationId: string) =>
  (await getDb().select().from(automationRuns)).filter((r) => r.automationId === automationId);
const tagsOf = async (id: string) =>
  (await getDb().select().from(contacts)).find((c) => c.id === id)?.tags ?? [];

beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  resetTimeScan();
  const db = getDb();
  for (const t of [
    automationRuns,
    automations,
    contactVisits,
    contacts,
    engineEvents,
    engineJobs,
    engineLog,
    engineTimeFires,
  ])
    await db.delete(t);
});

describe("N months since the last visit", () => {
  test("a patient whose 12 months came today starts one journey — and only one", async () => {
    await automation("recall", flow("visit_months_ago", { months: "12" }));
    await patient("due");
    await visit("due", noon(addMonths(today(), -12)), "completed");

    expect(await scanTimeTriggers(Date.now(), true)).toBe(1);
    await tick();
    await tick();
    expect(await runsOf("recall")).toHaveLength(1);
    expect(await tagsOf("due")).toContain("zaproszony");

    // The run has ended; the date is still "due". A second scan starts nothing.
    expect(await scanTimeTriggers(Date.now(), true)).toBe(0);
    await tick();
    expect(await runsOf("recall")).toHaveLength(1);
  });

  test("not before the date, not with a visit booked, and not years later by default", async () => {
    await automation("recall", flow("visit_months_ago", { months: "12" }));
    await patient("early");
    await visit("early", noon(addMonths(today(), -11)), "completed");
    await patient("booked");
    await visit("booked", noon(addMonths(today(), -12)), "completed");
    await visit("booked", Date.now() + 5 * DAY, "booked");
    await patient("ancient");
    await visit("ancient", noon(addMonths(today(), -40)), "completed");
    await patient("noshow");
    // A visit that did not happen is no visit to count from.
    await visit("noshow", noon(addMonths(today(), -12)), "cancelled");

    expect(await scanTimeTriggers(Date.now(), true)).toBe(0);
  });

  test("“also overdue” reaches the patient last seen years ago", async () => {
    await automation("winback", flow("visit_months_ago", { months: "12", overdue: "tak" }));
    await patient("ancient");
    await visit("ancient", noon(addMonths(today(), -40)), "completed");
    expect(await scanTimeTriggers(Date.now(), true)).toBe(1);
  });

  test("the service filter counts from the last visit of that service", async () => {
    await automation("cardio", flow("visit_months_ago", { months: "6", service: "kardio" }));
    await patient("p");
    await visit("p", noon(addMonths(today(), -6)), "completed", "Konsultacja kardiologiczna");
    await visit("p", noon(addMonths(today(), -1)), "completed", "Konsultacja dermatologiczna");
    expect(await scanTimeTriggers(Date.now(), true)).toBe(1);
  });

  test("an inactive automation is not scanned", async () => {
    await automation("recall", flow("visit_months_ago", { months: "12" }));
    await getDb().update(automations).set({ status: "inactive" });
    await patient("due");
    await visit("due", noon(addMonths(today(), -12)), "completed");
    expect(await scanTimeTriggers(Date.now(), true)).toBe(0);
  });
});

describe("birthday", () => {
  test("from the PESEL, on the day, once a year", async () => {
    await automation("bday", flow("birthday"));
    const [y, m, d] = today().split("-");
    await patient("today", peselFor(`${Number(y) - 30}-${m}-${d}`));
    await patient("tomorrow", peselFor(warsawDay(Date.now() + DAY).replace(/^\d{4}/, "1990")));
    await patient("nopesel");

    expect(await scanTimeTriggers(Date.now(), true)).toBe(1);
    await tick();
    await tick();
    expect((await runsOf("bday")).map((r) => r.contactId)).toEqual(["today"]);
    expect(await scanTimeTriggers(Date.now(), true)).toBe(0);
  });

  test("a time event starts a journey only in the automation it was fired for", async () => {
    await automation("bday-a", flow("birthday"));
    await automation("bday-b", flow("birthday"));
    const [y, m, d] = today().split("-");
    await patient("today", peselFor(`${Number(y) - 30}-${m}-${d}`));
    expect(await scanTimeTriggers(Date.now(), true)).toBe(2);
    await tick();
    expect(await runsOf("bday-a")).toHaveLength(1);
    expect(await runsOf("bday-b")).toHaveLength(1);
  });
});
