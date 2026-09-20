import {
  nodeId,
  type AutomationGraph,
  type AutomationStatus,
  type AutomationNode,
  type AutomationEdge,
} from "@/lib/automation-flow";
import { t } from "@/lib/i18n";

export interface AutomationRecord {
  id: string;
  name: string;
  status: AutomationStatus;
  flow: AutomationGraph | null;
}

export function createInitialRecords(): AutomationRecord[] {
  return [
    {
      id: "auto1",
      name: "Powitanie nowego leada",
      status: "active",
      flow: simpleGraph("segment_joined", "send_email", { template: "Powitanie pacjenta" }),
    },
    {
      id: "auto2",
      name: "Przypomnienie o wizycie 24h",
      status: "active",
      flow: seedGraph(),
    },
    {
      id: "auto3",
      name: "Win-back nieaktywnych",
      status: "active",
      flow: simpleGraph("points_changed", "send_sms", {
        template: "Przypomnienie o wizycie (SMS)",
      }),
    },
    {
      id: "auto4",
      name: "Onboarding kardiologia",
      status: "inactive",
      flow: simpleGraph("tag_added", "send_email", { template: t("Materiały edukacyjne") }),
    },
    {
      id: "auto5",
      name: "Ankieta satysfakcji NPS",
      status: "active",
      flow: simpleGraph("visit_scheduled", "send_email", { template: "Ankieta NPS" }),
    },
  ];
}

export function newDraftRecord(name = ""): AutomationRecord {
  return { id: nodeId("auto"), name, status: "draft", flow: null };
}

const COL = 260;

/** Minimal valid graph: trigger -> action. */
export function simpleGraph(
  triggerKey: string,
  actionKey: string,
  actionConfig: Record<string, string> = {},
): AutomationGraph {
  const trigger: AutomationNode = {
    id: nodeId("trigger"),
    kind: "trigger",
    key: triggerKey,
    config: {},
    position: { x: 40, y: 120 },
  };
  const action: AutomationNode = {
    id: nodeId("action"),
    kind: "action",
    key: actionKey,
    config: actionConfig,
    position: { x: 40 + COL, y: 120 },
  };
  const edge: AutomationEdge = {
    id: nodeId("edge"),
    source: trigger.id,
    target: action.id,
    sourceHandle: "out",
  };
  return { nodes: [trigger, action], edges: [edge] };
}

export function seedGraph(): AutomationGraph {
  const trigger: AutomationNode = {
    id: nodeId("trigger"),
    kind: "trigger",
    key: "visit_scheduled",
    config: { specialization: "Kardiologia" },
    position: { x: 40, y: 220 },
  };
  const delay: AutomationNode = {
    id: nodeId("delay"),
    kind: "delay",
    amount: 1,
    unit: "days",
    position: { x: 40 + COL, y: 220 },
  };
  const pathHighRisk = { id: nodeId("path"), label: t("Wysokie ryzyko nieobecności") };
  const pathStandard = { id: nodeId("path"), label: t("Standardowe przypomnienie") };
  const pathActive = { id: nodeId("path"), label: t("Aktywny w aplikacji") };
  const aiAgent: AutomationNode = {
    id: nodeId("aiAgent"),
    kind: "aiAgent",
    goal: t(
      "Oceń prawdopodobieństwo stawienia się pacjenta na wizytę i automatycznie dobierz najskuteczniejszy kanał przypomnienia.",
    ),
    paths: [pathHighRisk, pathStandard, pathActive],
    position: { x: 40 + COL * 2, y: 220 },
  };
  const actionSms: AutomationNode = {
    id: nodeId("action"),
    kind: "action",
    key: "send_sms",
    config: { template: "Przypomnienie o wizycie (SMS)" },
    position: { x: 40 + COL * 3, y: 40 },
  };
  const actionEmail: AutomationNode = {
    id: nodeId("action"),
    kind: "action",
    key: "send_email",
    config: {
      template: "Przypomnienie o wizycie",
      subject: t("Przypomnienie o jutrzejszej wizycie"),
    },
    position: { x: 40 + COL * 3, y: 220 },
  };
  const actionPush: AutomationNode = {
    id: nodeId("action"),
    kind: "action",
    key: "send_push",
    config: { content: t("Twoja wizyta jest jutro o 10:00 — do zobaczenia!") },
    position: { x: 40 + COL * 3, y: 400 },
  };

  return {
    nodes: [trigger, delay, aiAgent, actionSms, actionEmail, actionPush],
    edges: [
      { id: nodeId("edge"), source: trigger.id, target: delay.id, sourceHandle: "out" },
      { id: nodeId("edge"), source: delay.id, target: aiAgent.id, sourceHandle: "out" },
      {
        id: nodeId("edge"),
        source: aiAgent.id,
        target: actionSms.id,
        sourceHandle: pathHighRisk.id,
        label: pathHighRisk.label,
      },
      {
        id: nodeId("edge"),
        source: aiAgent.id,
        target: actionEmail.id,
        sourceHandle: pathStandard.id,
        label: pathStandard.label,
      },
      {
        id: nodeId("edge"),
        source: aiAgent.id,
        target: actionPush.id,
        sourceHandle: pathActive.id,
        label: pathActive.label,
      },
    ],
  };
}

/**
 * Mock "AI generation": rule-based read of the prompt's keywords, always producing a
 * valid trigger -> delay -> AI-agent router -> actions graph so the result is guaranteed
 * to pass validateGraph and land directly on the visual canvas.
 */
