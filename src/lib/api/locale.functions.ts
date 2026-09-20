import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getSessionUser } from "../auth/session.server";
import { getDb } from "../db/client.server";
import { users } from "../db/schema";
import { LOCALES } from "../i18n";
import { setLocaleCookie } from "../i18n/locale-cookie.server";

/**
 * Switch the interface language.
 *
 * Works signed out too (the switch on the sign-in page) — then only the cookie
 * is set. Signed in, the choice is also saved on the account, so it follows the
 * user to other devices. The caller reloads the page: texts rendered on the
 * server and cached in the browser must all come from the new language.
 */
export const setMyLocale = createServerFn({ method: "POST" })
  .inputValidator(z.object({ locale: z.enum(LOCALES as ["en", "pl"]) }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    setLocaleCookie(data.locale);
    const user = await getSessionUser();
    if (user) {
      await getDb().update(users).set({ locale: data.locale }).where(eq(users.id, user.id));
    }
    return { ok: true };
  });
