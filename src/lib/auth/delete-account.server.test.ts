/**
 * Usuwanie konta przez administratora na prawdziwej bazie: sesje znikają
 * razem z kontem, własnego konta ani ostatniego administratora usunąć się nie da.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const katalog = fs.mkdtempSync(path.join(os.tmpdir(), "prm-konta-"));
process.env.DATABASE_URL = `file:${path.join(katalog, "test.db")}`;

const { adminDeleteUserAccount } = await import("./delete-account.server");
const { getDb } = await import("../db/client.server");
const { users, sessions, engineLog } = await import("../db/schema");
const { eq } = await import("drizzle-orm");

beforeAll(() => {
  const wynik = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (wynik.status !== 0)
    throw new Error(`Migracje nie przeszły:\n${wynik.stdout}\n${wynik.stderr}`);
});
afterAll(() => fs.rmSync(katalog, { recursive: true, force: true }));

async function konto(id: string, role: "admin" | "marketing") {
  await getDb()
    .insert(users)
    .values({
      id,
      email: `${id}@test.local`,
      passwordHash: "x",
      firstName: "Jan",
      lastName: "Test",
      company: "",
      role,
      createdAt: new Date().toISOString(),
    });
  await getDb()
    .insert(sessions)
    .values({ id: `sesja-${id}`, userId: id, expiresAt: Date.now() + 60_000 });
}

beforeEach(async () => {
  const db = getDb();
  await db.delete(sessions);
  await db.delete(users);
  await db.delete(engineLog);
});

describe("adminDeleteUserAccount", () => {
  test("usuwa konto razem z sesjami i zostawia wpis w dzienniku", async () => {
    await konto("admin", "admin");
    await konto("marketer", "marketing");

    const wynik = await adminDeleteUserAccount("admin", "marketer");

    expect(wynik.email).toBe("marketer@test.local");
    const db = getDb();
    expect(await db.select().from(users).where(eq(users.id, "marketer"))).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.userId, "marketer"))).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.userId, "admin"))).toHaveLength(1);
    const wpisy = await db.select().from(engineLog);
    expect(wpisy.some((w) => w.detail?.source === "konto-usuniete")).toBe(true);
  });

  test("administrator może usunąć innego administratora", async () => {
    await konto("admin", "admin");
    await konto("admin2", "admin");

    await adminDeleteUserAccount("admin", "admin2");

    expect(await getDb().select().from(users)).toHaveLength(1);
  });

  test("odmawia usunięcia własnego konta", async () => {
    await konto("admin", "admin");

    await expect(adminDeleteUserAccount("admin", "admin")).rejects.toThrow("własnego konta");
    expect(await getDb().select().from(users)).toHaveLength(1);
  });

  test("odmawia usunięcia ostatniego administratora", async () => {
    // Stan nieosiągalny z interfejsu (usuwający sam jest administratorem),
    // ale blokada ma działać niezależnie od tego, kto woła.
    await konto("marketer", "marketing");
    await konto("admin", "admin");

    await expect(adminDeleteUserAccount("marketer", "admin")).rejects.toThrow(
      "ostatni administrator",
    );
    expect(await getDb().select().from(users)).toHaveLength(2);
  });

  test("zgłasza nieistniejące konto", async () => {
    await konto("admin", "admin");

    await expect(adminDeleteUserAccount("admin", "nie-ma")).rejects.toThrow("Nie znaleziono");
  });
});
