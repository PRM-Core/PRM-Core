import { TOPIC_LABELS, URGENCY_LABELS } from "./triage";
import type { TriageTopic, TriageUrgency } from "../db/schema";
import { intlLocale, t } from "@/lib/i18n";

/**
 * The patient in three sentences, for whoever picks up the phone or the
 * reply: their visits, what is ahead of them, and where the correspondence
 * stands. From visits and correspondence only — no notes, no model — so
 * every word can be checked against the record, and it reads the same with
 * the AI switched off.
 */

export interface SummaryFacts {
  /** Completed visits, oldest first is not needed — only counts and the last one. */
  completed: number;
  noShows: number;
  cancelled: number;
  firstVisitAt: number | null;
  lastVisit: { at: number; title: string; doctor: string } | null;
  nextVisit: { at: number; title: string; doctor: string; risk: number | null } | null;
  lastInbound: { at: number; channel: string; preview: string; answered: boolean } | null;
  openTriage: { urgency: string; topic: string } | null;
  lastOutbound: {
    at: number;
    channel: "email" | "sms";
    subject: string;
    opened: boolean | null;
  } | null;
}

function day(ms: number): string {
  return new Date(ms).toLocaleDateString(intlLocale(), {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
function dayTime(ms: number): string {
  return new Date(ms).toLocaleString(intlLocale(), {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
const who = (title: string, doctor: string) => [title, doctor].filter(Boolean).join(", ");

/** Three sentences: visits, ahead, correspondence. */
export function summarize(f: SummaryFacts): string[] {
  // 1. Visits so far.
  let visits: string;
  if (f.completed === 0 && f.noShows === 0) {
    visits = f.cancelled
      ? t("Jeszcze bez odbytej wizyty ({n} odwołanych).", { n: f.cancelled })
      : t("Jeszcze bez odbytej wizyty.");
  } else {
    const since = f.firstVisitAt
      ? t("Pacjent od {date}", { date: day(f.firstVisitAt) })
      : t("Pacjent");
    const last = f.lastVisit
      ? t(", ostatnio {date} ({who})", {
          date: day(f.lastVisit.at),
          who: who(f.lastVisit.title, f.lastVisit.doctor) || "—",
        })
      : "";
    const misses =
      f.noShows > 0 ? t("; nieobecności: {n}", { n: f.noShows }) : t("; bez nieobecności");
    visits = t("{since}: {n} odbytych wizyt{last}{misses}.", {
      since,
      n: f.completed,
      last,
      misses,
    });
  }

  // 2. Ahead.
  let ahead: string;
  if (f.nextVisit) {
    const risk =
      f.nextVisit.risk !== null && f.nextVisit.risk >= 0.3
        ? t(" — ryzyko nieobecności {p}, warto przypomnieć", {
            p: `${Math.round(f.nextVisit.risk * 100)}%`,
          })
        : "";
    ahead = t("Wizyta umówiona na {when} ({who}){risk}.", {
      when: dayTime(f.nextVisit.at),
      who: who(f.nextVisit.title, f.nextVisit.doctor) || "—",
      risk,
    });
  } else {
    ahead = t("Nic nie jest umówione.");
  }

  // 3. Correspondence.
  let mail: string;
  if (f.lastInbound) {
    const triage = f.openTriage
      ? t(" — {u}, {topic}", {
          u: URGENCY_LABELS[f.openTriage.urgency as TriageUrgency] ?? f.openTriage.urgency,
          topic: TOPIC_LABELS[f.openTriage.topic as TriageTopic] ?? f.openTriage.topic,
        })
      : "";
    mail = f.lastInbound.answered
      ? t(
          "Ostatnia wiadomość od pacjenta {date} ({channel}): „{preview}” — odpowiedziano{triage}.",
          {
            date: day(f.lastInbound.at),
            channel: f.lastInbound.channel,
            preview: f.lastInbound.preview,
            triage,
          },
        )
      : t("Czeka na odpowiedź od {date} ({channel}): „{preview}”{triage}.", {
          date: day(f.lastInbound.at),
          channel: f.lastInbound.channel,
          preview: f.lastInbound.preview,
          triage,
        });
  } else if (f.lastOutbound) {
    const read =
      f.lastOutbound.opened === null
        ? ""
        : f.lastOutbound.opened
          ? t(", otwarta")
          : t(", nieotwarta");
    mail = t(
      "Bez wiadomości od pacjenta; ostatnia od placówki {date} ({channel}{subject}{read}).",
      {
        date: day(f.lastOutbound.at),
        channel: f.lastOutbound.channel === "sms" ? "SMS" : "e-mail",
        subject: f.lastOutbound.subject ? t(": „{s}”", { s: f.lastOutbound.subject }) : "",
        read,
      },
    );
  } else {
    mail = t("Bez korespondencji w systemie.");
  }
  return [visits, ahead, mail];
}

/** A message cut to a preview a person can read in one glance. */
export function preview(text: string, max = 90): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
}
