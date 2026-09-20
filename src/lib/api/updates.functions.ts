import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./require-user";
import { currentLocale } from "@/lib/i18n";
import { APP_VERSION } from "@/lib/version";
import { visibleNotices, type Notice } from "@/lib/updates/feed";

/** Notices for the banner — administrators only; everyone else gets none. */
export const getUpdateNotices = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async (): Promise<Notice[]> => {
    const { getSessionUser } = await import("@/lib/auth/session.server");
    const user = await getSessionUser();
    if (!user || user.role !== "admin") return [];
    const { storedFeed, dismissedNotices } = await import("@/lib/updates/check.server");
    const feed = await storedFeed();
    if (!feed) return [];
    return visibleNotices(feed, APP_VERSION, currentLocale(), await dismissedNotices(user.id));
  });

export const dismissUpdateNotice = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string().max(80) }))
  .handler(async ({ data }) => {
    const { getSessionUser } = await import("@/lib/auth/session.server");
    const user = await getSessionUser();
    if (!user || user.role !== "admin") return { ok: false as const };
    const { dismissNotice } = await import("@/lib/updates/check.server");
    await dismissNotice(user.id, data.id);
    return { ok: true as const };
  });
