import {
  AiProviderError,
  type AiCompleteInput,
  type AiCompletion,
  type AiToolCall,
} from "./provider.server";
import type { AiProviderId } from "../db/schema";
import { t } from "@/lib/i18n";

/**
 * The Chat Completions wire format — shared by the OpenAI adapter and the
 * local adapter. Ollama, vLLM, LM Studio and llama.cpp all speak it, which is
 * what makes "bring your own model inside the perimeter" a configuration
 * choice rather than a new integration.
 */

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

export function toChatMessages(input: AiCompleteInput): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: input.system }];

  for (const message of input.messages) {
    // Tool results are their own `tool` messages, one per call, rather than
    // blocks inside a user turn like Claude does.
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

export interface ChatCompletionsTarget {
  /** Full endpoint URL, e.g. `https://api.openai.com/v1/chat/completions`. */
  url: string;
  /** Bearer token; omitted when the endpoint needs none (a local server). */
  apiKey?: string;
  providerId: AiProviderId;
  /** Shown in error messages — "OpenAI", or the local endpoint's host. */
  label: string;
  timeoutMs?: number;
}

/** One request to a Chat Completions endpoint, mapped onto the `complete()` contract. */
export async function chatCompletions(
  target: ChatCompletionsTarget,
  input: AiCompleteInput,
): Promise<AiCompletion> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (target.apiKey) headers.Authorization = `Bearer ${target.apiKey}`;

  let response: Response;
  try {
    response = await fetch(target.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: input.model,
        // Both names: `max_tokens` is what Ollama, llama.cpp and LM Studio
        // read; `max_completion_tokens` is the newer name vLLM also takes.
        // A server that ignores the cap lets a small model run on for
        // minutes and blocks every call queued behind it.
        max_tokens: input.maxTokens,
        max_completion_tokens: input.maxTokens,
        messages: toChatMessages(input),
        tools:
          input.tools.length > 0
            ? input.tools.map((tool) => ({
                type: "function",
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.inputSchema,
                },
              }))
            : undefined,
      }),
      signal: AbortSignal.timeout(target.timeoutMs ?? 120_000),
    });
  } catch (err) {
    throw new AiProviderError(
      t("Brak połączenia z {label}: {detail}", {
        label: target.label,
        detail: err instanceof Error ? err.message : String(err),
      }),
      target.providerId,
    );
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body?.error?.message || body?.error || detail;
    } catch {
      // response body wasn't JSON — fall back to statusText
    }
    throw new AiProviderError(
      t("{label} odrzucił zapytanie: {detail}", { label: target.label, detail: String(detail) }),
      target.providerId,
    );
  }

  // A server under memory pressure can drop the connection mid-answer or
  // send nothing at all: that is the model being unavailable, and callers
  // fall back on their rules for an AiProviderError, not for a SyntaxError.
  let body: {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: { id: string; function: { name: string; arguments: string } }[];
      };
      finish_reason?: string;
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    body = await response.json();
  } catch (err) {
    throw new AiProviderError(
      t("{label} zwrócił niepełną odpowiedź: {detail}", {
        label: target.label,
        detail: err instanceof Error ? err.message : String(err),
      }),
      target.providerId,
    );
  }
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
    wantsTools: choice?.finish_reason === "tool_calls" || toolCalls.length > 0,
    usage: {
      inputTokens: body?.usage?.prompt_tokens ?? 0,
      outputTokens: body?.usage?.completion_tokens ?? 0,
    },
  };
}
