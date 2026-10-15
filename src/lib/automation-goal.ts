import { triggerLabel } from "@/lib/automation-catalog";
import type { AutomationGoal } from "@/lib/automation-flow";
import { intlLocale } from "@/lib/i18n";

/** "Visit booked: kardio" — a goal in the words its trigger uses. */
export function goalLabel(goal: AutomationGoal): string {
  return triggerLabel({
    nodes: [
      { id: "", kind: "trigger", position: { x: 0, y: 0 }, key: goal.key, config: goal.config },
    ],
    edges: [],
  });
}

/** A rate as a percentage; a dash when there is nothing to divide by. */
export function percent(value: number | null): string {
  return value === null
    ? "—"
    : value.toLocaleString(intlLocale(), { style: "percent", maximumFractionDigits: 1 });
}
