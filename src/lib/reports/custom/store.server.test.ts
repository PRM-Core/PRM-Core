/**
 * Zapis własnych raportów na prawdziwej bazie.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { newWidget } from "./catalog";

const katalog = fs.mkdtempSync(path.join(os.tmpdir(), "prm-raporty-zapis-"));
const adresBazy = `file:${path.join(katalog, "test.db")}`;

const { saveReport, getReport, listReports, deleteReport, duplicateReport, ReportStoreError } =
  await import("./store.server");

beforeAll(() => {
  process.env.DATABASE_URL = adresBazy;
  const wynik = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (wynik.status !== 0)
    throw new Error(`Migracje nie przeszły:\n${wynik.stdout}\n${wynik.stderr}`);
});
beforeEach(() => {
  process.env.DATABASE_URL = adresBazy;
});
afterAll(() => fs.rmSync(katalog, { recursive: true, force: true }));

const definicja = () => ({
  range: { preset: "30" as const, from: "", to: "" },
  widgets: [newWidget("kpi", "k1"), newWidget("bar", "b1")],
});

describe("zapis raportu", () => {
  test("zapis, odczyt i zmiana", async () => {
    const { id } = await saveReport({
      name: "  Źródła leadów ",
      description: "",
      definition: definicja(),
      userId: "u1",
      now: 1000,
    });
    const r = await getReport(id);
    expect(r?.name).toBe("Źródła leadów");
    expect(r?.definition.widgets.map((w) => w.id)).toEqual(["k1", "b1"]);

    const zmieniona = definicja();
    zmieniona.widgets.reverse();
    await saveReport({
      id,
      name: "Źródła",
      description: "opis",
      definition: zmieniona,
      userId: "u1",
      now: 2000,
    });
    const po = await getReport(id);
    expect(po?.definition.widgets.map((w) => w.id)).toEqual(["b1", "k1"]);
    expect(po?.updatedAt).toBe(2000);
  });

  test("lista od ostatnio zmienianego, z liczbą kafelków", async () => {
    await saveReport({
      name: "Starszy",
      description: "",
      definition: definicja(),
      userId: "u1",
      now: 10,
    });
    await saveReport({
      name: "Nowszy",
      description: "",
      definition: definicja(),
      userId: "u1",
      now: 99999,
    });
    const lista = await listReports();
    expect(lista[0].name).toBe("Nowszy");
    expect(lista[0].widgetCount).toBe(2);
  });

  test("raport bez nazwy nie przechodzi", async () => {
    await expect(
      saveReport({ name: "   ", description: "", definition: definicja(), userId: "u1" }),
    ).rejects.toBeInstanceOf(ReportStoreError);
  });

  test("kafelek, którego nie da się policzyć, blokuje zapis — z numerem kafelka", async () => {
    const d = definicja();
    d.widgets[1] = { ...d.widgets[1], dimensions: [] }; // słupki bez wymiaru
    await expect(
      saveReport({ name: "X", description: "", definition: d, userId: "u1" }),
    ).rejects.toThrow("Kafelek 2");
  });

  test("klucz spoza katalogu blokuje zapis", async () => {
    const d = definicja();
    d.widgets[0] = { ...d.widgets[0], source: "users" };
    await expect(
      saveReport({ name: "X", description: "", definition: d, userId: "u1" }),
    ).rejects.toBeInstanceOf(ReportStoreError);
  });

  test("zmiana usuniętego raportu to czytelny błąd, a nie ciche utworzenie nowego", async () => {
    await expect(
      saveReport({
        id: "nie-ma-takiego",
        name: "X",
        description: "",
        definition: definicja(),
        userId: "u1",
      }),
    ).rejects.toThrow("już nie ma");
  });

  test("kopia i usunięcie", async () => {
    const { id } = await saveReport({
      name: "Oryginał",
      description: "",
      definition: definicja(),
      userId: "u1",
    });
    const kopia = await duplicateReport(id, "u2");
    expect((await getReport(kopia.id))?.name).toBe("Oryginał (kopia)");
    await deleteReport(id);
    expect(await getReport(id)).toBeNull();
    expect(await getReport(kopia.id)).not.toBeNull();
  });
});
