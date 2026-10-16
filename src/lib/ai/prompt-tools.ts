import type { AiCompleteInput, AiMessage, AiToolCall, AiToolDef } from "./provider.server";
import { t } from "@/lib/i18n";

/**
 * Tools for a model that has none.
 *
 * Every feature that once ran on a hosted model asks for tools: the
 * automation and segment builders, the Copilot, the supervisor, the agent
 * node in automations. Many open models served locally — Bielik on Ollama
 * among them — answer text only, and the server refuses a request that
 * carries tools. Here the tools travel in the prompt instead: their names,
 * descriptions and parameters are described in the system text, and every
 * reply is one JSON object — a call, `{"tool": "<name>", "input": {…}}`, or
 * the final answer, `{"tool": "answer", "text": "…"}`. Where the server can
 * hold the model to a JSON schema (Ollama, vLLM, llama.cpp), `replySchema`
 * makes any other reply impossible; where it cannot, `parseToolReply` reads
 * the call out of free text. The features above see no difference.
 *
 * Pure: no network, no database — tested on paper.
 */

/** The final answer's "tool" — unless a feature has a real tool of that name. */
export function answerName(tools: AiToolDef[]): string {
  return tools.some((tool) => tool.name === "answer") ? "final_answer" : "answer";
}

/** The system text that tells the model which tools it has and how to call one. */
export function toolsPreamble(tools: AiToolDef[], requireTool = false): string {
  const answer = answerName(tools);
  const list = tools
    .map(
      (tool) =>
        `- ${tool.name}: ${tool.description}\n  ${t("Parametry (JSON Schema)")}: ${JSON.stringify(tool.inputSchema)}`,
    )
    .join("\n");
  return [
    "",
    "",
    t("## Narzędzia"),
    list,
    "",
    t("Każda Twoja odpowiedź to dokładnie jeden obiekt JSON, bez tekstu przed ani po nim."),
    t("Wywołanie narzędzia (input musi pasować do jego parametrów):"),
    '{"tool": "<nazwa>", "input": { … }}',
    ...(requireTool
      ? [t("Odpowiadasz wyłącznie wywołaniem narzędzia — zwykły tekst nie zostanie odczytany.")]
      : [t("Odpowiedź końcowa dla użytkownika:"), `{"tool": "${answer}", "text": "…"}`]),
    t(
      "Jedno narzędzie naraz. Liczb, nazw ani danych nie zgadujesz — najpierw narzędzie, potem odpowiedź na podstawie jego wyniku. Nie wymyślasz identyfikatorów, adresów ani linków, których nie ma w wynikach.",
    ),
  ].join("\n");
}

/**
 * The JSON schema a reply must match: one branch per tool, with that tool's
 * own parameters, and one for the final answer. Sent as `response_format`, it
 * holds the model to a valid call or an answer — no prose around a call, no
 * tool result made up instead of asked for.
 */
export function replySchema(tools: AiToolDef[], requireTool = false): Record<string, unknown> {
  const calls = tools.map((tool) => ({
    type: "object",
    properties: { tool: { const: tool.name }, input: tool.inputSchema },
    required: ["tool", "input"],
    additionalProperties: false,
  }));
  if (requireTool) return { anyOf: calls };
  return {
    anyOf: [
      ...calls,
      {
        type: "object",
        properties: { tool: { const: answerName(tools) }, text: { type: "string" } },
        required: ["tool", "text"],
        additionalProperties: false,
      },
    ],
  };
}

/**
 * The conversation as a text-only model can take it: an earlier tool call is
 * the JSON it was asked to write, a tool result is a user message that says
 * which tool answered and what.
 */
export function flattenForPrompt(input: AiCompleteInput): AiCompleteInput {
  const names = new Map<string, string>();
  const messages: AiMessage[] = [];
  for (const message of input.messages) {
    const results = message.toolResults ?? [];
    if (results.length > 0) {
      const text = results
        .map((r) =>
          t("Wynik narzędzia {name}:\n{content}", {
            name: names.get(r.toolUseId) ?? r.toolUseId,
            content: r.content,
          }),
        )
        .join("\n\n");
      messages.push({ role: "user", text: [text, message.text].filter(Boolean).join("\n\n") });
      continue;
    }
    const calls = message.toolCalls ?? [];
    for (const call of calls) names.set(call.id, call.name);
    if (calls.length > 0) {
      // The JSON alone, as the model was told to write it: prose kept beside
      // it would teach the model that prose around a call is fine.
      const json = calls.map((c) => JSON.stringify({ tool: c.name, input: c.input })).join("\n");
      messages.push({ role: message.role, text: json });
      continue;
    }
    messages.push({ role: message.role, text: message.text ?? "" });
  }
  return {
    ...input,
    system: input.system + toolsPreamble(input.tools, input.requireTool),
    messages,
    tools: [],
  };
}

/** Every balanced top-level {...} in a text, in order. Strings are respected, so a brace inside one does not end the object. */
export function jsonObjects(text: string): string[] {
  const found: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"' && depth > 0) inString = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0) found.push(text.slice(start, i + 1));
    }
  }
  return found;
}

/** The first balanced {...} in a text, or null. */
export function firstJsonObject(text: string): string | null {
  return jsonObjects(text)[0] ?? null;
}

let counter = 0;

/**
 * A text model's reply read back: a tool call when it wrote one for a tool it
 * has (as {"tool","input"}, or the common {"name","arguments"} shape), the
 * answer's text when it wrote {"tool":"answer","text"}, otherwise the reply as
 * plain text. A tool it does not have is plain text, not a call. The first
 * call in the text wins — a model that writes an example object before the
 * real call still gets its call made.
 */
export function parseToolReply(
  text: string,
  tools: AiToolDef[],
): { text: string; toolCalls: AiToolCall[] } {
  const answer = answerName(tools);
  for (const json of jsonObjects(text)) {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(json) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!o || typeof o !== "object" || Array.isArray(o)) continue;
    const name = o.tool ?? o.name ?? o.tool_name;
    if (name === answer && typeof o.text === "string") return { text: o.text, toolCalls: [] };
    if (typeof name !== "string" || !tools.some((tool) => tool.name === name)) continue;
    let args = o.input ?? o.arguments ?? o.parameters ?? {};
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch {
        continue;
      }
    }
    if (!args || typeof args !== "object" || Array.isArray(args)) continue;
    counter += 1;
    return {
      text: "",
      toolCalls: [
        {
          id: `prompt-tool-${Date.now()}-${counter}`,
          name,
          input: args as Record<string, unknown>,
        },
      ],
    };
  }
  return { text: salvageAnswer(text, answer) ?? text, toolCalls: [] };
}

/**
 * An answer cut off by the token limit is JSON that never closes. Its text is
 * still worth showing — without the `{"tool": "answer", "text": "` in front.
 */
function salvageAnswer(text: string, answer: string): string | null {
  const head = new RegExp(`^\\s*\\{\\s*"tool"\\s*:\\s*"${answer}"\\s*,\\s*"text"\\s*:\\s*"`);
  const m = head.exec(text);
  if (!m) return null;
  let body = text.slice(m[0].length).replace(/"\s*\}?\s*$/, "");
  // A cut can split an escape: drop a lone trailing backslash.
  if (/(^|[^\\])(\\\\)*\\$/.test(body)) body = body.slice(0, -1);
  try {
    return JSON.parse(`"${body}"`) as string;
  } catch {
    return body;
  }
}

/**
 * Control tokens a chat template leaks into the text (`<|im_sep|>`,
 * `<|im_end|>`, `<|eot_id|>`) — never meant for the reader.
 */
export function stripControlTokens(text: string): string {
  return text.replace(/<\|[a-z_]+\|>/gi, "").trim();
}

/**
 * Prose as a reader should get it: a small model sometimes ends lines with a
 * stray backslash or a carriage return copied from its training data. Only
 * for plain text — in JSON or code a backslash means something.
 */
export function tidyProse(text: string): string {
  return text.replace(/\r/g, "").replace(/[ \t]*\\+$/gm, "");
}

/**
 * A reply that announces a tool and stops before the call: it names one of
 * the tools and ends on a colon, or opens a JSON object it never closes.
 * Small models do this now and then without a schema; one reminder is enough.
 */
export function announcedButNotCalled(text: string, tools: AiToolDef[]): boolean {
  if (!tools.some((tool) => text.includes(tool.name))) return false;
  const trimmed = text.trim();
  return trimmed.endsWith(":") || (trimmed.includes("{") && jsonObjects(trimmed).length === 0);
}

/** The reminder sent after such a reply. */
export function callNowReminder(): string {
  return t(
    "Nie podałeś wywołania. Odpowiedz teraz jednym obiektem JSON: wywołaniem narzędzia albo odpowiedzią końcową.",
  );
}
