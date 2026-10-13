import { t } from "@/lib/i18n";

/**
 * Recommendations — rules over the signals. Pure: numbers in, findings out.
 *
 * Each rule names the evidence (the numbers it looked at) and proposes one
 * action a person can take. Thresholds are deliberately conservative: a
 * recommendation that fires on noise trains people to ignore the panel.
 */

export interface SignalLike {
  key: string;
  dimension: string;
  value: number;
  previous: number | null;
  count: number;
}

export interface Recommendation {
  /** Stable across nights for the same finding — the supervisor dedupes on it. */
  signature: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  proposedAction: string;
  evidence: Record<string, string>;
  /** When set, a campaign draft is proposed for the audience behind this signal. */
  draft?: { audienceSignal: string; channel: "sms" | "email"; title: string; message: string };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pp = (a: number, b: number) => Math.round((a - b) * 100);

/** The dimension of a signal, as a reader sees it. */
function dimLabel(dimension: string): string {
  const [kind, ...rest] = dimension.split(":");
  const name = rest.join(":");
  if (kind === "doctor") return name;
  if (kind === "specialization") return name;
  return "";
}

export const NO_SHOW_RISE_PP = 5;
export const OPEN_RATE_DROP_PP = 10;
export const RECALL_MIN = 10;
export const FIRST_VISIT_MIN = 5;
export const DRIFTING_MIN = 20;

export function deriveRecommendations(
  signals: SignalLike[],
  highRiskVisits: number,
): Recommendation[] {
  const out: Recommendation[] = [];
  const overall = (key: string) => signals.find((s) => s.key === key && s.dimension === "");

  // ── no-shows rising, overall or somewhere specific ──────────────────────
  for (const s of signals.filter((x) => x.key === "no_show_rate")) {
    if (s.previous === null || s.count < 10) continue;
    const rise = pp(s.value, s.previous);
    if (rise < NO_SHOW_RISE_PP) continue;
    const where = dimLabel(s.dimension);
    out.push({
      signature: `agent:no-show-rise:${s.dimension || "all"}`,
      severity: rise >= 2 * NO_SHOW_RISE_PP ? "critical" : "warning",
      title: where
        ? t("Nieobecności wzrosły: {where} — {prev} → {now}", {
            where,
            prev: pct(s.previous),
            now: pct(s.value),
          })
        : t("Nieobecności wzrosły: {prev} → {now}", { prev: pct(s.previous), now: pct(s.value) }),
      detail: t(
        "Ostatnie 30 dni wobec poprzednich 30, z {n} rozstrzygniętych wizyt. Wzrost o {pp} punktów procentowych.",
        { n: s.count, pp: rise },
      ),
      proposedAction: t(
        "Dodaj drugie przypomnienie SMS 2 godziny przed wizytą{scope}. Jeśli to jedna pora dnia albo jeden dzień tygodnia, sprawdź listę wizyt zagrożonych nieobecnością na pulpicie.",
        { scope: where ? t(" dla: {where}", { where }) : "" },
      ),
      evidence: {
        now: pct(s.value),
        previous: pct(s.previous),
        visits: String(s.count),
        dimension: s.dimension,
      },
    });
  }

  // ── e-mail response falling ──────────────────────────────────────────────
  const open = overall("email.open_rate");
  if (
    open &&
    open.previous !== null &&
    open.count >= 50 &&
    pp(open.previous, open.value) >= OPEN_RATE_DROP_PP
  ) {
    out.push({
      signature: "agent:open-rate-drop",
      severity: "warning",
      title: t("Otwarcia e-maili spadły: {prev} → {now}", {
        prev: pct(open.previous),
        now: pct(open.value),
      }),
      detail: t(
        "Z {n} wysyłek w ostatnich 30 dniach. Taki spadek rzadko bierze się z treści — częściej z nadawcy, tematu albo godziny wysyłki.",
        { n: open.count },
      ),
      proposedAction: t(
        "Porównaj tematy i nadawcę ostatnich kampanii z poprzednimi; sprawdź, czy domena wysyłkowa nie trafiła na listę ostrzeżeń.",
      ),
      evidence: { now: pct(open.value), previous: pct(open.previous), sends: String(open.count) },
    });
  }

  // ── audiences worth a campaign ───────────────────────────────────────────
  const recall = overall("recall_due");
  if (recall && recall.value >= RECALL_MIN) {
    out.push({
      signature: "agent:recall-due",
      severity: "info",
      title: t("{n} pacjentów ma recall do zrobienia", { n: Math.round(recall.value) }),
      detail: t(
        "Ostatnia wizyta ponad rok temu i nic umówionego. To pacjenci, którzy znają placówkę — najtańsi do odzyskania.",
      ),
      proposedAction: t(
        "Zatwierdź draft kampanii recall (SMS albo e-mail) — audytorium jest gotowe.",
      ),
      evidence: { patients: String(Math.round(recall.value)) },
      draft: {
        audienceSignal: "recall_due",
        channel: "sms",
        title: t("Recall — pacjenci bez wizyty od roku"),
        message: t(
          "Dzień dobry {{firstName}}, minął rok od Państwa ostatniej wizyty. Zapraszamy na kontrolę — odpowiedź TAK, a znajdziemy dogodny termin.",
        ),
      },
    });
  }
  const first = overall("first_visit_no_followup");
  if (first && first.value >= FIRST_VISIT_MIN) {
    out.push({
      signature: "agent:first-visit-no-followup",
      severity: "info",
      title: t("{n} pacjentów po pierwszej wizycie bez kolejnej", { n: Math.round(first.value) }),
      detail: t(
        "Jedna odbyta wizyta 1–12 miesięcy temu i nic umówionego. Druga wizyta decyduje, czy pacjent zostaje.",
      ),
      proposedAction: t("Zatwierdź draft zaproszenia na wizytę kontrolną."),
      evidence: { patients: String(Math.round(first.value)) },
      draft: {
        audienceSignal: "first_visit_no_followup",
        channel: "email",
        title: t("Zaproszenie po pierwszej wizycie"),
        message: t(
          "Dzień dobry {{firstName}}, dziękujemy za wizytę u nas. Jeśli chcą Państwo umówić wizytę kontrolną, wystarczy odpowiedzieć na tę wiadomość albo zadzwonić do rejestracji.",
        ),
      },
    });
  }
  const drifting = overall("drifting");
  if (drifting && drifting.value >= DRIFTING_MIN) {
    out.push({
      signature: "agent:drifting",
      severity: "info",
      title: t("{n} pacjentów dryfuje", { n: Math.round(drifting.value) }),
      detail: t(
        "Pół roku bez wizyty, bez otwartego e-maila i bez odpowiedzi. Część z nich odeszła po cichu.",
      ),
      proposedAction: t(
        "Zatwierdź draft kampanii reaktywacyjnej; kto nie zareaguje, wychodzi z aktywnej bazy.",
      ),
      evidence: { patients: String(Math.round(drifting.value)) },
      draft: {
        audienceSignal: "drifting",
        channel: "email",
        title: t("Reaktywacja — pół roku bez kontaktu"),
        message: t(
          "Dzień dobry {{firstName}}, dawno się nie widzieliśmy. Jeśli chcą Państwo nadal otrzymywać od nas informacje o badaniach i terminach, nie trzeba nic robić — a jeśli nie, wystarczy jedno kliknięcie w link poniżej.",
        ),
      },
    });
  }

  // ── the front desk's list for today ──────────────────────────────────────
  const noReply = overall("post_visit_no_reply");
  if (noReply && noReply.value >= 1) {
    out.push({
      signature: "agent:post-visit-no-reply",
      severity: "info",
      title: t("{n} pacjentów po wizycie bez odpowiedzi", { n: Math.round(noReply.value) }),
      detail: t("Wizyta w ostatnich 7 dniach, brak odpowiedzi od tego czasu i nic umówionego."),
      proposedAction: t("Lista do obdzwonienia dla rejestracji — zakładka PRM_Agent → Listy."),
      evidence: { patients: String(Math.round(noReply.value)) },
    });
  }
  if (highRiskVisits >= 1) {
    out.push({
      signature: "agent:high-risk-visits",
      severity: "info",
      title: t("{n} nadchodzących wizyt z ryzykiem nieobecności ≥ 30%", { n: highRiskVisits }),
      detail: t(
        "Z czynnikami przy każdej: wyprzedzenie rezerwacji, wcześniejsze nieobecności, pora, brak telefonu.",
      ),
      proposedAction: t(
        "Telefon dzień wcześniej do pacjentów z tej listy — zakładka PRM_Agent → Listy.",
      ),
      evidence: { visits: String(highRiskVisits) },
    });
  }

  return out;
}
