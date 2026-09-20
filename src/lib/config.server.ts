import process from "node:process";
import { t } from "@/lib/i18n";

// Server-only config. The .server.ts suffix prevents Vite from bundling
// this file into the client — values here never reach the browser.
//
// On Cloudflare Workers, env binds at REQUEST time. Module-scope reads
// (e.g. `const x = process.env.X`) resolve to undefined — always read
// process.env INSIDE a function or handler.
//
// When to use which env-access pattern:
//   - .server.ts module (this file): server-only helpers reused across
//     handlers. Wrap reads in a function so they run per-request.
//   - inline process.env inside a createServerFn handler: one-off reads
//     not reused elsewhere.
//   - import.meta.env.VITE_FOO: PUBLIC config readable from both client
//     and server (analytics IDs, public URLs). Define in .env with the
//     VITE_ prefix. Never put secrets here — they ship to the browser.

export function getServerConfig() {
  return {
    nodeEnv: process.env.NODE_ENV,
    // Add server-only values here, e.g.:
    //   databaseUrl: process.env.DATABASE_URL,
    //   stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  };
}

/**
 * Nazwa placówki, która ma się pojawiać w treściach generowanych przez system:
 * temat i stopka dobowego raportu bezpieczeństwa, prompty PRM_Agenta.
 *
 * Pusta wartość jest poprawna i oznacza „nie wiemy” — wtedy teksty mówią
 * o „placówce” bez nazwy. Do 1.59.0 w tych miejscach siedziała na sztywno
 * nazwa jednej kliniki, przez co każda inna instalacja dostawała cudzą.
 *
 * Ustawiane w `.env` (`PRM_ORG_NAME`), bo to konfiguracja instancji, nie kod.
 */
export function getOrgName(): string {
  return (process.env.PRM_ORG_NAME ?? "").trim();
}

/** „PRM Core · Klinika ABC” albo samo „PRM Core”, gdy nazwy nie podano. */
export function withOrgName(prefix: string, separator = " · "): string {
  const org = getOrgName();
  return org ? `${prefix}${separator}${org}` : prefix;
}

/**
 * Dopełniacz do wstawienia w prompt: „placówki Klinika ABC” albo — gdy
 * nazwy nie podano — „placówki medycznej”. Model dostaje zdanie poprawne
 * gramatycznie w obu wariantach.
 */
export function opisPlacowki(): string {
  const org = getOrgName();
  return org ? t("placówki {org}", { org: org }) : t("placówki medycznej");
}
