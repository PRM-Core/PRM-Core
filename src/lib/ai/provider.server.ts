import type { AiProviderId } from "../db/schema";
import type { KnownIdentifiers } from "./redact";
import { t } from "@/lib/i18n";

// One interface, three adapters. The PRM_Agent talks only to this shape, so
// swapping Claude for GPT or Gemini is a settings change rather than a code
// change. API keys live exclusively in .env — same convention as SendGrid and
// Twilio; they never reach the database or the client bundle.

export interface AiToolDef {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  inputSchema: Record<string, unknown>;
}

export interface AiToolCall {
  /** Provider-assigned id — echoed back with the tool result so the model can match them up. */
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AiToolResult {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

/** Obraz doklejony do tury użytkownika — grafika, którą model ma obejrzeć. */
export interface AiImage {
  /** np. `image/png` — dokładnie to, co zgłosił upload do Media. */
  mimeType: string;
  dataBase64: string;
}

/** One turn of the conversation. Tool results ride along on a user turn, mirroring the Claude API shape. */
export interface AiMessage {
  role: "user" | "assistant";
  text?: string;
  /**
   * Obrazy w tej turze. Wszystkie trzy adaptery je obsługują (Claude: blok
   * `image`, OpenAI: `image_url` z data-URL, Gemini: `inlineData`) — dzięki
   * temu studio kreacji działa niezależnie od wybranego dostawcy.
   */
  images?: AiImage[];
  toolCalls?: AiToolCall[];
  toolResults?: AiToolResult[];
  /**
   * The provider's own assistant content, echoed back verbatim. Rebuilding an
   * assistant turn from `text` + `toolCalls` loses blocks the API needs intact
   * on the next round — thinking blocks (which Claude requires unchanged) and
   * server-tool blocks (which a paused turn resumes from). When present, the
   * adapter must prefer this over the reconstructed form.
   */
  raw?: unknown;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiCompletion {
  text: string;
  toolCalls: AiToolCall[];
  usage: AiUsage;
  /** True when the model asked for tools and expects results back. */
  wantsTools: boolean;
  /**
   * True when a server-side tool (web search) hit its iteration limit and the
   * turn must simply be re-sent to continue — no tool results to supply.
   */
  paused?: boolean;
  /** Provider-native assistant content, to be echoed back on the next turn. See AiMessage.raw. */
  raw?: unknown;
}

export interface AiCompleteInput {
  model: string;
  system: string;
  messages: AiMessage[];
  tools: AiToolDef[];
  maxTokens: number;
  /**
   * Let the model search the web. Runs on the provider's own infrastructure —
   * there is no client-side tool to execute — so each adapter maps it to its
   * native server tool, or reports it unsupported via `supportsWebSearch`.
   */
  webSearch?: boolean;
  /**
   * Who the prompt is about. The boundary (`settings.server.ts`) replaces
   * these names, addresses and numbers with placeholders in every text of the
   * request before the adapter sees it — on top of the shape-based redaction
   * it always applies. A builder that knows the contact passes them.
   */
  identifiers?: KnownIdentifiers;
}

export interface AiProvider {
  id: AiProviderId;
  /** False when the adapter has no verified way to search the web; the agent then falls back to its own knowledge and says so. */
  supportsWebSearch: boolean;
  complete(input: AiCompleteInput): Promise<AiCompletion>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: AiProviderId,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export interface AiModelOption {
  id: string;
  label: string;
  /** USD per million tokens, used to price each call for the daily spend limit. */
  inputPerMTok: number;
  outputPerMTok: number;
  /**
   * Whether the model accepts `thinking: { type: "adaptive" }`. Sending it to a
   * model without it is a hard 400, so this is not a nice-to-have flag — it
   * decides whether the call works at all.
   */
  supportsThinking?: boolean;
}

/**
 * The local model is named in .env (PRM_AI_LOCAL_MODEL) and costs nothing per
 * token, so there is no catalogue to choose from and nothing to price. The
 * shape stays so the daily-limit code keeps one path.
 */
export const AI_MODELS: Record<AiProviderId, AiModelOption[]> = { local: [] };

export { PROVIDER_LABELS } from "./provider-labels";

/** Which .env variable each provider reads its key from — surfaced in the settings UI. */
export const PROVIDER_ENV_VARS: Record<AiProviderId, string> = { local: "PRM_AI_LOCAL_URL" };

export function findModel(provider: AiProviderId, model: string): AiModelOption | undefined {
  return AI_MODELS[provider].find((m) => m.id === model);
}

/** Cost of one call in USD. Unknown models price at 0 rather than blocking the run. */
export function priceCall(provider: AiProviderId, model: string, usage: AiUsage): number {
  const meta = findModel(provider, model);
  if (!meta) return 0;
  return (
    (usage.inputTokens / 1_000_000) * meta.inputPerMTok +
    (usage.outputTokens / 1_000_000) * meta.outputPerMTok
  );
}
