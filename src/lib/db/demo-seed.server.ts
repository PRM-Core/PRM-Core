import process from "node:process";

/**
 * Whether this installation may plant demo data into an empty table.
 *
 * The lazy seeds (eight fictional patients, six sample automations, three
 * funnels) exist so a fresh checkout has something to click on. On a clinic's
 * production instance they are the opposite of helpful: "Anna Kowalska" and
 * "Piotr Nowak" would appear in a real patient base on day one, count towards
 * every KPI, and — because seeded contacts carry granted consents — sit inside
 * the audience of the first real campaign.
 *
 * So the rule is inverted for production: seed only when somebody asks.
 *
 * - `PRM_SEED_DEMO=1` — yes, even in production (a demo instance)
 * - `PRM_SEED_DEMO=0` — no, even in development
 * - unset — development seeds, production does not
 */
export function shouldSeedDemoData(): boolean {
  const flag = process.env.PRM_SEED_DEMO;
  if (flag === "1" || flag?.toLowerCase() === "true") return true;
  if (flag === "0" || flag?.toLowerCase() === "false") return false;
  return process.env.NODE_ENV !== "production";
}
