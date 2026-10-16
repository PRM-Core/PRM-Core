import process from "node:process";

/**
 * Demo mode — `PRM_DEMO=1`.
 *
 * An installation that shows PRM Core to the public on simulated patients.
 * Three things change, and nothing else:
 *
 * 1. **Nothing leaves the server.** E-mail and SMS transports and outgoing
 *    webhooks record what they would have sent in the demo outbox
 *    (`outbox.server.ts`) instead of calling SendGrid, Twilio or the receiver.
 *    The switch sits inside the transports themselves, so every path that
 *    sends — automations, campaigns, the inbox, the agent, login codes — is
 *    covered without any of them knowing about the demo.
 * 2. **The simulator runs on the engine clock** (`clock.server.ts`): leads,
 *    bookings, visits, opens, clicks and replies keep arriving.
 * 3. **The data is reset to the seed every night**, and on the first tick of
 *    an empty database.
 *
 * Never set it on a clinic's installation: the reset deletes patients. It
 * refuses to run on a database that was not created by the demo (see
 * `assertDemoDatabase` in `seed.server.ts`), but that is the second line of
 * defence, not the first.
 */
export function isDemoMode(): boolean {
  const v = (process.env.PRM_DEMO ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Seconds between simulator steps; `PRM_DEMO_TICK_SECONDS`, 30 by default, at least 5. */
export function demoTickMs(): number {
  const n = Number(process.env.PRM_DEMO_TICK_SECONDS);
  return Math.max(5, Number.isFinite(n) && n > 0 ? n : 30) * 1000;
}

/** Warsaw hour of the nightly reset; `PRM_DEMO_RESET_HOUR`, 3 by default. */
export function demoResetHour(): number {
  // Empty, as .env.example ships it, is "not set" — Number("") would be midnight.
  const raw = (process.env.PRM_DEMO_RESET_HOUR ?? "").trim();
  const n = Number(raw);
  return raw !== "" && Number.isInteger(n) && n >= 0 && n <= 23 ? n : 3;
}
