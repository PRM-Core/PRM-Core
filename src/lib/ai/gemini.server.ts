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

// Google Gemini adapter for the PRM_Agent — plain fetch against the
// generateContent endpoint. Third of the three swappable providers; see
// provider.server.ts for the shared contract.

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

function toContents(input: AiCompleteInput): Array<{ role: string; parts: GeminiPart[] }> {
  const contents: Array<{ role: string; parts: GeminiPart[] }> = [];

  for (const message of input.messages) {
    const parts: GeminiPart[] = [];

    // Gemini matches a functionResponse to its call by NAME, not by id — so the
    // tool name has to be carried through, unlike Claude/OpenAI which use ids.
    for (const result of message.toolResults ?? []) {
      parts.push({
        functionResponse: {
          name: result.toolUseId.split(":")[0],
          response: { result: result.content },
        },
      });
    }
    for (const image of message.images ?? []) {
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.dataBase64 } });
    }
    if (message.text) parts.push({ text: message.text });
    for (const call of message.toolCalls ?? []) {
      parts.push({ functionCall: { name: call.name, args: call.input } });
    }

    if (parts.length > 0) {
      contents.push({ role: message.role === "assistant" ? "model" : "user", parts });
    }
  }

  return contents;
}

export const geminiProvider: AiProvider = {
  id: "google",
  // Gemini has a native search tool, but combining it with functionDeclarations
  // in one request is not something this adapter verifies — left off until it is.
  supportsWebSearch: false,

  async complete(input: AiCompleteInput): Promise<AiCompletion> {
    const apiKey = await getCredential("GOOGLE_API_KEY");
    if (!apiKey) {
      throw new AiProviderError(
        t(
          "Brak klucza Google — uzupełnij go w Integracje → Klucze i dane dostępowe. PRM_Agent nie może wykonać zapytania.",
        ),
        "google",
      );
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: toContents(input),
        tools: [
          {
            functionDeclarations: input.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema,
            })),
          },
        ],
        generationConfig: { maxOutputTokens: input.maxTokens },
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
        t("Gemini odrzucił zapytanie: {detail}", { detail: detail }),
        "google",
      );
    }

    const body = await response.json();
    const parts: GeminiPart[] = body?.candidates?.[0]?.content?.parts ?? [];

    const toolCalls: AiToolCall[] = [];
    let text = "";
    for (const part of parts) {
      if (part.text) text += part.text;
      if (part.functionCall) {
        toolCalls.push({
          // Gemini assigns no call id; the name doubles as one so tool results
          // can be routed back (see the split in toContents above).
          id: `${part.functionCall.name}:${toolCalls.length}`,
          name: part.functionCall.name,
          input: part.functionCall.args ?? {},
        });
      }
    }

    return {
      text,
      toolCalls,
      wantsTools: toolCalls.length > 0,
      usage: {
        inputTokens: body?.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: body?.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  },
};
