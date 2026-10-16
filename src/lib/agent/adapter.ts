import { t } from "@/lib/i18n";

/**
 * The tuned model — pure parts of its gate.
 *
 * An installation may train a LoRA adapter for its local model on its own
 * approved examples (docs/AGENT.md, section 12) and register it on the same
 * model server. The adapter is used only when the administrator enables the
 * "tuned model" direction, and may be enabled only when it scores no worse
 * than the base model on the same cases of the evaluation harness. Both
 * scores are recorded with the decision.
 */

export interface EvalScore {
  /** As the run stores it: `local/<model name>`. */
  model: string;
  passed: number;
  total: number;
  runAt: number;
  caseIds: string[];
}

export interface AdapterGate {
  ok: boolean;
  /** Why it may not be enabled, in a sentence; empty when it may. */
  reason: string;
  base: EvalScore | null;
  tuned: EvalScore | null;
}

const sameCases = (a: string[], b: string[]) => {
  const x = [...a].sort();
  const y = [...b].sort();
  return x.length === y.length && x.every((id, i) => id === y[i]);
};

/** Whether the tuned model may replace the base model: run on the same cases, no fewer passed. */
export function adapterGate(base: EvalScore | null, tuned: EvalScore | null): AdapterGate {
  const no = (reason: string): AdapterGate => ({ ok: false, reason, base, tuned });
  if (!base) return no(t("Brak sprawdzianu modelu bazowego — uruchom porównanie."));
  if (!tuned) return no(t("Brak sprawdzianu modelu dostrojonego — uruchom porównanie."));
  if (!sameCases(base.caseIds, tuned.caseIds))
    return no(
      t(
        "Oba modele sprawdzano na różnych zestawach przypadków (np. przed i po aktualizacji) — uruchom porównanie jeszcze raz.",
      ),
    );
  if (tuned.passed < base.passed)
    return no(
      t("Model dostrojony wypada gorzej niż bazowy: {tuned} wobec {base}. Zostaje model bazowy.", {
        tuned: `${tuned.passed}/${tuned.total}`,
        base: `${base.passed}/${base.total}`,
      }),
    );
  return { ok: true, reason: "", base, tuned };
}

/** Both scores as the decision records them. */
export function gateEvidence(g: AdapterGate): Record<string, string> {
  return {
    baseModel: g.base?.model ?? "",
    base: g.base ? `${g.base.passed}/${g.base.total}` : "",
    tunedModel: g.tuned?.model ?? "",
    tuned: g.tuned ? `${g.tuned.passed}/${g.tuned.total}` : "",
  };
}
