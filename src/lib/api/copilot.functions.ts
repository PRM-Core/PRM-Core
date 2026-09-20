import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import {
  askCopilot,
  copilotStatus,
  deleteCopilotConversation,
  listCopilotConversations,
  loadCopilotConversation,
  COPILOT_RETENTION_DAYS,
} from "../ai/copilot.server";
import { getSessionUser } from "../auth/session.server";
import { t } from "@/lib/i18n";

// RPC only — the tools, prompt and transcript rules live in ai/copilot.server.ts.
//
// Every handler resolves the user server-side and scopes the query to them: a
// transcript quotes patient data, so one account must never read another's.

export const sendCopilotMessage = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      conversationId: z.string().min(1),
      history: z
        .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() }))
        .min(1)
        // The whole conversation is re-sent each turn: the model is stateless,
        // so the client is what carries the thread. Capped so a long chat
        // cannot quietly grow the bill on every message.
        .max(30),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: t("Sesja wygasła — zaloguj się ponownie.") };
    return askCopilot(data.history, { userId: user.id, conversationId: data.conversationId });
  });

export const getCopilotStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async () => copilotStatus());

export const getCopilotHistory = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async () => {
    const user = await getSessionUser();
    if (!user) return { retentionDays: COPILOT_RETENTION_DAYS, conversations: [] };
    return {
      retentionDays: COPILOT_RETENTION_DAYS,
      conversations: await listCopilotConversations(user.id),
    };
  });

export const openCopilotConversation = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .inputValidator(z.object({ conversationId: z.string() }))
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) return [];
    return loadCopilotConversation(user.id, data.conversationId);
  });

export const removeCopilotConversation = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ conversationId: z.string() }))
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) return { ok: false };
    await deleteCopilotConversation(user.id, data.conversationId);
    return { ok: true };
  });
