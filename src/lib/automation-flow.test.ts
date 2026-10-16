/** The graph rules the editor enforces before an automation can be switched on — the wait step's. */
import { describe, expect, test } from "bun:test";
import { outputHandles, validateGraph, type AutomationGraph } from "./automation-flow";

const graph = (
  wait: Partial<AutomationGraph["nodes"][number]>,
  edges: AutomationGraph["edges"],
): AutomationGraph => ({
  nodes: [
    { id: "t1", kind: "trigger", position: { x: 0, y: 0 }, key: "visit_scheduled" },
    { id: "w1", kind: "wait", position: { x: 0, y: 0 }, amount: 2, unit: "days", ...wait },
    { id: "a1", kind: "action", position: { x: 0, y: 0 }, key: "send_sms" },
    { id: "a2", kind: "action", position: { x: 0, y: 0 }, key: "change_tags" },
  ],
  edges,
});

const both: AutomationGraph["edges"] = [
  { id: "e1", source: "t1", target: "w1", sourceHandle: "out" },
  { id: "e2", source: "w1", target: "a1", sourceHandle: "event" },
  { id: "e3", source: "w1", target: "a2", sourceHandle: "timeout" },
];

describe("a wait step", () => {
  test("has two ways out: the event, and the time running out", () => {
    expect(outputHandles({ id: "w", kind: "wait", position: { x: 0, y: 0 } })).toEqual([
      "event",
      "timeout",
    ]);
  });

  test("with an event and both ways connected, the automation is valid", () => {
    expect(validateGraph(graph({ key: "chat_message" }, both))).toEqual({
      valid: true,
      errors: [],
    });
  });

  test("without an event to wait for, it is not", () => {
    const r = validateGraph(graph({}, both));
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toContain("Czekaj na zdarzenie");
  });

  test("with the “time ran out” path left open, it is not — nothing may strand a patient", () => {
    const r = validateGraph(graph({ key: "chat_message" }, both.slice(0, 2)));
    expect(r.valid).toBe(false);
  });
});

describe("an e-mail-then-SMS step", () => {
  const flow = (config: Record<string, string>): AutomationGraph => ({
    nodes: [
      { id: "t1", kind: "trigger", position: { x: 0, y: 0 }, key: "visit_scheduled" },
      { id: "f1", kind: "fallback", position: { x: 0, y: 0 }, amount: 24, unit: "hours", config },
    ],
    edges: [{ id: "e1", source: "t1", target: "f1", sourceHandle: "out" }],
  });

  test("needs both templates", () => {
    expect(validateGraph(flow({ emailTemplate: "A" })).errors.join(" ")).toContain("obu szablonów");
  });

  test("with both, it is a complete step — a message, so the automation is valid", () => {
    // It sends, so it counts as the automation's action, and its way out may end the path.
    expect(validateGraph(flow({ emailTemplate: "A", smsTemplate: "B" }))).toEqual({
      valid: true,
      errors: [],
    });
  });
});
