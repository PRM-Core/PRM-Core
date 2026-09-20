import { statfs } from "node:fs/promises";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { and, eq, gte, like, or } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { engineLog, sessions, users } from "../db/schema";
import { APP_VERSION } from "../version";
import { getBaseUrl } from "../engine/settings.server";
import { intlLocale, t } from "@/lib/i18n";

/**
 * Deterministyczne sprawdzenia stanu bezpieczeństwa.
 *
 * **Wszystko tutaj liczy kod, nie model.** Model dostanie gotowe liczby do
 * zinterpretowania — proszony o zliczanie wierszy prędzej czy później się
 * pomyli, a pomyłka w liczbach raportu bezpieczeństwa jest gorsza niż brak
 * raportu: buduje spokój, który nie ma pokrycia.
 *
 * Ta sama lista co w `scripts/sprawdz-bezpieczenstwo.sh`, tyle że pytana
 * z wnętrza serwera i raz na dobę.
 */

/**
 * Adres, pod który raport ma się dobijać z zewnątrz. Do 1.59.0 był tu zaszyty
 * adres jednej placówki, przez co każda inna instalacja sprawdzałaby cudzy
 * serwer i dostawała raport o nieswoim stanie. `PRM_PUBLIC_URL` zostaje jako
 * furtka (np. gdy raport ma pytać po adresie wewnętrznym), ale domyślnie
 * pytamy o to samo, co reszta aplikacji.
 */
async function publicUrl(): Promise<string> {
  const fromEnv = process.env.PRM_PUBLIC_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return getBaseUrl();
}
const DATA_DIR = process.env.PRM_DATA_DIR || "/data";

export interface Check {
  nazwa: string;
  ok: boolean;
  szczegol: string;
}

/** Identyfikator `getAllContacts` — funkcji, która oddaje najwięcej danych pacjentów. */
const KARTOTEKI_FN = "02709757d15c4dae99170c06ff2c342420e3d822eea38442817cb450565b81c0";

async function checkPublicSurface(): Promise<Check[]> {
  const PUBLIC_URL = await publicUrl();
  const checks: Check[] = [];

  // 1. Funkcja serwerowa bez sesji — najważniejsze pytanie w całym raporcie.
  try {
    const res = await fetch(`${PUBLIC_URL}/_serverFn/${KARTOTEKI_FN}`, {
      headers: { "x-tsr-serverFn": "true" },
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.text()).slice(0, 2000);
    const wyciek = body.includes("pesel") || body.includes("prmId");
    checks.push({
      nazwa: t("Funkcje serwerowe wymagają zalogowania"),
      ok: !wyciek && body.includes("isSerializedRedirect"),
      szczegol: wyciek
        ? t("ODDAJĄ KARTOTEKI BEZ LOGOWANIA — to wyciek danych pacjentów")
        : t("bez sesji odsyłają na ekran logowania"),
    });
  } catch (err) {
    checks.push({
      nazwa: t("Funkcje serwerowe wymagają zalogowania"),
      ok: false,
      szczegol: t("nie udało się sprawdzić: {v0}", {
        v0: err instanceof Error ? err.message : t("błąd"),
      }),
    });
  }

  // 2. Trasy MCP.
  for (const sciezka of ["/mcp", "/.mcp/invoke-tool/list_contacts"]) {
    try {
      const res = await fetch(`${PUBLIC_URL}${sciezka}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"limit":1}',
        signal: AbortSignal.timeout(20_000),
      });
      checks.push({
        nazwa: t("Trasa {sciezka} zamknięta", { sciezka: sciezka }),
        ok: res.status === 404,
        szczegol: `odpowiada ${res.status}${res.status === 404 ? "" : " — powinno 404"}`,
      });
    } catch {
      checks.push({
        nazwa: t("Trasa {sciezka} zamknięta", { sciezka: sciezka }),
        ok: false,
        szczegol: "brak odpowiedzi",
      });
    }
  }

  // 3. Nagłówki i certyfikat.
  try {
    const res = await fetch(`${PUBLIC_URL}/login`, { signal: AbortSignal.timeout(20_000) });
    const wymagane = [
      "strict-transport-security",
      "x-content-type-options",
      "x-frame-options",
      "permissions-policy",
    ];
    const brakuje = wymagane.filter((h) => !res.headers.get(h));
    checks.push({
      nazwa: t("Nagłówki bezpieczeństwa"),
      ok: brakuje.length === 0,
      szczegol: brakuje.length === 0 ? "komplet" : `brakuje: ${brakuje.join(", ")}`,
    });
    checks.push({
      nazwa: "Strona logowania odpowiada",
      ok: res.ok,
      szczegol: `HTTP ${res.status}`,
    });
  } catch (err) {
    checks.push({
      nazwa: t("Nagłówki bezpieczeństwa"),
      ok: false,
      szczegol: t("nie udało się sprawdzić: {v0}", {
        v0: err instanceof Error ? err.message : t("błąd"),
      }),
    });
  }

  // 4. /health nie wystawia szczegółów anonimowo.
  try {
    const res = await fetch(`${PUBLIC_URL}/health`, { signal: AbortSignal.timeout(20_000) });
    const body = await res.text();
    checks.push({
      nazwa: t("/health bez szczegółów dla anonimowych"),
      ok: body.trim() === '{"status":"ok"}',
      szczegol:
        body.length > 80 ? t("wystawia szczegóły: {v0}…", { v0: body.slice(0, 80) }) : body.trim(),
    });
  } catch {
    checks.push({
      nazwa: t("/health bez szczegółów dla anonimowych"),
      ok: false,
      szczegol: "brak odpowiedzi",
    });
  }

  return checks;
}

/** Kopie bazy — najświeższa i ile ich jest. Kopia sprzed tygodnia to brak kopii. */
async function checkBackups(): Promise<Check> {
  const dir = path.join(DATA_DIR, "backups");
  try {
    const names = (await readdir(dir)).filter((n) => n.endsWith(".db") || n.endsWith(".db.gz"));
    if (names.length === 0)
      return { nazwa: "Kopie bazy", ok: false, szczegol: "brak jakiejkolwiek kopii" };

    let newest = 0;
    for (const name of names) {
      const info = await stat(path.join(dir, name));
      newest = Math.max(newest, info.mtimeMs);
    }
    const dni = Math.floor((Date.now() - newest) / 86_400_000);
    return {
      nazwa: "Kopie bazy",
      ok: dni <= 7,
      szczegol: t("{length} kopii, najświeższa sprzed {dni} dni", {
        length: names.length,
        dni: dni,
      }),
    };
  } catch {
    return {
      nazwa: "Kopie bazy",
      ok: false,
      szczegol: t("nie widzę katalogu {dir}", { dir: dir }),
    };
  }
}

/** Miejsce na dysku. Baza, której nie ma gdzie zapisać, to awaria bez ostrzeżenia. */
async function checkDisk(): Promise<Check> {
  try {
    const fs = await statfs(DATA_DIR);
    const wolneGb = (fs.bavail * fs.bsize) / 1024 ** 3;
    const calosc = (fs.blocks * fs.bsize) / 1024 ** 3;
    const procent = calosc > 0 ? (wolneGb / calosc) * 100 : 0;
    return {
      nazwa: t("Miejsce na dysku"),
      ok: procent >= 10,
      szczegol: t("{v0} GB wolnego z {v1} GB ({v2}%)", {
        v0: wolneGb.toFixed(1),
        v1: calosc.toFixed(1),
        v2: procent.toFixed(0),
      }),
    };
  } catch {
    return {
      nazwa: t("Miejsce na dysku"),
      ok: true,
      szczegol: t("nie udało się odczytać — pomijam"),
    };
  }
}

export interface SecuritySnapshot {
  wersja: string;
  checks: Check[];
  /** Blokady z ogranicznika prób logowania — realne próby zgadywania hasła. */
  blokadyLogowania: number;
  /** Błędy silnika z doby — nie są incydentem bezpieczeństwa, ale zmieniają obraz. */
  bledySilnika: Array<{ message: string; kiedy: string }>;
  /** Ilu ludzi ma aktywną sesję. Nagły wzrost w nocy jest sygnałem. */
  aktywneSesje: number;
  administratorzy: number;
  awarieBramkiSms: number;
}

export async function collectSecuritySnapshot(now = Date.now()): Promise<SecuritySnapshot> {
  const db = getDb();
  const doba = now - 24 * 60 * 60 * 1000;

  const [publiczne, kopie, dysk, blokady, bledy, sesje, admini, bramka] = await Promise.all([
    checkPublicSurface(),
    checkBackups(),
    checkDisk(),
    db
      .select({ id: engineLog.id })
      .from(engineLog)
      .where(
        and(
          // Tagged in detail; the message is translated. Polish text = older rows.
          or(
            like(engineLog.detail, '%"source":"login-throttle"%'),
            like(engineLog.message, "%BLOKADA LOGOWANIA%"),
          ),
          gte(engineLog.createdAt, doba),
        ),
      ),
    db
      .select({ message: engineLog.message, createdAt: engineLog.createdAt })
      .from(engineLog)
      .where(and(eq(engineLog.kind, "error"), gte(engineLog.createdAt, doba)))
      .limit(12),
    db.select({ id: sessions.id }).from(sessions).where(gte(sessions.expiresAt, now)),
    db.select({ id: users.id }).from(users).where(eq(users.role, "admin")),
    db
      .select({ id: engineLog.id })
      .from(engineLog)
      .where(
        and(
          or(
            like(engineLog.detail, '%"source":"2fa-gateway"%'),
            like(engineLog.message, "%bramki SMS%"),
          ),
          gte(engineLog.createdAt, doba),
        ),
      ),
  ]);

  return {
    wersja: APP_VERSION,
    checks: [...publiczne, kopie, dysk],
    blokadyLogowania: blokady.length,
    bledySilnika: bledy.map((b) => ({
      message: b.message.slice(0, 200),
      kiedy: new Date(b.createdAt).toLocaleString(intlLocale(), { timeZone: "Europe/Warsaw" }),
    })),
    aktywneSesje: sesje.length,
    administratorzy: admini.length,
    awarieBramkiSms: bramka.length,
  };
}
