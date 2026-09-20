import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "./require-user";
import { getWebhookSecret, regenerateSecret } from "../leads/lead-webhook.server";

export const getLeadsWebhookStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async () => {
    return { secret: await getWebhookSecret() };
  });

export const regenerateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => {
    return { secret: await regenerateSecret() };
  });
