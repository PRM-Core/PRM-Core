/**
 * No-show risk for an upcoming visit — a small model trained on the
 * installation's own history. Pure: no database, no clock of its own.
 *
 * Logistic regression over a handful of explainable features. It is not the
 * strongest model possible; it is one whose answer can be read: every score
 * comes with the three factors that moved it most, in words a receptionist
 * understands ("booked 40 days ahead", "two earlier no-shows").
 *
 * With too little history the model declines to train and the score is the
 * base rate for everyone — an honest "we do not know yet", flagged as such.
 *
 * Its quality is measured on visits it did not learn from: a copy is trained
 * on the older visits and scored on the most recent quarter, against the base
 * rate of those same older visits. The model that scores tomorrow's visits is
 * then trained on everything. A model that only memorised its history looks
 * good on that history and no better than the base rate here.
 */

export interface VisitFeatures {
  /** Days between booking and the visit, ≥ 0. */
  leadDays: number;
  /** Hour of the visit in the clinic's local time, 0–23. */
  hour: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  priorVisits: number;
  priorNoShows: number;
  /** The visit came through the online booking (webhook), not the reception desk. */
  bookedOnline: boolean;
  hasPhone: boolean;
  consentSms: boolean;
  /** Days the contact has been in the base at booking time, ≥ 0. */
  daysInBase: number;
}

export const FEATURE_NAMES = [
  "leadDaysLog",
  "earlyMorning",
  "lateAfternoon",
  "monday",
  "friday",
  "firstVisit",
  "priorNoShowRate",
  "priorNoShows",
  "bookedOnline",
  "noPhone",
  "noSmsConsent",
  "newInBase",
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

export function featureVector(f: VisitFeatures): number[] {
  const priorRate = f.priorVisits > 0 ? f.priorNoShows / f.priorVisits : 0;
  return [
    Math.log1p(Math.max(0, f.leadDays)),
    f.hour < 9 ? 1 : 0,
    f.hour >= 16 ? 1 : 0,
    f.weekday === 1 ? 1 : 0,
    f.weekday === 5 ? 1 : 0,
    f.priorVisits === 0 ? 1 : 0,
    priorRate,
    Math.min(f.priorNoShows, 5),
    f.bookedOnline ? 1 : 0,
    f.hasPhone ? 0 : 1,
    f.consentSms ? 0 : 1,
    f.daysInBase < 30 ? 1 : 0,
  ];
}

/** How the model did on visits it never saw — the number worth reporting. */
export interface HeldOutCheck {
  /** The most recent visits, kept out of the training for the check. */
  samples: number;
  positives: number;
  /** Older visits the checked copy was trained on. */
  trainedOn: number;
  /** Log-loss on the held-out visits — lower is better. */
  logLoss: number;
  /** Log-loss of the older visits' base rate on the same held-out visits. */
  priorLogLoss: number;
  /** 1 − logLoss / priorLogLoss: 0 = no better than the base rate, below 0 = worse. */
  skill: number;
  /** Calibration in the large: the mean predicted no-show rate against the observed one. */
  meanPredicted: number;
  observedRate: number;
}

export interface NoShowModel {
  kind: "no-show";
  /** `prior` when there was not enough history to learn from. */
  mode: "trained" | "prior";
  baseRate: number;
  samples: number;
  positives: number;
  weights: number[];
  bias: number;
  means: number[];
  stds: number[];
  /**
   * Log-loss on the training set — lower is better; the base-rate model
   * scores `priorLogLoss`. Optimistic by construction: report `heldOut`.
   */
  logLoss: number;
  priorLogLoss: number;
  /** Quality on visits outside the training; null = too little data to say. */
  heldOut: HeldOutCheck | null;
}

export const MIN_SAMPLES = 40;
export const MIN_PER_CLASS = 5;
/** The share of the most recent visits held out of training for the check. */
export const HOLDOUT_SHARE = 0.25;

/** A labelled past visit; `at` (the visit's start) orders the history, oldest first. */
export interface NoShowExample {
  features: VisitFeatures;
  label: 0 | 1;
  at?: number;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const clamp = (p: number) => Math.min(1 - 1e-6, Math.max(1e-6, p));

/**
 * Train on labelled past visits. `label` is 1 for a no-show, 0 for a visit
 * that happened; cancelled visits are not examples of either and must not be
 * passed in. Without `at` the order given is taken as oldest first.
 */
export function trainNoShow(examples: NoShowExample[]): NoShowModel {
  const model = fit(examples);
  return { ...model, heldOut: model.mode === "trained" ? checkHeldOut(examples) : null };
}

/**
 * Train on the older visits, score the most recent `HOLDOUT_SHARE` of them.
 * Null when either side is too small to say anything: the older part must be
 * enough to train on, and the held-out part must hold `MIN_PER_CLASS` of each
 * outcome.
 */
export function checkHeldOut(examples: NoShowExample[]): HeldOutCheck | null {
  const ordered = examples
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.at ?? 0) - (b.e.at ?? 0) || a.i - b.i)
    .map((x) => x.e);
  const cut = ordered.length - Math.floor(ordered.length * HOLDOUT_SHARE);
  const older = ordered.slice(0, cut);
  const recent = ordered.slice(cut);
  const positives = recent.filter((e) => e.label === 1).length;
  if (positives < MIN_PER_CLASS || recent.length - positives < MIN_PER_CLASS) return null;
  const model = fit(older);
  if (model.mode !== "trained") return null;

  const prior = clamp(model.baseRate);
  let logLoss = 0;
  let priorLogLoss = 0;
  let predicted = 0;
  for (const e of recent) {
    const p = clamp(scoreNoShow(model, e.features).probability);
    logLoss -= Math.log(e.label === 1 ? p : 1 - p);
    priorLogLoss -= Math.log(e.label === 1 ? prior : 1 - prior);
    predicted += p;
  }
  const n = recent.length;
  return {
    samples: n,
    positives,
    trainedOn: older.length,
    logLoss: logLoss / n,
    priorLogLoss: priorLogLoss / n,
    skill: 1 - logLoss / priorLogLoss,
    meanPredicted: predicted / n,
    observedRate: positives / n,
  };
}

function fit(examples: NoShowExample[]): NoShowModel {
  const n = examples.length;
  const positives = examples.filter((e) => e.label === 1).length;
  const baseRate = n > 0 ? positives / n : 0;
  const priorLogLoss =
    n > 0
      ? -examples.reduce(
          (s, e) => s + Math.log(clamp(e.label === 1 ? baseRate : 1 - baseRate)),
          0,
        ) / n
      : 0;
  const dims = FEATURE_NAMES.length;
  const prior: NoShowModel = {
    kind: "no-show",
    mode: "prior",
    baseRate,
    samples: n,
    positives,
    weights: new Array(dims).fill(0),
    bias: n > 0 ? Math.log(clamp(baseRate) / clamp(1 - baseRate)) : 0,
    means: new Array(dims).fill(0),
    stds: new Array(dims).fill(1),
    logLoss: priorLogLoss,
    priorLogLoss,
    heldOut: null,
  };
  if (n < MIN_SAMPLES || positives < MIN_PER_CLASS || n - positives < MIN_PER_CLASS) return prior;

  const X = examples.map((e) => featureVector(e.features));
  const y = examples.map((e) => e.label);
  const means = new Array(dims).fill(0);
  const stds = new Array(dims).fill(1);
  for (let j = 0; j < dims; j++) {
    means[j] = X.reduce((s, row) => s + row[j], 0) / n;
    const v = X.reduce((s, row) => s + (row[j] - means[j]) ** 2, 0) / n;
    stds[j] = Math.sqrt(v) || 1;
  }
  const Z = X.map((row) => row.map((x, j) => (x - means[j]) / stds[j]));

  // Gradient descent with L2 — small data, so regularisation matters more
  // than speed. Starts from the base rate so a flat feature set stays there.
  const weights = new Array(dims).fill(0);
  let bias = prior.bias;
  const lr = 0.1;
  const l2 = 0.01;
  for (let epoch = 0; epoch < 400; epoch++) {
    const gradW = new Array(dims).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const z = Z[i].reduce((s, zj, j) => s + zj * weights[j], bias);
      const err = sigmoid(z) - y[i];
      for (let j = 0; j < dims; j++) gradW[j] += err * Z[i][j];
      gradB += err;
    }
    for (let j = 0; j < dims; j++) weights[j] -= lr * (gradW[j] / n + l2 * weights[j]);
    bias -= lr * (gradB / n);
  }

  const logLoss =
    -Z.reduce((s, z, i) => {
      const p = clamp(sigmoid(z.reduce((acc, zj, j) => acc + zj * weights[j], bias)));
      return s + Math.log(y[i] === 1 ? p : 1 - p);
    }, 0) / n;

  return { ...prior, mode: "trained", weights, bias, means, stds, logLoss };
}

export interface NoShowScore {
  probability: number;
  /** The three features that moved the score most, signed: + raises the risk. */
  factors: { feature: FeatureName; contribution: number }[];
}

export function scoreNoShow(model: NoShowModel, f: VisitFeatures): NoShowScore {
  if (model.mode === "prior") return { probability: model.baseRate, factors: [] };
  const x = featureVector(f);
  const contributions = x.map((v, j) => ((v - model.means[j]) / model.stds[j]) * model.weights[j]);
  const z = contributions.reduce((s, c) => s + c, model.bias);
  const factors = contributions
    .map((contribution, j) => ({ feature: FEATURE_NAMES[j], contribution }))
    .filter((c) => Math.abs(c.contribution) > 0.05)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3);
  return { probability: sigmoid(z), factors };
}
