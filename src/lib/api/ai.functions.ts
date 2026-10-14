import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "./require-user";
import { z } from "zod";
import { aiMode, localEndpoint } from "../ai/boundary.server";
import { hasStaleHostedConfig, type AiMode, type HostClass } from "../ai/boundary";
import { generateFlow, type FlowGenerationResult } from "../ai/flow-builder.server";

// Settings surface for PRM_Agent's language layer. Nothing here is edited:
// where a model runs is decided in .env by whoever runs the server, and the
// product has no provider other than a model inside the perimeter. The
// screen shows the decision and what it means.

export interface AiSettingsView {
  /** The data boundary in force — decided by .env, shown here, never edited here. */
  mode: AiMode;
  local: { host: string; hostClass: HostClass; model: string; configured: boolean };
  /** Leftovers of releases before 2.0.0 found in .env (a hosted mode, a provider key) — unused, worth removing. */
  stale: string[];
}

export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async (): Promise<AiSettingsView> => {
    const e = localEndpoint();
    return {
      mode: aiMode(),
      local: {
        host: e.host,
        hostClass: e.hostClass,
        model: e.model,
        configured: !!e.url && !!e.model && e.hostClass !== "public",
      },
      stale: hasStaleHostedConfig(process.env),
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
