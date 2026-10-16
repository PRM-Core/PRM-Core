/**
 * Re-entry — may a patient start the same automation again once their last
 * run is over? Pure: the rule, the last entry and the clock come in.
 *
 * "always" is how every automation behaved before 2.19.0 and stays the
 * default: a visit reminder must fire for every visit. "never" suits a
 * welcome series; "after N days" a recall or a survey that must not repeat
 * too soon. One live run per patient holds in every case — that check comes
 * first, in the runner.
 */

export type ReentryRule = "always" | "never" | "after";

export const DAY_MS = 86_400_000;

/** Null when the patient may enter; otherwise why not, and from when they may (for "after"). */
export function reentryBlocked(
  rule: ReentryRule,
  days: number,
  lastEnteredAt: number | null,
  now: number,
): { rule: "never" } | { rule: "after"; from: number } | null {
  if (lastEnteredAt === null || rule === "always") return null;
  if (rule === "never") return { rule: "never" };
  const from = lastEnteredAt + Math.max(1, days) * DAY_MS;
  return now < from ? { rule: "after", from } : null;
}
