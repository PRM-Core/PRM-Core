/**
 * Authentication by construction: every server function either carries the
 * `requireUser` / `allowReporter` middleware, or is listed in
 * PUBLIC_SERVER_FNS with the reason it must answer before sign-in.
 *
 * A server function is a public `/_serverFn/<id>` address whose id ships in
 * the page's code before anyone signs in, so a forgotten gate is an open door
 * to patient data. This test reads the source, so the rule holds before a
 * deployment, not only when a probe is run against one.
 */
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { PUBLIC_SERVER_FNS } from "./public-server-fns";

const SRC = path.join(import.meta.dir, "..", "..");
const GATES = ["requireUser", "allowReporter"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

interface ServerFn {
  name: string;
  file: string;
  gated: boolean;
}

/** Every `const <name> = createServerFn(...)…handler(` in the source, and whether its chain names a gate. */
function serverFns(): ServerFn[] {
  const found: ServerFn[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:export\s+)?const\s+(\w+)\s*=\s*createServerFn\(/g)) {
      const start = (m.index ?? 0) + m[0].length;
      const end = text.indexOf(".handler(", start);
      const chain = text.slice(start, end < 0 ? start : end);
      const mw = /\.middleware\(\s*\[([^\]]*)\]/.exec(chain);
      const gated = !!mw && GATES.some((g) => new RegExp(`\\b${g}\\b`).test(mw[1]));
      found.push({ name: m[1], file: path.relative(SRC, file), gated });
    }
  }
  return found;
}

describe("authentication by construction", () => {
  const fns = serverFns();

  test("the scan finds the server functions", () => {
    expect(fns.length).toBeGreaterThan(200);
  });

  test("every server function has a gate, or is public on purpose", () => {
    const open = fns
      .filter((f) => !f.gated && !(f.name in PUBLIC_SERVER_FNS))
      .map((f) => `${f.file}: ${f.name}`);
    expect(open).toEqual([]);
  });

  test("the public list is not stale: each entry exists and has no gate", () => {
    const byName = new Map(fns.map((f) => [f.name, f]));
    const stale = Object.keys(PUBLIC_SERVER_FNS).filter((name) => {
      const f = byName.get(name);
      return !f || f.gated;
    });
    expect(stale).toEqual([]);
  });

  test("every public entry says why", () => {
    for (const reason of Object.values(PUBLIC_SERVER_FNS))
      expect(reason.length).toBeGreaterThan(20);
  });
});
