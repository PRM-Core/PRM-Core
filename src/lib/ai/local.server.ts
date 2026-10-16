import {
  AiProviderError,
  type AiCompleteInput,
  type AiCompletion,
  type AiProvider,
} from "./provider.server";
import { chatCompletions } from "./openai-compatible.server";
import {
  announcedButNotCalled,
  callNowReminder,
  flattenForPrompt,
  parseToolReply,
  replySchema,
  stripControlTokens,
  tidyProse,
} from "./prompt-tools";
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
    const target = {
      url: `${endpoint.url}/chat/completions`,
      apiKey: endpoint.apiKey,
      providerId: "local" as const,
      label: endpoint.host,
      // A model on a CPU-only server takes its time; a short timeout would
      // turn every draft into an error.
      timeoutMs: 300_000,
    };
    const request = { ...input, model: input.model || endpoint.model };
    const out = await completeWithImages(target, request);
    const text = stripControlTokens(out.text);
    const prose = request.tools.length === 0 && !request.responseSchema;
    return { ...out, text: prose ? tidyProse(text) : text };
  },
};

/** How a server says its model takes no images (llama.cpp in Ollama, vLLM wording). */
const NO_IMAGES =
  /multimodal data provided|does not support (?:multimodal|images?|vision)|image input is not supported/i;

/** Models found to take no images — remembered for the life of the process. */
const textOnlyModels = new Set<string>();

const hasImages = (input: AiCompleteInput) =>
  input.messages.some((m) => (m.images ?? []).length > 0);

const withoutImages = (input: AiCompleteInput): AiCompleteInput => ({
  ...input,
  messages: input.messages.map((m) => ({ ...m, images: undefined })),
});

/**
 * Images go to a model that can see them. A text-only model (Bielik) gets
 * the same request without them and the completion says so — the creative
 * studio then codes from the description instead of failing outright.
 */
async function completeWithImages(
  target: Parameters<typeof chatCompletions>[0],
  request: AiCompleteInput,
): Promise<AiCompletion> {
  if (!hasImages(request)) return completeWithTools(target, request);
  if (textOnlyModels.has(request.model))
    return { ...(await completeWithTools(target, withoutImages(request))), imagesDropped: true };
  try {
    return await completeWithTools(target, request);
  } catch (err) {
    if (err instanceof AiProviderError && NO_IMAGES.test(err.message)) {
      textOnlyModels.add(request.model);
      return { ...(await completeWithTools(target, withoutImages(request))), imagesDropped: true };
    }
    throw err;
  }
}

async function completeWithTools(
  target: Parameters<typeof chatCompletions>[0],
  request: AiCompleteInput,
): Promise<AiCompletion> {
  if (request.tools.length === 0) {
    if (!request.responseSchema) return chatCompletions(target, request);
    if (freeTextModels.has(request.model))
      return chatCompletions(target, { ...request, responseSchema: undefined });
    try {
      return await chatCompletions(target, request);
    } catch (err) {
      if (err instanceof AiProviderError && NO_SCHEMA.test(err.message)) {
        freeTextModels.add(request.model);
        return chatCompletions(target, { ...request, responseSchema: undefined });
      }
      throw err;
    }
  }

  // Tools: natively when the model has them, in the prompt when it does
  // not (prompt-tools.ts) — so every feature works on any local model.
  const mode = toolsMode(process.env.PRM_AI_LOCAL_TOOLS);
  if (mode === "prompt" || (mode === "auto" && promptToolModels.has(request.model)))
    return viaPrompt(target, request);
  try {
    return await chatCompletions(target, request);
  } catch (err) {
    if (mode === "auto" && err instanceof AiProviderError && NO_TOOLS.test(err.message)) {
      promptToolModels.add(request.model);
      return viaPrompt(target, request);
    }
    throw err;
  }
}

/** How a server says its model takes no tools (Ollama, llama.cpp, vLLM wording). */
const NO_TOOLS = /does not support tools|tools? (?:are|is) not supported|tool.*not supported/i;

/** Models found to take no tools — remembered for the life of the process. */
const promptToolModels = new Set<string>();

/** PRM_AI_LOCAL_TOOLS: "native", "prompt", or "auto" (the default: native, prompt when refused). */
export function toolsMode(value: string | undefined): "native" | "prompt" | "auto" {
  const v = (value ?? "").trim().toLowerCase();
  return v === "native" || v === "prompt" ? v : "auto";
}

async function viaPrompt(
  target: Parameters<typeof chatCompletions>[0],
  request: AiCompleteInput,
): Promise<AiCompletion> {
  const flat = flattenForPrompt(request);
  const ask = (input: AiCompleteInput) => constrained(target, request, input);
  let out = await ask(flat);
  let text = stripControlTokens(out.text);
  if (announcedButNotCalled(text, request.tools)) {
    // One reminder; its tokens are counted with the first reply's.
    const again = await ask({
      ...flat,
      messages: [
        ...flat.messages,
        { role: "assistant", text },
        { role: "user", text: callNowReminder() },
      ],
    });
    out = {
      ...again,
      usage: {
        inputTokens: out.usage.inputTokens + again.usage.inputTokens,
        outputTokens: out.usage.outputTokens + again.usage.outputTokens,
      },
    };
    text = stripControlTokens(again.text);
  }
  const parsed = parseToolReply(text, request.tools);
  return {
    ...out,
    text: parsed.text,
    toolCalls: parsed.toolCalls,
    wantsTools: parsed.toolCalls.length > 0,
  };
}

/** How a server says it cannot hold a reply to a schema. */
const NO_SCHEMA = /response_format|json_schema|structured output|grammar/i;

/** Models whose server refused a reply schema — free text for them from then on. */
const freeTextModels = new Set<string>();

/**
 * One call with the reply held to `replySchema`, where the server can do it
 * (Ollama, vLLM, llama.cpp, LM Studio): a valid call or an answer, nothing
 * else. A server that refuses the schema gets the same prompt without it,
 * and the reply is parsed from free text.
 */
async function constrained(
  target: Parameters<typeof chatCompletions>[0],
  request: AiCompleteInput,
  input: AiCompleteInput,
): Promise<AiCompletion> {
  if (freeTextModels.has(request.model)) return chatCompletions(target, input);
  const withSchema = {
    ...input,
    responseSchema: replySchema(request.tools, request.requireTool),
  };
  try {
    return await chatCompletions(target, withSchema);
  } catch (err) {
    if (err instanceof AiProviderError && NO_SCHEMA.test(err.message)) {
      freeTextModels.add(request.model);
      return chatCompletions(target, input);
    }
    throw err;
  }
}

/** Tests only — forget which models were found to take no tools. */
export function resetToolsCache(): void {
  promptToolModels.clear();
  freeTextModels.clear();
  textOnlyModels.clear();
}

export { hostClass };
