/**
 * The boundary as every prompt builder meets it: the provider returned by
 * `getAiConfig()` follows PRM_AI_MODE and redacts the request. Own temp
 * database, `fetch` replaced, no network.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-ai-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { getAiConfig, getKeyStatus, redactRequest } = await import("./settings.server");
const { AiProviderError } = await import("./provider.server");

const realFetch = globalThis.fetch;
let sent: string[] = [];

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
});
beforeEach(() => {
  process.env.DATABASE_URL = dbUrl;
  sent = [];
  for (const k of [
    "PRM_AI_MODE",
    "PRM_AI_LOCAL_URL",
    "PRM_AI_LOCAL_MODEL",
    "PRM_AI_EGRESS_ALLOW",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
  ])
    delete process.env[k];
  globalThis.fetch = (async (_url: string | URL, init: RequestInit) => {
    sent.push(String(init.body));
    return Response.json({
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const request = {
  model: "",
  system: "Pacjent Anna Kowalska, anna@example.invalid, +48 600 100 200.",
  messages: [
    { role: "user" as const, text: "Co z Kowalską? PESEL 90010112345." },
    { role: "assistant" as const, text: "Odpowiadam o {{firstName}}." },
    {
      role: "user" as const,
      toolResults: [{ toolUseId: "t1", content: '{"email":"anna@example.invalid"}' }],
    },
  ],
  tools: [],
  maxTokens: 50,
  identifiers: { firstNames: ["Anna"], lastNames: ["Kowalska"] },
};

describe("PRM_AI_MODE", () => {
  test("unset → off: the provider explains instead of calling anyone", async () => {
    const config = await getAiConfig();
    expect(config.mode).toBe("off");
    await expect(config.provider.complete(request)).rejects.toBeInstanceOf(AiProviderError);
    await expect(config.provider.complete(request)).rejects.toThrow(/PRM_AI_MODE=off/);
    expect(sent).toHaveLength(0);
    // Nothing is "missing": the key status must not send the user to look for a key.
    expect((await getKeyStatus())[config.providerId]).toBe(true);
  });

  test("local: the local adapter, model from .env, request redacted", async () => {
    process.env.PRM_AI_LOCAL_URL = "http://127.0.0.1:11434/v1";
    process.env.PRM_AI_LOCAL_MODEL = "bielik";
    const config = await getAiConfig();
    expect(config.mode).toBe("local");
    expect(config.providerId).toBe("local");
    expect(config.model).toBe("bielik");
    expect((await getKeyStatus()).local).toBe(true);
    await config.provider.complete(request);
    const body = sent[0];
    for (const secret of ["Anna", "Kowalsk", "anna@example.invalid", "600 100 200", "90010112345"])
      expect(body).not.toContain(secret);
    expect(body).toContain("{{firstName}} {{lastName}}");
    expect(body).toContain("{{nationalId}}");
    expect(body).toContain('{\\"email\\":\\"{{email}}\\"}');
  });

  test("hosted needs the word: a key alone does not open the door", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect((await getAiConfig()).mode).toBe("off");
    process.env.PRM_AI_MODE = "hosted";
    const config = await getAiConfig();
    expect(config.mode).toBe("hosted");
    expect(config.providerId).toBe("anthropic");
  });
});

describe("redactRequest", () => {
  test("the model's own turns are left intact", () => {
    const out = redactRequest(request);
    expect(out.messages[1].text).toBe("Odpowiadam o {{firstName}}.");
    expect(out.messages[0].text).toBe("Co z {{lastName}}? PESEL {{nationalId}}.");
    expect(out.system).toBe("Pacjent {{firstName}} {{lastName}}, {{email}}, {{phone}}.");
  });
});
