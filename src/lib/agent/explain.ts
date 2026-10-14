import type { ListKey } from "./drafts.server";
import { factorLabel } from "./factor-labels";
import { intlLocale, t } from "@/lib/i18n";

/**
 * Why — pure parts. The agent never puts a patient on a list, proposes a
 * draft or holds a message without a reason a receptionist can read; this
 * file turns the numbers behind each decision into that sentence, the same
 * way on every screen.
 */

export interface ReasonInput {
  lastVisitAt: number | null;
  nextVisitAt: number | null;
  probability?: number;
  factors?: { feature: string; contribution: number }[];
}

function day(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(intlLocale(), {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** One sentence: why this contact is on this list today. */
export function listReason(key: ListKey, r: ReasonInput): string {
  switch (key) {
    case "recall_due":
      return t("Ostatnia wizyta {date} — ponad rok temu; nic umówionego.", {
        date: day(r.lastVisitAt),
      });
    case "first_visit_no_followup":
      return t("Jedna odbyta wizyta ({date}); kolejnej nie umówiono.", {
        date: day(r.lastVisitAt),
      });
    case "post_visit_no_reply":
      return t("Wizyta {date}; od tego czasu brak odpowiedzi i nic umówionego.", {
        date: day(r.lastVisitAt),
      });
    case "drifting":
      return r.lastVisitAt
        ? t("Ostatnia wizyta {date}; od pół roku bez otwartego e-maila i bez odpowiedzi.", {
            date: day(r.lastVisitAt),
          })
        : t("Od pół roku bez wizyty, otwartego e-maila i odpowiedzi.");
    case "high_risk": {
      const factors = (r.factors ?? [])
        .map((f) => factorLabel(f.feature, f.contribution > 0))
        .join(", ");
      return factors
        ? t("Ryzyko nieobecności {p} na wizycie {date}: {factors}.", {
            p: pct(r.probability ?? 0),
            date: day(r.nextVisitAt),
            factors,
          })
        : t("Ryzyko nieobecności {p} na wizycie {date}.", {
            p: pct(r.probability ?? 0),
            date: day(r.nextVisitAt),
          });
    }
    case "no_phone":
      return t("W karcie nie ma numeru telefonu.");
  }
}

/** Who stands behind an entry of the agent's log. */
export type Actor = "person" | "agent" | "model";

/**
 * A decision by a person carries `decision` in its detail (approve, reject,
 * enable, decline, correct, dismiss); a model call is an "ai" entry; the
 * rest is the agent acting on its own rules.
 */
export function actorOf(kind: string, detail: Record<string, string> | null): Actor {
  if (kind === "ai") return "model";
  if (detail?.decision) return "person";
  return "agent";
}
