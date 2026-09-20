import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "./require-user";
import { z } from "zod";
import { getAiConfig, saveAiConfig, getKeyStatus, getSpendToday } from "../ai/settings.server";
import { AI_MODELS, PROVIDER_ENV_VARS, type AiModelOption } from "../ai/provider.server";
import { generateFlow, type FlowGenerationResult } from "../ai/flow-builder.server";
import type { AiProviderId } from "../db/schema";

// Settings surface for the PRM_Agent. Note what is NOT here: API keys. The
// client only ever learns whether a key is present, never its value.

export interface AiSettingsView {
  provider: AiProviderId;
  model: string;
  dailyLimitUsd: number;
  spentTodayUsd: number;
  keyConfigured: Record<AiProviderId, boolean>;
  envVars: Record<AiProviderId, string>;
  models: Record<AiProviderId, AiModelOption[]>;
}

export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async (): Promise<AiSettingsView> => {
    const [config, spentTodayUsd] = await Promise.all([getAiConfig(), getSpendToday()]);
    return {
      provider: config.providerId,
      model: config.model,
      dailyLimitUsd: config.dailyLimitUsd,
      spentTodayUsd,
      keyConfigured: await getKeyStatus(),
      envVars: PROVIDER_ENV_VARS,
      models: AI_MODELS,
    };
  });

/**
 * "Agent AI" tab: turns a plain-language brief into a real automation graph.
 * Template names travel from the client because content items live in
 * localStorage — the server cannot list them, and a generator that invents
 * template names produces steps that fail at send time.
 */
export const generateAutomationFlow = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      prompt: z.string().min(3).max(2000),
      templates: z.record(z.string(), z.array(z.string())).default({}),
    }),
  )
  .handler(async ({ data }): Promise<FlowGenerationResult> => {
    return generateFlow({ prompt: data.prompt, templates: data.templates });
  });

export const saveAiSettings = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      provider: z.enum(["anthropic", "openai", "google"]),
      model: z.string().min(1),
      dailyLimitUsd: z.number().min(0).max(1000),
    }),
  )
  .handler(async ({ data }) => {
    await saveAiConfig(data);
    return { ok: true };
  });
