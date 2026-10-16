/**
 * Demo simulator from the command line — for a demo database only.
 *
 *   PRM_DEMO=1 bun scripts/demo-simulator.ts --reset          # back to the seed state
 *   PRM_DEMO=1 bun scripts/demo-simulator.ts --steps 120      # the last hour, replayed at once
 *   PRM_DEMO=1 bun scripts/demo-simulator.ts --loop           # a step every PRM_DEMO_TICK_SECONDS
 *
 * **Usually not needed.** With `PRM_DEMO=1` the running application does all
 * of this on its own engine clock: the reset every night and on an empty
 * database, a step every 30 seconds. The script is for a reset on demand, for
 * filling a fresh demo with an hour of traffic before showing it, and for a
 * demo whose application runs without the engine.
 *
 * It refuses to run without `PRM_DEMO=1`, and the reset itself refuses a
 * database with contacts that do not look like sample data — it deletes
 * patients. Steps go through the same entrances the application uses (the lead
 * and booking webhooks' intake, the tracking recorder, the inbox); what the
 * engine sends in response happens in the running application's next tick.
 */
import process from "node:process";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const { isDemoMode, demoTickMs } = await import("../src/lib/demo/mode.server");
if (!isDemoMode()) {
  console.error("Odmowa: ustaw PRM_DEMO=1 — ten skrypt jest wyłącznie dla bazy demonstracyjnej.");
  process.exit(1);
}

const { resetDemo, DemoResetRefused } = await import("../src/lib/demo/seed.server");
const { simulateStep } = await import("../src/lib/demo/simulator.server");

const sum = (a: Record<string, number>, b: Record<string, number>) => {
  for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v;
  return a;
};
const line = (t: Record<string, number>) =>
  Object.entries(t)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ") || "nic";

try {
  if (flag("reset")) {
    const s = await resetDemo();
    console.log(
      `Reset: ${s.contacts} kontaktów, ${s.visits} wizyt (${s.resolvedVisits} rozstrzygniętych), ${s.automations} automatyzacji.`,
    );
  }

  const steps = Number(value("steps") ?? 0);
  if (steps > 0) {
    const total: Record<string, number> = {};
    // The steps replay the time just past, 30 s apart, ending now: visits booked
    // "in an hour" end within the run, and nothing is stamped in the future.
    let now = Date.now() - steps * 30_000;
    for (let i = 0; i < steps; i++) {
      sum(total, { ...(await simulateStep(now)) });
      now += 30_000;
    }
    console.log(`${steps} kroków: ${line(total)}.`);
  }

  if (flag("loop")) {
    console.log(`Symulator działa (krok co ${demoTickMs() / 1000} s). Ctrl+C kończy.`);
    for (;;) {
      const s = await simulateStep();
      const text = line({ ...s });
      if (text !== "nic") console.log(`${new Date().toISOString()}  ${text}`);
      await new Promise((r) => setTimeout(r, demoTickMs()));
    }
  }

  if (!flag("reset") && !(steps > 0) && !flag("loop"))
    console.log("Nic do zrobienia — podaj --reset, --steps N albo --loop.");
  process.exit(0);
} catch (err) {
  if (err instanceof DemoResetRefused) {
    console.error(err.message);
    process.exit(2);
  }
  throw err;
}
