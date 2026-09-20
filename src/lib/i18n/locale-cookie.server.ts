import { setCookie } from "@tanstack/react-start/server";
import { LOCALE_COOKIE, type Locale } from "./index";

/** A year: the language is a preference, not a credential. */
export function setLocaleCookie(locale: Locale): void {
  setCookie(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 24 * 60 * 60,
  });
}
