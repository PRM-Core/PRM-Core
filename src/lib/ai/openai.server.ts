import process from "node:process";
import {
  AiProviderError,
  type AiCompleteInput,
  type AiCompletion,
  type AiProvider,
  type AiToolCall,
} from "./provider.server";
import { getCredential } from "@/lib/credentials/store.server";
import { t } from "@/lib/i18n";

// OpenAI adapter for the PRM_Agent — plain fetch against the Chat Completions
// API. Its job is to make the same `complete()` contract work on a second
// provider; the Anthropic adapter (anthropic.server.ts) is the default and the
// one built on an official SDK.

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | ChatContentPart[] | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

function toChatMessages(input: AiCompleteInput): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: input.system }];

  for (const message of input.messages) {
    // OpenAI models tool results as their own `tool` messages, one per call,
    // rather than as blocks inside a user turn like Claude does.
    for (const result of message.toolResults ?? []) {
      out.push({ role: "tool", tool_call_id: result.toolUseId, content: result.content });
    }

    const toolCalls = message.toolCalls ?? [];
    const images = message.images ?? [];
    if (message.text || toolCalls.length > 0 || images.length > 0) {
      // Z obrazami `content` musi być tablicą części; bez nich zostaje zwykłym
      // napisem — starszy kształt, którego nie ma powodu ruszać.
      const content =
        images.length > 0
          ? ([
              ...images.map((img) => ({
                type: "image_url" as const,
                image_url: { url: `data:${img.mimeType};base64,${img.dataBase64}` },
              })),
              ...(message.text ? [{ type: "text" as const, text: message.text }] : []),
            ] satisfies ChatContentPart[])
          : message.text || null;
      out.push({
        role: message.role,
        content,
        tool_calls:
          toolCalls.length > 0
            ? toolCalls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: { name: call.name, arguments: JSON.stringify(call.input) },
              }))
            : undefined,
      });
    }
  }

  return out;
}

export const openaiProvider: AiProvider = {
  id: "openai",
  // The Chat Completions endpoint this adapter uses has no web-search tool;
  // rather than guess a request shape, the agent is told it is unavailable.
  supportsWebSearch: false,

  async complete(input: AiCompleteInput): Promise<AiCompletion> {
    const apiKey = await getCredential("OPENAI_API_KEY");
    if (!apiKey) {
      throw new AiProviderError(
        t(
          "Brak klucza OpenAI — uzupełnij go w Integracje → Klucze i dane dostępowe. PRM_Agent nie może wykonać zapytania.",
        ),
        "openai",
      );
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        max_completion_tokens: input.maxTokens,
        messages: toChatMessages(input),
        tools: input.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        })),
      }),
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = await response.json();
        detail = body?.error?.message || detail;
      } catch {
        // response body wasn't JSON — fall back to statusText
      }
      throw new AiProviderError(
        t("OpenAI odrzuciło zapytanie: {detail}", { detail: detail }),
        "openai",
      );
    }

    const body = await response.json();
    const choice = body?.choices?.[0];
    const rawCalls = choice?.message?.tool_calls ?? [];

    const toolCalls: AiToolCall[] = rawCalls.map(
      (call: { id: string; function: { name: string; arguments: string } }) => {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(call.function.arguments || "{}");
        } catch {
          // malformed arguments — hand the agent an empty object rather than throwing
        }
        return { id: call.id, name: call.function.name, input: parsed };
      },
    );

    return {
      text: choice?.message?.content ?? "",
      toolCalls,
      wantsTools: choice?.finish_reason === "tool_calls",
      usage: {
        inputTokens: body?.usage?.prompt_tokens ?? 0,
        outputTokens: body?.usage?.completion_tokens ?? 0,
      },
    };
  },
};
