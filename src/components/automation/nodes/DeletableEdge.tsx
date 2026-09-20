import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { t } from "@/lib/i18n";

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
  });

  const onDelete = (data as { onDelete?: (id: string) => void } | undefined)?.onDelete;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan flex items-center gap-1"
        >
          {label ? (
            <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-background/95 px-1.5 py-0.5 rounded-full border border-border whitespace-nowrap">
              {label}
            </span>
          ) : null}
          {/* Absent handler means a locked canvas — the label still shows, but
              the connection cannot be cut. */}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(id)}
              className="h-4 w-4 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/40 shadow-sm cursor-pointer"
              title={t("Usuń połączenie")}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
