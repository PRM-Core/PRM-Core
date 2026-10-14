import { t } from "@/lib/i18n";
import type { Recommendation, SignalLike } from "./recommend";

/**
 * The weekly brief — plain language from the numbers, no model.
 *
 * Written for whoever runs the clinic and reads it in a minute: what changed,
 * who needs attention, what the agent proposes, what is ahead. A language
 * model may polish it later (phase 2); the facts and their order come from
 * here, so the brief exists and is correct with the AI switched off.
 */

export interface BriefInput {
  day: string;
  signals: SignalLike[];
  recommendations: Recommendation[];
  risks: { patient: string; startsAt: number | null; probability: number }[];
  model: { mode: "trained" | "prior"; samples: number } | null;
  /** How the agent itself is doing: its model's skill, what it has learned, what waits for a decision. */
  development?: {
    skill: number | null;
    previousSkill: number | null;
    examples: number;
    directionsPending: number;
    directionsEnabled: number;
    /** The last run of the evaluation harness, if any. */
    evaluation?: { passed: number; total: number } | null;
  };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function trend(s: SignalLike | undefined, lowerIsBetter = false): string {
  if (!s) return t("brak danych");
  if (s.previous === null) return `${pct(s.value)} (${t("bez porównania")})`;
  const delta = Math.round((s.value - s.previous) * 100);
  if (delta === 0) return `${pct(s.value)} (${t("bez zmian")})`;
  const word = delta > 0 ? t("wzrost") : t("spadek");
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  return `${pct(s.value)} (${word} ${t("o {n} pp", { n: Math.abs(delta) })}${good ? "" : ` — ${t("uwaga")}`})`;
}

export function buildBrief(input: BriefInput): string {
  const s = (key: string) => input.signals.find((x) => x.key === key && x.dimension === "");
  const n = (key: string) => Math.round(s(key)?.value ?? 0);
  const lines: string[] = [];

  lines.push(t("Brief PRM Core — {day}", { day: input.day }));
  lines.push("");
  lines.push(t("Co się zmieniło (30 dni wobec poprzednich 30)"));
  lines.push(
    t("- Nieobecności: {v} z {n} wizyt.", {
      v: trend(s("no_show_rate"), true),
      n: s("no_show_rate")?.count ?? 0,
    }),
  );
  lines.push(
    t("- Wizyty: {done} odbytych, {ns} nieobecności, {c} odwołanych.", {
      done: n("visits.completed"),
      ns: n("visits.no_show"),
      c: n("visits.cancelled"),
    }),
  );
  lines.push(
    t("- E-mail: otwarcia {o}, kliknięcia {c}.", {
      o: trend(s("email.open_rate")),
      c: trend(s("email.click_rate")),
    }),
  );
  lines.push(t("- Odpowiedzi pacjentów w skrzynce: {n}.", { n: n("inbox.inbound") }));

  // The largest rises by doctor and by site, together: whoever reads the
  // brief wants the place where it hurts, whichever kind of place it is.
  const byPlace = input.signals.filter(
    (x) =>
      x.key === "no_show_rate" &&
      (x.dimension.startsWith("doctor:") || x.dimension.startsWith("location:")) &&
      x.previous !== null,
  );
  const worst = byPlace
    .map((x) => ({
      name: x.dimension.slice(x.dimension.indexOf(":") + 1),
      rise: (x.value - (x.previous ?? 0)) * 100,
      now: x.value,
    }))
    .filter((x) => x.rise >= 5)
    .sort((a, b) => b.rise - a.rise)
    .slice(0, 3);
  if (worst.length > 0) {
    lines.push(
      t("- Największy wzrost nieobecności: {list}.", {
        list: worst.map((w) => `${w.name} (${pct(w.now)}, +${Math.round(w.rise)} pp)`).join(", "),
      }),
    );
  }

  lines.push("");
  lines.push(t("Kto wymaga uwagi"));
  lines.push(t("- Recall do zrobienia: {n}", { n: n("recall_due") }));
  lines.push(t("- Po pierwszej wizycie bez kolejnej: {n}", { n: n("first_visit_no_followup") }));
  lines.push(
    t("- Po wizycie w tym tygodniu, bez odpowiedzi: {n}", { n: n("post_visit_no_reply") }),
  );
  lines.push(t("- Pacjenci dryfujący (pół roku ciszy): {n}", { n: n("drifting") }));

  lines.push("");
  lines.push(t("Co proponuje agent"));
  if (input.recommendations.length === 0) {
    lines.push(t("- Nic pilnego. Liczby są w normie wobec poprzedniego okresu."));
  } else {
    for (const r of input.recommendations.slice(0, 5)) {
      lines.push(`- ${r.title} → ${r.proposedAction}`);
    }
  }

  lines.push("");
  lines.push(t("Przed nami"));
  if (input.risks.length === 0) {
    lines.push(t("- Brak nadchodzących wizyt z podwyższonym ryzykiem nieobecności."));
  } else {
    const high = input.risks.filter((r) => r.probability >= 0.3);
    lines.push(
      t("- {h} z {all} najbliższych wizyt ma ryzyko nieobecności ≥ 30%.", {
        h: high.length,
        all: input.risks.length,
      }),
    );
  }
  if (input.model) {
    lines.push(
      input.model.mode === "trained"
        ? t("- Ocena ryzyka: model nauczony na {n} wizytach tej placówki.", {
            n: input.model.samples,
          })
        : t("- Ocena ryzyka: za mało historii ({n} wizyt) — podana jest częstość bazowa.", {
            n: input.model.samples,
          }),
    );
  }
  if (input.development) {
    const d = input.development;
    lines.push("");
    lines.push(t("Jak rozwija się agent"));
    if (d.skill !== null && input.model?.mode === "trained") {
      const prev =
        d.previousSkill === null ? "" : ` (${t("wczoraj {v}", { v: pct(d.previousSkill) })})`;
      lines.push(
        t("- Model nieobecności: o {v} lepszy niż sama częstość bazowa{prev}.", {
          v: pct(d.skill),
          prev,
        }),
      );
    }
    lines.push(
      d.examples > 0
        ? t("- Przykładów zatwierdzonych przez zespół: {n}.", { n: d.examples })
        : t("- Agent nie ma jeszcze zatwierdzonych przykładów do nauki."),
    );
    lines.push(
      d.directionsPending > 0
        ? t("- Kierunki rozwoju czekające na decyzję administratora: {n} (PRM_Agent → Kierunki).", {
            n: d.directionsPending,
          })
        : t("- Włączone kierunki rozwoju: {n}; nic nie czeka na decyzję.", {
            n: d.directionsEnabled,
          }),
    );
    if (d.evaluation)
      lines.push(
        t("- Ostatni sprawdzian modelu: {passed} z {total} przypadków.", {
          passed: d.evaluation.passed,
          total: d.evaluation.total,
        }),
      );
  }
  lines.push("");
  lines.push(
    t("Żadna wiadomość nie wyszła bez zatwierdzenia. Drafty czekają w PRM_Agent → Drafty."),
  );
  return lines.join("\n");
}
