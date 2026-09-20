#!/usr/bin/env bun
/**
 * Nocna kopia bazy PRM Core.
 *
 * Uruchamiana wewnątrz kontenera aplikacji (`scripts/backup.sh`), bo tam jest
 * Bun i `@libsql/client` — host nie musi mieć `sqlite3`.
 *
 * Kopię robi `VACUUM INTO`, a nie `cp`. Zwykłe kopiowanie pliku, po którym
 * silnik właśnie pisze, potrafi złapać bazę w połowie transakcji i dać plik,
 * który wygląda jak baza, a nie otwiera się w dniu, w którym jest potrzebny.
 * `VACUUM INTO` zapisuje spójny stan przy działającej aplikacji.
 *
 * Każda kopia jest OTWIERANA I SPRAWDZANA zaraz po zapisie. Backup, którego
 * nikt nigdy nie odczytał, jest tylko nadzieją na backup.
 */

import { createClient } from "@libsql/client";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const DB_URL = process.env.DATABASE_URL || "file:/data/prm-core.db";
const DB_FILE = DB_URL.replace(/^file:/, "");
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_FILE), "backups");
/** Ile nocnych kopii zostaje. 30 = miesiąc wstecz. */
const KEEP = Number.parseInt(process.env.BACKUP_KEEP || "30", 10);

/** Znacznik czasu w czasie warszawskim — nazwa pliku ma się zgadzać z tym, co pamięta człowiek. */
function stamp() {
  const w = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Warsaw" });
  return w.replace(/[-: ]/g, "").slice(0, 8) + "-" + w.replace(/[-: ]/g, "").slice(8, 14);
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
  await mkdir(BACKUP_DIR, { recursive: true });

  const name = `nightly-${stamp()}.db`;
  const raw = path.join(BACKUP_DIR, name);
  const gz = `${raw}.gz`;

  // ── 1. Spójna kopia ───────────────────────────────────────────────────────
  // VACUUM INTO odmawia zapisu do istniejącego pliku. Gdyby poprzedni przebieg
  // przerwał się między kopią a kompresją, niedokończony plik zostałby tu na
  // zawsze i blokował KAŻDY kolejny backup — cicho, bo cron nikomu tego nie
  // powie. Niedokończona kopia i tak jest bezwartościowa, więc znika.
  await rm(raw, { force: true });

  const db = createClient({ url: DB_URL });
  // Ścieżka trafia do SQL-a, więc apostrofy są podwajane — katalog backupów
  // pochodzi z konfiguracji, ale zasada jest tańsza niż wyjątek od niej.
  await db.execute(`VACUUM INTO '${raw.replace(/'/g, "''")}'`);
  db.close();

  // ── 2. Weryfikacja: kopia musi się otworzyć i zawierać dane ──────────────
  const check = createClient({ url: `file:${raw}` });
  const integrity = await check.execute("PRAGMA quick_check");
  const verdict = String(Object.values(integrity.rows[0] ?? {})[0] ?? "");
  if (verdict !== "ok") {
    check.close();
    await rm(raw, { force: true });
    throw new Error(`Kopia nie przeszła quick_check: ${verdict}. Plik usunięty.`);
  }
  const counted = await check.execute("SELECT COUNT(*) AS n FROM contacts");
  const contacts = Number(counted.rows[0]?.n ?? 0);
  check.close();

  const rawSize = (await stat(raw)).size;

  // ── 3. Kompresja ──────────────────────────────────────────────────────────
  await pipeline(createReadStream(raw), createGzip({ level: 9 }), createWriteStream(gz));
  await rm(raw, { force: true });
  const gzSize = (await stat(gz)).size;

  console.log(
    `✓ ${path.basename(gz)} · kontaktów: ${contacts} · ${mb(rawSize)} → ${mb(gzSize)} · quick_check ok`,
  );

  // ── 4. Retencja ───────────────────────────────────────────────────────────
  // Dotyczy WYŁĄCZNIE kopii nocnych. Kopie wydaniowe (`prm-core-<wersja>-*.db`)
  // robi deploy.sh i ma własną retencję — te dwa zbiory nigdy się nie mieszają.
  const all = (await readdir(BACKUP_DIR))
    .filter((f) => f.startsWith("nightly-") && f.endsWith(".db.gz"))
    .sort()
    .reverse();
  const stale = all.slice(KEEP);
  for (const f of stale) await rm(path.join(BACKUP_DIR, f), { force: true });
  console.log(
    `  kopii nocnych: ${Math.min(all.length, KEEP)}${stale.length ? ` (usunięto ${stale.length} najstarszych)` : ""}`,
  );
}

main().catch((err) => {
  console.error(`✗ Backup NIEUDANY: ${err.message}`);
  process.exit(1);
});
