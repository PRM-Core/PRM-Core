import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client.server";
import { APP_COMMIT, APP_VERSION } from "@/lib/version";
import { getSessionUser } from "@/lib/auth/session.server";

/**
 * What the deploy script asks before it decides a release succeeded.
 *
 * It checks the two things that can be broken while the process still answers
 * on the port: the database is readable, and the schema is at the migration the
 * code expects. A health check that only proves "something is listening" would
 * green-light a release that lost its database.
 *
 * **Publiczny, ale odchudzony.** Anonimowo oddaje wyłącznie
 * `status` — tyle, ile potrzebuje monitoring uptime'u i skrypt wdrożeniowy
 * pytający „czy wstało". Wersja, znacznik migracji i liczba kontaktów wracają
 * **tylko dla zalogowanej sesji**.
 *
 * Powód: numer wersji podpowiada napastnikowi, których podatności szukać,
 * a liczba kontaktów to informacja handlowa o placówce. Żadna z nich nie jest
 * potrzebna do stwierdzenia, że usługa żyje.
 *
 * `deploy.sh` woła to **z wnętrza kontenera**, gdzie i tak nie ma sesji —
 * i wystarcza mu kod odpowiedzi, bo o zdrowiu bazy decyduje 200 vs 503.
 */
export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        let dbOk = false;
        let migration = "";
        let contacts = -1;
        let error = "";

        try {
          const db = getDb();
          const applied = await db.all<{ hash: string; created_at: number }>(
            sql`select hash, created_at from __drizzle_migrations order by created_at desc limit 1`,
          );
          migration = applied[0] ? new Date(applied[0].created_at).toISOString() : "brak";
          const counted = await db.get<{ n: number }>(sql`select count(*) as n from contacts`);
          contacts = counted?.n ?? -1;
          dbOk = true;
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        }

        // Szczegóły wyłącznie dla zalogowanych. Treść błędu też: potrafi
        // nieść ścieżki i nazwy tabel, czyli mapę systemu dla obcego.
        const user = await getSessionUser().catch(() => null);

        return new Response(
          JSON.stringify({
            status: dbOk ? "ok" : "error",
            ...(user
              ? {
                  version: APP_VERSION,
                  commit: APP_COMMIT,
                  database: dbOk ? "ok" : "unreachable",
                  lastMigration: migration,
                  contacts,
                  checkedInMs: Date.now() - started,
                  ...(error ? { error } : {}),
                }
              : {}),
          }),
          {
            status: dbOk ? 200 : 503,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          },
        );
      },
    },
  },
});
