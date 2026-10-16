import { describe, expect, test } from "bun:test";
import {
  announcedButNotCalled,
  answerName,
  flattenForPrompt,
  jsonObjects,
  parseToolReply,
  replySchema,
  stripControlTokens,
  tidyProse,
} from "./prompt-tools";
import type { AiToolDef } from "./provider.server";

const tools: AiToolDef[] = [
  {
    name: "count_contacts",
    description: "Policz kontakty.",
    inputSchema: { type: "object", properties: { segment: { type: "string" } } },
  },
  {
    name: "list_automations",
    description: "Lista automatyzacji.",
    inputSchema: { type: "object", properties: {} },
  },
];

describe("parseToolReply", () => {
  test("a call for a tool the model has", () => {
    const out = parseToolReply('{"tool": "count_contacts", "input": {"segment": "VIP"}}', tools);
    expect(out.text).toBe("");
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0].name).toBe("count_contacts");
    expect(out.toolCalls[0].input).toEqual({ segment: "VIP" });
  });

  test("the final answer is its text, not JSON", () => {
    const out = parseToolReply('{"tool": "answer", "text": "W segmencie są 2 osoby."}', tools);
    expect(out).toEqual({ text: "W segmencie są 2 osoby.", toolCalls: [] });
  });

  test("an example object before the real call does not hide the call", () => {
    const reply =
      'Wynik będzie wyglądał tak: {"segmenty": ["A"]}\n\n{"tool": "count_contacts", "input": {}}';
    expect(parseToolReply(reply, tools).toolCalls[0]?.name).toBe("count_contacts");
  });

  test("the {name, arguments} shape, arguments as a JSON string", () => {
    const out = parseToolReply(
      '{"name": "count_contacts", "arguments": "{\\"segment\\": "}',
      tools,
    );
    // Arguments that do not parse are no call.
    expect(out.toolCalls).toHaveLength(0);
    const ok = parseToolReply(
      '{"name": "count_contacts", "arguments": "{\\"segment\\": \\"VIP\\"}"}',
      tools,
    );
    expect(ok.toolCalls[0].input).toEqual({ segment: "VIP" });
  });

  test("a tool it does not have is plain text", () => {
    const reply = '{"tool": "delete_everything", "input": {}}';
    expect(parseToolReply(reply, tools)).toEqual({ text: reply, toolCalls: [] });
  });

  test("prose stays prose", () => {
    expect(parseToolReply("Mamy 5 automatyzacji.", tools)).toEqual({
      text: "Mamy 5 automatyzacji.",
      toolCalls: [],
    });
  });

  test("an answer cut off by the token limit shows its text", () => {
    const out = parseToolReply('{"tool": "answer", "text": "Pierwsze zdanie.\\nDrugie zd', tools);
    expect(out.text).toBe("Pierwsze zdanie.\nDrugie zd");
  });
});

describe("jsonObjects", () => {
  test("braces inside strings do not end an object", () => {
    expect(jsonObjects('a {"x": "}{"} b {"y": 1}')).toEqual(['{"x": "}{"}', '{"y": 1}']);
  });
  test("an object that never closes is not returned", () => {
    expect(jsonObjects('{"tool": "count_contacts", "input": {')).toEqual([]);
  });
});

describe("replySchema", () => {
  test("one branch per tool and one for the answer", () => {
    const schema = replySchema(tools) as { anyOf: { properties: { tool: { const: string } } }[] };
    expect(schema.anyOf.map((b) => b.properties.tool.const)).toEqual([
      "count_contacts",
      "list_automations",
      "answer",
    ]);
  });
  test("a caller that needs the call gets no answer branch", () => {
    const schema = replySchema(tools, true) as { anyOf: unknown[] };
    expect(schema.anyOf).toHaveLength(2);
  });
  test("a real tool named answer moves the final answer aside", () => {
    expect(answerName([{ ...tools[0], name: "answer" }])).toBe("final_answer");
  });
});

describe("flattenForPrompt", () => {
  test("calls become the JSON the model writes, results a user turn naming the tool", () => {
    const flat = flattenForPrompt({
      model: "m",
      system: "System.",
      tools,
      maxTokens: 100,
      messages: [
        { role: "user", text: "Ilu w VIP?" },
        {
          role: "assistant",
          text: "Sprawdzam.",
          toolCalls: [{ id: "c1", name: "count_contacts", input: { segment: "VIP" } }],
        },
        { role: "user", toolResults: [{ toolUseId: "c1", content: '{"pasujące":2}' }] },
      ],
    });
    expect(flat.tools).toEqual([]);
    expect(flat.system).toContain("System.");
    expect(flat.system).toContain("count_contacts");
    expect(flat.messages[1]).toEqual({
      role: "assistant",
      text: '{"tool":"count_contacts","input":{"segment":"VIP"}}',
    });
    expect(flat.messages[2].role).toBe("user");
    expect(flat.messages[2].text).toContain("count_contacts");
    expect(flat.messages[2].text).toContain('{"pasujące":2}');
  });
});

describe("text clean-up", () => {
  test("template control tokens never reach the reader", () => {
    expect(stripControlTokens('{"tool": "answer"}<|im_sep|>')).toBe('{"tool": "answer"}');
  });
  test("stray backslashes and carriage returns at line ends", () => {
    expect(tidyProse("Dzień dobry,\\\r\n\r\nZapraszamy.")).toBe("Dzień dobry,\n\nZapraszamy.");
  });
  test("a call announced and not written", () => {
    expect(announcedButNotCalled("Użyję count_contacts, oto odpowiedź:", tools)).toBe(true);
    expect(announcedButNotCalled("Sprawdziłem count_contacts: są 2 osoby.", tools)).toBe(false);
    expect(announcedButNotCalled("Oto odpowiedź:", tools)).toBe(false);
  });
});
