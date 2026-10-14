/**
 * Role views — pure parts: what a message costs and whether a difference
 * between two variants is a difference.
 */

// The GSM 03.38 basic set: a message written only with these is 7-bit.
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
// The extension set: each costs two characters (an escape and the sign).
const GSM_EXTENDED = "^{}\\[~]|€\f";

/**
 * How many SMS parts a body is billed as. A single Polish letter (ą, ę, ł…)
 * switches the whole message to UCS-2, where one part holds 70 characters
 * instead of 160 — the most common surprise on a clinic's SMS invoice.
 */
export function smsSegments(body: string): number {
  if (!body) return 0;
  const chars = [...body];
  const gsm = chars.every((c) => GSM_BASIC.includes(c) || GSM_EXTENDED.includes(c));
  if (gsm) {
    const len = chars.reduce((n, c) => n + (GSM_EXTENDED.includes(c) ? 2 : 1), 0);
    return len <= 160 ? 1 : Math.ceil(len / 153);
  }
  const len = chars.length;
  return len <= 70 ? 1 : Math.ceil(len / 67);
}

/** Whether a body is billed at the 70-character UCS-2 rate. */
export function isUnicodeSms(body: string): boolean {
  return [...body].some((c) => !GSM_BASIC.includes(c) && !GSM_EXTENDED.includes(c));
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26), enough for a p-value shown to two digits. */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export const MIN_PER_VARIANT = 30;

export interface ProportionTest {
  /** Rate of B minus rate of A. */
  diff: number;
  /** Two-sided p-value; null when a sample is too small to say anything. */
  p: number | null;
  significant: boolean;
}

/**
 * Two-proportion z-test. Below 30 in either group the answer is "not enough
 * data" rather than a number that looks like evidence.
 */
export function compareRates(
  aHits: number,
  aTotal: number,
  bHits: number,
  bTotal: number,
): ProportionTest {
  const ra = aTotal > 0 ? aHits / aTotal : 0;
  const rb = bTotal > 0 ? bHits / bTotal : 0;
  const diff = rb - ra;
  if (aTotal < MIN_PER_VARIANT || bTotal < MIN_PER_VARIANT)
    return { diff, p: null, significant: false };
  const pooled = (aHits + bHits) / (aTotal + bTotal);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / aTotal + 1 / bTotal));
  if (se === 0) return { diff, p: diff === 0 ? 1 : 0, significant: diff !== 0 };
  const z = diff / se;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { diff, p, significant: p < 0.05 };
}

export interface UnitPrices {
  /** Price of one SMS part, in grosze. 0 = not set. */
  smsPartGrosze: number;
  /** Price of a thousand e-mails, in grosze. 0 = not set. */
  emailPer1000Grosze: number;
}

/** Cost in grosze, rounded; null when the price is not set — an unknown, not a zero. */
export function channelCost(units: number, pricePerUnitGrosze: number, per = 1): number | null {
  if (pricePerUnitGrosze <= 0) return null;
  return Math.round((units * pricePerUnitGrosze) / per);
}
