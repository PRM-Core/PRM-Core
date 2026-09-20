import { EN } from "./en";

/**
 * Interface language.
 *
 * **Each user picks their language** (account menu, or the switch on the
 * sign-in page). The choice is kept on the account and in the `prm_locale`
 * cookie. The server reads the cookie for every request and writes the result
 * into `<html lang>`; the browser reads it from there.
 *
 * **Work without a user** — the engine, emails and pages for patients — uses
 * the installation default, `PRM_LOCALE` in `.env` (`en`, the default, or `pl`).
 *
 * **The Polish text is the key.** `t("Zapisz")` returns "Zapisz" in Polish and
 * the English entry from `./en` otherwise. A missing English entry falls back
 * to Polish instead of showing a raw key. `bun run i18n:check` lists gaps.
 */
export type Locale = "en" | "pl";

export const LOCALES: Locale[] = ["en", "pl"];
export const LOCALE_COOKIE = "prm_locale";

export function normalizeLocale(value: string | undefined | null): Locale {
  return (value ?? "").trim().toLowerCase().startsWith("pl") ? "pl" : "en";
}

/** Installation default — for work that is not done on behalf of a user. */
export function defaultLocale(): Locale {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return normalizeLocale(env?.PRM_LOCALE);
}

type RequestLocaleReader = () => string | undefined;

/**
 * The server registers a reader of the current request's language (see
 * `request-locale.server.ts`). Kept on `globalThis` so this module stays free of
 * server-only imports and can run in the browser.
 */
function requestLocale(): string | undefined {
  const reader = (globalThis as { __prmRequestLocale?: RequestLocaleReader }).__prmRequestLocale;
  try {
    return reader?.();
  } catch {
    return undefined;
  }
}

export function currentLocale(): Locale {
  if (typeof document !== "undefined") return normalizeLocale(document.documentElement.lang);
  const fromRequest = requestLocale();
  return fromRequest ? normalizeLocale(fromRequest) : defaultLocale();
}

type Vars = Record<string, string | number | null | undefined>;

/**
 * Translate a Polish UI text. Placeholders in braces are filled from `vars`:
 * `t("Usunięto {n} kontaktów", { n: 3 })`.
 */
export function t(pl: string, vars?: Vars): string {
  const text = currentLocale() === "pl" ? pl : (EN[pl] ?? pl);
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** Locale tag for `Intl` and `toLocale*String` — dates and numbers follow the interface. */
export function intlLocale(): string {
  return currentLocale() === "pl" ? "pl-PL" : "en-GB";
}

const localizedCaches = new WeakMap<object, Map<Locale, unknown>>();

/** Drop the built copies of a `localized` constant — its source changed (e.g. an extension registered). */
export function refreshLocalized(value: object): void {
  localizedCaches.get(value)?.clear();
}

/**
 * A module-level constant with translated texts, built once per language.
 *
 * On the server a module is evaluated once and then serves requests in both
 * languages, so `const LABELS = { a: t("…") }` would stay in whichever language
 * was active at start-up. `localized(() => ({ a: t("…") }))` returns an object
 * that behaves like the constant but reads from the copy built for the current
 * request's language. Use it only for objects and arrays; a plain string
 * constant should become a function.
 */
export function localized<T extends object>(build: () => T): T {
  const copies = new Map<Locale, T>();
  const current = (): T => {
    const locale = currentLocale();
    let copy = copies.get(locale);
    if (!copy) {
      copy = build();
      copies.set(locale, copy);
    }
    return copy;
  };
  const first = current();
  const target = (Array.isArray(first) ? [] : {}) as T;
  const proxy = new Proxy(target, {
    get: (_, key) => {
      const copy = current() as Record<PropertyKey, unknown>;
      const value = copy[key];
      // Inherited methods (map, find, …) must run against the real array. Own
      // values — e.g. an icon component — are returned as they are, so React
      // sees the same component on every render.
      return typeof value === "function" && !Object.prototype.hasOwnProperty.call(copy, key)
        ? (value as (...a: unknown[]) => unknown).bind(copy)
        : value;
    },
    has: (_, key) => key in current(),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (proxyTarget, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(current(), key);
      if (!descriptor) return undefined;
      // The proxy target is empty; only `length` of an array exists on it.
      if (!Reflect.getOwnPropertyDescriptor(proxyTarget, key)) descriptor.configurable = true;
      return descriptor;
    },
    set: (_, key, value) => Reflect.set(current(), key, value),
    deleteProperty: (_, key) => Reflect.deleteProperty(current(), key),
    getPrototypeOf: () => Reflect.getPrototypeOf(current()),
  });
  localizedCaches.set(proxy, copies as Map<Locale, unknown>);
  return proxy;
}
