/**
 * Odmowa bramki pocztowej jako ostrzeżenie w panelu.
 *
 * Wrzesień 2026: SendGrid odrzucał każdą wysyłkę przez wyczerpany limit planu,
 * a placówka zorientowała się po czterech dniach — po tym, że nie przyszedł
 * dobowy raport bezpieczeństwa. Cisza w poczcie musi być widoczna wcześniej.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const katalog = fs.mkdtempSync(path.join(os.tmpdir(), "prm-bramka-"));
process.env.DATABASE_URL = `file:${path.join(katalog, "test.db")}`;

const { collectSignals } = await import("./supervisor.server");
const { getDb } = await import("../db/client.server");
const { engineLog } = await import("../db/schema");

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

async function blad(message: string) {
  await getDb()
    .insert(engineLog)
    .values({
      id: `log-${Math.random().toString(36).slice(2, 10)}`,
      kind: "error",
      message,
      createdAt: Date.now() - 60 * 60 * 1000,
    });
}

const bramka = async () =>
  (await collectSignals()).find((s) => s.signature.startsWith("email-gateway-failures:"));

describe("ostrzeżenie o bramce pocztowej", () => {
  test("wyczerpany limit planu daje ostrzeżenie krytyczne z podpowiedzią o koncie", async () => {
    await blad(
      "Wysyłka „Przypomnienie” nie powiodła się: SendGrid odrzucił wysyłkę: Maximum credits exceeded",
    );
    await blad(
      "raport-bezpieczenstwa: wysyłka raportu za 2026-09-29 nie powiodła się — SendGrid odrzucił wysyłkę: Maximum credits exceeded",
    );

    const insight = await bramka();

    expect(insight?.severity).toBe("critical");
    expect(insight?.evidence?.odrzucone).toBe("2");
    expect(insight?.detail).toContain("limitu planu");
    expect(insight?.proposedAction).toContain("SendGrid");
  });

  test("inna odmowa bramki kieruje do sprawdzenia klucza", async () => {
    await blad(
      "Wysyłka e-maila nie powiodła się: SendGrid odrzucił wysyłkę: The provided authorization grant is invalid",
    );

    expect((await bramka())?.proposedAction).toContain("Sprawdź połączenie");
  });

  test("bez odmów nie ma ostrzeżenia", async () => {
    await blad("Krok automatyzacji nie powiódł się: brak szablonu");

    expect(await bramka()).toBeUndefined();
  });
});
