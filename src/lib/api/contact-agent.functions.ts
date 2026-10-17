import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "./require-user";
import { z } from "zod";
import {
  summariseContact,
  askAboutContact,
  cachedSummary,
  type AgentResult,
  type CachedSummary,
} from "../ai/contact-agent.server";

// Warstwa RPC PRM_Agenta na karcie pacjenta.

export type { AgentResult, CachedSummary };

/** The last summary, at once and without a model — what the card shows on opening. */
export const getCachedContactSummary = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ contactId: z.string().min(1) }))
  .handler(async ({ data }): Promise<CachedSummary | null> => cachedSummary(data.contactId));

export const generateContactSummary = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ contactId: z.string().min(1) }))
  .handler(async ({ data }): Promise<AgentResult> => summariseContact(data.contactId));

export const askContactAgent = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      contactId: z.string().min(1),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })),
    }),
  )
  .handler(async ({ data }): Promise<AgentResult> => askAboutContact(data.contactId, data.history));
