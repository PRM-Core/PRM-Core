import { describe, expect, test } from "bun:test";
import {
  checkHeldOut,
  HOLDOUT_SHARE,
  MIN_SAMPLES,
  scoreNoShow,
  trainNoShow,
  type NoShowExample,
  type VisitFeatures,
} from "./no-show";

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
  const out: NoShowExample[] = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const leadDays = Math.floor(rnd() * 60);
    const priorNoShows = rnd() < 0.3 ? 1 + Math.floor(rnd() * 3) : 0;
    const risk = 0.05 + leadDays / 120 + priorNoShows * 0.2;
    out.push({
      features: { ...base, leadDays, priorNoShows, priorVisits: 2 + priorNoShows },
      label: rnd() < risk ? 1 : 0,
      at: i,
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

/** Labels that are pure noise: nothing to learn, only something to memorise. */
function noise(n: number) {
  const out: NoShowExample[] = [];
  let seed = 11;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const priorVisits = Math.floor(rnd() * 6);
    out.push({
      label: rnd() < 0.3 ? 1 : 0,
      at: i,
      features: {
        leadDays: Math.floor(rnd() * 60),
        hour: 7 + Math.floor(rnd() * 11),
        weekday: Math.floor(rnd() * 7),
        priorVisits,
        priorNoShows: Math.floor(rnd() * (priorVisits + 1)),
        bookedOnline: rnd() < 0.5,
        hasPhone: rnd() < 0.8,
        consentSms: rnd() < 0.7,
        daysInBase: Math.floor(rnd() * 100),
      },
    });
  }
  return out;
}

describe("quality on visits outside the training", () => {
  test("is measured on the most recent visits, by a copy that never saw them", () => {
    const all = synthetic(600);
    // Handed over shuffled: the split follows `at`, not the order given.
    const shuffled = [...all].reverse();
    const check = checkHeldOut(shuffled)!;
    const cut = all.length - Math.floor(all.length * HOLDOUT_SHARE);
    const older = all.slice(0, cut);
    const recent = all.slice(cut);
    expect(check.samples).toBe(recent.length);
    expect(check.trainedOn).toBe(older.length);
    expect(check.positives).toBe(recent.filter((e) => e.label === 1).length);

    // Recomputed by hand: a model trained on the older visits only, scored on the recent ones.
    const copy = trainNoShow(older);
    const loss =
      -recent.reduce((s, e) => {
        const p = scoreNoShow(copy, e.features).probability;
        return s + Math.log(e.label === 1 ? p : 1 - p);
      }, 0) / recent.length;
    expect(check.logLoss).toBeCloseTo(loss, 9);
    const base = copy.baseRate;
    const priorLoss =
      -recent.reduce((s, e) => s + Math.log(e.label === 1 ? base : 1 - base), 0) / recent.length;
    expect(check.priorLogLoss).toBeCloseTo(priorLoss, 9);

    // The held-out labels do not reach the checked copy: flipping them moves only the loss.
    const flipped = all.map((e, i) => (i >= cut ? { ...e, label: (1 - e.label) as 0 | 1 } : e));
    expect(checkHeldOut(flipped)!.logLoss).not.toBeCloseTo(check.logLoss, 3);
    expect(trainNoShow(older).weights).toEqual(copy.weights);
  });

  test("a model with something real to learn beats the base rate there too, and is calibrated", () => {
    const model = trainNoShow(synthetic(600));
    expect(model.samples).toBe(600); // the scoring model learns from everything
    const h = model.heldOut!;
    expect(h.skill).toBeGreaterThan(0.05);
    expect(h.logLoss).toBeLessThan(h.priorLogLoss);
    expect(Math.abs(h.meanPredicted - h.observedRate)).toBeLessThan(0.1);
  });

  test("a model that merely memorises looks good on its history and not outside it", () => {
    const model = trainNoShow(noise(80));
    expect(model.mode).toBe("trained");
    const inSample = 1 - model.logLoss / model.priorLogLoss;
    expect(inSample).toBeGreaterThan(0.1); // the old figure: "over 10% better" on noise
    expect(model.heldOut!.skill).toBeLessThan(0); // the honest one: no better than the base rate
  });

  test("too few recent visits of either outcome: no number at all", () => {
    // 60 visits: 15 held out, two of them no-shows — nothing to say.
    const few = synthetic(60).map((e, i) =>
      i >= 45 ? { ...e, label: (i < 47 ? 1 : 0) as 0 | 1 } : e,
    );
    const model = trainNoShow(few);
    expect(model.mode).toBe("trained");
    expect(model.heldOut).toBeNull();
    expect(checkHeldOut(few)).toBeNull();
  });

  test("an untrained model has no held-out check", () => {
    expect(trainNoShow(synthetic(MIN_SAMPLES - 1)).heldOut).toBeNull();
  });
});
