import {
  AiProviderError,
  type AiCompleteInput,
  type AiCompletion,
  type AiProvider,
} from "./provider.server";
import { chatCompletions } from "./openai-compatible.server";
import { getCredential } from "@/lib/credentials/store.server";
import { t } from "@/lib/i18n";

// OpenAI adapter for the PRM_Agent — the Chat Completions API. The wire
// format lives in openai-compatible.server.ts, shared with the local adapter;
// this file only adds the key and the address.

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
    return chatCompletions(
      {
        url: "https://api.openai.com/v1/chat/completions",
        apiKey,
        providerId: "openai",
        label: "OpenAI",
      },
      input,
    );
  },
};
