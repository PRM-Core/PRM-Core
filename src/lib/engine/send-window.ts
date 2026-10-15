import { planBatch, windowLabel, type ThrottleState } from "../campaigns/throttle";
import { t } from "@/lib/i18n";

/**
 * When an automation message may go out — the campaigns' window and limits,
 * applied to the engine.
 *
 * Campaigns have had a sending window and an hourly / daily pace for long;
 * automations bypassed both, so a visit booked at 23:40 sent its
 * confirmation at 23:40, and ten flows that were each reasonable could
 * together send a burst the SMS operator reads as spam. The arithmetic is
 * the campaigns' own (`planBatch`), with a batch of one: a message step
 * either goes now or waits until the moment `planBatch` names.
 *
 * Pure: state and clock come in as arguments, so the edge cases — midnight,
 * a window across midnight, the change of time — are tested on paper.
 */

export interface MessageGate {
  /** Send now. */
  send: boolean;
  /** When to try again if not now (ms since epoch). */
  nextAt: number;
  /** What holds it back — for the log and the panel. */
  blockedBy: "window" | "hour" | "day" | null;
  /** The counters after the windows moved on — saved whether or not it sends. */
  state: Pick<ThrottleState, "hourWindowAt" | "hourSentCount" | "dayKey" | "daySentCount">;
}

/** A minute — when the arithmetic has no answer, try again soon rather than never. */
const RETRY_MS = 60_000;

/**
 * May one automation message go out now?
 *
 * @param ignoreWindow The automation asked to send at any hour; the limits
 *                     still apply, since they protect the sender, not the
 *                     patient's evening.
 */
export function gateMessage(state: ThrottleState, now: number, ignoreWindow: boolean): MessageGate {
  const d = planBatch(ignoreWindow ? { ...state, sendFrom: "", sendTo: "" } : state, now, 1);
  const counters = {
    hourWindowAt: d.hourWindowAt,
    hourSentCount: d.hourSentCount,
    dayKey: d.dayKey,
    daySentCount: d.daySentCount,
  };
  if (d.allowance >= 1) return { send: true, nextAt: now, blockedBy: null, state: counters };
  return {
    send: false,
    nextAt: d.nextAt && d.nextAt > now ? d.nextAt : now + RETRY_MS,
    blockedBy: d.blockedBy ?? "hour",
    state: counters,
  };
}

/** The counters after one message went out. */
export function countSent(state: MessageGate["state"]): MessageGate["state"] {
  return {
    ...state,
    hourSentCount: state.hourSentCount + 1,
    daySentCount: state.daySentCount + 1,
  };
}

/** Why a message waits, in a sentence for the engine log. */
export function deferralMessage(
  gate: MessageGate,
  window: { sendFrom: string; sendTo: string },
  at: string,
): string {
  if (gate.blockedBy === "window")
    return t("Poza godzinami wysyłki ({hours}) — wiadomość wyjdzie {at}.", {
      hours: windowLabel(window.sendFrom, window.sendTo),
      at,
    });
  if (gate.blockedBy === "day")
    return t("Dzienny limit wiadomości automatyzacji wyczerpany — wiadomość wyjdzie {at}.", {
      at,
    });
  return t("Limit wiadomości automatyzacji na godzinę — wiadomość wyjdzie {at}.", { at });
}

/** The window a new installation starts with — the hours a patient expects a message. */
export const DEFAULT_SEND_WINDOW = { sendFrom: "08:00", sendTo: "20:00" } as const;
