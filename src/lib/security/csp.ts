/**
 * The Content-Security-Policy the application sends with every HTML page —
 * pure, so the policy is tested on paper.
 *
 * Scripts run only from the application's own origin or with this page's
 * nonce: TanStack Router stamps the nonce on its own inline scripts (the
 * dehydrated state), and nothing else may run inline. That is what turns an
 * injected `<script>` in a patient's name or a message into inert text.
 * Inline styles stay allowed: the UI library sets them, and a style cannot
 * read a page or send data the way a script can.
 */

export type CspMode = "enforce" | "report" | "off";

/** PRM_CSP: "enforce" (default in production), "report" (report-only, to diagnose), "off". */
export function cspMode(value: string | undefined, production: boolean): CspMode {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "off" || v === "report" || v === "enforce") return v;
  // In development Vite injects its own inline scripts without a nonce.
  return production ? "enforce" : "off";
}

export function cspPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "frame-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function cspHeaderName(mode: CspMode): string | null {
  if (mode === "enforce") return "Content-Security-Policy";
  if (mode === "report") return "Content-Security-Policy-Report-Only";
  return null;
}
