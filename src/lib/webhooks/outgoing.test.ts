/** Outgoing webhooks — the address rules and the payload, on paper. */
import { describe, expect, test } from "bun:test";
import { buildPayload, checkWebhookUrl } from "./outgoing";

describe("which addresses an automation may post to", () => {
  test("HTTPS anywhere", () => {
    expect(checkWebhookUrl("https://hooks.zapier.com/hooks/catch/1/abc")).toEqual({
      ok: true,
      host: "hooks.zapier.com",
    });
  });

  test("plain HTTP only inside the clinic's network", () => {
    expect(checkWebhookUrl("http://192.168.1.20:5678/webhook/x").ok).toBe(true);
    expect(checkWebhookUrl("http://localhost:5678/webhook/x").ok).toBe(true);
    expect(checkWebhookUrl("http://example.com/hook")).toEqual({ ok: false, reason: "insecure" });
  });

  test("no login in the address, nothing that is not http(s)", () => {
    expect(checkWebhookUrl("https://user:pass@example.com/hook")).toEqual({
      ok: false,
      reason: "credentials",
    });
    expect(checkWebhookUrl("ftp://example.com/x")).toEqual({ ok: false, reason: "invalid" });
    expect(checkWebhookUrl("not a url")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("the payload", () => {
  const contact = {
    prmId: "PRM-00042",
    firstName: "Anna",
    lastName: "Testowa",
    email: "anna@example.test",
    phone: "+48000100200",
    pesel: "00000000000",
    customFields: { diagnoza: "x" },
    tags: ["kardio"],
  };
  const ctx = { automationId: "a1", automationName: "Kontrola", runId: "r1", stepId: "s1" };

  test("the PRM number always, the rest only when allowed", () => {
    const p = buildPayload(contact, [], ctx, 0) as { contact: Record<string, unknown> };
    expect(p.contact).toEqual({ prmId: "PRM-00042" });
    const q = buildPayload(contact, ["firstName", "tags"], ctx, 0) as {
      contact: Record<string, unknown>;
    };
    expect(q.contact).toEqual({ prmId: "PRM-00042", firstName: "Anna", tags: ["kardio"] });
  });

  test("never a PESEL or custom fields, even when a destination lists them", () => {
    const p = buildPayload(contact, ["pesel", "customFields", "email"], ctx, 0) as {
      contact: Record<string, unknown>;
    };
    expect(p.contact).toEqual({ prmId: "PRM-00042", email: "anna@example.test" });
    expect(JSON.stringify(p)).not.toContain("00000000000");
    expect(JSON.stringify(p)).not.toContain("diagnoza");
  });

  test("says which automation, run and step sent it", () => {
    expect(buildPayload(contact, [], ctx, Date.UTC(2026, 9, 15))).toMatchObject({
      event: "automation.step",
      sentAt: "2026-10-15T00:00:00.000Z",
      automation: { id: "a1", name: "Kontrola" },
      run: "r1",
      step: "s1",
    });
  });
});
