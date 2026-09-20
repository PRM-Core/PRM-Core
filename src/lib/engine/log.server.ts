import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { engineLog } from "../db/schema";
import type { EngineLogRow } from "../db/schema";
import { t } from "@/lib/i18n";

// Every engine step leaves a row here — this is the whole observability story
// for the deterministic layer, and the place AI token spend lands once the
// PRM_Agent node arrives. Writing a log line must never be able to fail a
// run, so errors are swallowed.

export type EngineLogKind =
  | "run_started"
  | "run_ended"
  | "action"
  | "condition"
  | "delay"
  | "skipped"
  | "error"
  | "ai"
  /**
   * Zdarzenia dotyczące dostępu i drugiego składnika logowania.
   *
   * Wartość była zapisywana do bazy przez nadzorcę AI od dawna, ale brakowało
   * jej w tym typie — pisano ją surowym `insert`, omijając `logStep`. Dopisana,
   * żeby jedna droga zapisu obsługiwała wszystkie rodzaje wpisów.
   */
  | "security";

export async function logStep(input: {
  runId?: string | null;
  automationId?: string | null;
  contactId?: string | null;
  nodeId?: string | null;
  kind: EngineLogKind;
  message: string;
  detail?: Record<string, string>;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}): Promise<void> {
  try {
    const db = getDb();
    await db.insert(engineLog).values({
      id: randomUUID(),
      runId: input.runId ?? null,
      automationId: input.automationId ?? null,
      contactId: input.contactId ?? null,
      nodeId: input.nodeId ?? null,
      kind: input.kind,
      message: input.message,
      detail: input.detail ?? null,
      tokensIn: input.tokensIn ?? null,
      tokensOut: input.tokensOut ?? null,
      costUsd: input.costUsd ?? null,
      createdAt: Date.now(),
    });
  } catch (err) {
    console.error(t("[PRM Engine] nie udało się zapisać logu"), input.message, err);
  }
}

export async function recentLog(limit = 50): Promise<EngineLogRow[]> {
  const db = getDb();
  return db.select().from(engineLog).orderBy(desc(engineLog.createdAt)).limit(limit);
}

export async function logForRun(runId: string): Promise<EngineLogRow[]> {
  const db = getDb();
  return db
    .select()
    .from(engineLog)
    .where(eq(engineLog.runId, runId))
    .orderBy(desc(engineLog.createdAt));
}
