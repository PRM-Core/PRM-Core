/**
 * Ponawianie dobowego raportu po nieudanej wysyłce.
 *
 * 2026-09-25 SendGrid zaczął odrzucać wysyłkę („Maximum credits exceeded”).
 * Znacznik „wysłano” powstaje dopiero po udanej wysyłce, więc pętla silnika
 * ponawiała raport co 4 sekundy — z wywołaniem modelu za każdym razem.
 * Nieudana próba zostawia teraz własny wpis i wstrzymuje kolejne na godzinę.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const katalog = fs.mkdtempSync(path.join(os.tmpdir(), "prm-raport-"));
process.env.DATABASE_URL = `file:${path.join(katalog, "test.db")}`;

const { liczbaZEnv, stanPoNieudanychProbach } = await import("./daily-report.server");
const { getDb } = await import("../db/client.server");
const { engineLog } = await import("../db/schema");

const GODZINA_MS = 60 * 60 * 1000;
const TERAZ = Date.UTC(2026, 8, 29, 9, 0, 0);

beforeAll(() => {
  const wynik = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (wynik.status !== 0)
    throw new Error(`Migracje nie przeszły:\n${wynik.stdout}\n${wynik.stderr}`);
});
afterAll(() => fs.rmSync(katalog, { recursive: true, force: true }));
beforeEach(async () => {
  await getDb().delete(engineLog);
});

async function wpis(detail: Record<string, string>, createdAt: number) {
  await getDb()
    .insert(engineLog)
    .values({
      id: `log-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
      kind: "error",
      message: "raport-bezpieczenstwa: wysyłka nie powiodła się",
      detail,
      createdAt,
    });
}

describe("stanPoNieudanychProbach", () => {
  test("bez nieudanych prób nic nie wstrzymuje i model zostaje", async () => {
    expect(await stanPoNieudanychProbach(TERAZ)).toEqual({
      wstrzymaj: false,
      byloNieudane: false,
    });
  });

  test("próba sprzed kwadransa wstrzymuje kolejną", async () => {
    await wpis(
      { source: "raport-bezpieczenstwa", proba: "blad", dzienProby: "2026-09-29" },
      TERAZ - 15 * 60 * 1000,
    );

    expect((await stanPoNieudanychProbach(TERAZ)).wstrzymaj).toBe(true);
  });

  test("po godzinie próba rusza znowu, ale już bez modelu", async () => {
    await wpis(
      { source: "raport-bezpieczenstwa", proba: "blad", dzienProby: "2026-09-29" },
      TERAZ - GODZINA_MS - 60_000,
    );

    expect(await stanPoNieudanychProbach(TERAZ)).toEqual({ wstrzymaj: false, byloNieudane: true });
  });

  test("wpisy starsze niż doba nie zdejmują modelu z kolejnego raportu", async () => {
    await wpis(
      { source: "raport-bezpieczenstwa", proba: "blad", dzienProby: "2026-09-27" },
      TERAZ - 30 * GODZINA_MS,
    );

    expect(await stanPoNieudanychProbach(TERAZ)).toEqual({
      wstrzymaj: false,
      byloNieudane: false,
    });
  });

  test("udana wysyłka nie jest brana za nieudaną próbę", async () => {
    await wpis(
      { source: "raport-bezpieczenstwa", dzien: "2026-09-29", werdykt: "spokojnie" },
      TERAZ - 10 * 60 * 1000,
    );

    expect(await stanPoNieudanychProbach(TERAZ)).toEqual({
      wstrzymaj: false,
      byloNieudane: false,
    });
  });

  test("cudzy błąd w dzienniku nie wstrzymuje raportu", async () => {
    await wpis({ source: "kampanie", proba: "blad" }, TERAZ - 10 * 60 * 1000);

    expect((await stanPoNieudanychProbach(TERAZ)).wstrzymaj).toBe(false);
  });
});

describe("liczbaZEnv", () => {
  test("pusta zmienna z .env.example to wartość domyślna, nie zero", () => {
    expect(liczbaZEnv("", 5)).toBe(5);
    expect(liczbaZEnv("  ", 7)).toBe(7);
    expect(liczbaZEnv(undefined, 5)).toBe(5);
  });
  test("ustawiona liczba wygrywa, także zero; śmieci to domyślna", () => {
    expect(liczbaZEnv("2.5", 5)).toBe(2.5);
    expect(liczbaZEnv("0", 5)).toBe(0);
    expect(liczbaZEnv("pięć", 5)).toBe(5);
  });
});
