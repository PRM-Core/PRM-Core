import {
  AiProviderError,
  type AiCompleteInput,
  type AiCompletion,
  type AiProvider,
} from "./provider.server";
import { chatCompletions } from "./openai-compatible.server";
import { localEndpoint } from "./boundary.server";
import { hostClass } from "./boundary";
import { t } from "@/lib/i18n";

/**
 * The local adapter — a model inside the clinic's perimeter.
 *
 * Any server that speaks the Chat Completions protocol works: Ollama, vLLM,
 * LM Studio, llama.cpp. The one thing this adapter adds is the refusal: the
 * endpoint's host must be a loopback, a private address or an allowlisted
 * name, checked on every call. A misconfigured URL fails loudly instead of
 * quietly sending a prompt across the internet.
 */
export const localProvider: AiProvider = {
  id: "local",
  supportsWebSearch: false,

  async complete(input: AiCompleteInput): Promise<AiCompletion> {
    const endpoint = localEndpoint();
    if (!endpoint.url || !endpoint.model) {
      throw new AiProviderError(
        t(
          "Brak lokalnego modelu — ustaw PRM_AI_LOCAL_URL (adres serwera modelu) i PRM_AI_LOCAL_MODEL (nazwa modelu) w .env.",
        ),
        "local",
      );
    }
    if (endpoint.hostClass === "public") {
      throw new AiProviderError(
        t(
          "Odmowa: {host} jest poza siecią placówki. W trybie local model musi działać lokalnie albo pod adresem z PRM_AI_EGRESS_ALLOW.",
          { host: endpoint.host },
        ),
        "local",
      );
    }
    return chatCompletions(
      {
        url: `${endpoint.url}/chat/completions`,
        apiKey: endpoint.apiKey,
        providerId: "local",
        label: endpoint.host,
        // A model on a CPU-only server takes its time; a short timeout would
        // turn every draft into an error.
        timeoutMs: 300_000,
      },
      { ...input, model: input.model || endpoint.model },
    );
  },
};

export { hostClass };
