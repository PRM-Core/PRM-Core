import type { DirectionKey } from "../db/schema";
import { localized, t } from "@/lib/i18n";

/**
 * Directions of the agent's development — pure parts.
 *
 * The agent develops on its own inside the installation: it retrains its
 * models every night, keeps what the team approved as examples, and watches
 * what it could do next. What it may *start* doing is the administrator's
 * decision. A direction is proposed when the numbers give grounds for it;
 * nothing below runs until someone enables it on PRM_Agent → Kierunki.
 */

export interface DirectionInfo {
  title: string;
  /** What changes when it is enabled. */
  what: string;
  /** Why the agent proposes it — the condition, in words. */
  why: string;
}

export const DIRECTIONS: Record<DirectionKey, DirectionInfo> = localized(() => ({
  drafts_by_model: {
    title: t("Treść draftów pisana przez model"),
    what: t(
      "Nowy draft kampanii dostaje tekst napisany przez model w sieci placówki z faktów za sygnałem; szablon zostaje jako wersja zapasowa i do porównania. Do modelu nie trafia żaden pacjent.",
    ),
    why: t("Serwer modelu w sieci placówki jest skonfigurowany i odpowiada."),
  },
  brief_by_model: {
    title: t("Brief wygładzany przez model"),
    what: t(
      "Co noc brief dla zarządu dostaje wersję w pełnych zdaniach. Przyjmowana tylko wtedy, gdy zachowa każdą liczbę szablonu; inaczej zostaje szablon.",
    ),
    why: t("Serwer modelu w sieci placówki jest skonfigurowany i odpowiada."),
  },
  triage_by_model: {
    title: t("Triaż wiadomości przez model"),
    what: t(
      "Pilność, temat i właściciel wiadomości pacjenta oceniane przez model zamiast samych reguł; treść przechodzi przez pseudonimizację, odpowiedź liczy się tylko w ustalonych słownikach.",
    ),
    why: t("Serwer modelu w sieci placówki jest skonfigurowany i odpowiada."),
  },
  learn_from_approvals: {
    title: t("Uczenie się z decyzji zespołu"),
    what: t(
      "Zatwierdzone teksty draftów stają się przykładami „tak piszemy u nas”; poprawione przez rejestrację oceny wiadomości — przykładami „tak sortujemy”; odrzucona rekomendacja podnosi próg, przy którym wróci. Przykłady nie opuszczają bazy instalacji.",
    ),
    why: t(
      "Zespół podjął co najmniej jedną decyzję: zatwierdził draft, poprawił ocenę wiadomości albo odrzucił rekomendację.",
    ),
  },
  collect_phones: {
    title: t("Uzupełnianie brakujących telefonów"),
    what: t(
      "Pacjenci bez numeru telefonu trafiają na listę dla rejestracji (PRM_Agent → Listy) i do rekomendacji; bez telefonu nie ma SMS-a ani przypomnienia 2 godziny przed wizytą, a model ryzyka widzi to jako czynnik.",
    ),
    why: t("Co najmniej jedna piąta kontaktów nie ma numeru telefonu."),
  },
}));

export const DIRECTION_KEYS: DirectionKey[] = [
  "drafts_by_model",
  "brief_by_model",
  "triage_by_model",
  "learn_from_approvals",
  "collect_phones",
];

/** What the agent knows about its own situation tonight. */
export interface DevelopmentState {
  /** A model endpoint inside the perimeter is configured and allowed. */
  localModel: boolean;
  /** Decisions the team has taken: drafts approved, triages corrected, recommendations dismissed. */
  approvals: number;
  contacts: number;
  withoutPhone: number;
  /** The last run of the evaluation harness against the model in reach. */
  evaluation?: { passed: number; total: number } | null;
}

export const PHONE_GAP_SHARE = 0.2;
export const PHONE_GAP_MIN_CONTACTS = 20;

/** The directions the state gives grounds for, each with its evidence. */
export function deriveDirections(
  s: DevelopmentState,
): { key: DirectionKey; evidence: Record<string, string> }[] {
  const out: { key: DirectionKey; evidence: Record<string, string> }[] = [];
  if (s.localModel) {
    const evidence: Record<string, string> = { model: t("w sieci placówki, skonfigurowany") };
    evidence.sprawdzian = s.evaluation
      ? `${s.evaluation.passed}/${s.evaluation.total}`
      : t("nie uruchomiono — uruchom przed włączeniem");
    out.push({ key: "drafts_by_model", evidence });
    out.push({ key: "brief_by_model", evidence });
    out.push({ key: "triage_by_model", evidence });
  }
  if (s.approvals >= 1)
    out.push({ key: "learn_from_approvals", evidence: { approvals: String(s.approvals) } });
  if (s.contacts >= PHONE_GAP_MIN_CONTACTS && s.withoutPhone / s.contacts >= PHONE_GAP_SHARE)
    out.push({
      key: "collect_phones",
      evidence: {
        withoutPhone: String(s.withoutPhone),
        share: `${Math.round((s.withoutPhone / s.contacts) * 100)}%`,
      },
    });
  return out;
}
