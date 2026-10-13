import { describe, expect, test } from "bun:test";
import { draftTextOk, factTokens, keepsFacts } from "./language";

describe("keepsFacts", () => {
  const original = [
    "Brief PRM Core — 2026-10-13",
    "- Nieobecności: 18% (wzrost o 8 pp — uwaga) z 40 wizyt.",
    "- Największy wzrost: lek. Jan Kowalski (30%, +20 pp).",
  ].join("\n");

  test("numbers, in any order and wording, are enough", () => {
    const polished =
      "W tygodniu do 13 października 2026 (brief z 10. miesiąca) nieobecności sięgnęły 18 procent — o 8 pp więcej, przy 40 wizytach. Najmocniej u lek. Jana Kowalskiego: 30% (+20 pp).";
    expect(factTokens(original)).toEqual(["2026", "10", "13", "18", "8", "40", "30", "20"]);
    expect(keepsFacts(original, polished)).toEqual({ ok: true, missing: [], invented: [] });
  });

  test("a lost number fails, an invented number fails", () => {
    const lost = keepsFacts(
      original,
      "Nieobecności 18% z 40 wizyt, u Kowalskiego 30% (+20 pp), 2026-10-13.",
    );
    expect(lost.ok).toBe(false);
    expect(lost.missing).toEqual(["8"]);
    const invented = keepsFacts(original, original + "\nTo 3 razy więcej niż rok temu.");
    expect(invented.ok).toBe(false);
    expect(invented.invented).toEqual(["3"]);
  });

  test("list numbering a model adds is not a fact; decimals are compared by value", () => {
    expect(keepsFacts("- a 1,5 pp\n- b", "1. a 1.5 pp\n2. b").ok).toBe(true);
    expect(keepsFacts("2026-10-13", "13.10.2026").ok).toBe(true);
  });
});

describe("draftTextOk", () => {
  test("a plain SMS with the first-name field passes", () => {
    expect(
      draftTextOk(
        "Dzień dobry {{firstName}}, zapraszamy na kontrolę — wystarczy odpowiedzieć TAK.",
        "sms",
      ).ok,
    ).toBe(true);
  });
  test("what a model must not invent", () => {
    expect(draftTextOk("Dzień dobry, zapraszamy.", "sms").ok).toBe(false);
    expect(draftTextOk("Dzień dobry {{firstName}} {{lastName}}.", "sms").ok).toBe(false);
    expect(
      draftTextOk("Dzień dobry {{firstName}}, zapisy: https://example.invalid", "sms").ok,
    ).toBe(false);
    expect(draftTextOk("Dzień dobry {{firstName}}, tel. 600 100 200.", "sms").ok).toBe(false);
    expect(draftTextOk("Dzień dobry {{firstName}}, <b>zapraszamy</b>.", "email").ok).toBe(false);
    expect(draftTextOk(`Dzień dobry {{firstName}}, ${"x".repeat(330)}`, "sms").ok).toBe(false);
    expect(draftTextOk(`Dzień dobry {{firstName}}, ${"x".repeat(330)}`, "email").ok).toBe(true);
  });
});
