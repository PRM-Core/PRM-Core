import { describe, expect, test } from "bun:test";
import { MIN_SAMPLES, scoreNoShow, trainNoShow, type VisitFeatures } from "./no-show";

const base: VisitFeatures = {
  leadDays: 7,
  hour: 11,
  weekday: 3,
  priorVisits: 3,
  priorNoShows: 0,
  bookedOnline: false,
  hasPhone: true,
  consentSms: true,
  daysInBase: 400,
};

/** A deterministic generator: long lead times and earlier no-shows mean no-shows. */
function synthetic(n: number) {
  const out: { features: VisitFeatures; label: 0 | 1 }[] = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const leadDays = Math.floor(rnd() * 60);
    const priorNoShows = rnd() < 0.3 ? 1 + Math.floor(rnd() * 3) : 0;
    const risk = 0.05 + leadDays / 120 + priorNoShows * 0.2;
    out.push({
      features: { ...base, leadDays, priorNoShows, priorVisits: 2 + priorNoShows },
      label: rnd() < risk ? 1 : 0,
    });
  }
  return out;
}

describe("trainNoShow", () => {
  test("with too little history it declines and answers with the base rate", () => {
    const few = synthetic(MIN_SAMPLES - 1);
    const model = trainNoShow(few);
    expect(model.mode).toBe("prior");
    const s = scoreNoShow(model, { ...base, leadDays: 55, priorNoShows: 3 });
    expect(s.probability).toBeCloseTo(model.baseRate, 6);
    expect(s.factors).toEqual([]);
  });

  test("with history it learns the direction of the real drivers", () => {
    const model = trainNoShow(synthetic(600));
    expect(model.mode).toBe("trained");
    expect(model.logLoss).toBeLessThan(model.priorLogLoss);
    const safe = scoreNoShow(model, { ...base, leadDays: 1, priorNoShows: 0 });
    const risky = scoreNoShow(model, { ...base, leadDays: 55, priorNoShows: 3, priorVisits: 5 });
    expect(risky.probability).toBeGreaterThan(safe.probability + 0.2);
    expect(risky.factors.length).toBeGreaterThan(0);
    expect(risky.factors.map((f) => f.feature)).toContain("leadDaysLog");
    expect(risky.factors.every((f) => Math.abs(f.contribution) > 0.05)).toBe(true);
  });

  test("one class only: nothing to learn, prior", () => {
    const allShow = synthetic(100).map((e) => ({ ...e, label: 0 as const }));
    expect(trainNoShow(allShow).mode).toBe("prior");
    expect(trainNoShow([]).baseRate).toBe(0);
  });
});
