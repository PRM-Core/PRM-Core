import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { allowReporter, requireUser } from "./require-user";
import { t } from "@/lib/i18n";

// Outgoing webhook destinations. Anyone who edits automations sees their
// names and hosts to pick one in a step; only an administrator creates,
// changes or deletes them, because each one is a decision about which
// patient data leaves the installation and where to.

export type { WebhookEndpointView } from "../webhooks/outgoing.server";

async function requireAdmin(): Promise<string> {
  const { getSessionUser } = await import("../auth/session.server");
  const user = await getSessionUser();
  if (!user || user.role !== "admin")
    throw new Error(t("Odbiorców webhooków ustawia administrator."));
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

/** Destinations for the step picker and the PRM Engine panel. */
export const getWebhookEndpoints = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async () => {
    const { listWebhookEndpoints } = await import("../webhooks/outgoing.server");
    return listWebhookEndpoints();
  });

/**
 * Creates or updates a destination. Returns the signing secret once — for a
 * new destination or when asked to rotate it — to paste into the receiver.
 */
export const saveWebhookEndpointFn = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1).max(80),
      url: z.string().max(2000).optional(),
      fields: z.array(z.string()).max(20),
      rotateSecret: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const who = await requireAdmin();
    const { saveWebhookEndpoint } = await import("../webhooks/outgoing.server");
    return saveWebhookEndpoint(data, who);
  });

export const deleteWebhookEndpointFn = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const who = await requireAdmin();
    const { deleteWebhookEndpoint } = await import("../webhooks/outgoing.server");
    await deleteWebhookEndpoint(data.id, who);
    return { ok: true as const };
  });
