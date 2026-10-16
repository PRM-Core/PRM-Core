import { randomUUID } from "node:crypto";
import { and, desc, eq, lt } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { auditLog } from "../db/schema";

// The audit trail of administrative actions: who added or removed an account,
// reset a password, exported contacts, opened a patient's document, changed
// a credential or a webhook. One table, read on Settings → Security, kept for
// PRM_AUDIT_RETENTION_DAYS (365 by default) and then purged.

export type AuditAction =
  | "user.added"
  | "user.deleted"
  | "user.password_reset"
  | "user.phone_set"
  | "contacts.exported"
  | "document.downloaded"
  | "document.uploaded"
  | "document.removed"
  | "credentials.saved"
  | "credentials.cleared"
  | "credentials.imported"
  | "mcp.token_generated"
  | "webhook.incoming_secret_rotated"
  | "webhook.destination_saved"
  | "webhook.destination_deleted";

export interface Actor {
  id: string;
  name: string;
}

/** The signed-in user as the trail names them; empty when there is none. */
export async function currentActor(): Promise<Actor> {
  const { getSessionUser } = await import("../auth/session.server");
  const user = await getSessionUser().catch(() => null);
  if (!user) return { id: "", name: "" };
  return {
    id: user.id,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
  };
}

/**
 * Records one action. Never throws: the trail must not stop the action it
 * describes — a failure is reported to the server log instead.
 */
export async function recordAudit(input: {
  action: AuditAction;
  target?: string;
  detail?: Record<string, string>;
  actor?: Actor;
  at?: number;
}): Promise<void> {
  try {
    const actor = input.actor ?? (await currentActor());
    await getDb()
      .insert(auditLog)
      .values({
        id: randomUUID(),
        at: input.at ?? Date.now(),
        actorId: actor.id,
        actorName: actor.name,
        action: input.action,
        target: input.target ?? "",
        detail: input.detail ?? {},
      });
  } catch (err) {
    console.error("[audit] could not record", input.action, err);
  }
}

export async function listAudit(input: {
  action?: string;
  before?: number;
  limit?: number;
}): Promise<(typeof auditLog.$inferSelect)[]> {
  const conditions = [
    input.action ? eq(auditLog.action, input.action) : undefined,
    input.before ? lt(auditLog.at, input.before) : undefined,
  ].filter((c) => c !== undefined);
  return getDb()
    .select()
    .from(auditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.at))
    .limit(Math.min(500, Math.max(1, input.limit ?? 100)));
}

export function retentionDays(value = process.env.PRM_AUDIT_RETENTION_DAYS): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 30 ? n : 365;
}

let lastPurgeAt = 0;

/** Deletes entries older than the retention period — at most once a day. */
export async function purgeAuditIfDue(now = Date.now(), force = false): Promise<number> {
  if (!force && now - lastPurgeAt < 86_400_000) return 0;
  lastPurgeAt = now;
  const cutoff = now - retentionDays() * 86_400_000;
  const gone = await getDb()
    .delete(auditLog)
    .where(lt(auditLog.at, cutoff))
    .returning({ id: auditLog.id });
  return gone.length;
}
