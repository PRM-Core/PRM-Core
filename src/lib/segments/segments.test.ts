/**
 * Wygasanie segmentów doraźnych.
 *
 * Segmenty powstają pod jedną wysyłkę i po 48 godzinach znikają, żeby lista nie
 * puchła o „Kardiologia marzec”, „Kardiologia marzec 2”, „test”. Cena pomyłki
 * jest jednak niesymetryczna: segment skasowany o jeden przebieg za wcześnie
 * wyłącza komuś zaplanowaną wysyłkę albo działającą automatyzację — po cichu.
 * Dlatego sprzątanie ma być tchórzliwe: w razie wątpliwości przedłuża.
 *
 * Test chodzi po prawdziwej bazie (tymczasowy plik SQLite + migracje), bo
 * sprawdzana logika to w większości zapytania. `DATABASE_URL` jest ustawiany
 * przed pierwszym wywołaniem `getDb()`, które zapamiętuje połączenie.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const katalog = fs.mkdtempSync(path.join(os.tmpdir(), "prm-segmenty-"));
const adresBazy = `file:${path.join(katalog, "test.db")}`;

// Moduły czytają DATABASE_URL dopiero w środku funkcji, więc zwykły import
// wystarczy — byle przypisanie powyżej wykonało się przed pierwszym zapytaniem.
const { getDb } = await import("../db/client.server");
const { segments, campaigns, automations, contacts } = await import("../db/schema");
const { emptyDefinition } = await import("./segment-definition");
const { purgeExpiredSegments } = await import("./segments.server");

const GODZINA = 60 * 60 * 1000;
const TTL = 48 * GODZINA;
const TERAZ = 1_760_000_000_000;

beforeAll(() => {
  // Tu, a nie przy wczytaniu pliku: inne pliki testowe w tym samym procesie
  // ustawiają własną bazę, a wczytywane są wszystkie przed pierwszym testem.
  process.env.DATABASE_URL = adresBazy;
  const wynik = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (wynik.status !== 0) {
    throw new Error(`Migracje nie przeszły:\n${wynik.stdout}\n${wynik.stderr}`);
  }
});

afterAll(() => fs.rmSync(katalog, { recursive: true, force: true }));

beforeEach(async () => {
  process.env.DATABASE_URL = adresBazy;
  const db = getDb();
  await db.delete(campaigns);
  await db.delete(automations);
  await db.delete(segments);
  await db.delete(contacts);
});

async function dodajSegment(name: string, expiresAt: number | null, permanent = false) {
  const id = randomUUID();
  await getDb()
    .insert(segments)
    .values({
      id,
      name,
      description: "",
      status: "live",
      definition: emptyDefinition(),
      createdAt: TERAZ - TTL,
      updatedAt: TERAZ - TTL,
      updatedBy: "test",
      permanent: permanent ? 1 : 0,
      expiresAt,
    });
  return id;
}

async function dodajKampanie(
  segmentId: string,
  status: "scheduled" | "sending" | "paused" | "sent",
) {
  await getDb().insert(campaigns).values({
    id: randomUUID(),
    kind: "email",
    templateName: "szablon testowy",
    segmentId,
    segmentName: "segment testowy",
    status,
    createdAt: TERAZ,
  });
}

async function dodajAutomatyzacje(nazwaSegmentu: string, status: "active" | "inactive" | "draft") {
  await getDb()
    .insert(automations)
    .values({
      id: randomUUID(),
      name: "automatyzacja",
      status,
      flow: {
        nodes: [
          {
            id: "n1",
            kind: "condition" as const,
            position: { x: 0, y: 0 },
            key: "inSegment",
            config: { segment: nazwaSegmentu },
          },
        ],
        edges: [],
      },
      updatedAt: new Date(TERAZ).toISOString(),
    });
}

async function istnieje(id: string) {
  const wszystkie = await getDb().select().from(segments);
  return wszystkie.some((s) => s.id === id);
}

async function terminWaznosci(id: string) {
  const wszystkie = await getDb().select().from(segments);
  return wszystkie.find((s) => s.id === id)?.expiresAt ?? null;
}

describe("purgeExpiredSegments — co znika, a co zostaje", () => {
  test("segment po terminie i bez użycia znika", async () => {
    const id = await dodajSegment("doraźny", TERAZ - GODZINA);
    const wynik = await purgeExpiredSegments(TERAZ);
    expect(wynik.usuniete).toBe(1);
    expect(await istnieje(id)).toBe(false);
  });

  test("segment przed terminem zostaje nietknięty", async () => {
    const id = await dodajSegment("jeszcze ważny", TERAZ + GODZINA);
    const wynik = await purgeExpiredSegments(TERAZ);
    expect(wynik).toEqual({ usuniete: 0, przedluzone: 0 });
    expect(await terminWaznosci(id)).toBe(TERAZ + GODZINA);
  });

  test("segment stały nie wygasa nigdy", async () => {
    // Oznaczenie „cykliczny / stały" to jedyny sposób, by segment przetrwał.
    const id = await dodajSegment("stały", null, true);
    await purgeExpiredSegments(TERAZ);
    expect(await istnieje(id)).toBe(true);
  });

  test("segment stały z zapisanym terminem też jest chroniony", async () => {
    // Flaga `permanent` wygrywa z `expiresAt` — inaczej segment przestawiony
    // na stały zniknąłby przez wpis, który został po jego doraźnej przeszłości.
    const id = await dodajSegment("stały ze starym terminem", TERAZ - GODZINA, true);
    const wynik = await purgeExpiredSegments(TERAZ);
    expect(wynik.usuniete).toBe(0);
    expect(await istnieje(id)).toBe(true);
  });
});

describe("purgeExpiredSegments — ochrona tego, co w użyciu", () => {
  for (const status of ["scheduled", "sending", "paused"] as const) {
    test(`wysyłka w stanie „${status}" przedłuża segment zamiast go usunąć`, async () => {
      const id = await dodajSegment("pod wysyłkę", TERAZ - GODZINA);
      await dodajKampanie(id, status);
      const wynik = await purgeExpiredSegments(TERAZ);
      expect(wynik).toEqual({ usuniete: 0, przedluzone: 1 });
      expect(await terminWaznosci(id)).toBe(TERAZ + TTL);
    });
  }

  test("wysyłka zakończona już nie chroni", async () => {
    // Raport z wysyłki trzyma własną kopię opisu segmentu, więc jego usunięcie
    // nie odbiera historii.
    const id = await dodajSegment("po wysyłce", TERAZ - GODZINA);
    await dodajKampanie(id, "sent");
    const wynik = await purgeExpiredSegments(TERAZ);
    expect(wynik.usuniete).toBe(1);
    expect(await istnieje(id)).toBe(false);
  });

  test("aktywna automatyzacja przedłuża segment", async () => {
    const id = await dodajSegment("w automatyzacji", TERAZ - GODZINA);
    await dodajAutomatyzacje("w automatyzacji", "active");
    const wynik = await purgeExpiredSegments(TERAZ);
    expect(wynik).toEqual({ usuniete: 0, przedluzone: 1 });
    expect(await istnieje(id)).toBe(true);
  });

  test("automatyzacja nieaktywna nie chroni", async () => {
    const id = await dodajSegment("w wyłączonej", TERAZ - GODZINA);
    await dodajAutomatyzacje("w wyłączonej", "inactive");
    const wynik = await purgeExpiredSegments(TERAZ);
    expect(wynik.usuniete).toBe(1);
  });

  test("dopasowanie idzie przez ZAWIERANIE tekstu, nie przez równość nazw", async () => {
    // Silnik szuka nazwy segmentu w zapisanym grafie automatyzacji jako
    // fragmentu tekstu. Segment „Kardiologia" jest więc chroniony także przez
    // automatyzację mówiącą o „Kardiologia — pilne", bo tamta nazwa zawiera tę.
    // To celowa nadgorliwość: lepiej zostawić segment o przebieg za długo, niż
    // po cichu wyłączyć komuś działającą automatyzację.
    const id = await dodajSegment("Kardiologia", TERAZ - GODZINA);
    await dodajAutomatyzacje("Kardiologia — pilne", "active");
    const wynik = await purgeExpiredSegments(TERAZ);
    expect(wynik).toEqual({ usuniete: 0, przedluzone: 1 });
    expect(await istnieje(id)).toBe(true);
  });

  test("nazwa niewystępująca w grafie NIE chroni — to znany dług", async () => {
    // Powiązanie jest po NAZWIE, nie po identyfikatorze: zmiana nazwy segmentu
    // zrywa je i segment zostanie usunięty mimo działającej automatyzacji.
    // Test opisuje stan faktyczny, żeby przyszłe przejście na wiązanie po `id`
    // nie przeszło niezauważone.
    const id = await dodajSegment("Kardiologia", TERAZ - GODZINA);
    await dodajAutomatyzacje("Ortopedia", "active");
    const wynik = await purgeExpiredSegments(TERAZ);
    expect(wynik.usuniete).toBe(1);
    expect(await istnieje(id)).toBe(false);
  });

  test("krótka nazwa segmentu bywa chroniona przypadkiem", async () => {
    // Konsekwencja dopasowania przez zawieranie: segment nazwany „test" trafia
    // w każdą automatyzację, której graf zawiera gdziekolwiek to słowo — choćby
    // w zupełnie innym polu. Skutek jest po bezpiecznej stronie (segment
    // zostaje), ale wyjaśnia, czemu segmenty o ogólnych nazwach nie znikają.
    const id = await dodajSegment("test", TERAZ - GODZINA);
    await dodajAutomatyzacje("wysyłka testowa", "active");
    const wynik = await purgeExpiredSegments(TERAZ);
    expect(wynik.przedluzone).toBe(1);
    expect(await istnieje(id)).toBe(true);
  });
});

describe("purgeExpiredSegments — działanie na wielu naraz", () => {
  test("rozdziela usuwane od przedłużanych w jednym przebiegu", async () => {
    const doUsuniecia = await dodajSegment("bez użycia", TERAZ - GODZINA);
    const wUzyciu = await dodajSegment("w użyciu", TERAZ - GODZINA);
    const swiezy = await dodajSegment("świeży", TERAZ + GODZINA);
    await dodajKampanie(wUzyciu, "scheduled");

    const wynik = await purgeExpiredSegments(TERAZ);
    expect(wynik).toEqual({ usuniete: 1, przedluzone: 1 });
    expect(await istnieje(doUsuniecia)).toBe(false);
    expect(await istnieje(wUzyciu)).toBe(true);
    expect(await istnieje(swiezy)).toBe(true);
  });

  test("pusta baza nie wywołuje żadnego zapisu", async () => {
    expect(await purgeExpiredSegments(TERAZ)).toEqual({ usuniete: 0, przedluzone: 0 });
  });
});
