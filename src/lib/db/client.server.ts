import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import process from "node:process";
import * as schema from "./schema";

// Server-only. Only works under the node-server build target (local `bun run
// dev` and the OSS Docker image) — the Cloudflare Workers target has no
// filesystem for a local SQLite file. Wrapped in a function per the
// per-request-env caveat documented in config.server.ts.

let cached: ReturnType<typeof drizzle<typeof schema>> | null = null;
/**
 * Adres, dla którego powstało zapamiętane połączenie. Na produkcji nigdy się
 * nie zmienia, więc zachowanie jest jak dawniej. Liczy się w testach: kilka
 * plików testowych w jednym procesie stawia każdy własną bazę, a połączenie
 * zapamiętane bez adresu kierowało drugi plik do bazy pierwszego.
 */
let cachedUrl = "";

export function getDb() {
  const url = process.env.DATABASE_URL || "file:./local.db";
  if (cached && cachedUrl === url) return cached;
  // **Czekanie na blokadę zapisu (1.64.3).** SQLite pozwala pisać jednemu
  // procesowi naraz. Bez limitu drugi zapis kończył się natychmiast błędem
  // `SQLITE_BUSY` — tak przerwał się skrypt uzupełniania zgód uruchomiony obok
  // działającej aplikacji. 10 s z zapasem
  // wystarcza na każdy zapis silnika; zmierzone czekanie przy blokadzie 2 s
  // z innego procesu: ~1,3 s, potem zapis przechodzi.
  const client = createClient({ url, timeout: 10_000 });
  cached = drizzle(client, { schema });
  cachedUrl = url;
  return cached;
}
