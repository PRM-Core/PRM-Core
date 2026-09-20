import { t as tr } from "@/lib/i18n";
export type DelayUnit = "minutes" | "hours" | "days";

export type NodeKind = "trigger" | "delay" | "action" | "condition" | "aiAgent" | "path" | "split";

export interface AiAgentPathDef {
  id: string;
  label: string;
}

/** One condition inside a Path branch's filter — same catalog as the standalone condition node. */
export interface BranchFilter {
  key: string;
  config?: Record<string, string>;
}

/**
 * One branch of a Path node. The contact takes the FIRST branch whose filter
 * passes, so order is meaningful; a branch with no filters always passes and
 * therefore acts as the "everyone else" catch-all (which is why the editor
 * keeps one at the bottom).
 */
export interface PathBranchDef {
  id: string;
  label: string;
  /** Whether every filter must pass, or just one of them. */
  match?: "all" | "any";
  filters?: BranchFilter[];
}

/** One branch of a Split node — `weight` is its share of contacts in percent. */
export interface SplitBranchDef {
  id: string;
  label: string;
  weight: number;
}

export interface AutomationNode {
  id: string;
  kind: NodeKind;
  position: { x: number; y: number };
  /** Catalog key for trigger/condition/action nodes. */
  key?: string;
  config?: Record<string, string>;
  /** delay */
  amount?: number;
  unit?: DelayUnit;
  /** aiAgent */
  goal?: string;
  paths?: AiAgentPathDef[];
  /** path */
  branches?: PathBranchDef[];
  /** split */
  variants?: SplitBranchDef[];
}

export interface AutomationEdge {
  id: string;
  source: string;
  target: string;
  /** Which output handle on the source node this edge leaves from: "matched" | "unmatched" | a path id | undefined (single-output nodes). */
  sourceHandle?: string;
  label?: string;
}

export interface AutomationGraph {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}

export type AutomationStatus = "draft" | "active" | "inactive";

let counter = 0;
export function nodeId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyGraph(): AutomationGraph {
  return { nodes: [], edges: [] };
}

/** The output handles a node must have a connection from once it's finished. */
export function outputHandles(node: AutomationNode): string[] {
  if (node.kind === "condition") return ["matched", "unmatched"];
  if (node.kind === "aiAgent") return (node.paths ?? []).map((p) => p.id);
  if (node.kind === "path") return (node.branches ?? []).map((b) => b.id);
  if (node.kind === "split") return (node.variants ?? []).map((v) => v.id);
  if (node.kind === "action" && node.key === "end_process") return [];
  return ["out"];
}

export function makeBranchId(): string {
  return nodeId("branch");
}

/** A fresh Path node: two branches, the second one empty so it catches everyone else. */
export function defaultPathBranches(): PathBranchDef[] {
  return [
    { id: makeBranchId(), label: tr("Odnoga 1"), match: "all", filters: [] },
    { id: makeBranchId(), label: tr("Pozostali"), match: "all", filters: [] },
  ];
}

/** A fresh Split node: an even A/B test. */
export function defaultSplitVariants(): SplitBranchDef[] {
  return [
    { id: makeBranchId(), label: tr("Wariant A"), weight: 50 },
    { id: makeBranchId(), label: tr("Wariant B"), weight: 50 },
  ];
}

/**
 * Picks a Split branch at random, honouring the weights. Weights are treated as
 * shares of their own sum rather than requiring exactly 100, so a half-edited
 * node (30/30) still splits sensibly instead of dropping contacts on the floor.
 */
export function pickSplitVariant(
  variants: SplitBranchDef[],
  random: number = Math.random(),
): SplitBranchDef | null {
  const usable = variants.filter((v) => v.weight > 0);
  if (usable.length === 0) return variants[0] ?? null;
  const total = usable.reduce((sum, v) => sum + v.weight, 0);
  let threshold = random * total;
  for (const variant of usable) {
    threshold -= variant.weight;
    if (threshold < 0) return variant;
  }
  return usable[usable.length - 1];
}

export function addNode(graph: AutomationGraph, node: AutomationNode): AutomationGraph {
  return { ...graph, nodes: [...graph.nodes, node] };
}

export function updateNode(
  graph: AutomationGraph,
  id: string,
  patch: Partial<AutomationNode>,
): AutomationGraph {
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

/** Removes a node and every edge touching it. */
export function removeNode(graph: AutomationGraph, id: string): AutomationGraph {
  return {
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.source !== id && e.target !== id),
  };
}

/**
 * Connects source->target from the given handle, replacing any existing edge from that
 * same handle (a handle can only ever have one outgoing connection at a time) — this is
 * what lets the system auto-wire new steps while still letting the user rewire freely.
 */
export function connectNodes(
  graph: AutomationGraph,
  source: string,
  target: string,
  sourceHandle: string,
  label?: string,
): AutomationGraph {
  const edges = graph.edges.filter(
    (e) => !(e.source === source && e.sourceHandle === sourceHandle),
  );
  edges.push({ id: nodeId("edge"), source, target, sourceHandle, label });
  return { ...graph, edges };
}

export function removeEdge(graph: AutomationGraph, edgeId: string): AutomationGraph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== edgeId) };
}

/**
 * A trigger and at least one reachable action are required; conditions/AI agent are
 * optional. Because connections are now user-editable (drag to rewire, delete edges),
 * "all modules connected" is no longer guaranteed by construction, so it's checked here:
 * every non-trigger node needs an incoming edge, and every node needs all of its required
 * output handles connected.
 */
export function validateGraph(graph: AutomationGraph | null): { valid: boolean; errors: string[] } {
  if (!graph || graph.nodes.length === 0) {
    return {
      valid: false,
      errors: [tr("Automatyzacja jest pusta — dodaj wyzwalacz i przynajmniej jedną akcję.")],
    };
  }

  const errors: string[] = [];
  const triggers = graph.nodes.filter((n) => n.kind === "trigger");
  if (triggers.length === 0) {
    errors.push(tr("Automatyzacja musi zaczynać się od wyzwalacza."));
  }

  for (const node of graph.nodes) {
    if (node.kind === "trigger") continue;
    const hasIncoming = graph.edges.some((e) => e.target === node.id);
    if (!hasIncoming) {
      errors.push(
        tr("Krok „{v0}” nie jest połączony z resztą scenariusza.", { v0: node.key ?? node.kind }),
      );
    }
  }

  // Actions are valid terminal steps (the natural end of a path), so their output
  // handle is allowed to stay unconnected. Every other kind exists to lead somewhere
  // (a trigger/delay that goes nowhere, or a condition/AI-agent branch with a dead end),
  // so those must have every output handle wired up.
  for (const node of graph.nodes) {
    if (node.kind === "action") continue;
    for (const handle of outputHandles(node)) {
      const hasOutgoing = graph.edges.some(
        (e) => e.source === node.id && e.sourceHandle === handle,
      );
      if (!hasOutgoing) {
        errors.push(
          tr("Krok „{v0}” ma niepodłączoną ścieżkę wyjścia.", { v0: node.key ?? node.kind }),
        );
      }
    }
  }

  if (triggers.length > 0) {
    const reachable = new Set<string>();
    const queue = [...triggers.map((t) => t.id)];
    while (queue.length) {
      const id = queue.shift()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const e of graph.edges) {
        if (e.source === id) queue.push(e.target);
      }
    }
    const hasAction = graph.nodes.some((n) => reachable.has(n.id) && n.kind === "action");
    if (!hasAction) {
      errors.push(tr("Automatyzacja musi zawierać przynajmniej jedną akcję."));
    }
  }

  return { valid: errors.length === 0, errors };
}

// Per-node contact counts come from `automation_runs.path` via getNodeStats()
// in engine.functions.ts. The hash-derived placeholders that preceded it were
// deleted together with their only caller, the dead FlowChain.tsx.
