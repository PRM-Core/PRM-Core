import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import { getDb } from "../../db/client.server";
import { agentEvaluations, type AgentEvaluationRow } from "../../db/schema";
import { logStep } from "../../engine/log.server";
import { askModel, modelGate } from "../language.server";
import { EVAL_CASES, type EvalCase } from "./cases";
import { t } from "@/lib/i18n";

/**
 * The evaluation harness — running it. Every case goes to the model in
 * reach through the same boundary as production; the answer is judged by
 * the case's own check. The run is stored whole, so the report can be read
 * later and compared with the next one. Cases run one after another: a
 * local model answers one question at a time anyway.
 */

export type EvalRun = { ok: true; row: AgentEvaluationRow } | { ok: false; error: string };

export async function runEvaluation(input: {
  startedBy: string;
  cases?: EvalCase[];
  now?: number;
}): Promise<EvalRun> {
  const gate = await modelGate();
  if (!gate.ok) return { ok: false, error: gate.reason };
  const cases = input.cases ?? EVAL_CASES;
  const now = input.now ?? Date.now();
  const report: AgentEvaluationRow["report"] = [];
  for (const c of cases) {
    const r = await askModel(c.system, c.user, c.maxTokens, `eval:${c.id}`);
    if (!r.ok) {
      report.push({
        id: c.id,
        feature: c.feature,
        title: c.title,
        ok: false,
        reason: r.reason,
        output: "",
      });
      continue;
    }
    let output = r.text;
    let verdict = c.check(output);
    if (!verdict.ok && c.retry) {
      const again = await askModel(
        c.system,
        c.retry(output, verdict.reason),
        c.maxTokens,
        `eval:${c.id}`,
      );
      if (again.ok) {
        output = again.text;
        verdict = c.check(output);
      }
    }
    report.push({
      id: c.id,
      feature: c.feature,
      title: c.title,
      ok: verdict.ok,
      reason: verdict.reason,
      output: output.slice(0, 2000),
    });
  }
  const row: AgentEvaluationRow = {
    id: randomUUID(),
    runAt: now,
    model: `${gate.config.providerId}/${gate.config.model}`,
    total: report.length,
    passed: report.filter((r) => r.ok).length,
    report,
    startedBy: input.startedBy,
  };
  await getDb().insert(agentEvaluations).values(row);
  await logStep({
    kind: "agent",
    message: t("Sprawdzian modelu {model}: {passed} z {total} przypadków ({who}).", {
      model: row.model,
      passed: row.passed,
      total: row.total,
      who: input.startedBy,
    }),
    detail: { source: "agent-eval", passed: String(row.passed), total: String(row.total) },
  });
  return { ok: true, row };
}

export async function latestEvaluation(): Promise<AgentEvaluationRow | null> {
  const row = await getDb()
    .select()
    .from(agentEvaluations)
    .orderBy(desc(agentEvaluations.runAt))
    .limit(1)
    .get();
  return row ?? null;
}
