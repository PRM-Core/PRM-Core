import { createContext, useContext } from "react";
import type { AutomationEdge } from "@/lib/automation-flow";
import type { NodeStats } from "@/lib/api/engine.functions";
import { t } from "@/lib/i18n";

export interface CanvasContextValue {
  edges: AutomationEdge[];
  /** Real per-node run counts from the engine; empty until the first fetch lands. */
  contactCounts: Record<string, NodeStats>;
  /** True while the counts are still loading, so nodes can say so instead of showing a bare 0. */
  countsLoading: boolean;
  showContacts: boolean;
  /**
   * Locked canvas: the scenario can be read and inspected, but not changed.
   * True while the builder is out of edit mode — and always while the
   * automation is active, because editing a live graph fails the runs of
   * patients standing on the steps being changed.
   */
  readOnly: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAddFromHandle: (id: string, handle: string) => void;
}

export const CanvasContext = createContext<CanvasContextValue | null>(null);

export function useCanvasContext(): CanvasContextValue {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error(t("useCanvasContext must be used within CanvasContext.Provider"));
  return ctx;
}
