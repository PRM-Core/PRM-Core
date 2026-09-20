import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

/**
 * Applies pending migrations, and nothing else.
 *
 * Run by the container on every start, before the server accepts a request.
 * The migrator keeps its own table of what it has already applied, so this is
 * safe to run on every boot and on an already-current database.
 *
 * **`drizzle-kit push` must never be used against a real installation.** It
 * diffs the schema and rewrites the database to match, which silently drops
 * columns and the data in them. Only the numbered files in `migrations/` ever
 * touch a production database, and each one that removes something carries the
 * statements that move the data first (see migrations 0022 and 0025).
 */
const url = process.env.DATABASE_URL || "file:./data/prm-core.db";
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;
const folder = process.env.MIGRATIONS_DIR || "./migrations";

console.log(`[migrate] baza: ${url.replace(/authToken=[^&]+/, "authToken=***")}`);

const db = drizzle(createClient({ url, authToken }));

try {
  await migrate(db, { migrationsFolder: folder });
  console.log("[migrate] migracje zastosowane.");
  process.exit(0);
} catch (err) {
  console.error("[migrate] BŁĄD — serwer nie wystartuje:", err);
  // Exiting non-zero stops the container before it can serve a request against
  // a schema the code does not expect. Failing loudly beats serving wrong data.
  process.exit(1);
}
