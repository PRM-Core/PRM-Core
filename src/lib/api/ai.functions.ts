import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "./require-user";
import { z } from "zod";
import { t } from "@/lib/i18n";
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
  /** Model runs a day for the whole installation, and how many so far today. */
  dailyCallLimit: number;
  callsToday: number;
}

export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async (): Promise<AiSettingsView> => {
    const e = localEndpoint();
    const { isOverDailyLimit } = await import("../ai/settings.server");
    const limit = await isOverDailyLimit();
    return {
      mode: aiMode(),
      local: {
        host: e.host,
        hostClass: e.hostClass,
        model: e.model,
        configured: !!e.url && !!e.model && e.hostClass !== "public",
      },
      stale: hasStaleHostedConfig(process.env),
      dailyCallLimit: limit.limit,
      callsToday: limit.used,
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

/** The installation's daily limit of model runs — an administrator's decision. */
export const saveDailyCallLimitFn = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ limit: z.number().int().min(0).max(1_000_000) }))
  .handler(async ({ data }) => {
    const { getSessionUser } = await import("../auth/session.server");
    const user = await getSessionUser();
    if (!user || user.role !== "admin")
      throw new Error(t("Limit uruchomień modelu ustawia administrator."));
    const { saveDailyCallLimit } = await import("../ai/settings.server");
    await saveDailyCallLimit(data.limit);
    return { ok: true as const };
  });
