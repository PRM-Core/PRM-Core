/** Goals and conversion — the counting, on paper. */
import { describe, expect, test } from "bun:test";
import { DAY_MS, goalReport, reached, variantOf, type GoalRun } from "./goals";
import type { AutomationGraph } from "../automation-flow";

const NOW = Date.UTC(2026, 9, 15);
const run = (id: string, daysAgo: number, path: string[] = []): GoalRun => ({
  id,
  contactId: `c-${id}`,
  startedAt: NOW - daysAgo * DAY_MS,
  path,
});

const SPLIT: AutomationGraph = {
  nodes: [
    { id: "t", kind: "trigger", position: { x: 0, y: 0 } },
    {
      id: "s",
      kind: "split",
      position: { x: 0, y: 0 },
      variants: [
        { id: "va", label: "A", weight: 50 },
        { id: "vb", label: "B", weight: 50 },
      ],
    },
    { id: "a", kind: "action", position: { x: 0, y: 0 } },
    { id: "b", kind: "action", position: { x: 0, y: 0 } },
  ],
  edges: [
    { id: "e0", source: "t", target: "s" },
    { id: "e1", source: "s", target: "a", sourceHandle: "va" },
    { id: "e2", source: "s", target: "b", sourceHandle: "vb" },
  ],
};

describe("reaching the goal", () => {
  test("the same patient, after the start, within the window", () => {
    const r = run("1", 20);
    expect(reached(r, [{ contactId: "c-1", occurredAt: r.startedAt + 3 * DAY_MS }], 14)).toBe(true);
    expect(reached(r, [{ contactId: "c-1", occurredAt: r.startedAt + 15 * DAY_MS }], 14)).toBe(
      false,
    );
    expect(reached(r, [{ contactId: "c-1", occurredAt: r.startedAt - 1 }], 14)).toBe(false);
    expect(reached(r, [{ contactId: "c-2", occurredAt: r.startedAt + DAY_MS }], 14)).toBe(false);
  });
});

describe("the variant a run took", () => {
  test("is read from the step after the split", () => {
    expect(variantOf(run("1", 1, ["t", "s", "b"]), SPLIT)).toEqual({ id: "vb", label: "B" });
    expect(variantOf(run("2", 1, ["t", "s"]), SPLIT)).toBeNull();
    expect(variantOf(run("3", 1, ["t"]), SPLIT)).toBeNull();
  });
});

describe("the report", () => {
  test("a run still inside its window is pending, not a miss", () => {
    const runs = [run("1", 30), run("2", 30), run("3", 2)];
    const hits = [{ contactId: "c-1", occurredAt: runs[0].startedAt + DAY_MS }];
    const r = goalReport(runs, hits, null, 14, NOW);
    expect(r).toMatchObject({ entered: 3, converted: 1, pending: 1, rate: 0.5 });
  });

  test("per variant, with a test only when there are two", () => {
    const runs = [
      run("1", 30, ["t", "s", "a"]),
      run("2", 30, ["t", "s", "a"]),
      run("3", 30, ["t", "s", "b"]),
      run("4", 30, ["t", "s", "b"]),
    ];
    const hits = runs
      .slice(0, 2)
      .map((r) => ({ contactId: r.contactId, occurredAt: r.startedAt + DAY_MS }));
    const r = goalReport(runs, hits, SPLIT, 14, NOW);
    expect(r.variants).toEqual([
      { id: "va", label: "A", entered: 2, converted: 2, rate: 1 },
      { id: "vb", label: "B", entered: 2, converted: 0, rate: 0 },
    ]);
    // Two runs a variant is not evidence: the test says so instead of a p-value.
    expect(r.test).toMatchObject({ p: null, significant: false });
  });

  test("enough runs and a real difference: the test says it is not chance", () => {
    const runs: GoalRun[] = [];
    const hits = [];
    for (let i = 0; i < 100; i++) {
      const a = run(`a${i}`, 30, ["t", "s", "a"]);
      const b = run(`b${i}`, 30, ["t", "s", "b"]);
      runs.push(a, b);
      if (i < 40) hits.push({ contactId: a.contactId, occurredAt: a.startedAt + DAY_MS });
      if (i < 15) hits.push({ contactId: b.contactId, occurredAt: b.startedAt + DAY_MS });
    }
    const r = goalReport(runs, hits, SPLIT, 14, NOW);
    expect(r.test?.significant).toBe(true);
  });

  test("no runs, no rate — a dash, not 0%", () => {
    expect(goalReport([], [], null, 14, NOW).rate).toBeNull();
  });
});
