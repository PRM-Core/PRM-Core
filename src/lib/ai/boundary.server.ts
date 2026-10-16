import process from "node:process";
import {
  hostClass,
  isInsidePerimeter,
  parseAllowlist,
  resolveMode,
  type AiMode,
  type HostClass,
} from "./boundary";

/** The server-side reading of the boundary: environment in, decisions out. */

export function aiMode(): AiMode {
  return resolveMode({
    PRM_AI_MODE: process.env.PRM_AI_MODE,
    PRM_AI_LOCAL_URL: process.env.PRM_AI_LOCAL_URL,
  });
}

export interface LocalEndpoint {
  /** Base URL without a trailing slash, e.g. `http://localhost:11434/v1`. Empty when unset. */
  url: string;
  host: string;
  hostClass: HostClass;
  model: string;
  /**
   * The same model with this installation's LoRA adapter, registered on the
   * same server (`PRM_AI_LOCAL_ADAPTER_MODEL`). Used only with the "tuned
   * model" direction enabled. Empty when there is none.
   */
  adapterModel: string;
  apiKey?: string;
  allowlist: string[];
}

export function localEndpoint(): LocalEndpoint {
  const url = (process.env.PRM_AI_LOCAL_URL ?? "").trim().replace(/\/+$/, "");
  const allowlist = parseAllowlist(process.env.PRM_AI_EGRESS_ALLOW);
  let host = "";
  try {
    host = url ? new URL(url).hostname : "";
  } catch {
    host = "";
  }
  return {
    url,
    host,
    hostClass: url && isInsidePerimeter(url, allowlist) ? hostClass(host, allowlist) : "public",
    model: (process.env.PRM_AI_LOCAL_MODEL ?? "").trim(),
    adapterModel: (process.env.PRM_AI_LOCAL_ADAPTER_MODEL ?? "").trim(),
    apiKey: (process.env.PRM_AI_LOCAL_KEY ?? "").trim() || undefined,
    allowlist,
  };
}

/** One sentence on what the current mode means — for the settings screen and the security report. */
export function describeBoundary(): string {
  const mode = aiMode();
  if (mode === "off") return "PRM_AI_MODE=off";
  const e = localEndpoint();
  return e.url
    ? `PRM_AI_MODE=local · ${e.host} (${e.hostClass})`
    : "PRM_AI_MODE=local · PRM_AI_LOCAL_URL unset";
}
