import { t } from "@/lib/i18n";
import type { VisitState } from "./provider";

/**
 * Visit states as stored in `contact_visits.ic_status` (the column keeps its
 * historical name) and what the user reads for them.
 *
 * The state is stored raw, not as a finished label, because a **no-show is
 * derived from the clock**: still `booked` more than two hours after the start.
 * A stored label would go stale the moment those two hours pass.
 */

/** How long after the start a still-booked visit counts as a no-show. The clinic's rule. */
export const NO_SHOW_GRACE_MS = 2 * 60 * 60 * 1000;

export const STATE_LABELS_PL: Record<VisitState, string> = {
  booked: "Umówiona",
  waiting: "Oczekuje",
  started: "Rozpoczęta",
  completed: "Zakończona",
  cancelled: "Odwołana",
  other: "Inny status",
};

export const NO_SHOW_LABEL_PL = "Brak wizyty pacjenta";

export function isVisitState(value: string): value is VisitState {
  return value in STATE_LABELS_PL;
}

/** Effective state at `now`: a booked visit long past its start is a no-show. */
export function effectiveState(
  state: string,
  startsAt: number | null,
  now: number = Date.now(),
): VisitState | "no_show" | "" {
  if (!isVisitState(state)) return "";
  if (state === "booked" && startsAt !== null && now > startsAt + NO_SHOW_GRACE_MS) {
    return "no_show";
  }
  return state;
}

/** The label shown on the timeline: the system's own wording for `other`, ours otherwise. */
export function visitLabel(
  state: VisitState,
  startsAt: number | null,
  otherLabel = "",
  now: number = Date.now(),
): string {
  const effective = effectiveState(state, startsAt, now);
  if (effective === "no_show") return t(NO_SHOW_LABEL_PL);
  if (effective === "other") return otherLabel || t(STATE_LABELS_PL.other);
  return effective ? t(STATE_LABELS_PL[effective]) : "";
}
