/**
 * The installation's training set for a LoRA adapter of the local model —
 * what the team approved (draft texts) and corrected (triage), as chat
 * lines in the shape the product sends. Recipe: docs/AGENT.md, section 12.
 *
 *   bun run agent:export-training -- --out /data/adapter-training
 *   bun run agent:export-training -- --out /data/adapter-training --min 300
 *   bun run agent:export-training -- --dry-run      # counts only, writes nothing
 *
 * Writes train.jsonl, valid.jsonl and manifest.json (counts only, no text)
 * with permissions 0600 — the lines are pseudonymised patient-related text
 * and stay inside the installation, next to its database. Every line is
 * checked for identifiers again; a line that still has one is refused.
 *
 * Exit code 1 below the minimum (default 200 lines) — then nothing is
 * written; 2 for a wrong invocation.
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { exportTrainingSet } from "../src/lib/agent/training.server";
import { TRAINING_MIN_EXAMPLES, toJsonl } from "../src/lib/agent/training";

const args = process.argv.slice(2);
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const out = value("--out");
const min = Number(value("--min") ?? TRAINING_MIN_EXAMPLES);

if (!dryRun && !out) {
  console.error("[agent:export-training] --out <directory> is required (or --dry-run).");
  process.exit(2);
}
if (!Number.isInteger(min) || min < 1) {
  console.error("[agent:export-training] --min must be a positive whole number.");
  process.exit(2);
}
const target = out ? path.resolve(out) : "";
// Never next to the code: a file in the checkout is one `git add` away from
// a public repository.
const code = path.resolve(import.meta.dir, "..");
if (target && (target === code || target.startsWith(code + path.sep))) {
  console.error(
    `[agent:export-training] refusing to write inside the application directory (${code}); choose a directory next to the database.`,
  );
  process.exit(2);
}

const set = await exportTrainingSet(min);
const refused = Object.entries(set.refused)
  .filter(([, n]) => n > 0)
  .map(([k, n]) => `${k} ${n}`)
  .join(", ");
console.log(
  `[agent:export-training] lines: ${set.counts.total} (drafts ${set.counts.draft}, triage ${set.counts.triage}); refused: ${refused || "none"}; minimum ${set.minimum}`,
);
if (!set.ok) {
  console.error(`[agent:export-training] ${set.reason}`);
  process.exit(1);
}
if (dryRun) {
  console.log("[agent:export-training] dry run — nothing written.");
  process.exit(0);
}

if (!existsSync(target)) mkdirSync(target, { recursive: true, mode: 0o700 });
const write = (name: string, body: string) => {
  const file = path.join(target, name);
  writeFileSync(file, body, { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
};
write("train.jsonl", toJsonl(set.train));
write("valid.jsonl", toJsonl(set.valid));
write(
  "manifest.json",
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      format: "chat (messages: system, user, assistant)",
      train: set.train.length,
      valid: set.valid.length,
      counts: set.counts,
      refused: set.refused,
      minimum: set.minimum,
      note: "Pseudonymised patient-related text of this installation. Do not copy outside it; an adapter trained on it is not shared between clinics.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `[agent:export-training] written to ${target}: train.jsonl ${set.train.length}, valid.jsonl ${set.valid.length}, manifest.json`,
);
