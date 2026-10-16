/**
 * The local adapter — no network: `fetch` is replaced. What is tested is the
 * refusal (a public host never gets a request) and the wire format.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { localProvider, resetToolsCache } from "./local.server";
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

// ── tools and images for models without them ─────────────────────────────

type Reply = { status?: number; error?: string; content?: string };

/** A server that answers from a script, one reply per request. */
function scripted(replies: Reply[]) {
  globalThis.fetch = (async (url: string | URL, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = replies.shift();
    if (!r) throw new Error("unexpected request");
    if (r.error) return Response.json({ error: { message: r.error } }, { status: r.status ?? 400 });
    return Response.json({
      choices: [{ message: { content: r.content ?? "" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
  }) as typeof fetch;
}

const body = (i: number) => JSON.parse(String(calls[i].init.body));

const withTools = {
  ...input,
  messages: [{ role: "user" as const, text: "Ilu pacjentów w segmencie VIP?" }],
  tools: [
    {
      name: "count_contacts",
      description: "Policz kontakty.",
      inputSchema: { type: "object", properties: { segment: { type: "string" } } },
    },
  ],
};

describe("localProvider — tools in the prompt", () => {
  beforeEach(() => {
    resetToolsCache();
    delete process.env.PRM_AI_LOCAL_TOOLS;
  });

  test("a model that refuses tools gets them in the prompt, its reply held to a schema", async () => {
    scripted([
      { error: "registry.ollama.ai/test-model does not support tools" },
      { content: '{"tool": "count_contacts", "input": {"segment": "VIP"}}' },
    ]);
    const out = await localProvider.complete(withTools);
    expect(out.toolCalls.map((c) => [c.name, c.input])).toEqual([
      ["count_contacts", { segment: "VIP" }],
    ]);
    expect(out.wantsTools).toBe(true);
    expect(body(0).tools).toHaveLength(1);
    const second = body(1);
    expect(second.tools).toBeUndefined();
    expect(second.messages[0].content).toContain("count_contacts");
    expect(second.response_format.type).toBe("json_schema");

    // Remembered: the next request goes straight to the prompt.
    calls = [];
    scripted([{ content: '{"tool": "answer", "text": "Dwóch."}' }]);
    const next = await localProvider.complete(withTools);
    expect(calls).toHaveLength(1);
    expect(next.text).toBe("Dwóch.");
    expect(next.toolCalls).toEqual([]);
  });

  test("a server without schemas gets free text, and a forgotten call one reminder", async () => {
    process.env.PRM_AI_LOCAL_TOOLS = "prompt";
    scripted([
      { error: "response_format json_schema is not supported" },
      { content: "Użyję count_contacts, oto odpowiedź:" },
      { content: '{"tool": "count_contacts", "input": {}}<|im_end|>' },
    ]);
    const out = await localProvider.complete(withTools);
    expect(out.toolCalls[0]?.name).toBe("count_contacts");
    expect(body(1).response_format).toBeUndefined();
    const reminder = body(2).messages.at(-1);
    expect(reminder.role).toBe("user");
    expect(out.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
  });

  test("a caller that needs the call: tool_choice natively, no answer branch in the prompt", async () => {
    scripted([{ content: "Bez narzędzia." }]);
    await localProvider.complete({ ...withTools, requireTool: true });
    expect(body(0).tool_choice).toBe("required");

    calls = [];
    process.env.PRM_AI_LOCAL_TOOLS = "prompt";
    scripted([{ content: '{"tool": "count_contacts", "input": {}}' }]);
    await localProvider.complete({ ...withTools, requireTool: true });
    const branches = body(0).response_format.json_schema.schema.anyOf;
    expect(branches).toHaveLength(1);
  });

  test("native tools stay native when the model has them", async () => {
    process.env.PRM_AI_LOCAL_TOOLS = "native";
    scripted([{ error: "test-model does not support tools" }]);
    await expect(localProvider.complete(withTools)).rejects.toThrow(/does not support tools/);
    expect(calls).toHaveLength(1);
  });
});

describe("localProvider — images and schemas", () => {
  beforeEach(() => resetToolsCache());

  test("a text-only model gets the request without images, and the caller is told", async () => {
    scripted([
      { error: "Multimodal data provided, but model does not support multimodal requests." },
      { content: "Opis." },
    ]);
    const out = await localProvider.complete({
      ...input,
      messages: [
        {
          role: "user",
          text: "Zakoduj.",
          images: [{ mimeType: "image/png", dataBase64: "AAAA" }],
        },
      ],
    });
    expect(out.imagesDropped).toBe(true);
    expect(out.text).toBe("Opis.");
    expect(JSON.stringify(body(1).messages)).not.toContain("image_url");
  });

  test("a reply schema without tools travels as response_format", async () => {
    scripted([{ content: '{"blocks": []}' }]);
    await localProvider.complete({ ...input, responseSchema: { type: "object" } });
    expect(body(0).response_format.json_schema.schema).toEqual({ type: "object" });
  });

  test("plain text loses template debris; JSON is left alone", async () => {
    scripted([{ content: "Dzień dobry,\\\r\n<|im_end|>" }]);
    expect((await localProvider.complete(input)).text).toBe("Dzień dobry,");
  });
});
