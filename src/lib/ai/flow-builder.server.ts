import { getAiConfig, isOverDailyLimit, getKeyStatus } from "./settings.server";
import { priceCall, type AiToolDef } from "./provider.server";
import { logStep } from "../engine/log.server";
import { triggerCatalog, conditionCatalog, actionCatalog } from "../automation-catalog";
import {
  nodeId,
  makeBranchId,
  type AutomationGraph,
  type AutomationNode,
  type DelayUnit,
} from "../automation-flow";
import { t as tr } from "@/lib/i18n";

// The "Agent AI" tab, for real. It used to be `prompt.includes("sms")` behind a
// promise of "opisz cel — wygeneruję automatyzację"; since M3 there is a
// provider layer, so the model now gets the actual catalog and answers with a
// tool call.
//
// The model never writes node ids, positions or edge handles: it describes the
// scenario in domain terms (trigger + steps, branches one level deep) and the
// compiler below turns that into a graph that passes validateGraph by
// construction. A hallucinated action key is rejected here, not on the canvas.

const MAX_TOKENS = 4000;
/** Layout constants — the same grid feel as a hand-built scenario. */
const COL = 260;
const ROW = 180;
const ORIGIN = { x: 40, y: 200 };

export interface FlowGenerationResult {
  ok: boolean;
  /** Present when ok — ready to drop into the builder. */
  graph?: AutomationGraph;
  name?: string;
  /** The model's own one-line summary of what it built. */
  summary?: string;
  notes?: string[];
  error?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

interface StepInput {
  type?: string;
  actionKey?: string;
  conditionKey?: string;
  config?: Record<string, unknown>;
  amount?: number;
  unit?: string;
  goal?: string;
  matched?: StepInput[];
  unmatched?: StepInput[];
  paths?: Array<{ label?: string; steps?: StepInput[] }>;
  branches?: Array<{
    label?: string;
    match?: string;
    filters?: Array<{ key?: string; config?: Record<string, unknown> }>;
    steps?: StepInput[];
  }>;
  variants?: Array<{ label?: string; weight?: number; steps?: StepInput[] }>;
}

// ── prompt ──────────────────────────────────────────────────────────────────

function catalogLines(
  items: Array<{ key: string; label: string; description: string; fields?: unknown }>,
): string {
  return items
    .map((item) => {
      const fields = (item as { fields?: Array<{ key: string; label: string }> }).fields ?? [];
      const fieldList =
        fields.length > 0
          ? tr(" — pola: {v0}", { v0: fields.map((f) => `${f.key} (${f.label})`).join(", ") })
          : "";
      return `- ${item.key}: ${item.label}. ${item.description}${fieldList}`;
    })
    .join("\n");
}

function buildSystemPrompt(templates: Record<string, string[]>): string {
  const templateLines = Object.entries(templates)
    .map(
      ([kind, names]) =>
        `- ${kind}: ${names.length > 0 ? names.join(" | ") : tr("(brak szablonów)")}`,
    )
    .join("\n");

  return tr(
    'Jesteś projektantem automatyzacji marketingowych w PRM Core — systemie do komunikacji z pacjentami placówki medycznej.\n\nNa podstawie opisu użytkownika zaprojektuj scenariusz i zwróć go wywołaniem narzędzia build_automation. Zawsze wywołaj to narzędzie dokładnie raz.\n\nWYZWALACZE (trigger):\n{v0}\n\nWARUNKI (condition):\n{v1}\n\nAKCJE (action):\n{v2}\n\nDOSTĘPNE SZABLONY TREŚCI (pole "template" w akcjach wysyłki — używaj WYŁĄCZNIE tych nazw, dokładnie tak zapisanych):\n{templateLines}\n\nZasady:\n1. Używaj wyłącznie kluczy z powyższych list. Nie wymyślaj własnych.\n2. Akcje wysyłki (send_email, send_newsletter, send_sms, show_popup) wymagają pola config.template z nazwy powyżej. Jeśli dla danego kanału nie ma żadnego szablonu, nie używaj tej akcji.\n3. Scenariusz ma być realistyczny i możliwie prosty — zwykle 2–5 kroków. Nie dodawaj kroków, o które nikt nie prosił.\n4. Rozgałęzienia (condition, path, split, ai_agent) mogą mieć tylko jeden poziom zagnieżdżenia: w gałęziach umieszczaj wyłącznie akcje i opóźnienia.\n5. Który rodzaj rozgałęzienia wybrać:\n   - condition — jedno pytanie tak/nie (dwie gałęzie).\n   - path — kilka grup pacjentów rozróżnianych filtrami (np. wg segmentu, tagu, statusu). Odnogi są sprawdzane po kolei, kontakt schodzi pierwszą pasującą, więc ostatnia odnoga musi być bez filtrów jako „Pozostali”.\n   - split — test A/B: podział losowy wg procentów, bez żadnych warunków. Używaj TYLKO, gdy użytkownik prosi o test, porównanie wariantów albo losowy podział.\n   - ai_agent — tylko gdy decyzja naprawdę wymaga oceny kontekstu pacjenta i nie da się jej zapisać filtrem. Kosztuje realne pieniądze przy każdym kontakcie, więc gdy wystarczy filtr, użyj path lub condition.\n6. Nazwa automatyzacji: krótka, po polsku, bez cudzysłowów.\n7. W polu notes wypisz założenia i braki (np. „brak szablonu SMS — pominięto krok"), po polsku. Nie zmyślaj, że coś istnieje.',
    {
      v0: catalogLines(triggerCatalog),
      v1: catalogLines(conditionCatalog),
      v2: catalogLines(actionCatalog),
      templateLines: templateLines,
    },
  );
}

function buildTool(templates: Record<string, string[]>): AiToolDef {
  const triggerKeys = triggerCatalog.map((t) => t.key);
  const conditionKeys = conditionCatalog.map((c) => c.key);
  const actionKeys = actionCatalog.map((a) => a.key);
  const allTemplates = Object.values(templates).flat();

  // One level of nesting only: JSON Schema has no recursion here, and a draft
  // that a human then refines on the canvas does not need deeper trees.
  const leafStep = {
    type: "object",
    properties: {
      type: { type: "string", enum: ["action", "delay"] },
      actionKey: { type: "string", enum: actionKeys },
      config: {
        type: "object",
        description: tr('Pola akcji, np. {"template": "Nazwa szablonu", "tag": "vip"}.'),
        additionalProperties: { type: "string" },
      },
      amount: { type: "number", description: tr("Dla type=delay: ile jednostek czekać.") },
      unit: { type: "string", enum: ["minutes", "hours", "days"] },
    },
    required: ["type"],
  };

  return {
    name: "build_automation",
    description: tr(
      "Zwraca zaprojektowany scenariusz automatyzacji: wyzwalacz i listę kroków. Wywołaj dokładnie raz.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: tr("Krótka nazwa automatyzacji po polsku.") },
        summary: { type: "string", description: tr("Jedno zdanie: co ten scenariusz robi.") },
        trigger: {
          type: "object",
          properties: {
            key: { type: "string", enum: triggerKeys },
            config: { type: "object", additionalProperties: { type: "string" } },
          },
          required: ["key"],
        },
        steps: {
          type: "array",
          description: tr("Kroki w kolejności wykonania."),
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["action", "delay", "condition", "path", "split", "ai_agent"],
              },
              actionKey: { type: "string", enum: actionKeys },
              conditionKey: { type: "string", enum: conditionKeys },
              config: {
                type: "object",
                description:
                  allTemplates.length > 0
                    ? tr("Pola kroku. Nazwy szablonów: {v0}.", { v0: allTemplates.join(" | ") })
                    : tr("Pola kroku."),
                additionalProperties: { type: "string" },
              },
              amount: { type: "number" },
              unit: { type: "string", enum: ["minutes", "hours", "days"] },
              goal: {
                type: "string",
                description: tr(
                  "Dla type=ai_agent: cel decyzji agenta. Dla type=path/split: nazwa kroku.",
                ),
              },
              branches: {
                type: "array",
                description: tr(
                  "Dla type=path: odnogi w kolejności sprawdzania. Kontakt schodzi PIERWSZĄ, której filtr spełnia. Ostatnia powinna być bez filtrów („Pozostali”).",
                ),
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    match: {
                      type: "string",
                      enum: ["all", "any"],
                      description: tr("Czy kontakt musi spełnić wszystkie warunki, czy dowolny."),
                    },
                    filters: {
                      type: "array",
                      description: tr("Warunki filtra tej odnogi. Puste = odnoga „pozostali”."),
                      items: {
                        type: "object",
                        properties: {
                          key: { type: "string", enum: conditionKeys },
                          config: { type: "object", additionalProperties: { type: "string" } },
                        },
                        required: ["key"],
                      },
                    },
                    steps: { type: "array", items: leafStep },
                  },
                  required: ["label"],
                },
              },
              variants: {
                type: "array",
                description: tr(
                  "Dla type=split: warianty testu A/B. `weight` to procent kontaktów; wagi powinny sumować się do 100.",
                ),
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    weight: { type: "number" },
                    steps: { type: "array", items: leafStep },
                  },
                  required: ["label", "weight"],
                },
              },
              matched: {
                type: "array",
                items: leafStep,
                description: tr("Gałąź „warunek spełniony”."),
              },
              unmatched: {
                type: "array",
                items: leafStep,
                description: tr("Gałąź „warunek niespełniony”."),
              },
              paths: {
                type: "array",
                description: tr("Dla type=ai_agent: ścieżki do wyboru przez agenta."),
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    steps: { type: "array", items: leafStep },
                  },
                  required: ["label"],
                },
              },
            },
            required: ["type"],
          },
        },
        notes: {
          type: "array",
          items: { type: "string" },
          description: tr("Założenia i braki, po polsku."),
        },
      },
      required: ["name", "trigger", "steps"],
    },
  };
}

// ── compiler ────────────────────────────────────────────────────────────────

function stringConfig(input: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (typeof value === "string") out[key] = value;
    else if (typeof value === "number" || typeof value === "boolean") out[key] = String(value);
  }
  return out;
}

class GraphBuilder {
  nodes: AutomationNode[] = [];
  edges: AutomationGraph["edges"] = [];
  notes: string[] = [];

  add(node: AutomationNode): AutomationNode {
    this.nodes.push(node);
    return node;
  }

  connect(from: string, to: string, handle: string, label?: string) {
    this.edges.push({ id: nodeId("edge"), source: from, sourceHandle: handle, target: to, label });
  }

  /**
   * Appends a straight run of leaf steps and returns the last node, so the
   * caller can keep chaining. Unknown keys are dropped with a note rather than
   * silently producing a step the engine would skip at runtime.
   */
  chainLeaves(steps: StepInput[], from: string, x: number, y: number): { last: string; x: number } {
    let previous = from;
    let column = x;
    for (const step of steps) {
      const node = this.leafNode(step, column, y);
      if (!node) continue;
      this.add(node);
      this.connect(previous, node.id, "out");
      previous = node.id;
      column += COL;
    }
    return { last: previous, x: column };
  }

  /**
   * Wires every branch of a branching node. An empty branch gets an explicit
   * "Koniec Procesu": validateGraph rejects an unconnected output handle, so a
   * branch the model left empty would otherwise block activation.
   */
  wireBranches(
    sourceId: string,
    branches: Array<{ handle: string; label: string; steps: StepInput[] }>,
    x: number,
  ) {
    branches.forEach((branch, index) => {
      const y = ORIGIN.y + (index - (branches.length - 1) / 2) * ROW;
      const chained = this.chainLeaves(branch.steps, sourceId, x, y);
      if (chained.last === sourceId) {
        const end = this.add({
          id: nodeId("action"),
          kind: "action",
          key: "end_process",
          config: {},
          position: { x, y },
        });
        this.connect(sourceId, end.id, branch.handle, branch.label);
      } else {
        // chainLeaves wired the first branch node with "out" — rewrite that one
        // edge to the real branch handle. Earlier branches are already
        // rewritten, so this always finds the current one.
        const first = this.edges.find((e) => e.source === sourceId && e.sourceHandle === "out");
        if (first) {
          first.sourceHandle = branch.handle;
          first.label = branch.label;
        }
      }
    });
  }

  leafNode(step: StepInput, x: number, y: number): AutomationNode | null {
    if (step.type === "delay") {
      return {
        id: nodeId("delay"),
        kind: "delay",
        amount: typeof step.amount === "number" && step.amount > 0 ? step.amount : 1,
        unit: (["minutes", "hours", "days"] as DelayUnit[]).includes(step.unit as DelayUnit)
          ? (step.unit as DelayUnit)
          : "days",
        position: { x, y },
      };
    }
    const key = step.actionKey ?? "";
    if (!actionCatalog.some((a) => a.key === key)) {
      this.notes.push(tr("Pominięto nieznany krok „{v0}”.", { v0: key || step.type }));
      return null;
    }
    return {
      id: nodeId("action"),
      kind: "action",
      key,
      config: stringConfig(step.config),
      position: { x, y },
    };
  }
}

/** Turns the model's description into a real graph — ids, positions and handles are ours. */
export function compileFlow(input: {
  trigger?: { key?: string; config?: Record<string, unknown> };
  steps?: StepInput[];
}): { graph: AutomationGraph; notes: string[] } {
  const builder = new GraphBuilder();

  const triggerKey = input.trigger?.key ?? "";
  const trigger = builder.add({
    id: nodeId("trigger"),
    kind: "trigger",
    key: triggerCatalog.some((t) => t.key === triggerKey) ? triggerKey : "contact_created",
    config: stringConfig(input.trigger?.config),
    position: { ...ORIGIN },
  });
  if (!triggerCatalog.some((t) => t.key === triggerKey)) {
    builder.notes.push(
      tr(
        "Model podał nieznany wyzwalacz „{triggerKey}” — użyto „Nowy kontakt”. Zmień go w builderze.",
        { triggerKey: triggerKey },
      ),
    );
  }

  let previous = trigger.id;
  let x = ORIGIN.x + COL;

  const steps = input.steps ?? [];
  for (const [index, step] of steps.entries()) {
    // A branch ends the main line — everything after it lives inside one of the
    // branches. Say so instead of dropping steps quietly.
    const noteTail = () => {
      const dropped = steps.length - index - 1;
      if (dropped > 0) {
        builder.notes.push(
          tr(
            "Kroki po rozgałęzieniu ({dropped}) nie zostały wstawione — dodaj je w wybranej gałęzi w builderze.",
            { dropped: dropped },
          ),
        );
      }
    };

    if (step.type === "condition") {
      const key = step.conditionKey ?? "";
      const known = conditionCatalog.some((c) => c.key === key);
      if (!known) {
        builder.notes.push(tr("Pominięto nieznany warunek „{key}”.", { key: key }));
        continue;
      }
      const node = builder.add({
        id: nodeId("condition"),
        kind: "condition",
        key,
        config: stringConfig(step.config),
        position: { x, y: ORIGIN.y },
      });
      builder.connect(previous, node.id, "out");
      x += COL;

      builder.wireBranches(
        node.id,
        [
          { handle: "matched", label: tr("spełniony"), steps: step.matched ?? [] },
          { handle: "unmatched", label: tr("niespełniony"), steps: step.unmatched ?? [] },
        ],
        x,
      );
      noteTail();
      previous = "";
      break;
    }

    if (step.type === "path") {
      const branches = (step.branches ?? [])
        .filter((b) => b.label)
        .map((b) => ({
          id: makeBranchId(),
          label: b.label as string,
          match: b.match === "any" ? ("any" as const) : ("all" as const),
          // Only conditions the catalog actually knows survive — a filter on an
          // invented key would silently never match.
          filters: (b.filters ?? [])
            .filter((f) => conditionCatalog.some((c) => c.key === f.key))
            .map((f) => ({ key: f.key as string, config: stringConfig(f.config) })),
          steps: b.steps ?? [],
        }));
      if (branches.length < 2) {
        builder.notes.push(tr("Rozgałęzienie wymaga co najmniej dwóch odnóg — pominięto je."));
        continue;
      }
      // The contact takes the first branch whose filter passes, so the last one
      // must let everybody through — otherwise contacts matching nothing would
      // fall back onto a branch that was never meant for them.
      const last = branches[branches.length - 1];
      if (last.filters.length > 0) {
        branches.push({
          id: makeBranchId(),
          label: tr("Pozostali"),
          match: "all",
          filters: [],
          steps: [],
        });
        builder.notes.push(
          tr(
            "Dodano odnogę „Pozostali” bez filtra — bez niej kontakt niepasujący do żadnego filtra trafiłby na ostatnią odnogę wbrew jej warunkom.",
          ),
        );
      }

      const node = builder.add({
        id: nodeId("path"),
        kind: "path",
        config: { label: step.goal ?? tr("Rozgałęzienie") },
        branches: branches.map((b) => ({
          id: b.id,
          label: b.label,
          match: b.match,
          filters: b.filters,
        })),
        position: { x, y: ORIGIN.y },
      });
      builder.connect(previous, node.id, "out");
      x += COL;

      builder.wireBranches(
        node.id,
        branches.map((b) => ({ handle: b.id, label: b.label, steps: b.steps })),
        x,
      );
      noteTail();
      previous = "";
      break;
    }

    if (step.type === "split") {
      const variants = (step.variants ?? [])
        .filter((v) => v.label)
        .map((v) => ({
          id: makeBranchId(),
          label: v.label as string,
          weight: typeof v.weight === "number" && v.weight > 0 ? v.weight : 50,
          steps: v.steps ?? [],
        }));
      if (variants.length < 2) {
        builder.notes.push(tr("Split A/B wymaga co najmniej dwóch wariantów — pominięto go."));
        continue;
      }

      const node = builder.add({
        id: nodeId("split"),
        kind: "split",
        config: { label: step.goal ?? tr("Split A/B") },
        variants: variants.map((v) => ({ id: v.id, label: v.label, weight: v.weight })),
        position: { x, y: ORIGIN.y },
      });
      builder.connect(previous, node.id, "out");
      x += COL;

      builder.wireBranches(
        node.id,
        variants.map((v) => ({ handle: v.id, label: `${v.label} · ${v.weight}%`, steps: v.steps })),
        x,
      );
      noteTail();
      previous = "";
      break;
    }

    if (step.type === "ai_agent") {
      const paths = (step.paths ?? [])
        .filter((p) => p.label)
        .map((p) => ({ id: nodeId("path"), label: p.label as string, steps: p.steps ?? [] }));
      if (paths.length < 2) {
        builder.notes.push(tr("Węzeł Agent AI wymaga co najmniej dwóch ścieżek — pominięto go."));
        continue;
      }
      const node = builder.add({
        id: nodeId("aiAgent"),
        kind: "aiAgent",
        goal: step.goal ?? "",
        paths: paths.map((p) => ({ id: p.id, label: p.label })),
        position: { x, y: ORIGIN.y },
      });
      builder.connect(previous, node.id, "out");
      x += COL;

      builder.wireBranches(
        node.id,
        paths.map((p) => ({ handle: p.id, label: p.label, steps: p.steps })),
        x,
      );
      noteTail();
      previous = "";
      break;
    }

    const node = builder.leafNode(step, x, ORIGIN.y);
    if (!node) continue;
    builder.add(node);
    builder.connect(previous, node.id, "out");
    previous = node.id;
    x += COL;
  }

  return { graph: { nodes: builder.nodes, edges: builder.edges }, notes: builder.notes };
}

// ── entry point ─────────────────────────────────────────────────────────────

/**
 * One model call, one tool result, no retries: this is a draft the user edits
 * on the canvas anyway, and a generator that silently costs three calls per
 * click is not what anyone asked for.
 */
export async function generateFlow(input: {
  prompt: string;
  templates: Record<string, string[]>;
}): Promise<FlowGenerationResult> {
  const config = await getAiConfig();

  if (!(await getKeyStatus())[config.providerId]) {
    return {
      ok: false,
      error: tr(
        "Brak klucza API dostawcy {providerId} — uzupełnij go w Integracje → Klucze i dane dostępowe.",
        { providerId: config.providerId },
      ),
    };
  }

  const limit = await isOverDailyLimit();
  if (limit.over) {
    return {
      ok: false,
      error: tr(
        "Dzienny limit kosztów AI wyczerpany ({v0} / {v1} USD). Podnieś go w Ustawieniach → PRM_Agent.",
        { v0: limit.spent.toFixed(2), v1: limit.limit.toFixed(2) },
      ),
    };
  }

  try {
    const completion = await config.provider.complete({
      model: config.model,
      system: buildSystemPrompt(input.templates),
      messages: [{ role: "user", text: input.prompt }],
      tools: [buildTool(input.templates)],
      maxTokens: MAX_TOKENS,
    });

    const costUsd = priceCall(config.providerId, config.model, completion.usage);
    const usage = {
      tokensIn: completion.usage.inputTokens,
      tokensOut: completion.usage.outputTokens,
      costUsd,
    };

    // Logged as kind "ai" so this call counts towards the same daily ceiling as
    // the agent node — spending is spending, whoever triggered it.
    await logStep({
      kind: "ai",
      message: tr("Generator scenariuszy: „{v0}”.", { v0: input.prompt.slice(0, 80) }),
      detail: { feature: "flow-builder" },
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costUsd,
    });

    const call = completion.toolCalls.find((c) => c.name === "build_automation");
    if (!call) {
      return {
        ok: false,
        error: completion.text
          ? tr("Model nie zwrócił scenariusza. Odpowiedział: {v0}", {
              v0: completion.text.slice(0, 300),
            })
          : tr("Model nie zwrócił scenariusza. Spróbuj opisać cel bardziej konkretnie."),
        ...usage,
      };
    }

    const payload = call.input as {
      name?: string;
      summary?: string;
      notes?: string[];
      trigger?: { key?: string; config?: Record<string, unknown> };
      steps?: StepInput[];
    };
    const { graph, notes } = compileFlow(payload);

    if (graph.nodes.filter((n) => n.kind === "action").length === 0) {
      return {
        ok: false,
        error: tr(
          "Model nie zaproponował żadnej wykonalnej akcji — doprecyzuj, co ma się wydarzyć.",
        ),
        ...usage,
      };
    }

    return {
      ok: true,
      graph,
      name: (payload.name ?? "").trim() || tr("Automatyzacja z opisu"),
      summary: payload.summary,
      notes: [...(payload.notes ?? []), ...notes],
      ...usage,
    };
  } catch (err) {
    return { ok: false, error: tr("Wywołanie modelu nie powiodło się: {v0}", { v0: String(err) }) };
  }
}
