import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./require-user";
import { recordAudit } from "../audit/audit.server";
import { getWebhookSecret, regenerateSecret } from "../leads/lead-webhook.server";

export const getLeadsWebhookStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async () => {
    return { secret: await getWebhookSecret() };
  });

/**
 * A new secret. `keepPrevious` — a planned rotation: the old secret keeps
 * working for 24 hours while each sender is updated. Without it (the
 * default, for a leak) the old one stops at once.
 */
export const regenerateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ keepPrevious: z.boolean().optional() }).optional())
  .handler(async ({ data }) => {
    const keepPrevious = data?.keepPrevious ?? false;
    const secret = await regenerateSecret(Date.now(), keepPrevious);
    await recordAudit({
      action: "webhook.incoming_secret_rotated",
      detail: { mode: keepPrevious ? "planned (24 h)" : "leak (immediate)" },
    });
    return { secret };
  });
