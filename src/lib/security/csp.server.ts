import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { cspHeaderName, cspMode, cspPolicy } from "./csp";

// One nonce per request, held for the length of that request, so the router
// created while rendering it can stamp the nonce on its scripts — and the
// response carries the same nonce in its header.

const store = new AsyncLocalStorage<string>();

declare global {
  // Read by src/router.tsx, which is shared with the browser and so cannot
  // import this server module.
  var __prmCspNonce: (() => string | undefined) | undefined;
}
globalThis.__prmCspNonce = () => store.getStore();

export async function withCsp(handle: () => Promise<Response>): Promise<Response> {
  const mode = cspMode(process.env.PRM_CSP, process.env.NODE_ENV === "production");
  const header = cspHeaderName(mode);
  if (!header) return handle();
  const nonce = randomBytes(16).toString("base64");
  const response = await store.run(nonce, handle);
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;
  const headers = new Headers(response.headers);
  headers.set(header, cspPolicy(nonce));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
