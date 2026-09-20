/**
 * Wczytywanie listy lekarzy z pliku placówki.
 *
 * Sedno: plik przychodzi z zewnątrz i bywa uzupełniany ręcznie w arkuszu.
 * Żaden jego stan nie ma prawa wywrócić startu aplikacji — ani brak pliku,
 * ani zepsuty JSON, ani pojedynczy wiersz bez nazwiska.
 */
import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { doctorSeedPath, loadDoctorSeed } from "./doctors-seed.server";

const pierwotny = process.env.DATABASE_URL;
const katalogi: string[] = [];

/** Katalog z podłożonym plikiem, wskazany przez DATABASE_URL — tak jak na produkcji. */
function zPlikiem(tresc: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-lekarze-"));
  katalogi.push(dir);
  fs.writeFileSync(path.join(dir, "doctors-seed.json"), tresc);
  process.env.DATABASE_URL = `file:${path.join(dir, "baza.db")}`;
  return dir;
}

afterEach(() => {
  if (pierwotny === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = pierwotny;
  for (const d of katalogi.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("doctorSeedPath — plik leży obok bazy", () => {
  test("ścieżka wywodzi się z DATABASE_URL, tak jak media i dokumenty", () => {
    process.env.DATABASE_URL = "file:/data/prm-core.db";
    expect(doctorSeedPath()).toBe("/data/doctors-seed.json");
  });

  test("bez DATABASE_URL wypada w katalogu projektu", () => {
    delete process.env.DATABASE_URL;
    expect(doctorSeedPath()).toBe("doctors-seed.json");
  });
});

describe("loadDoctorSeed — stany, w których plik bywa", () => {
  test("poprawny plik wczytuje się w całości", () => {
    zPlikiem(
      JSON.stringify([
        {
          icId: 615,
          name: "lek. Adam Przykładowy",
          specialization: "Chirurg dziecięcy",
          specKey: "chirurg dzieciecy",
          services: [{ id: 4989, name: "Konsultacja" }],
          bookingUrl: "",
        },
      ]),
    );
    const rows = loadDoctorSeed();
    expect(rows).toHaveLength(1);
    expect(rows[0].systemId).toBe(615);
    expect(rows[0].services).toEqual([{ id: 4989, name: "Konsultacja" }]);
  });

  test("brak pliku to pusta lista, nie wyjątek", () => {
    // Instalacja bez arkusza lekarzy ma po prostu zacząć od zera.
    process.env.DATABASE_URL = "file:/nie/ma/takiego/katalogu/baza.db";
    expect(loadDoctorSeed()).toEqual([]);
  });

  test("zepsuty JSON nie wywraca startu", () => {
    zPlikiem("{to nie jest json");
    expect(loadDoctorSeed()).toEqual([]);
  });

  test("obiekt zamiast tablicy też nie wywraca startu", () => {
    zPlikiem(JSON.stringify({ lekarze: [] }));
    expect(loadDoctorSeed()).toEqual([]);
  });

  test("wadliwy wiersz jest pomijany, reszta wchodzi", () => {
    // Najważniejszy przypadek: arkusz uzupełnia człowiek i jeden brak `icId`
    // nie może kosztować pozostałych pozycji.
    zPlikiem(
      JSON.stringify([
        {
          icId: 1,
          name: "lek. Dobry Wpis",
          specialization: "Laryngolog",
          specKey: "laryngolog",
          services: [],
          bookingUrl: "",
        },
        { icId: 2, name: "", specialization: "Bez nazwiska" },
        { name: "lek. Bez Identyfikatora", specialization: "Kardiolog" },
        {
          icId: 3,
          name: "lek. Druga Dobra",
          specialization: "Ortopeda",
          services: [],
          bookingUrl: "",
        },
      ]),
    );
    const rows = loadDoctorSeed();
    expect(rows.map((d) => d.name)).toEqual(["lek. Dobry Wpis", "lek. Druga Dobra"]);
  });

  test("specKey wylicza się z nazwy, gdy go nie podano", () => {
    // Arkusze miewają „Chirurg Ogólny" i „Chirurg ogólny" jako osobne wpisy,
    // a to jeden zespół.
    zPlikiem(
      JSON.stringify([
        { icId: 1, name: "lek. A", specialization: "Chirurg Ogólny" },
        { icId: 2, name: "lek. B", specialization: "Chirurg ogólny" },
      ]),
    );
    const rows = loadDoctorSeed();
    expect(rows[0].specKey).toBe("chirurg ogolny");
    expect(rows[0].specKey).toBe(rows[1].specKey);
  });

  test("nowa nazwa pola (systemId) i stara (icId) działają tak samo", () => {
    zPlikiem(
      JSON.stringify([
        { systemId: 7, name: "lek. Nowy" },
        { icId: 8, name: "lek. Stary" },
      ]),
    );
    expect(loadDoctorSeed().map((d) => d.systemId)).toEqual([7, 8]);
  });

  test("polska litera ł też jest normalizowana", () => {
    zPlikiem(JSON.stringify([{ icId: 1, name: "lek. A", specialization: "Radiolog Główny" }]));
    expect(loadDoctorSeed()[0].specKey).toBe("radiolog glowny");
  });

  test("brakujące pola opcjonalne dostają bezpieczne wartości", () => {
    zPlikiem(JSON.stringify([{ icId: 9, name: "lek. Minimalny" }]));
    const [d] = loadDoctorSeed();
    expect(d.services).toEqual([]);
    expect(d.bookingUrl).toBe("");
    expect(d.specialization).toBe("");
  });

  test("wadliwa pozycja w services odpada, poprawne zostają", () => {
    zPlikiem(
      JSON.stringify([
        {
          icId: 1,
          name: "lek. A",
          services: [
            { id: 10, name: "Dobra" },
            { id: "nie liczba", name: "Zła" },
            { name: "Bez id" },
            null,
          ],
        },
      ]),
    );
    expect(loadDoctorSeed()[0].services).toEqual([{ id: 10, name: "Dobra" }]);
  });
});
