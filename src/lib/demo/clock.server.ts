import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { appSettings } from "../db/schema";
import { logStep } from "../engine/log.server";
import { warsawDay, warsawMinuteOfDay } from "../visits/warsaw-time";
import { demoResetHour, demoTickMs, isDemoMode } from "./mode.server";
import { DemoResetRefused, resetDemo } from "./seed.server";
import { simulateStep } from "./simulator.server";
import { t } from "@/lib/i18n";

/**
 * The demo on the engine clock — one hook, called from every engine tick.
 *
 * Does nothing unless `PRM_DEMO=1`. Then: the nightly reset (once a day after
 * `PRM_DEMO_RESET_HOUR`, and at once on a database the demo has never reset),
 * and a simulator step every `PRM_DEMO_TICK_SECONDS`. Never throws: a failed
 * step is logged, and the engine's own tick goes on.
 */

const RESET_KEY = "demo.reset.day";
const STATE_KEY = Symbol.for("prm.demo.state");

interface DemoClockState {
  lastStepAt: number;
  /** Set when the reset refused the database — no point asking every tick. */
  refused: boolean;
}

function state(): DemoClockState {
  const g = globalThis as unknown as Record<symbol, DemoClockState | undefined>;
  if (!g[STATE_KEY]) g[STATE_KEY] = { lastStepAt: 0, refused: false };
  return g[STATE_KEY]!;
}

/** Is a reset due: never done, or not yet today after the reset hour. */
export async function resetDue(now: number): Promise<boolean> {
  const row = await getDb().select().from(appSettings).where(eq(appSettings.key, RESET_KEY)).get();
  if (!row) return true;
  if (row.value === warsawDay(now)) return false;
  return warsawMinuteOfDay(now) >= demoResetHour() * 60;
}

async function markReset(now: number): Promise<void> {
  const value = warsawDay(now);
  await getDb()
    .insert(appSettings)
    .values({ key: RESET_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

export async function maybeRunDemo(now = Date.now()): Promise<void> {
  if (!isDemoMode()) return;
  const s = state();
  if (s.refused) return;
  try {
    if (await resetDue(now)) {
      await resetDemo(now);
      await markReset(now);
      s.lastStepAt = now;
      return;
    }
    if (now - s.lastStepAt < demoTickMs()) return;
    s.lastStepAt = now;
    await simulateStep(now);
  } catch (err) {
    if (err instanceof DemoResetRefused) s.refused = true;
    await logStep({
      kind: "error",
      message: t("Demo: krok symulatora nie powiódł się: {err}", {
        err: err instanceof Error ? err.message : String(err),
      }),
      detail: { source: "demo" },
    });
  }
}
