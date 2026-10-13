/**
 * The data boundary of PRM_Agent — pure rules, no environment, no network.
 *
 * `PRM_AI_MODE` decides where text may be sent to a language model:
 *
 * - `off`    — no model calls at all. Everything that needs no model
 *              (rules, signals, predictions, templated briefs) keeps working.
 * - `local`  — calls go only to an endpoint **inside the perimeter**: a
 *              loopback, a private-network address, or a host the
 *              administrator listed explicitly. Refused in code, not by
 *              convention.
 * - `hosted` — a cloud provider (Anthropic, OpenAI, Google). Never the
 *              default; prompts are pseudonymised before they leave (see
 *              `redact.ts`).
 *
 * The server-side half (`boundary.server.ts`) reads the environment and
 * hands the values to these functions, so the rules can be tested without one.
 */

export type AiMode = "off" | "local" | "hosted";

export const AI_MODES: AiMode[] = ["off", "local", "hosted"];

export interface AiEnv {
  PRM_AI_MODE?: string;
  PRM_AI_LOCAL_URL?: string;
  PRM_AI_LOCAL_MODEL?: string;
  PRM_AI_EGRESS_ALLOW?: string;
}

/**
 * The mode in force. Unset means the safe answer: `local` when a local
 * endpoint is configured, otherwise `off`. Reaching a hosted provider always
 * takes an explicit `PRM_AI_MODE=hosted`.
 */
export function resolveMode(env: AiEnv): AiMode {
  const raw = (env.PRM_AI_MODE ?? "").trim().toLowerCase();
  if (raw === "off" || raw === "local" || raw === "hosted") return raw;
  return (env.PRM_AI_LOCAL_URL ?? "").trim() ? "local" : "off";
}

export type HostClass = "loopback" | "private" | "allowlisted" | "public";

const PRIVATE_V4 = [
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/,
];

/**
 * Where a host lives, from its name alone. Only what can be decided without a
 * DNS lookup counts: an address, a loopback name, a name on the allowlist.
 * A name that resolves to a private address but is not listed is `public` —
 * the administrator lists it, and the listing is the decision.
 */
export function hostClass(hostname: string, allowlist: string[] = []): HostClass {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!host) return "public";
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "0:0:0:0:0:0:0:1"
  )
    return "loopback";
  if (/^127\.\d+\.\d+\.\d+$/.test(host)) return "loopback";
  if (PRIVATE_V4.some((re) => re.test(host))) return "private";
  // IPv6: unique local (fc00::/7) and link local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) return "private";
  if (allowlist.some((a) => a.trim().toLowerCase() === host)) return "allowlisted";
  return "public";
}

export function parseAllowlist(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** `true` when a model endpoint at this URL may be called in `local` mode. */
export function isInsidePerimeter(url: string, allowlist: string[] = []): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return hostClass(parsed.hostname, allowlist) !== "public";
}
