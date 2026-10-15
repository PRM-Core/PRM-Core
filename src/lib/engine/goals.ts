import type { AutomationGraph } from "../automation-flow";
import { compareRates, type ProportionTest } from "../reports/roles";

/**
 * Goals and conversion — the arithmetic, with no database: which runs reached
 * the goal, and how each split variant did. The matching of events to the
 * goal happens before (the engine's own trigger matcher); this file counts.
 */

export const DAY_MS = 86_400_000;

export interface GoalRun {
  id: string;
  contactId: string;
  startedAt: number;
  path: string[];
}

/** A patient's event that matches the goal. */
export interface GoalHit {
  contactId: string;
  occurredAt: number;
}

export interface VariantResult {
  id: string;
  label: string;
  entered: number;
  converted: number;
  rate: number | null;
}

export interface GoalReport {
  entered: number;
  converted: number;
  /** Not converted yet, but still inside the window — not counted as a miss in the rate. */
  pending: number;
  /** converted / (entered − pending): runs still in their window are left out of the denominator. */
  rate: number | null;
  variants: VariantResult[];
  /** Two variants only: is the difference more than chance? */
  test: ProportionTest | null;
}

/** Did this run reach the goal: a hit for the same patient within `days` of its start? */
export function reached(run: GoalRun, hits: GoalHit[], days: number): boolean {
  const end = run.startedAt + days * DAY_MS;
  return hits.some(
    (h) => h.contactId === run.contactId && h.occurredAt >= run.startedAt && h.occurredAt <= end,
  );
}

/**
 * The split variant a run took: the first split step on its path, and the
 * step right after it, matched to the split's edge — whose handle is the
 * variant. Null when the run never passed a split (or has not left it yet).
 */
export function variantOf(
  run: GoalRun,
  graph: AutomationGraph,
): { id: string; label: string } | null {
  for (let i = 0; i < run.path.length - 1; i++) {
    const node = graph.nodes.find((n) => n.id === run.path[i]);
    if (node?.kind !== "split") continue;
    const edge = graph.edges.find((e) => e.source === node.id && e.target === run.path[i + 1]);
    const variant = node.variants?.find((v) => v.id === edge?.sourceHandle);
    return variant ? { id: variant.id, label: variant.label } : null;
  }
  return null;
}

const rate = (hits: number, total: number) => (total > 0 ? hits / total : null);

export function goalReport(
  runs: GoalRun[],
  hits: GoalHit[],
  graph: AutomationGraph | null,
  days: number,
  now: number,
): GoalReport {
  let converted = 0;
  let pending = 0;
  const byVariant = new Map<string, VariantResult & { pending: number }>();
  for (const run of runs) {
    const ok = reached(run, hits, days);
    const open = !ok && run.startedAt + days * DAY_MS > now;
    if (ok) converted += 1;
    if (open) pending += 1;
    const v = graph ? variantOf(run, graph) : null;
    if (!v) continue;
    const row = byVariant.get(v.id) ?? { ...v, entered: 0, converted: 0, rate: null, pending: 0 };
    row.entered += 1;
    if (ok) row.converted += 1;
    if (open) row.pending += 1;
    byVariant.set(v.id, row);
  }
  const rows = [...byVariant.values()];
  // The test compares the same thing the rates show: runs whose window has
  // closed or that converted — a run still waiting is not yet a miss.
  const [a, b] = rows;
  const test =
    rows.length === 2
      ? compareRates(a.converted, a.entered - a.pending, b.converted, b.entered - b.pending)
      : null;
  const variants = rows.map(({ pending: p, ...v }) => ({
    ...v,
    rate: rate(v.converted, v.entered - p),
  }));
  return {
    entered: runs.length,
    converted,
    pending,
    rate: rate(converted, runs.length - pending),
    variants,
    test,
  };
}
