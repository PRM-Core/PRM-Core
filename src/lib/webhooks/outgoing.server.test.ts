/**
 * Outgoing webhooks against a temp database, with `fetch` replaced — no
 * network. The encryption key is generated for the test run. Covers: the
 * address and secret stored encrypted, the secret shown once, a signature
 * the receiver can verify, only the allowed fields, redirects and errors
 * refused, and the automation step through the real engine.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createHmac, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-hook-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;
// Set only while these tests run, and restored after: the test process is
// shared, and other suites expect no key unless they set one.
const PREVIOUS_KEY = process.env.PRM_SECRETS_KEY;
const TEST_KEY = randomBytes(32).toString("hex");

const { saveWebhookEndpoint, listWebhookEndpoints, deliverWebhook } =
  await import("./outgoing.server");
const { tick } = await import("../engine/runner.server");
const { getDb } = await import("../db/client.server");
const { automationRuns, automations, contacts, engineJobs, engineLog, webhookEndpoints } =
  await import("../db/schema");
const { eq } = await import("drizzle-orm");

const URL_ = "https://hooks.example.test/catch/123/s3cr3t-path";
const realFetch = globalThis.fetch;
let calls: { url: string; init: RequestInit }[] = [];
let reply: () => Response = () => new Response("ok", { status: 200 });

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
});
afterAll(() => {
  globalThis.fetch = realFetch;
  if (PREVIOUS_KEY === undefined) delete process.env.PRM_SECRETS_KEY;
  else process.env.PRM_SECRETS_KEY = PREVIOUS_KEY;
});
beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  process.env.PRM_SECRETS_KEY = TEST_KEY;
  calls = [];
  reply = () => new Response("ok", { status: 200 });
  globalThis.fetch = (async (url: string | URL, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return reply();
  }) as unknown as typeof fetch;
  for (const t of [automationRuns, automations, contacts, engineJobs, engineLog, webhookEndpoints])
    await getDb().delete(t);
});

const CONTACT = {
  prmId: "PRM-00042",
  firstName: "Anna",
  lastName: "Testowa",
  email: "anna@example.test",
  phone: "+48000100200",
  pesel: "00000000000",
};
const CTX = { automationId: "a1", automationName: "Kontrola", runId: "r1", stepId: "s1" };

describe("destinations", () => {
  test("the address and the secret are stored encrypted; the secret is shown once", async () => {
    const { id, secret } = await saveWebhookEndpoint(
      { name: "n8n", url: URL_, fields: ["firstName", "pesel"] },
      "Admin",
    );
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    const row = (await getDb().select().from(webhookEndpoints).get())!;
    expect(row.host).toBe("hooks.example.test");
    expect(row.urlEnc).not.toContain("s3cr3t-path");
    expect(row.secretEnc).not.toContain(secret!);
    // Only the fields a destination may have — "pesel" is not one of them.
    expect(row.fields).toEqual(["firstName"]);
    const [view] = await listWebhookEndpoints();
    expect(JSON.stringify(view)).not.toContain("s3cr3t-path");
    // The decision is logged — who, which host, which fields — never the address.
    const logged = (await getDb().select().from(engineLog)).map((l) => l.message).join("\n");
    expect(logged).toContain("Admin");
    expect(logged).toContain("hooks.example.test");
    expect(logged).not.toContain("s3cr3t-path");
    expect(logged).not.toContain(secret!);
    // A save without rotating returns no secret.
    expect((await saveWebhookEndpoint({ id, name: "n8n", fields: [] }, "Admin")).secret).toBeNull();
  });

  test("an address over plain HTTP outside the clinic's network is refused", async () => {
    await expect(
      saveWebhookEndpoint({ name: "x", url: "http://example.com/hook", fields: [] }, "Admin"),
    ).rejects.toThrow(/https/);
  });

  test("without PRM_SECRETS_KEY nothing is stored", async () => {
    delete process.env.PRM_SECRETS_KEY;
    await expect(
      saveWebhookEndpoint({ name: "x", url: URL_, fields: [] }, "Admin"),
    ).rejects.toThrow(/PRM_SECRETS_KEY/);
  });
});

describe("delivery", () => {
  test("signed so the receiver can check it, with only the allowed fields", async () => {
    const { id, secret } = await saveWebhookEndpoint(
      { name: "n8n", url: URL_, fields: ["firstName"] },
      "Admin",
    );
    const d = await deliverWebhook(id, CONTACT, CTX, 1_700_000_000_000);
    expect(d.status).toBe(200);
    const [call] = calls;
    expect(call.url).toBe(URL_);
    expect(call.init.redirect).toBe("manual");
    const headers = call.init.headers as Record<string, string>;
    const body = String(call.init.body);
    const expected = `sha256=${createHmac("sha256", secret!).update(`${headers["X-PRM-Timestamp"]}.${body}`).digest("hex")}`;
    expect(headers["X-PRM-Signature"]).toBe(expected);
    expect(JSON.parse(body).contact).toEqual({ prmId: "PRM-00042", firstName: "Anna" });
    expect(body).not.toContain("00000000000");
  });

  test("a redirect is refused, not followed; an error answer is an error", async () => {
    const { id } = await saveWebhookEndpoint({ name: "n8n", url: URL_, fields: [] }, "Admin");
    reply = () => new Response(null, { status: 302, headers: { Location: "http://10.0.0.1/" } });
    await expect(deliverWebhook(id, CONTACT, CTX)).rejects.toThrow(/302/);
    reply = () => new Response("no", { status: 500 });
    await expect(deliverWebhook(id, CONTACT, CTX)).rejects.toThrow(/500/);
  });

  test("a new secret replaces the old one", async () => {
    const first = await saveWebhookEndpoint({ name: "n8n", url: URL_, fields: [] }, "Admin");
    const second = await saveWebhookEndpoint(
      { id: first.id, name: "n8n", fields: [], rotateSecret: true },
      "Admin",
    );
    expect(second.secret).not.toBe(first.secret);
    await deliverWebhook(first.id, CONTACT, CTX, 1);
    const headers = calls[0].init.headers as Record<string, string>;
    const sig = createHmac("sha256", second.secret!)
      .update(`1.${String(calls[0].init.body)}`)
      .digest("hex");
    expect(headers["X-PRM-Signature"]).toBe(`sha256=${sig}`);
  });
});

describe("the automation step", () => {
  async function setup(endpointId: string) {
    await getDb()
      .insert(automations)
      .values({
        id: "auto-1",
        name: "Przekaż do rejestracji",
        status: "active",
        flow: {
          nodes: [
            { id: "t1", kind: "trigger", position: { x: 0, y: 0 }, key: "manual" },
            {
              id: "w1",
              kind: "action",
              position: { x: 0, y: 0 },
              key: "send_webhook",
              config: { endpoint: endpointId },
            },
          ],
          edges: [{ id: "e1", source: "t1", target: "w1" }],
        },
        updatedAt: "",
        reviewFirst: 0,
        reviewed: 0,
      });
    await getDb().insert(contacts).values({
      id: "p1",
      prmId: "PRM-00042",
      firstName: "Anna",
      lastName: "Testowa",
      email: "",
      phone: "",
      segments: [],
      tags: [],
      source: "test",
      medium: "",
      campaign: "",
      createdAt: "2025-01-01",
      status: "patient",
      customFields: {},
    });
    await getDb()
      .insert(automationRuns)
      .values({
        id: "run-1",
        automationId: "auto-1",
        contactId: "p1",
        currentNodeId: "w1",
        status: "running",
        path: ["t1"],
        startedAt: Date.now(),
      });
    await getDb()
      .insert(engineJobs)
      .values({
        id: "job-1",
        runId: "run-1",
        nodeId: "w1",
        dueAt: Date.now() - 1000,
        status: "pending",
        attempts: 0,
        idempotencyKey: "run-1:w1:1",
        createdAt: Date.now(),
      });
  }

  test("posts the patient with the automation's name, and logs where it went", async () => {
    const { id } = await saveWebhookEndpoint({ name: "n8n", url: URL_, fields: [] }, "Admin");
    await setup(id);
    await tick();
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      automation: { id: "auto-1", name: "Przekaż do rejestracji" },
      run: "run-1",
      step: "w1",
      contact: { prmId: "PRM-00042" },
    });
    const line = (await getDb().select().from(engineLog)).find((l) => l.kind === "action");
    expect(line?.message).toContain("hooks.example.test");
  });

  test("a destination that answers with an error stops the run with the reason", async () => {
    const { id } = await saveWebhookEndpoint({ name: "n8n", url: URL_, fields: [] }, "Admin");
    await setup(id);
    reply = () => new Response("no", { status: 503 });
    await tick();
    const run = await getDb()
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.id, "run-1"))
      .get();
    expect(run?.status).toBe("failed");
    expect(run?.lastError).toContain("503");
  });
});
