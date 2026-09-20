/**
 * Wspólna mechanika importu wizyt — ta sama dla każdego systemu rezerwacji.
 * Bez sieci: wizyty podaje test, tak jak podałby je dostawca.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExternalVisit } from "./provider";

const katalog = fs.mkdtempSync(path.join(os.tmpdir(), "prm-wizyty-"));
const adresBazy = `file:${path.join(katalog, "test.db")}`;
process.env.DATABASE_URL = adresBazy;

const { applyVisits } = await import("./visits-import.server");
const { getDb } = await import("../db/client.server");
const { contacts, contactVisits, doctors, engineEvents } = await import("../db/schema");

const SYSTEM = { id: "testsys", name: "TestSys", historyIsComplete: true };
const KONTAKT = "c-test";
const TERAZ = Date.parse("2026-09-10T12:00:00Z");

const wizyta = (over: Partial<ExternalVisit> = {}): ExternalVisit => ({
  id: 501,
  patientId: 77,
  date: "2026-09-12",
  time: "10:00",
  state: "booked",
  ...over,
});

const zdarzenia = async () =>
  (await getDb().select().from(engineEvents).all()).map((e) => e.type).sort();
const wiersze = () => getDb().select().from(contactVisits).all();

beforeAll(() => {
  const wynik = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: adresBazy, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (wynik.status !== 0) throw new Error(`Migracje nie przeszły:\n${wynik.stderr}`);
});

beforeEach(async () => {
  process.env.DATABASE_URL = adresBazy;
  const db = getDb();
  await db.delete(engineEvents);
  await db.delete(contactVisits);
  await db.delete(contacts);
  await db.delete(doctors);
  await db.insert(doctors).values({
    id: "d-1",
    systemId: 9,
    name: "lek. Jan Kowalski",
    specialization: "Internista",
    services: [{ id: 1, name: "Konsultacja internistyczna" }],
    createdAt: TERAZ,
    updatedAt: TERAZ,
  });
  await db.insert(contacts).values({
    id: KONTAKT,
    prmId: "PRM-00001",
    firstName: "Anna",
    lastName: "Testowa",
    email: "anna@example.invalid",
    phone: "",
    segments: [],
    tags: [],
    source: "test",
    medium: "",
    campaign: "",
    createdAt: "2026-09-01",
    status: "patient",
    customFields: {},
    externalPatientId: 77,
  });
});

describe("applyVisits", () => {
  test("nowa wizyta: klucz z prefiksem dostawcy, źródło = nazwa systemu, stan surowy", async () => {
    const r = await applyVisits(SYSTEM, KONTAKT, [wizyta()], TERAZ);
    expect(r.added).toBe(1);
    const [w] = await wiersze();
    expect(w.externalId).toBe("testsys-501");
    expect(w.source).toBe("TestSys");
    expect(w.systemStatus).toBe("booked");
    expect(w.systemVisitId).toBe(501);
    expect(await zdarzenia()).toEqual([]);
  });

  test("zakończona: jedno zdarzenie visit.completed, także po kolejnym przebiegu", async () => {
    await applyVisits(SYSTEM, KONTAKT, [wizyta()], TERAZ);
    const r = await applyVisits(SYSTEM, KONTAKT, [wizyta({ state: "completed" })], TERAZ);
    expect(r.updated).toBe(1);
    expect(r.completed).toBe(1);
    await applyVisits(SYSTEM, KONTAKT, [wizyta({ state: "completed" })], TERAZ);
    expect(await zdarzenia()).toEqual(["visit.completed"]);
  });

  test("umówiona ponad 2 h po terminie: brak wizyty pacjenta, raz", async () => {
    const po = Date.parse("2026-09-12T12:30:00Z"); // 10:00 w Warszawie = 08:00 UTC
    const r = await applyVisits(SYSTEM, KONTAKT, [wizyta()], po);
    expect(r.noShow).toBe(1);
    await applyVisits(SYSTEM, KONTAKT, [wizyta()], po);
    expect(await zdarzenia()).toEqual(["visit.no_show"]);
    expect((await wiersze())[0].title).toContain("Brak wizyty pacjenta");
  });

  test("zniknięcie z pełnej historii = odwołanie, jedno zdarzenie", async () => {
    await applyVisits(SYSTEM, KONTAKT, [wizyta()], TERAZ);
    const r = await applyVisits(SYSTEM, KONTAKT, [], TERAZ);
    expect(r.cancelled).toBe(1);
    await applyVisits(SYSTEM, KONTAKT, [], TERAZ);
    const [w] = await wiersze();
    expect(w.systemStatus).toBe("cancelled");
    expect(w.title).toMatch(/Odwołana$/);
    expect(await zdarzenia()).toEqual(["visit.cancelled"]);
  });

  test("niepełna historia: zniknięcie niczego nie odwołuje", async () => {
    const czesciowy = { ...SYSTEM, historyIsComplete: false };
    await applyVisits(czesciowy, KONTAKT, [wizyta()], TERAZ);
    const r = await applyVisits(czesciowy, KONTAKT, [], TERAZ);
    expect(r.cancelled).toBe(0);
    expect((await wiersze())[0].systemStatus).toBe("booked");
  });

  test("wizyta z webhooka w tej samej minucie scala się, zamiast dublować", async () => {
    await getDb()
      .insert(contactVisits)
      .values({
        id: "z-webhooka",
        contactId: KONTAKT,
        externalId: "rezerwacja-www-1",
        title: "Konsultacja",
        doctor: "Jan Kowalski",
        specialization: "",
        startsAt: Date.parse("2026-09-12T08:00:00Z"),
        source: "rejestracja-www",
        createdAt: TERAZ,
      });
    const r = await applyVisits(SYSTEM, KONTAKT, [wizyta({ doctorId: 9, serviceId: 1 })], TERAZ);
    expect(r.merged).toBe(1);
    const w = await wiersze();
    expect(w).toHaveLength(1);
    // Klucz i źródło webhooka zostają — to one niosą „jak umówiono".
    expect(w[0].externalId).toBe("rezerwacja-www-1");
    expect(w[0].source).toBe("rejestracja-www");
    expect(w[0].systemVisitId).toBe(501);
    expect(w[0].title).toBe("Konsultacja internistyczna — Umówiona");
  });

  test("ta sama minuta u innego lekarza to osobna wizyta", async () => {
    await getDb()
      .insert(contactVisits)
      .values({
        id: "z-webhooka",
        contactId: KONTAKT,
        externalId: "rezerwacja-www-1",
        title: "Konsultacja",
        doctor: "Ewa Nowak",
        specialization: "",
        startsAt: Date.parse("2026-09-12T08:00:00Z"),
        source: "rejestracja-www",
        createdAt: TERAZ,
      });
    const r = await applyVisits(SYSTEM, KONTAKT, [wizyta({ doctorId: 9, serviceId: 1 })], TERAZ);
    expect(r.merged).toBe(0);
    expect(await wiersze()).toHaveLength(2);
  });
});
