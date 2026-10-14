import { describe, expect, test } from "bun:test";
import { actorOf, listReason } from "./explain";

const DAY = 86_400_000;
const LAST = Date.parse("2025-09-01T10:00:00Z");

describe("listReason", () => {
  test("every list says why, with the date that matters", () => {
    expect(listReason("recall_due", { lastVisitAt: LAST, nextVisitAt: null })).toMatch(
      /01\.09\.2025.*rok/,
    );
    expect(listReason("first_visit_no_followup", { lastVisitAt: LAST, nextVisitAt: null })).toMatch(
      /Jedna odbyta wizyta \(01\.09\.2025\)/,
    );
    expect(listReason("post_visit_no_reply", { lastVisitAt: LAST, nextVisitAt: null })).toMatch(
      /brak odpowiedzi/,
    );
    expect(listReason("drifting", { lastVisitAt: null, nextVisitAt: null })).toMatch(/pół roku/);
    expect(listReason("no_phone", { lastVisitAt: null, nextVisitAt: null })).toMatch(/telefonu/);
  });
  test("the risk names its factors the way the front desk reads them", () => {
    const r = listReason("high_risk", {
      lastVisitAt: null,
      nextVisitAt: LAST + 400 * DAY,
      probability: 0.34,
      factors: [
        { feature: "priorNoShows", contribution: 0.8 },
        { feature: "earlyMorning", contribution: 0.3 },
      ],
    });
    expect(r).toContain("34%");
    expect(r).toContain("wcześniejsze nieobecności");
    expect(r).toContain("wczesna pora");
  });
});

describe("actorOf", () => {
  test("a person's decision, a model call, the agent's own rule", () => {
    expect(actorOf("agent", { decision: "approve" })).toBe("person");
    expect(actorOf("agent", { decision: "dismiss" })).toBe("person");
    expect(actorOf("ai", { feature: "agent-triage" })).toBe("model");
    expect(actorOf("agent", { source: "agent-nightly" })).toBe("agent");
    expect(actorOf("agent", null)).toBe("agent");
  });
});
