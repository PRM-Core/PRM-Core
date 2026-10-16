/**
 * Key rotation without an outage, against a temp database, with keys made
 * for the test: rows under the previous key stay readable, the dry run
 * writes nothing, the move keeps every value, a row under neither key stops
 * the whole move, and the incoming webhook's previous secret works for 24
 * hours after a rotation and not after.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-rotate-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { encryptCredential, decryptCredential, masterFor, readMasterKey } =
  await import("./crypto.server");
const { rotateToCurrentKey } = await import("./rotate.server");
const { regenerateSecret, checkWebhookSecret, PREVIOUS_SECRET_GRACE_MS } =
  await import("../leads/lead-webhook.server");
const { getDb } = await import("../db/client.server");
const { integrationCredentials, leadWebhookSettings, webhookEndpoints } =
  await import("../db/schema");

const OLD = randomBytes(32).toString("hex");
const NEW = randomBytes(32).toString("hex");
const OTHER = randomBytes(32).toString("hex");
const saved = {
  key: process.env.PRM_SECRETS_KEY,
  previous: process.env.PRM_SECRETS_KEY_PREVIOUS,
};
const key = (hex: string) => {
  const s = readMasterKey(hex);
  if (s.state !== "ok") throw new Error("bad test key");
  return s.master;
};

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
});
afterAll(() => {
  for (const [k, v] of [
    ["PRM_SECRETS_KEY", saved.key],
    ["PRM_SECRETS_KEY_PREVIOUS", saved.previous],
  ] as const)
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
});
beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  process.env.PRM_SECRETS_KEY = NEW;
  process.env.PRM_SECRETS_KEY_PREVIOUS = OLD;
  for (const t of [integrationCredentials, webhookEndpoints, leadWebhookSettings])
    await getDb().delete(t);
});

async function seedUnder(hex: string) {
  const m = key(hex);
  await getDb()
    .insert(integrationCredentials)
    .values({
      name: "SENDGRID_API_KEY",
      ciphertext: encryptCredential("SG.test-value", "SENDGRID_API_KEY", m),
      keyId: m.id,
      updatedAt: 0,
    });
  await getDb()
    .insert(webhookEndpoints)
    .values({
      id: "w1",
      name: "n8n",
      host: "hooks.example.test",
      urlEnc: encryptCredential("https://hooks.example.test/x", "webhook:w1:url", m),
      secretEnc: encryptCredential("s3cret", "webhook:w1:secret", m),
      keyId: m.id,
      fields: [],
      updatedAt: 0,
    });
}

describe("which key reads a row", () => {
  test("the current one, the previous one, or none", () => {
    expect(masterFor(key(NEW).id)?.id).toBe(key(NEW).id);
    expect(masterFor(key(OLD).id)?.id).toBe(key(OLD).id);
    expect(masterFor(key(OTHER).id)).toBeNull();
    expect(masterFor("")?.id).toBe(key(NEW).id);
  });
});

describe("re-encrypting to the current key", () => {
  test("a dry run counts and writes nothing", async () => {
    await seedUnder(OLD);
    const r = await rotateToCurrentKey(false);
    expect(r).toMatchObject({ current: 0, moved: 2, unreadable: [], applied: false });
    expect((await getDb().select().from(integrationCredentials).get())?.keyId).toBe(key(OLD).id);
  });

  test("apply moves every row and keeps every value", async () => {
    await seedUnder(OLD);
    const r = await rotateToCurrentKey(true);
    expect(r.applied).toBe(true);
    const cred = (await getDb().select().from(integrationCredentials).get())!;
    const hook = (await getDb().select().from(webhookEndpoints).get())!;
    expect(cred.keyId).toBe(key(NEW).id);
    expect(decryptCredential(cred.ciphertext, cred.name, cred.keyId, key(NEW))).toBe(
      "SG.test-value",
    );
    expect(decryptCredential(hook.urlEnc, "webhook:w1:url", hook.keyId, key(NEW))).toBe(
      "https://hooks.example.test/x",
    );
    expect(decryptCredential(hook.secretEnc, "webhook:w1:secret", hook.keyId, key(NEW))).toBe(
      "s3cret",
    );
    // Run again: nothing left to move.
    expect(await rotateToCurrentKey(true)).toMatchObject({ current: 2, moved: 0 });
  });

  test("a row under neither key stops the whole move", async () => {
    await seedUnder(OTHER);
    const r = await rotateToCurrentKey(true);
    expect(r.applied).toBe(false);
    expect(r.unreadable).toEqual(["credential SENDGRID_API_KEY", "webhook n8n"]);
    expect((await getDb().select().from(integrationCredentials).get())?.keyId).toBe(key(OTHER).id);
  });
});

describe("the incoming webhook's previous secret", () => {
  test("works for 24 hours after a rotation, then not", async () => {
    const first = await regenerateSecret(0);
    const second = await regenerateSecret(1_000);
    expect(await checkWebhookSecret(second, 2_000)).toMatchObject({ ok: true, previous: false });
    expect(await checkWebhookSecret(first, 2_000)).toMatchObject({ ok: true, previous: true });
    expect(await checkWebhookSecret(first, 1_000 + PREVIOUS_SECRET_GRACE_MS + 1)).toEqual({
      ok: false,
    });
    expect(await checkWebhookSecret("wrong", 2_000)).toEqual({ ok: false });
    expect(await checkWebhookSecret("", 2_000)).toEqual({ ok: false });
  });

  test("after a leak the old secret stops at once", async () => {
    const first = await regenerateSecret(0);
    const second = await regenerateSecret(1_000, false);
    expect(await checkWebhookSecret(first, 2_000)).toEqual({ ok: false });
    expect(await checkWebhookSecret(second, 2_000)).toMatchObject({ ok: true, previous: false });
  });
});
