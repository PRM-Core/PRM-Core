import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  applyNodeChanges,
  applyEdgeChanges,
  reconnectEdge,
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type OnConnect,
  type OnReconnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Minus, Plus, Maximize2, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { AddNodeDialog } from "@/components/automation/AddNodeDialog";
import { AddTriggerDialog } from "@/components/automation/AddTriggerDialog";
import { NodeInspector } from "@/components/automation/NodeInspector";
import { AutomationNodeRenderer } from "@/components/automation/nodes/AutomationNodeRenderer";
import { DeletableEdge } from "@/components/automation/nodes/DeletableEdge";
import { CanvasContext } from "@/components/automation/nodes/canvas-context";
import {
  nodeId,
  outputHandles,
  type AutomationGraph,
  type AutomationNode,
  type AutomationEdge,
} from "@/lib/automation-flow";
import { getNodeStats, type NodeStats } from "@/lib/api/engine.functions";
import type { AutomationRecord } from "@/lib/automation-records";
import { t } from "@/lib/i18n";

const nodeTypes = { automation: AutomationNodeRenderer };
const edgeTypes = { deletable: DeletableEdge };

// Fixed starting pan/zoom for the canvas — same for every automation no
// matter how many nodes it has (vs. ReactFlow's `fitView`, which zoomed to
// fit all nodes and so looked different for 1 node vs. 10). The trigger
// always starts at x:40 (see AddTriggerDialog usage below), so this keeps
// it comfortably inset from the top-left corner.
const DEFAULT_VIEWPORT = { x: 80, y: 120, zoom: 0.85 };

function graphToRFNodes(graph: AutomationGraph): Node[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    type: "automation",
    position: n.position,
    data: { node: n },
  }));
}

function graphToRFEdges(
  graph: AutomationGraph,
  /** Undefined on a locked canvas — the edge then renders without its cut button. */
  onDelete: ((id: string) => void) | undefined,
): Edge[] {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    label: e.label,
    type: "deletable",
    data: { onDelete },
  }));
}

function rfToGraph(nodes: Node[], edges: Edge[]): AutomationGraph {
  return {
    nodes: nodes.map((n) => ({
      ...(n.data as { node: AutomationNode }).node,
      position: n.position,
    })),
    edges: edges.map(
      (e): AutomationEdge => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        label: typeof e.label === "string" ? e.label : undefined,
      }),
    ),
  };
}

export function AutomationBuilder({
  record,
  onChangeFlow,
  readOnly = false,
}: {
  record: AutomationRecord;
  onChangeFlow: (flow: AutomationGraph | null) => void;
  /** Locked canvas — see CanvasContextValue.readOnly. */
  readOnly?: boolean;
}) {
  return (
    <ReactFlowProvider>
      <AutomationCanvas record={record} onChangeFlow={onChangeFlow} readOnly={readOnly} />
    </ReactFlowProvider>
  );
}

function AutomationCanvas({
  record,
  onChangeFlow,
  readOnly,
}: {
  record: AutomationRecord;
  onChangeFlow: (flow: AutomationGraph | null) => void;
  readOnly: boolean;
}) {
  const { zoomIn, zoomOut, fitView, setViewport } = useReactFlow();

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addTarget, setAddTarget] = useState<{
    source: string;
    handle: string;
    position: { x: number; y: number };
  } | null>(null);
  const [triggerDialogOpen, setTriggerDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showContacts, setShowContacts] = useState(false);
  const [nodeStats, setNodeStats] = useState<Record<string, NodeStats>>({});
  const [statsLoading, setStatsLoading] = useState(false);

  // Only polled while the overlay is on — the counts are a diagnostic view,
  // not something worth querying on every canvas that happens to be open.
  useEffect(() => {
    if (!showContacts) return;
    let cancelled = false;

    const refresh = () => {
      getNodeStats({ data: { automationId: record.id } })
        .then((stats) => {
          if (cancelled) return;
          setNodeStats(stats);
          setStatsLoading(false);
        })
        .catch(() => {
          if (!cancelled) setStatsLoading(false);
        });
    };

    setStatsLoading(true);
    refresh();
    const id = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [showContacts, record.id]);

  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const handleEdgeDelete = useCallback(
    (edgeId: string) => {
      setEdges((eds) => {
        const next = eds.filter((e) => e.id !== edgeId);
        onChangeFlow(rfToGraph(nodesRef.current, next));
        return next;
      });
    },
    [onChangeFlow],
  );

  // (Re)load the canvas whenever the user switches to a different automation. Deliberately
  // NOT keyed on record.flow itself — every local edit calls onChangeFlow, which changes
  // that reference, and re-syncing from it here would stomp in-progress drag/edit state.
  useEffect(() => {
    if (record.flow) {
      setNodes(graphToRFNodes(record.flow));
      setEdges(graphToRFEdges(record.flow, readOnly ? undefined : handleEdgeDelete));
    } else {
      setNodes([]);
      setEdges([]);
    }
    setSelectedId(null);
    // Same starting pan/zoom every time, regardless of how many nodes this
    // automation has — otherwise ReactFlow's mount-time `fitView` zoomed
    // differently per record (way in for 1-2 nodes, way out for 10+).
    setViewport(DEFAULT_VIEWPORT);
    // `readOnly` is in here so entering or leaving edit mode rebuilds the edges:
    // their delete button is baked into edge data at build time, and without
    // this it would linger on a locked canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id, readOnly]);

  const onNodesChangeHandler = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onNodeDragStop = useCallback(
    (_e: unknown, _node: Node, allNodes: Node[]) => {
      onChangeFlow(rfToGraph(allNodes, edgesRef.current));
    },
    [onChangeFlow],
  );

  const onEdgesChangeHandler = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);
        if (changes.some((c) => c.type === "remove")) {
          onChangeFlow(rfToGraph(nodesRef.current, next));
        }
        return next;
      });
    },
    [onChangeFlow],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const filtered = eds.filter(
          (e) => !(e.source === connection.source && e.sourceHandle === connection.sourceHandle),
        );
        const newEdge: Edge = {
          id: nodeId("edge"),
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle ?? undefined,
          type: "deletable",
          data: { onDelete: handleEdgeDelete },
        };
        const next = [...filtered, newEdge];
        onChangeFlow(rfToGraph(nodesRef.current, next));
        return next;
      });
    },
    [onChangeFlow, handleEdgeDelete],
  );

  const onReconnect: OnReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      setEdges((eds) => {
        const next = reconnectEdge(oldEdge, newConnection, eds);
        onChangeFlow(rfToGraph(nodesRef.current, next));
        return next;
      });
    },
    [onChangeFlow],
  );

  const handleEditNode = useCallback((id: string) => setSelectedId(id), []);
  const handleDeleteRequest = useCallback((id: string) => setDeleteTargetId(id), []);

  const handleAddFromHandle = useCallback((sourceId: string, handle: string) => {
    const sourceNode = nodesRef.current.find((n) => n.id === sourceId);
    if (!sourceNode) return;
    const automationNode = (sourceNode.data as { node: AutomationNode }).node;
    const handles = outputHandles(automationNode);
    const idx = handles.indexOf(handle);
    const offsetY = handles.length > 1 ? (idx - (handles.length - 1) / 2) * 160 : 0;
    setAddTarget({
      source: sourceId,
      handle,
      position: { x: sourceNode.position.x + 280, y: sourceNode.position.y + offsetY },
    });
  }, []);

  const selectedNode = selectedId
    ? ((nodes.find((n) => n.id === selectedId)?.data as { node: AutomationNode } | undefined)
        ?.node ?? null)
    : null;

  const handleSaveNode = useCallback(
    (updated: AutomationNode) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === updated.id ? { ...n, data: { node: updated } } : n)),
      );
      setEdges((eds) => {
        let next = eds;
        if (updated.kind === "aiAgent") {
          const validHandles = new Set((updated.paths ?? []).map((p) => p.id));
          next = eds
            .filter((e) => e.source !== updated.id || validHandles.has(e.sourceHandle ?? ""))
            .map((e) =>
              e.source === updated.id
                ? { ...e, label: updated.paths?.find((p) => p.id === e.sourceHandle)?.label }
                : e,
            );
        }
        const nextNodes = nodesRef.current.map((n) =>
          n.id === updated.id ? { ...n, data: { node: updated } } : n,
        );
        onChangeFlow(rfToGraph(nextNodes, next));
        return next;
      });
    },
    [onChangeFlow],
  );

  const confirmDelete = () => {
    if (!deleteTargetId) return;
    const nextNodes = nodesRef.current.filter((n) => n.id !== deleteTargetId);
    const nextEdges = edgesRef.current.filter(
      (e) => e.source !== deleteTargetId && e.target !== deleteTargetId,
    );
    setNodes(nextNodes);
    setEdges(nextEdges);
    onChangeFlow(nextNodes.length ? rfToGraph(nextNodes, nextEdges) : null);
    if (selectedId === deleteTargetId) setSelectedId(null);
    setDeleteTargetId(null);
  };

  const graphEdges = edges.map(
    (e): AutomationEdge => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      label: typeof e.label === "string" ? e.label : undefined,
    }),
  );
  const canvasContextValue = {
    edges: graphEdges,
    contactCounts: nodeStats,
    countsLoading: statsLoading,
    showContacts,
    readOnly,
    onEdit: handleEditNode,
    onDelete: handleDeleteRequest,
    onAddFromHandle: handleAddFromHandle,
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 flex-wrap">
        <div className="flex items-center rounded-md border border-border bg-card">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-none"
            onClick={() => zoomOut()}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-none"
            onClick={() => zoomIn()}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-none border-l border-border"
            onClick={() => fitView({ padding: 0.2 })}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <label className="flex items-center gap-1.5 pl-1 cursor-pointer select-none">
          <Checkbox checked={showContacts} onCheckedChange={(v) => setShowContacts(!!v)} />
          <Label className="text-xs font-medium cursor-pointer">
            {t("Pokaż kontakty w procesie")}
          </Label>
        </label>

        <p className="ml-auto text-xs text-muted-foreground">
          {readOnly
            ? t(
                "Podgląd — kliknij krok, aby zobaczyć jego ustawienia. Aby zmieniać scenariusz, włącz tryb edycji.",
              )
            : nodes.length
              ? t(
                  "Przeciągnij krok, aby zmienić jego położenie, albo kliknij, aby go skonfigurować.",
                )
              : t("Zacznij od dodania wyzwalacza.")}
        </p>
      </div>

      <div className="relative" style={{ height: 640 }}>
        {nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center bg-muted/10">
            <div className="h-14 w-14 rounded-2xl bg-primary-soft flex items-center justify-center text-primary">
              <Workflow className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-medium">{t("Ta automatyzacja jest jeszcze pusta")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("Każdy scenariusz zaczyna się od wyzwalacza.")}
              </p>
            </div>
            {!readOnly && (
              <Button className="gap-1.5" onClick={() => setTriggerDialogOpen(true)}>
                <Plus className="h-4 w-4" /> {t(" Dodaj Trigger")}
              </Button>
            )}
          </div>
        ) : (
          <CanvasContext.Provider value={canvasContextValue}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={readOnly ? undefined : onNodesChangeHandler}
              onEdgesChange={readOnly ? undefined : onEdgesChangeHandler}
              onNodeDragStop={readOnly ? undefined : onNodeDragStop}
              onConnect={readOnly ? undefined : onConnect}
              onReconnect={readOnly ? undefined : onReconnect}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              edgesReconnectable={!readOnly}
              defaultViewport={DEFAULT_VIEWPORT}
              minZoom={0.3}
              maxZoom={1.5}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={18}
                size={1}
                color="oklch(0.85 0.02 240)"
              />
            </ReactFlow>
          </CanvasContext.Provider>
        )}
      </div>

      <NodeInspector
        node={selectedNode}
        readOnly={readOnly}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onSave={handleSaveNode}
      />

      <AddNodeDialog
        open={!!addTarget}
        onOpenChange={(open) => !open && setAddTarget(null)}
        position={addTarget?.position ?? { x: 0, y: 0 }}
        onSelect={(newNode) => {
          if (!addTarget) return;
          const newRFNode: Node = {
            id: newNode.id,
            type: "automation",
            position: newNode.position,
            data: { node: newNode },
          };
          const nextNodes = [...nodesRef.current, newRFNode];
          const filteredEdges = edgesRef.current.filter(
            (e) => !(e.source === addTarget.source && e.sourceHandle === addTarget.handle),
          );
          const newEdge: Edge = {
            id: nodeId("edge"),
            source: addTarget.source,
            target: newNode.id,
            sourceHandle: addTarget.handle,
            type: "deletable",
            data: { onDelete: handleEdgeDelete },
          };
          const nextEdges = [...filteredEdges, newEdge];
          setNodes(nextNodes);
          setEdges(nextEdges);
          onChangeFlow(rfToGraph(nextNodes, nextEdges));
          setAddTarget(null);
        }}
      />

      <AddTriggerDialog
        open={triggerDialogOpen}
        onOpenChange={setTriggerDialogOpen}
        position={{ x: 40, y: 240 }}
        onSelect={(triggerNode) => {
          const newRFNode: Node = {
            id: triggerNode.id,
            type: "automation",
            position: triggerNode.position,
            data: { node: triggerNode },
          };
          setNodes([newRFNode]);
          setEdges([]);
          onChangeFlow(rfToGraph([newRFNode], []));
        }}
      />

      <AlertDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Usunąć ten krok?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Krok zostanie usunięty razem z połączeniami, które do niego prowadzą i z niego wychodzą. Sąsiednie kroki pozostaną na płótnie — będzie można je połączyć ponownie.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Anuluj")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{t("Usuń")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
