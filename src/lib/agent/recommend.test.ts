import { describe, expect, test } from "bun:test";
import { deriveRecommendations, type SignalLike } from "./recommend";
import { buildBrief } from "./brief";

const sig = (
  key: string,
  value: number,
  previous: number | null = null,
  count = 0,
  dimension = "",
): SignalLike => ({
  key,
  dimension,
  value,
  previous,
  count,
});

describe("deriveRecommendations", () => {
  test("no-shows up 5 pp with enough visits — a warning; 10 pp — critical; small samples stay quiet", () => {
    const recs = deriveRecommendations(
      [
        sig("no_show_rate", 0.18, 0.1, 40),
        sig("no_show_rate", 0.3, 0.1, 25, "doctor:lek. Jan Kowalski"),
        sig("no_show_rate", 0.5, 0.0, 4, "doctor:dr Ewa Nowak"),
        sig("no_show_rate", 0.2, 0.12, 30, "location:Mokotów"),
      ],
      0,
    );
    const sigs = recs.map((r) => r.signature);
    expect(sigs).toContain("agent:no-show-rise:all");
    expect(sigs).toContain("agent:no-show-rise:doctor:lek. Jan Kowalski");
    expect(sigs).not.toContain("agent:no-show-rise:doctor:dr Ewa Nowak");
    expect(
      recs.find((r) => r.signature === "agent:no-show-rise:location:Mokotów")?.title,
    ).toContain("Mokotów");
    expect(recs.find((r) => r.signature === "agent:no-show-rise:all")?.severity).toBe("warning");
    expect(recs.find((r) => r.signature.endsWith("Kowalski"))?.severity).toBe("critical");
    expect(recs.find((r) => r.signature.endsWith("Kowalski"))?.title).toContain(
      "lek. Jan Kowalski",
    );
  });

  test("audiences become campaign drafts with placeholders, only above the thresholds", () => {
    const recs = deriveRecommendations(
      [sig("recall_due", 42), sig("first_visit_no_followup", 3), sig("drifting", 25)],
      0,
    );
    const drafts = recs.filter((r) => r.draft);
    expect(drafts.map((r) => r.draft!.audienceSignal).sort()).toEqual(["drifting", "recall_due"]);
    for (const r of drafts) expect(r.draft!.message).toContain("{{firstName}}");
  });

  test("the front desk gets a list when there is anyone on it", () => {
    expect(deriveRecommendations([sig("post_visit_no_reply", 0)], 0)).toHaveLength(0);
    const recs = deriveRecommendations([sig("post_visit_no_reply", 2)], 3);
    expect(recs.map((r) => r.signature).sort()).toEqual([
      "agent:high-risk-visits",
      "agent:post-visit-no-reply",
    ]);
  });

  test("a steady clinic gets no recommendations", () => {
    expect(
      deriveRecommendations(
        [
          sig("no_show_rate", 0.1, 0.11, 60),
          sig("email.open_rate", 0.4, 0.42, 300),
          sig("recall_due", 3),
        ],
        0,
      ),
    ).toHaveLength(0);
  });
});

describe("buildBrief", () => {
  test("reads like a note, carries the numbers, and says nothing was sent", () => {
    const text = buildBrief({
      day: "2026-10-13",
      signals: [
        sig("no_show_rate", 0.18, 0.1, 40),
        sig("visits.completed", 33),
        sig("visits.no_show", 7),
        sig("visits.cancelled", 2),
        sig("email.open_rate", 0.38, 0.39, 120),
        sig("email.click_rate", 0.11, 0.08, 120),
        sig("inbox.inbound", 5),
        sig("recall_due", 42),
        sig("no_show_rate", 0.3, 0.1, 25, "doctor:lek. Jan Kowalski"),
      ],
      recommendations: deriveRecommendations([sig("recall_due", 42)], 2),
      risks: [
        { patient: "A", startsAt: null, probability: 0.35 },
        { patient: "B", startsAt: null, probability: 0.1 },
      ],
      model: { mode: "trained", samples: 120 },
    });
    expect(text).toContain("2026-10-13");
    expect(text).toContain("18%");
    expect(text).toContain("33");
    expect(text).toContain("lek. Jan Kowalski (30%, +20 pp)");
    expect(text).toContain("42");
    expect(text).toContain("1 z 2");
    expect(text).toContain("120");
    expect(text).toMatch(/bez zatwierdzenia/);
  });
});
