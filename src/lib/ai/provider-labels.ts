import type { AiProviderId } from "../db/schema";

// Display names for the LLM providers. Deliberately a plain module rather than
// part of provider.server.ts — the settings UI needs these, and importing the
// server module would drag the SDK and the API keys toward the client bundle.

export const PROVIDER_LABELS: Record<AiProviderId, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  google: "Google (Gemini)",
};
