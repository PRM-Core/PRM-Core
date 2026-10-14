import { describe, expect, test } from "bun:test";
import { deriveDirections } from "./directions";

describe("deriveDirections", () => {
  test("nothing to propose for a fresh installation with no model", () => {
    expect(
      deriveDirections({ localModel: false, approvals: 0, contacts: 5, withoutPhone: 0 }),
    ).toEqual([]);
  });
  test("a model in reach opens the three language directions; an approval opens learning", () => {
    const keys = deriveDirections({
      localModel: true,
      approvals: 1,
      contacts: 10,
      withoutPhone: 0,
    }).map((d) => d.key);
    expect(keys).toEqual([
      "drafts_by_model",
      "brief_by_model",
      "triage_by_model",
      "learn_from_approvals",
    ]);
  });
  test("a phone gap of a fifth, on a base big enough to mean something", () => {
    expect(
      deriveDirections({ localModel: false, approvals: 0, contacts: 19, withoutPhone: 19 }),
    ).toEqual([]);
    const [d] = deriveDirections({
      localModel: false,
      approvals: 0,
      contacts: 100,
      withoutPhone: 25,
    });
    expect(d.key).toBe("collect_phones");
    expect(d.evidence).toEqual({ withoutPhone: "25", share: "25%" });
    expect(
      deriveDirections({ localModel: false, approvals: 0, contacts: 100, withoutPhone: 19 }),
    ).toEqual([]);
  });
});
