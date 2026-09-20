import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { startEngine } from "./lib/engine/loop.server";
import { t } from "@/lib/i18n";
import { withRequestLocale } from "./lib/i18n/request-locale.server";

// The PRM Engine tick loop lives in the server process, so this entry file is
// where it belongs — it starts once, on the first evaluation of the server
// bundle, and is HMR-safe (see loop.server.ts).
startEngine();

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

/**
 * Serving the built client assets.
 *
 * The node-server build splits into `dist/server` (this handler) and
 * `dist/client` (hashed JS/CSS, favicon, anything from `public/`) — but nothing
 * in that output serves the second half. Without this, every `/assets/*`
 * request falls through to the router, which answers with a redirect to the
 * login page: the HTML renders, no stylesheet or script loads, and the page
 * arrives unstyled with a form that cannot submit.
 *
 * Deliberately placed ahead of the SSR handler and limited to GET/HEAD.
 */
const CLIENT_DIR = process.env.CLIENT_DIR || "./dist/client";

const MIME: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

async function serveStatic(request: Request): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const { pathname } = new URL(request.url);
  if (pathname === "/" || pathname.endsWith("/")) return null;

  // Path traversal guard: a request for /assets/../../etc/passwd must not
  // escape the client directory, whatever the client encoded it as.
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes("..") || decoded.includes("\0")) return null;

  const { join, extname, resolve, sep } = await import("node:path");
  const root = resolve(CLIENT_DIR);
  const filePath = resolve(join(root, decoded));
  if (filePath !== root && !filePath.startsWith(root + sep)) return null;

  const ext = extname(filePath).toLowerCase();
  const type = MIME[ext];
  // Only known asset types — an unknown extension is a route, not a file.
  if (!type) return null;

  const { stat, readFile } = await import("node:fs/promises");
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return null;
    const body = request.method === "HEAD" ? null : await readFile(filePath);
    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(info.size),
        // Vite fingerprints these filenames, so a cached copy can never be
        // stale; everything else gets a short cache instead.
        "Cache-Control": pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600",
      },
    });
  } catch {
    return null;
  }
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(
    consumeLastCapturedError() ?? new Error(t("h3 swallowed SSR error: {body}", { body: body })),
  );
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Assets first: they must never reach the router, whose auth guard would
      // answer a stylesheet request with a redirect to the login page.
      const asset = await serveStatic(request);
      if (asset) return asset;

      const handler = await getServerEntry();
      // Every request is rendered in its user's language (prm_locale cookie).
      return await withRequestLocale(request, async () => {
        const response = await handler.fetch(request, env, ctx);
        return await normalizeCatastrophicSsrResponse(response);
      });
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
