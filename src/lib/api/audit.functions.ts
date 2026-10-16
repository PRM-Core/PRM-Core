import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./require-user";
import { t } from "@/lib/i18n";

// The audit trail, for administrators only: it names people and patients'
// documents, and it is the record an administrator's own actions are judged by.

export interface AuditEntry {
  id: string;
  at: number;
  actorName: string;
  action: string;
  target: string;
  detail: Record<string, string>;
}

export const getAuditLog = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      action: z.string().max(60).optional(),
      before: z.number().int().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ entries: AuditEntry[]; retentionDays: number }> => {
    const { getSessionUser } = await import("../auth/session.server");
    const user = await getSessionUser();
    if (!user || user.role !== "admin")
      throw new Error(t("Dziennik działań administracyjnych widzi administrator."));
    const { listAudit, retentionDays } = await import("../audit/audit.server");
    const rows = await listAudit(data);
    return {
      entries: rows.map(({ id, at, actorName, action, target, detail }) => ({
        id,
        at,
        actorName,
        action,
        target,
        detail,
      })),
      retentionDays: retentionDays(),
    };
  });
