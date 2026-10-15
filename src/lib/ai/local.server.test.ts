/**
 * The local adapter — no network: `fetch` is replaced. What is tested is the
 * refusal (a public host never gets a request) and the wire format.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { localProvider } from "./local.server";
import { AiProviderError } from "./provider.server";

const realFetch = globalThis.fetch;
let calls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  calls = [];
  delete process.env.PRM_AI_EGRESS_ALLOW;
  delete process.env.PRM_AI_LOCAL_KEY;
  process.env.PRM_AI_LOCAL_URL = "http://localhost:11434/v1/";
  process.env.PRM_AI_LOCAL_MODEL = "test-model";
  globalThis.fetch = (async (url: string | URL, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return Response.json({
      choices: [{ message: { content: "Dzień dobry {{firstName}}" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const input = {
  model: "",
  system: "Jesteś asystentem.",
  messages: [{ role: "user" as const, text: "Napisz przypomnienie." }],
  tools: [],
  maxTokens: 100,
};

describe("localProvider", () => {
  test("calls the local endpoint, without a bearer token when none is set", async () => {
    const out = await localProvider.complete(input);
    expect(out.text).toBe("Dzień dobry {{firstName}}");
    expect(out.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(calls[0].url).toBe("http://localhost:11434/v1/chat/completions");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model).toBe("test-model");
    expect(body.tools).toBeUndefined();
    // The cap under both names — local servers read `max_tokens`.
    expect(body.max_tokens).toBe(100);
    expect(body.max_completion_tokens).toBe(100);
  });

  test("refuses a public host even when the mode says local", async () => {
    process.env.PRM_AI_LOCAL_URL = "https://api.openai.com/v1";
    await expect(localProvider.complete(input)).rejects.toBeInstanceOf(AiProviderError);
    await expect(localProvider.complete(input)).rejects.toThrow(/poza siecią placówki/);
    expect(calls).toHaveLength(0);
  });

  test("a listed host is allowed", async () => {
    process.env.PRM_AI_LOCAL_URL = "https://gpu.clinic.example/v1";
    process.env.PRM_AI_EGRESS_ALLOW = "gpu.clinic.example";
    process.env.PRM_AI_LOCAL_KEY = "local-secret";
    await localProvider.complete(input);
    expect(calls[0].url).toBe("https://gpu.clinic.example/v1/chat/completions");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      "Bearer local-secret",
    );
  });

  test("an empty or cut-off answer is the model being unavailable, not a crash", async () => {
    globalThis.fetch = (async () => new Response("", { status: 200 })) as unknown as typeof fetch;
    await expect(localProvider.complete(input)).rejects.toBeInstanceOf(AiProviderError);
    globalThis.fetch = (async () =>
      new Response('{"choices":[{"mess', { status: 200 })) as unknown as typeof fetch;
    await expect(localProvider.complete(input)).rejects.toThrow(/niepełną odpowiedź/);
  });

  test("without an endpoint the error says what to set", async () => {
    delete process.env.PRM_AI_LOCAL_URL;
    await expect(localProvider.complete(input)).rejects.toThrow(/PRM_AI_LOCAL_URL/);
    expect(calls).toHaveLength(0);
  });
});
