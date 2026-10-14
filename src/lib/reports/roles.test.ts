import { describe, expect, test } from "bun:test";
import { channelCost, compareRates, isUnicodeSms, smsSegments } from "./roles";

describe("smsSegments", () => {
  test("plain text: 160 in one part, 153 per part after that", () => {
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
    expect(smsSegments("a".repeat(306))).toBe(2);
    expect(smsSegments("a".repeat(307))).toBe(3);
  });
  test("one Polish letter switches the whole message to 70 / 67", () => {
    expect(isUnicodeSms("Dzień dobry")).toBe(true);
    expect(smsSegments("Dzień dobry")).toBe(1);
    expect(smsSegments("ą" + "a".repeat(69))).toBe(1);
    expect(smsSegments("ą" + "a".repeat(70))).toBe(2);
    expect(smsSegments("Dzien dobry")).toBe(1);
    expect(isUnicodeSms("Dzien dobry")).toBe(false);
  });
  test("the euro sign and brackets count twice in 7-bit", () => {
    expect(smsSegments("€".repeat(80))).toBe(1);
    expect(smsSegments("€".repeat(81))).toBe(2);
    expect(smsSegments("")).toBe(0);
  });
});

describe("compareRates", () => {
  test("too few to say anything", () => {
    expect(compareRates(5, 20, 15, 20)).toMatchObject({ p: null, significant: false });
  });
  test("a clear difference is significant, the same rate is not", () => {
    const clear = compareRates(30, 100, 60, 100);
    expect(clear.significant).toBe(true);
    expect(clear.diff).toBeCloseTo(0.3, 6);
    expect(clear.p!).toBeLessThan(0.001);
    const same = compareRates(30, 100, 32, 100);
    expect(same.significant).toBe(false);
    expect(same.p!).toBeGreaterThan(0.5);
  });
});

describe("channelCost", () => {
  test("an unset price is unknown, not zero", () => {
    expect(channelCost(100, 0)).toBeNull();
    expect(channelCost(3, 9)).toBe(27);
    expect(channelCost(2500, 400, 1000)).toBe(1000);
  });
});
