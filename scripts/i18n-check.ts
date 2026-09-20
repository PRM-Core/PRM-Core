/**
 * English coverage of the interface.
 *
 *   bun run i18n:check            summary
 *   bun run i18n:check --missing  list Polish keys without an English entry
 *   bun run i18n:check --strict   fail when any key has no English entry (CI)
 *
 * Reads every `t("…")` / `tr("…")` call with a literal key in `src/` and
 * compares the keys with the dictionary in `src/lib/i18n/en`. Keys are the
 * Polish texts, so a missing entry is not an error at runtime — the Polish
 * text is shown — but it is a gap in the English interface.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import ts from "typescript";
import { EN, EN_PARTS, registerEnglish } from "../src/lib/i18n/en";

// Booking system providers bring their own English texts (`providers/*.en.ts`).
const providersDir = "src/lib/booking-system/providers";
if (existsSync(providersDir)) {
  for (const f of readdirSync(providersDir).filter((n) => n.endsWith(".en.ts"))) {
    const m = (await import(`../${providersDir}/${f}`)) as { en?: Record<string, string> };
    if (m.en) registerEnglish(`provider:${f}`, m.en);
  }
}

const files = execSync("git ls-files 'src/*.ts' 'src/*.tsx'", { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !f.includes(".test.") && !f.startsWith("src/lib/i18n/"));

const keys = new Set<string>();
// Read the keys from the syntax tree, not with a regular expression: Prettier
// switches quote styles, and a missed key would look like full coverage.
for (const f of files) {
  const source = ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      const literal = (n?: ts.Expression) =>
        n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null;
      if (name === "t" || name === "tr") {
        const key = literal(node.arguments[0]);
        if (key !== null) keys.add(key);
      }
      // Plural forms are translated inside plural(): count(n, "kontakt", "kontakty", "kontaktów").
      if (name === "plural" || name === "count") {
        for (const i of [1, 3]) {
          const key = literal(node.arguments[i]);
          if (key !== null) keys.add(key);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

// Texts with no letters to translate (codes, placeholders) do not need an entry.
const needsEntry = (k: string) => /[a-ząćęłńóśźż]/i.test(k.replace(/\{\w+\}/g, ""));
const missing = [...keys].filter((k) => needsEntry(k) && !(k in EN)).sort();
const unused = Object.keys(EN).filter((k) => !keys.has(k));

const owner = new Map<string, string>();
const duplicates: string[] = [];
for (const [part, entries] of Object.entries(EN_PARTS)) {
  for (const key of Object.keys(entries)) {
    const first = owner.get(key);
    if (first && entries[key] !== EN_PARTS[first][key])
      duplicates.push(`${first} / ${part}: ${key}`);
    owner.set(key, first ?? part);
  }
}

console.log(`Keys in code:       ${keys.size}`);
console.log(`English entries:    ${Object.keys(EN).length}`);
console.log(`Missing in English: ${missing.length}`);
console.log(`Unused entries:     ${unused.length}`);
if (process.argv.includes("--strict") && missing.length > 0) {
  console.log("\nMissing English entries (add them to src/lib/i18n/en):");
  for (const k of missing) console.log(`  ${JSON.stringify(k)}`);
  process.exitCode = 1;
}
if (duplicates.length > 0) {
  console.log(`\nSame key, different English in two files (${duplicates.length}):`);
  for (const d of duplicates) console.log(`  ${d}`);
  process.exitCode = 1;
}
if (process.argv.includes("--missing")) console.log(JSON.stringify(missing, null, 1));
if (process.argv.includes("--unused")) console.log(JSON.stringify(unused, null, 1));
