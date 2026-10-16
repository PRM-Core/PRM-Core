import { hostClass } from "../ai/boundary";

/**
 * Outgoing webhooks — the parts that need no database: which addresses are
 * acceptable, what a payload may contain, and how it is signed.
 *
 * This is the one automation step that sends patient data out of the
 * installation, so its limits are decided by an administrator, per
 * destination, and enforced here: the address (HTTPS, or plain HTTP only
 * inside the clinic's network, where n8n often runs), the fields that may
 * leave (the PRM number always, nothing else unless allowed, never a PESEL
 * or custom fields — those can hold anything), and a signature the receiver
 * can check.
 */

/** Fields an administrator may let a destination receive. The PRM number always goes. */
export const WEBHOOK_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "status",
  "tags",
  "segments",
  "source",
  "campaign",
  "createdAt",
] as const;
export type WebhookField = (typeof WEBHOOK_FIELDS)[number];

export type UrlCheck =
  { ok: true; host: string } | { ok: false; reason: "invalid" | "insecure" | "credentials" };

/**
 * May an automation post to this address? HTTPS anywhere; plain HTTP only to
 * a loopback or private address — a public host over HTTP would carry patient
 * data in the clear. No user:password in the URL: that belongs in the secret.
 */
export function checkWebhookUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    return { ok: false, reason: "invalid" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  if (url.protocol === "http:" && hostClass(url.hostname) === "public")
    return { ok: false, reason: "insecure" };
  return { ok: true, host: url.host };
}

/** The contact as the payload carries it — only the allowed fields. */
export interface WebhookContactSource {
  prmId: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  tags?: string[] | null;
  segments?: string[] | null;
  source?: string | null;
  campaign?: string | null;
  createdAt?: string | null;
}

export interface WebhookContext {
  automationId: string;
  automationName: string;
  runId: string;
  stepId: string;
}

export function buildPayload(
  contact: WebhookContactSource,
  fields: readonly string[],
  context: WebhookContext,
  now: number,
): Record<string, unknown> {
  const allowed = new Set(fields.filter((f) => (WEBHOOK_FIELDS as readonly string[]).includes(f)));
  const out: Record<string, unknown> = { prmId: contact.prmId };
  for (const f of WEBHOOK_FIELDS)
    if (allowed.has(f)) out[f] = (contact as unknown as Record<string, unknown>)[f] ?? null;
  return {
    event: "automation.step",
    sentAt: new Date(now).toISOString(),
    automation: { id: context.automationId, name: context.automationName },
    run: context.runId,
    step: context.stepId,
    contact: out,
  };
}
