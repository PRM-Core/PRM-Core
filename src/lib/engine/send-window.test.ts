/**
 * When an automation message may go out — the arithmetic on paper: the
 * window, a window across midnight, the opt-out, the hourly pace and the
 * daily limit. No database, no clock.
 */
import { describe, expect, test } from "bun:test";
import { countSent, deferralMessage, gateMessage } from "./send-window";
import type { ThrottleState } from "../campaigns/throttle";

/** A moment in Warsaw time (CEST in October: UTC+2). */
const at = (iso: string) => new Date(`${iso}+02:00`).getTime();

const state = (over: Partial<ThrottleState> = {}): ThrottleState => ({
  sendFrom: "08:00",
  sendTo: "20:00",
  perHourLimit: null,
  perDayLimit: null,
  hourWindowAt: null,
  hourSentCount: 0,
  dayKey: "",
  daySentCount: 0,
  ...over,
});

describe("the sending window", () => {
  test("inside the window a message goes now", () => {
    expect(gateMessage(state(), at("2026-10-15T12:00:00"), false).send).toBe(true);
  });

  test("a booking at 23:40 waits for 08:00 the next morning", () => {
    const g = gateMessage(state(), at("2026-10-15T23:40:00"), false);
    expect(g.send).toBe(false);
    expect(g.blockedBy).toBe("window");
    expect(g.nextAt).toBe(at("2026-10-16T08:00:00"));
  });

  test("before the window opens, it waits for the same morning", () => {
    const g = gateMessage(state(), at("2026-10-15T06:30:00"), false);
    expect(g.nextAt).toBe(at("2026-10-15T08:00:00"));
  });

  test("a window across midnight (22:00–06:00) is two pieces of the day", () => {
    const night = state({ sendFrom: "22:00", sendTo: "06:00" });
    expect(gateMessage(night, at("2026-10-15T23:00:00"), false).send).toBe(true);
    expect(gateMessage(night, at("2026-10-15T05:59:00"), false).send).toBe(true);
    expect(gateMessage(night, at("2026-10-15T12:00:00"), false).send).toBe(false);
  });

  test("no window (an installation from before 2.12.0) sends at any hour", () => {
    const any = state({ sendFrom: "", sendTo: "" });
    expect(gateMessage(any, at("2026-10-15T03:00:00"), false).send).toBe(true);
  });

  test("an automation that opted out sends at night — but the limits still hold", () => {
    expect(gateMessage(state(), at("2026-10-15T23:40:00"), true).send).toBe(true);
    const spent = state({ perDayLimit: 5, dayKey: "2026-10-15", daySentCount: 5 });
    const g = gateMessage(spent, at("2026-10-15T23:40:00"), true);
    expect(g.send).toBe(false);
    expect(g.blockedBy).toBe("day");
  });
});

describe("the limits, across all automations", () => {
  test("the hourly pace spreads messages out instead of a burst", () => {
    const now = at("2026-10-15T12:00:00");
    // 60 an hour = one a minute; the first goes at once.
    let s = state({ perHourLimit: 60 });
    const first = gateMessage(s, now, false);
    expect(first.send).toBe(true);
    s = { ...s, ...countSent(first.state) };
    const second = gateMessage(s, now + 10_000, false);
    expect(second.send).toBe(false);
    expect(second.blockedBy).toBe("hour");
    expect(second.nextAt).toBe(now + 60_000);
    expect(gateMessage(s, now + 60_000, false).send).toBe(true);
  });

  test("past the daily limit, it waits until midnight; a new day starts from zero", () => {
    const s = state({ perDayLimit: 3, dayKey: "2026-10-15", daySentCount: 3 });
    const g = gateMessage(s, at("2026-10-15T15:00:00"), false);
    expect(g.send).toBe(false);
    expect(g.blockedBy).toBe("day");
    expect(g.nextAt).toBe(at("2026-10-16T00:00:00"));
    // At midnight the window is closed — the window speaks first.
    const morning = gateMessage(s, at("2026-10-16T09:00:00"), false);
    expect(morning.send).toBe(true);
    expect(morning.state.daySentCount).toBe(0);
  });

  test("a message counts once, toward the hour and the day", () => {
    const g = gateMessage(state({ perHourLimit: 10 }), at("2026-10-15T12:00:00"), false);
    expect(countSent(g.state)).toMatchObject({ hourSentCount: 1, daySentCount: 1 });
  });
});

test("the log says why and when", () => {
  const g = gateMessage(state(), at("2026-10-15T23:40:00"), false);
  const msg = deferralMessage(g, { sendFrom: "08:00", sendTo: "20:00" }, "2026-10-16 08:00");
  expect(msg).toContain("08:00–20:00");
  expect(msg).toContain("2026-10-16 08:00");
});
