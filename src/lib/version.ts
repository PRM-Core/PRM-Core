/**
 * Which build is actually running.
 *
 * Injected at build time (`VITE_APP_VERSION`, `VITE_APP_COMMIT` — the deploy
 * script passes the git tag and short SHA) rather than read from package.json,
 * so the number on the screen is the number that was built, not the number
 * somebody last edited in the repo. In development both fall back to "dev",
 * which is the honest answer there.
 */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || "dev";
export const APP_COMMIT = import.meta.env.VITE_APP_COMMIT || "";

/** "1.0.0 · a1b2c3d" — one line for the settings footer and the health check. */
export function versionLabel(): string {
  return APP_COMMIT ? `${APP_VERSION} · ${APP_COMMIT}` : APP_VERSION;
}
