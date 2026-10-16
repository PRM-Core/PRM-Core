/**
 * The audit trail against a temp database: an entry names who, what and on
 * what; the filter finds one kind of action; retention removes only what is
 * older than the period, at most once a day; the retention setting has a
 * floor. Plus the temporary password now drawn from a cryptographic source.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-audit-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { recordAudit, listAudit, purgeAuditIfDue, retentionDays } = await import("./audit.server");
const { generateTempPassword } = await import("../auth/password.server");
const { getDb } = await import("../db/client.server");
const { auditLog } = await import("../db/schema");

const DAY = 86_400_000;
const saved = process.env.PRM_AUDIT_RETENTION_DAYS;
const admin = { id: "u1", name: "Administrator Testowy" };

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
});
afterAll(() => {
  if (saved === undefined) delete process.env.PRM_AUDIT_RETENTION_DAYS;
  else process.env.PRM_AUDIT_RETENTION_DAYS = saved;
});
beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  delete process.env.PRM_AUDIT_RETENTION_DAYS;
  await getDb().delete(auditLog);
});

describe("the trail", () => {
  test("names who, what and on what; the filter finds one kind of action", async () => {
    await recordAudit({ action: "user.password_reset", target: "anna@example.test", actor: admin });
    await recordAudit({
      action: "contacts.exported",
      target: "120",
      detail: { filter: "{}" },
      actor: admin,
    });
    const all = await listAudit({});
    expect(all).toHaveLength(2);
    const resets = await listAudit({ action: "user.password_reset" });
    expect(resets).toHaveLength(1);
    expect(resets[0]).toMatchObject({
      actorId: "u1",
      actorName: "Administrator Testowy",
      target: "anna@example.test",
    });
  });

  test("retention removes only what is older than the period, at most once a day", async () => {
    const now = 1000 * DAY;
    await recordAudit({ action: "user.added", actor: admin, at: now - 400 * DAY });
    await recordAudit({ action: "user.added", actor: admin, at: now - 10 * DAY });
    expect(await purgeAuditIfDue(now, true)).toBe(1);
    expect(await listAudit({})).toHaveLength(1);
    // Within the day it does not run again.
    await recordAudit({ action: "user.added", actor: admin, at: now - 500 * DAY });
    expect(await purgeAuditIfDue(now + 1000)).toBe(0);
  });

  test("the retention period: 365 by default, never under 30 days", () => {
    expect(retentionDays(undefined)).toBe(365);
    expect(retentionDays("730")).toBe(730);
    expect(retentionDays("7")).toBe(365);
    expect(retentionDays("abc")).toBe(365);
  });
});

test("a temporary password: 12 characters, no look-alikes", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const p = generateTempPassword();
    expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
    seen.add(p);
  }
  expect(seen.size).toBe(50);
});
