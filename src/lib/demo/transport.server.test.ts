/**
 * Demo mode against a temp database, with `fetch` replaced by a trap: an
 * e-mail, an SMS and an outgoing webhook each land in the demo outbox and
 * none of them touches the network — with no keys configured at all.
 * Outside demo mode the transports behave as before (no key → an error).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-demo-tx-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { sendEmail } = await import("../email/sendgrid.server");
const { sendSms } = await import("../sms/twilio.server");
const { saveWebhookEndpoint, deliverWebhook } = await import("../webhooks/outgoing.server");
const { listDemoOutbox, ensureDemoOutbox, demoOutbox } = await import("./outbox.server");
const { getDb } = await import("../db/client.server");

const saved = {
  demo: process.env.PRM_DEMO,
  key: process.env.PRM_SECRETS_KEY,
  sg: process.env.SENDGRID_API_KEY,
  sid: process.env.TWILIO_ACCOUNT_SID,
  token: process.env.TWILIO_AUTH_TOKEN,
};
const realFetch = globalThis.fetch;
let fetchCalls = 0;

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
});
afterAll(() => {
  globalThis.fetch = realFetch;
  for (const [env, value] of [
    ["PRM_DEMO", saved.demo],
    ["PRM_SECRETS_KEY", saved.key],
    ["SENDGRID_API_KEY", saved.sg],
    ["TWILIO_ACCOUNT_SID", saved.sid],
    ["TWILIO_AUTH_TOKEN", saved.token],
  ] as const) {
    if (value === undefined) delete process.env[env];
    else process.env[env] = value;
  }
});
beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  process.env.PRM_DEMO = "1";
  delete process.env.SENDGRID_API_KEY;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    throw new Error("network is off in this test");
  }) as unknown as typeof fetch;
  await ensureDemoOutbox();
  await getDb().delete(demoOutbox);
});

describe("demo transports", () => {
  test("an e-mail is recorded with its HTML and never sent", async () => {
    await sendEmail({
      to: "anna.testowa.000001@example.test",
      fromEmail: "recepcja@example.test",
      fromName: "Przychodnia Demo",
      subject: "Witamy",
      html: "<p>Dzień dobry</p>",
    });
    expect(fetchCalls).toBe(0);
    const [row] = await listDemoOutbox();
    expect(row).toMatchObject({
      channel: "email",
      to: "anna.testowa.000001@example.test",
      from: "Przychodnia Demo <recepcja@example.test>",
      subject: "Witamy",
      body: "<p>Dzień dobry</p>",
    });
  });

  test("an SMS is recorded and never sent", async () => {
    await sendSms({ to: "+48000000001", fromNumber: "+48000999000", body: "Przypominamy" });
    expect(fetchCalls).toBe(0);
    const [row] = await listDemoOutbox();
    expect(row).toMatchObject({ channel: "sms", to: "+48000000001", body: "Przypominamy" });
  });

  test("the sender is still required — a demo shows the same errors a clinic would get", async () => {
    await expect(
      sendEmail({ to: "a@example.test", fromEmail: "", subject: "x", html: "x" }),
    ).rejects.toThrow();
    await expect(sendSms({ to: "+48000000001", fromNumber: "", body: "x" })).rejects.toThrow();
    expect(fetchCalls).toBe(0);
  });

  test("an outgoing webhook is not called; its payload is in the outbox", async () => {
    process.env.PRM_SECRETS_KEY = randomBytes(32).toString("hex");
    const { id } = await saveWebhookEndpoint(
      { name: "n8n", url: "https://hooks.example.test/catch/1", fields: ["firstName"] },
      "Admin",
    );
    const d = await deliverWebhook(
      id,
      {
        prmId: "PRM-10001",
        firstName: "Anna",
        lastName: "Testowa",
        email: "anna.testowa.000001@example.test",
        phone: "+48000000001",
      },
      { automationId: "a1", automationName: "Demo", runId: "r1", stepId: "s1" },
    );
    expect(fetchCalls).toBe(0);
    expect(d.host).toBe("hooks.example.test");
    const [row] = await listDemoOutbox();
    expect(row.channel).toBe("webhook");
    expect(row.to).toBe("n8n (hooks.example.test)");
    expect(JSON.parse(row.body)).toMatchObject({
      contact: { prmId: "PRM-10001", firstName: "Anna" },
    });
  });

  test("outside demo mode nothing changes: no key, an error, nothing recorded", async () => {
    delete process.env.PRM_DEMO;
    await expect(
      sendEmail({ to: "a@example.test", fromEmail: "r@example.test", subject: "x", html: "x" }),
    ).rejects.toThrow();
    await expect(
      sendSms({ to: "+48000000001", fromNumber: "+48000999000", body: "x" }),
    ).rejects.toThrow();
    expect(fetchCalls).toBe(0);
    expect(await listDemoOutbox()).toHaveLength(0);
  });
});

describe("the preview", () => {
  test("shows a recorded e-mail without counting: no pixel, direct links, a dead unsubscribe", async () => {
    const { injectTracking } = await import("../email/email-tracking.server");
    const { UNSUBSCRIBE_PLACEHOLDER } = await import("../content-builder");
    const { previewSafeHtml } = await import("./outbox.server");
    const html = injectTracking(
      `<html><body><a href="https://example.test/umow-wizyte">Umów</a>` +
        `<a href="javascript:alert(1)">x</a><a href="${UNSUBSCRIBE_PLACEHOLDER}">Wypisz</a></body></html>`,
      "tok-1",
      "https://demo.example.test",
    );
    expect(html).toContain("/e/open/tok-1");
    expect(html).toContain("/e/click/tok-1");
    const safe = previewSafeHtml(html);
    expect(safe).not.toContain("/e/open/");
    expect(safe).not.toContain("/e/click/");
    expect(safe).not.toContain("/unsubscribe/");
    expect(safe).toContain('href="https://example.test/umow-wizyte"');
    // A tracked link to anything but http(s) goes nowhere.
    const crafted = previewSafeHtml(
      `<a href="https://demo.example.test/e/click/t?u=${encodeURIComponent("javascript:alert(1)")}">x</a>`,
    );
    expect(crafted).toBe('<a href="#">x</a>');
  });
});
