/**
 * Dane dostępowe na prawdziwej bazie: kolejność panel → .env, szyfrowanie
 * w bazie, zmiana klucza głównego, dziennik bez wartości.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CREDENTIAL_NAMES } from "./catalog";
// Registers the test booking system in the credentials catalog.
import "../booking-system/test-system";

const katalog = fs.mkdtempSync(path.join(os.tmpdir(), "prm-klucze-"));
const adresBazy = `file:${path.join(katalog, "test.db")}`;
const KLUCZ = randomBytes(32).toString("hex");

const {
  getCredential,
  saveCredentials,
  clearCredential,
  listCredentialStatuses,
  generateMcpToken,
  importCredentialsFromEnv,
  CredentialStoreError,
  __forgetCredentialCache,
} = await import("./store.server");
const { getDb } = await import("../db/client.server");
const { integrationCredentials, engineLog } = await import("../db/schema");

// Wszystkie zmienne integracji są czyszczone przed każdym testem i przywracane
// po nim. Bez tego lokalny `.env` z prawdziwymi kluczami wpływał na wynik
// (test przenoszenia z `.env` widział klucze, których nie ustawił).
const DOTYKANE = ["PRM_SECRETS_KEY", ...CREDENTIAL_NAMES];
const zapamietane = Object.fromEntries(DOTYKANE.map((n) => [n, process.env[n]]));

beforeAll(() => {
  process.env.DATABASE_URL = adresBazy;
  const wynik = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (wynik.status !== 0)
    throw new Error(`Migracje nie przeszły:\n${wynik.stdout}\n${wynik.stderr}`);
});
beforeEach(async () => {
  process.env.DATABASE_URL = adresBazy;
  for (const n of DOTYKANE) delete process.env[n];
  process.env.PRM_SECRETS_KEY = KLUCZ;
  await getDb().delete(integrationCredentials);
  await getDb().delete(engineLog);
  __forgetCredentialCache();
});
afterEach(() => {
  for (const [n, v] of Object.entries(zapamietane)) {
    if (v === undefined) delete process.env[n];
    else process.env[n] = v;
  }
  __forgetCredentialCache();
});
afterAll(() => fs.rmSync(katalog, { recursive: true, force: true }));

const SG_PANEL = "SG.test.panel.panel.9876";

describe("kolejność odczytu", () => {
  test("bez niczego — pusty napis", async () => {
    expect(await getCredential("SENDGRID_API_KEY")).toBe("");
  });

  test(".env działa jak przed panelem", async () => {
    process.env.SENDGRID_API_KEY = "SG.z-env";
    expect(await getCredential("SENDGRID_API_KEY")).toBe("SG.z-env");
  });

  test("panel wygrywa z .env, a usunięcie wraca do .env", async () => {
    process.env.SENDGRID_API_KEY = "SG.z-env";
    await saveCredentials({ SENDGRID_API_KEY: SG_PANEL }, "Anna Test");
    expect(await getCredential("SENDGRID_API_KEY")).toBe(SG_PANEL);
    await clearCredential("SENDGRID_API_KEY", "Anna Test");
    expect(await getCredential("SENDGRID_API_KEY")).toBe("SG.z-env");
  });
});

describe("zapis", () => {
  test("w bazie nie ma wartości jawnie, jest tylko końcówka", async () => {
    await saveCredentials({ SENDGRID_API_KEY: SG_PANEL }, "Anna Test");
    const row = await getDb().select().from(integrationCredentials).get();
    expect(row?.ciphertext.includes("panel")).toBe(false);
    expect(row?.hint).toBe("9876");
    expect(row?.updatedBy).toBe("Anna Test");
  });

  test("bez klucza głównego zapis jest odrzucany z jasnym komunikatem", async () => {
    delete process.env.PRM_SECRETS_KEY;
    await expect(saveCredentials({ SENDGRID_API_KEY: SG_PANEL }, "x")).rejects.toThrow(
      /PRM_SECRETS_KEY/,
    );
    process.env.PRM_SECRETS_KEY = "za-krótki";
    await expect(saveCredentials({ SENDGRID_API_KEY: SG_PANEL }, "x")).rejects.toThrow(/format/);
  });

  test("błąd w jednym polu — nie zapisuje się żadne", async () => {
    await expect(
      saveCredentials(
        { TWILIO_ACCOUNT_SID: `SK${"a".repeat(32)}`, TWILIO_AUTH_TOKEN: "token-token-token" },
        "x",
      ),
    ).rejects.toBeInstanceOf(CredentialStoreError);
    expect(await getDb().select().from(integrationCredentials).all()).toHaveLength(0);
  });

  test("nieznane pole", async () => {
    await expect(saveCredentials({ PRM_SECRETS_KEY: "x" }, "x")).rejects.toThrow(/Nieznane pole/);
  });

  test("dziennik: kto i co, bez wartości i bez końcówki", async () => {
    const haslo = "Tajne$Haslo-12345678";
    await saveCredentials({ TESTSYS_PASSWORD: haslo }, "Anna Test");
    const wpisy = await getDb().select().from(engineLog).all();
    expect(wpisy).toHaveLength(1);
    const tekst = JSON.stringify(wpisy[0]);
    expect(wpisy[0].kind).toBe("security");
    expect(tekst).toContain("Test booking system");
    expect(tekst).toContain("Anna Test");
    expect(tekst.includes(haslo)).toBe(false);
    expect(tekst.includes("5678")).toBe(false);
  });

  test("token MCP: zwrócony raz, potem tylko końcówka", async () => {
    const token = await generateMcpToken("Anna Test");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await getCredential("PRM_MCP_TOKEN")).toBe(token);
    const stan = (await listCredentialStatuses()).find((s) => s.name === "PRM_MCP_TOKEN")!;
    expect(stan.hint).toBe(token.slice(-4));
    expect(JSON.stringify(await listCredentialStatuses()).includes(token)).toBe(false);
  });
});

describe("zmiana albo brak klucza głównego", () => {
  test("inny klucz: system spada na .env, panel pokazuje problem", async () => {
    process.env.OPENAI_API_KEY = "sk-z-env";
    await saveCredentials({ OPENAI_API_KEY: "sk-z-panelu-123456" }, "x");
    process.env.PRM_SECRETS_KEY = randomBytes(32).toString("hex");
    __forgetCredentialCache();
    expect(await getCredential("OPENAI_API_KEY")).toBe("sk-z-env");
    const stan = (await listCredentialStatuses()).find((s) => s.name === "OPENAI_API_KEY")!;
    expect(stan.source).toBe("env");
    expect(stan.problem).toBe("key-mismatch");
  });

  test("brak klucza: wpis nieczytelny, bez .env — pusto i key-missing", async () => {
    await saveCredentials({ OPENAI_API_KEY: "sk-z-panelu-123456" }, "x");
    delete process.env.PRM_SECRETS_KEY;
    __forgetCredentialCache();
    expect(await getCredential("OPENAI_API_KEY")).toBe("");
    const stan = (await listCredentialStatuses()).find((s) => s.name === "OPENAI_API_KEY")!;
    expect(stan.source).toBe("none");
    expect(stan.problem).toBe("key-missing");
  });
});

describe("stan dla panelu", () => {
  test("sekret z .env pokazuje tylko końcówkę, pole jawne całość", async () => {
    process.env.SENDGRID_API_KEY = "SG.test.z-env.z-env.abcd";
    await saveCredentials({ TESTSYS_URL: "https://testsys.example/api" }, "x");
    const stany = await listCredentialStatuses();
    const sg = stany.find((s) => s.name === "SENDGRID_API_KEY")!;
    const url = stany.find((s) => s.name === "TESTSYS_URL")!;
    expect(sg).toMatchObject({ source: "env", hint: "abcd", updatedAt: null });
    expect(url).toMatchObject({
      source: "panel",
      hint: "https://testsys.example/api",
      updatedBy: "x",
    });
    expect(JSON.stringify(stany).includes("z-env.z-env")).toBe(false);
  });
});

describe("przeniesienie z .env do panelu", () => {
  test("przenosi to, co działa z .env; wpisu z panelu nie nadpisuje; błędny format zostaje w .env", async () => {
    process.env.OPENAI_API_KEY = "sk-z-env-openai-1234";
    process.env.TESTSYS_PASSWORD = "abc$def-z-env";
    process.env.SENDGRID_API_KEY = "SG.test.z-env.0000";
    process.env.TWILIO_ACCOUNT_SID = "SK-to-nie-jest-sid-konta";
    await saveCredentials({ SENDGRID_API_KEY: "SG.test.panel.9876" }, "Anna Test");

    const wynik = await importCredentialsFromEnv("Anna Test");
    expect(wynik.imported.sort()).toEqual(["OPENAI_API_KEY", "TESTSYS_PASSWORD"]);
    expect(wynik.skipped.map((s) => s.name)).toEqual(["TWILIO_ACCOUNT_SID"]);
    expect(JSON.stringify(wynik).includes("SK-to-nie")).toBe(false);

    // Po usunięciu z .env wartości zostają — czytane już z panelu.
    delete process.env.OPENAI_API_KEY;
    delete process.env.TESTSYS_PASSWORD;
    __forgetCredentialCache();
    expect(await getCredential("OPENAI_API_KEY")).toBe("sk-z-env-openai-1234");
    expect(await getCredential("TESTSYS_PASSWORD")).toBe("abc$def-z-env");
    expect(await getCredential("SENDGRID_API_KEY")).toBe("SG.test.panel.9876");

    const wpis = (await getDb().select().from(engineLog).all()).at(-1)!;
    expect(wpis.message).toContain("Przeniesiono dane dostępowe z .env");
    expect(JSON.stringify(wpis).includes("z-env-openai")).toBe(false);
  });

  test("drugie uruchomienie nic nie robi", async () => {
    process.env.OPENAI_API_KEY = "sk-z-env-openai-1234";
    await importCredentialsFromEnv("x");
    expect((await importCredentialsFromEnv("x")).imported).toEqual([]);
  });

  test("bez klucza szyfrującego — odmowa", async () => {
    delete process.env.PRM_SECRETS_KEY;
    await expect(importCredentialsFromEnv("x")).rejects.toThrow(/PRM_SECRETS_KEY/);
  });
});
