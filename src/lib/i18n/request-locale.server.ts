import { AsyncLocalStorage } from "node:async_hooks";
import { LOCALE_COOKIE } from "./index";

/**
 * The language of the request being served, for `currentLocale()`.
 *
 * `src/server.ts` runs every request inside `withRequestLocale`. Work outside a
 * request — the engine loop, background jobs — sees no store and falls back to
 * the installation default. Our own storage rather than the framework's
 * request context: that one is not reachable from here in the production
 * build, and a silent fallback to the default would look like a working switch
 * that does nothing.
 */
const store = new AsyncLocalStorage<string | undefined>();

(globalThis as { __prmRequestLocale?: () => string | undefined }).__prmRequestLocale = () =>
  store.getStore();

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function withRequestLocale<T>(request: Request, handle: () => Promise<T>): Promise<T> {
  return store.run(readCookie(request.headers.get("cookie"), LOCALE_COOKIE), handle);
}
