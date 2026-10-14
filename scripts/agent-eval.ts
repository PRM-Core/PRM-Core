/**
 * The evaluation harness from the command line — run it before a prompt or
 * a model changes:
 *
 *   PRM_AI_LOCAL_URL=http://127.0.0.1:11434/v1 PRM_AI_LOCAL_MODEL=bielik bun run agent:eval
 *
 * Uses the database from DATABASE_URL (the run is stored there, as from the
 * screen). Exit code 1 when any case fails, so it fits a CI step.
 */
import { runEvaluation } from "../src/lib/agent/eval/run.server";

const r = await runEvaluation({ startedBy: "cli" });
if (!r.ok) {
  console.error(`[agent:eval] ${r.error}`);
  process.exit(2);
}
const { row } = r;
console.log(`[agent:eval] model ${row.model}: ${row.passed}/${row.total} cases passed`);
for (const c of row.report) {
  console.log(
    `${c.ok ? "  ok  " : "  FAIL"} ${c.feature.padEnd(6)} ${c.id.padEnd(26)} ${c.ok ? "" : c.reason}`,
  );
  if (!c.ok) console.log(`        → ${c.output.replace(/\s+/g, " ").slice(0, 200)}`);
}
process.exit(row.passed === row.total ? 0 : 1);
