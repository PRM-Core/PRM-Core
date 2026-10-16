/**
 * The evaluation harness from the command line — run it before a prompt or
 * a model changes:
 *
 *   PRM_AI_LOCAL_URL=http://127.0.0.1:11434/v1 PRM_AI_LOCAL_MODEL=bielik bun run agent:eval
 *
 * With a LoRA adapter registered (PRM_AI_LOCAL_ADAPTER_MODEL, docs/AGENT.md
 * section 12), `--compare` runs the base model and then the tuned one and
 * says whether the tuned one may be enabled — no fewer cases passed:
 *
 *   PRM_AI_LOCAL_ADAPTER_MODEL=bielik-prm bun run agent:eval -- --compare
 *
 * Uses the database from DATABASE_URL (the runs are stored there, as from
 * the screen). Exit code 1 when any case fails — with `--compare`, when the
 * tuned model scores worse — so it fits a CI step.
 */
import { runEvaluation } from "../src/lib/agent/eval/run.server";
import { localEndpoint } from "../src/lib/ai/boundary.server";

const compare = process.argv.includes("--compare");

async function run(model?: string) {
  const r = await runEvaluation({ startedBy: "cli", model });
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
  return row;
}

if (!compare) {
  const row = await run();
  process.exit(row.passed === row.total ? 0 : 1);
}

const e = localEndpoint();
if (!e.adapterModel) {
  console.error(
    "[agent:eval] --compare needs PRM_AI_LOCAL_ADAPTER_MODEL (docs/AGENT.md, section 12).",
  );
  process.exit(2);
}
const base = await run(e.model);
const tuned = await run(e.adapterModel);
const ok = tuned.passed >= base.passed;
console.log(
  `[agent:eval] base ${base.passed}/${base.total}, tuned ${tuned.passed}/${tuned.total} — ${
    ok
      ? "the tuned model may be enabled (PRM_Agent → Kierunki → Dostrojony model)"
      : "the tuned model scores worse; the base model stays"
  }`,
);
process.exit(ok ? 0 : 1);
