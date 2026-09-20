import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Clock,
  GitBranch,
  Bot,
  Users,
  Split,
  Shuffle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { findCatalogItem, nodeTitle } from "@/lib/automation-catalog";
import { outputHandles, type AutomationNode } from "@/lib/automation-flow";
import { useCanvasContext } from "./canvas-context";
import { intlLocale, t } from "@/lib/i18n";

/**
 * Polish plural for "kontakt": 1 kontakt, 2–4 kontakty, 5+ kontaktów — with the
 * usual carve-out that the teens (12–14) take the genitive, not the "kontakty"
 * form their last digit would suggest.
 */
function passedLabel(count: number): string {
  if (count === 1) return "kontakt";
  const lastTwo = count % 100;
  const last = count % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return "kontakty";
  return t("kontaktów");
}

function summarize(config?: Record<string, string>): string | undefined {
  if (!config) return undefined;
  return Object.values(config).find((v) => v && v.trim().length > 0);
}

function nodeVisual(node: AutomationNode) {
  if (node.kind === "trigger") {
    const item = findCatalogItem("trigger", node.key ?? "");
    return {
      icon: item?.icon ?? Clock,
      kind: "Trigger",
      title: nodeTitle(node),
      tone: item?.tone ?? "bg-teal-100 text-teal-700",
      summary: summarize(node.config),
    };
  }
  if (node.kind === "delay") {
    return {
      icon: Clock,
      kind: t("Opóźnienie"),
      title: nodeTitle(node),
      tone: "bg-amber-100 text-amber-700",
      summary: undefined,
    };
  }
  if (node.kind === "condition") {
    const item = findCatalogItem("condition", node.key ?? "");
    return {
      icon: item?.icon ?? GitBranch,
      kind: "Warunek",
      title: nodeTitle(node),
      tone: item?.tone ?? "bg-violet-100 text-violet-700",
      summary: summarize(node.config),
    };
  }
  if (node.kind === "aiAgent") {
    return {
      icon: Bot,
      kind: "Agent AI",
      // The canvas has room to prompt for an unset goal; the shared title doesn't.
      title: node.goal || t("Inteligentny router — skonfiguruj cel"),
      tone: "bg-fuchsia-100 text-fuchsia-700",
      summary: undefined,
    };
  }
  if (node.kind === "path") {
    const branches = node.branches ?? [];
    const filtered = branches.filter((b) => (b.filters?.length ?? 0) > 0).length;
    return {
      icon: Split,
      kind: t("Rozgałęzienie"),
      title: nodeTitle(node),
      tone: "bg-teal-100 text-teal-700",
      summary: t("{length} {v1} · {filtered} z filtrem", {
        length: branches.length,
        v1: branches.length === 1 ? "odnoga" : "odnogi",
        filtered: filtered,
      }),
    };
  }
  if (node.kind === "split") {
    const variants = node.variants ?? [];
    return {
      icon: Shuffle,
      kind: "Split A/B",
      title: nodeTitle(node),
      tone: "bg-indigo-100 text-indigo-700",
      summary: variants.map((v) => `${v.label} ${v.weight}%`).join(" · "),
    };
  }
  const item = findCatalogItem("action", node.key ?? "");
  const summary =
    node.key === "change_stage"
      ? [node.config?.funnelName, node.config?.stageName].filter(Boolean).join(" → ") || undefined
      : summarize(node.config);
  return {
    icon: item?.icon ?? GitBranch,
    kind: "Akcja",
    title: nodeTitle(node),
    tone: item?.tone ?? "bg-orange-100 text-orange-700",
    summary,
  };
}

function branchLabel(node: AutomationNode, handle: string): string {
  if (node.kind === "condition")
    return handle === "matched" ? t("Jeśli pasuje") : t("Jeśli nie pasuje");
  if (node.kind === "aiAgent") return node.paths?.find((p) => p.id === handle)?.label ?? handle;
  if (node.kind === "path") return node.branches?.find((b) => b.id === handle)?.label ?? handle;
  if (node.kind === "split") {
    const variant = node.variants?.find((v) => v.id === handle);
    return variant ? `${variant.label} · ${variant.weight}%` : handle;
  }
  return "";
}

export function AutomationNodeRenderer({ id, data }: NodeProps) {
  const {
    edges,
    contactCounts,
    countsLoading,
    showContacts,
    readOnly,
    onEdit,
    onDelete,
    onAddFromHandle,
  } = useCanvasContext();
  const node = (data as { node: AutomationNode }).node;
  const visual = nodeVisual(node);
  const Icon = visual.icon;
  const handles = outputHandles(node);
  const isBranching =
    node.kind === "condition" ||
    node.kind === "aiAgent" ||
    node.kind === "path" ||
    node.kind === "split";
  const deletable = node.kind !== "trigger";
  const connectedHandles = edges.filter((e) => e.source === id).map((e) => e.sourceHandle ?? "out");
  const stats = contactCounts[id];

  return (
    <div className="group relative w-[220px] rounded-xl bg-card border border-border shadow-sm hover:border-primary/40 hover:shadow-md transition-all">
      {node.kind !== "trigger" && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !bg-muted-foreground/50 !border-background"
        />
      )}

      <button type="button" onClick={() => onEdit(id)} className="w-full text-left cursor-pointer">
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <div
            className={cn(
              "h-7 w-7 rounded-md flex items-center justify-center shrink-0",
              visual.tone,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-xs font-semibold text-foreground truncate">{visual.kind}</span>
        </div>
        <div className="h-px bg-border/70 mx-3" />
        <div className="px-3 py-2.5">
          <div className="text-xs text-foreground/90 leading-snug line-clamp-2">{visual.title}</div>
          {visual.summary && (
            <div className="mt-1.5 rounded-md bg-muted/60 border border-border px-2 py-1 text-[11px] text-muted-foreground truncate">
              {visual.summary}
            </div>
          )}
          {showContacts && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {countsLoading && !stats ? (
                <span className="text-[10px] text-muted-foreground">{t("Liczę…")}</span>
              ) : (
                <>
                  <div className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary">
                    <Users className="h-3 w-3" />
                    {(stats?.passed ?? 0).toLocaleString(intlLocale())}{" "}
                    {passedLabel(stats?.passed ?? 0)}
                  </div>
                  {/* Only shown when someone is genuinely parked here — a "0 teraz"
                      chip on every node would be noise on a finished automation. */}
                  {(stats?.current ?? 0) > 0 && (
                    <div className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-medium text-warning-foreground">
                      <Clock className="h-3 w-3" /> {stats!.current} {t(" teraz tutaj")}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </button>

      {/* No per-node menu on a locked canvas — "Edytuj" and "Usuń krok" both
          mutate the graph, and the node body stays clickable for inspection. */}
      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity nodrag"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(id)} className="gap-2">
              <Pencil className="h-3.5 w-3.5" /> {t(" Edytuj")}
            </DropdownMenuItem>
            {deletable && (
              <DropdownMenuItem
                onClick={() => onDelete(id)}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> {t(" Usuń krok")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {isBranching ? (
        <div className="border-t border-border/70 divide-y divide-border/70">
          {handles.map((h) => {
            const connected = connectedHandles.includes(h);
            return (
              <div key={h} className="relative flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-[10px] font-medium text-muted-foreground truncate">
                  {branchLabel(node, h)}
                </span>
                {!connected && !readOnly && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-5 w-5 shrink-0 nodrag"
                    onClick={() => onAddFromHandle(id, h)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                )}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={h}
                  className="!h-2.5 !w-2.5 !bg-primary/60 !border-background"
                />
              </div>
            );
          })}
        </div>
      ) : handles.length > 0 ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="out"
            className="!h-2.5 !w-2.5 !bg-primary/60 !border-background"
          />
          {!connectedHandles.includes("out") && !readOnly && (
            <Button
              variant="outline"
              size="icon"
              className="absolute top-1/2 -right-4 -translate-y-1/2 h-6 w-6 rounded-full bg-card shadow-sm nodrag"
              onClick={() => onAddFromHandle(id, "out")}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </>
      ) : null}
    </div>
  );
}
