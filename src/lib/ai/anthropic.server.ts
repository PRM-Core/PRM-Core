import process from "node:process";
import Anthropic from "@anthropic-ai/sdk";
import {
  AiProviderError,
  findModel,
  type AiCompleteInput,
  type AiCompletion,
  type AiMessage,
  type AiProvider,
  type AiToolCall,
} from "./provider.server";
import { getCredential } from "@/lib/credentials/store.server";
import { t } from "@/lib/i18n";

// Default provider for the PRM_Agent, on the official Anthropic SDK.
// Server-only: the API key is read per call (never at module scope) and never
// leaves this file.

async function client(): Promise<Anthropic> {
  const apiKey = await getCredential("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new AiProviderError(
      t(
        "Brak klucza Anthropic — uzupełnij go w Integracje → Klucze i dane dostępowe. PRM_Agent nie może wykonać zapytania.",
      ),
      "anthropic",
    );
  }
  return new Anthropic({ apiKey });
}

function toApiMessages(messages: AiMessage[]): Anthropic.MessageParam[] {
  return messages.map((message) => {
    // Echo the model's own blocks back untouched where we have them: Claude
    // rejects edited thinking blocks, and a paused server-tool turn resumes
    // from its own server_tool_use blocks.
    if (message.raw) {
      return { role: message.role, content: message.raw as Anthropic.ContentBlockParam[] };
    }

    const content: Anthropic.ContentBlockParam[] = [];

    // Tool results have to lead the user turn — the API rejects a tool_result
    // that follows text within the same message.
    for (const result of message.toolResults ?? []) {
      content.push({
        type: "tool_result",
        tool_use_id: result.toolUseId,
        content: result.content,
        is_error: result.isError,
      });
    }
    // Obrazy przed tekstem — tak zaleca dokumentacja: najpierw to, na co model
    // ma patrzeć, potem polecenie.
    for (const image of message.images ?? []) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: image.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: image.dataBase64,
        },
      });
    }
    if (message.text) content.push({ type: "text", text: message.text });
    for (const call of message.toolCalls ?? []) {
      content.push({ type: "tool_use", id: call.id, name: call.name, input: call.input });
    }

    return { role: message.role, content };
  });
}

export const anthropicProvider: AiProvider = {
  id: "anthropic",
  supportsWebSearch: true,

  async complete(input: AiCompleteInput): Promise<AiCompletion> {
    const anthropic = await client();

    // Server-side tool: Anthropic runs the search and feeds results back into
    // the same turn, so there is nothing for us to execute or return.
    const tools: Anthropic.ToolUnion[] = input.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    }));
    if (input.webSearch) {
      tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 5 });
    }

    let response: Anthropic.Message;
    try {
      // Przy dużym limicie wyjścia (studio kreacji: 32 tys. tokenów na
      // architekturę wzorcową) SDK wymaga strumieniowania — zwykłe wywołanie
      // odrzuca z góry jako potencjalnie dłuższe niż 10 minut. `.stream()`
      // z `finalMessage()` oddaje ten sam obiekt co `.create()`, więc reszta
      // funkcji nie widzi różnicy.
      const request = {
        model: input.model,
        max_tokens: input.maxTokens,
        // The agent is weighing a contact's history against several possible
        // paths — exactly the kind of judgement adaptive thinking is for. Not
        // every model takes it, though, and sending it where it is unsupported
        // is a hard 400 that kills the whole call, so it is opt-in per model.
        ...(findModel("anthropic", input.model)?.supportsThinking
          ? { thinking: { type: "adaptive" as const } }
          : {}),
        system: input.system,
        messages: toApiMessages(input.messages),
        tools,
      };
      response =
        input.maxTokens > 8192
          ? await anthropic.messages.stream(request).finalMessage()
          : await anthropic.messages.create(request);
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new AiProviderError(
          t("Claude API odrzuciło zapytanie: {message}", { message: err.message }),
          "anthropic",
        );
      }
      throw new AiProviderError(
        t("Błąd połączenia z Claude API: {v0}", { v0: String(err) }),
        "anthropic",
      );
    }

    // Safety classifiers can decline a request with a normal 200 — reading
    // content[0] before checking this would blow up on an empty array.
    if (response.stop_reason === "refusal") {
      throw new AiProviderError(
        t("Claude odmówił wykonania zapytania ze względów bezpieczeństwa."),
        "anthropic",
      );
    }

    const toolCalls: AiToolCall[] = [];
    let text = "";
    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }

    return {
      text,
      toolCalls,
      wantsTools: response.stop_reason === "tool_use",
      paused: response.stop_reason === "pause_turn",
      raw: response.content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  },
};
