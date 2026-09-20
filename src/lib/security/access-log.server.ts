import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createGunzip } from "node:zlib";
import { createReadStream } from "node:fs";
import { t } from "@/lib/i18n";

/**
 * Odczyt i podsumowanie logu dostępowego Caddy.
 *
 * **Dlaczego to tu jest.** Aplikacja widzi tylko własne zdarzenia. Kto pukał pod
 * `/_serverFn/…` albo `/.mcp/…` i dostał 404, wie **wyłącznie Caddy** — żądanie
 * ginie na proxy i do aplikacji nie dociera. Bez tego pliku dobowy raport
 * bezpieczeństwa opisywałby połowę obrazu.
 *
 * **Nic stąd nie idzie do modelu w surowej postaci.** Log zawiera adresy IP
 * (dane osobowe) i **tokeny pacjentów w ścieżkach** — `/e/open/:token`,
 * `/unsubscribe/:token`, `/documents/:id`. Model dostaje wyłącznie liczby
 * i ścieżki po redakcji, nigdy pojedyncze wiersze. Redakcja dzieje się
 * **na wejściu**, w `redactPath`, żeby token nie zdążył trafić nigdzie indziej.
 */

/** Katalog montowany z hosta (patrz docker-compose.yml). */
const LOG_DIR = process.env.PRM_ACCESS_LOG_DIR || "/logs";

/**
 * Ścieżki, w których ostatni odcinek jest tajemnicą pacjenta.
 * Zostaje kształt ścieżki, znika to, co identyfikuje człowieka.
 */
const TOKEN_PATHS = [
  /^\/e\/open\/[^/]+/,
  /^\/e\/click\/[^/]+/,
  /^\/unsubscribe\/[^/]+/,
  /^\/documents\/[^/]+/,
  /^\/media-file\/[^/]+/,
  /^\/api\/webhooks\/[a-z-]+\/[^/]+/,
];

export function redactPath(raw: string): string {
  // Parametry zapytania lecą w całości: nigdy nie wiadomo, co ktoś tam wstawił.
  const withoutQuery = raw.split("?")[0] ?? raw;

  for (const rule of TOKEN_PATHS) {
    if (rule.test(withoutQuery)) {
      const parts = withoutQuery.split("/");
      parts[parts.length - 1] = "…";
      return parts.join("/");
    }
  }

  // Identyfikatory funkcji serwerowych to 64 znaki heksadecymalne. Same w sobie
  // nie są tajemnicą, ale w raporcie nic nie wnoszą i tylko zaśmiecają.
  if (withoutQuery.startsWith("/_serverFn/")) return "/_serverFn/…";

  return withoutQuery;
}

/** Adres IP skrócony do sieci — do zliczania „ilu różnych", bez zapisywania kto. */
export function coarseIp(ip: string): string {
  if (ip.includes(":")) {
    // IPv6: zostawiamy prefiks /48, resztę ucinamy.
    return ip.split(":").slice(0, 3).join(":") + "::/48";
  }
  const parts = ip.split(".");
  if (parts.length !== 4) return "?";
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

export interface AccessEntry {
  at: number;
  ip: string;
  path: string;
  status: number;
  method: string;
  userAgent: string;
}

interface RawCaddyLine {
  ts?: number;
  request?: {
    remote_ip?: string;
    method?: string;
    uri?: string;
    headers?: { "User-Agent"?: string[] };
  };
  status?: number;
}

/** Jedna linia logu Caddy (JSON) → nasz wiersz. `null`, gdy linia nie jest żądaniem. */
export function parseLine(line: string): AccessEntry | null {
  if (!line.startsWith("{")) return null;
  let raw: RawCaddyLine;
  try {
    raw = JSON.parse(line) as RawCaddyLine;
  } catch {
    // Ostatnia linia bywa ucięta w połowie zapisu — to normalne, nie awaria.
    return null;
  }
  if (!raw.request?.uri || typeof raw.status !== "number") return null;

  return {
    at: Math.round((raw.ts ?? 0) * 1000),
    ip: raw.request.remote_ip ?? "",
    path: redactPath(raw.request.uri),
    status: raw.status,
    method: raw.request.method ?? "",
    userAgent: raw.request.headers?.["User-Agent"]?.[0] ?? "",
  };
}

async function readLogFile(file: string): Promise<string> {
  if (file.endsWith(".gz")) {
    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      createReadStream(file)
        .pipe(createGunzip())
        .on("data", (c: Buffer) => chunks.push(c))
        .on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
        .on("error", reject);
    });
  }
  return await readFile(file, "utf8");
}

/**
 * Wiersze z ostatnich `hours` godzin.
 *
 * Czyta bieżący plik i te przewinięte, ale **tylko tknięte w oknie** — przy
 * trzydziestu plikach po 10 MB czytanie wszystkiego co dobę byłoby marnotrawstwem.
 * Brak katalogu nie jest awarią: przed wdrożeniem zmiany w `docker-compose.yml`
 * logu po prostu nie ma, a raport ma wtedy powiedzieć „nie widzę logów", a nie
 * przestać przychodzić.
 */
export async function readAccessLog(
  hours = 24,
  now = Date.now(),
): Promise<{ entries: AccessEntry[]; available: boolean; note?: string }> {
  const since = now - hours * 60 * 60 * 1000;

  let names: string[];
  try {
    names = await readdir(LOG_DIR);
  } catch {
    return {
      entries: [],
      available: false,
      note: t(
        "Nie widzę katalogu z logami ({LOG_DIR}). Czy wdrożono zmianę w docker-compose.yml?",
        { LOG_DIR: LOG_DIR },
      ),
    };
  }

  const candidates = names.filter((n) => n.startsWith("access.log"));
  if (candidates.length === 0) {
    return { entries: [], available: false, note: t("Katalog z logami jest pusty.") };
  }

  const entries: AccessEntry[] = [];
  for (const name of candidates) {
    const file = path.join(LOG_DIR, name);
    try {
      const info = await stat(file);
      // Plik zamknięty przed początkiem okna nie ma w środku nic świeżego.
      if (info.mtimeMs < since) continue;
      const text = await readLogFile(file);
      for (const line of text.split("\n")) {
        const entry = parseLine(line);
        if (entry && entry.at >= since) entries.push(entry);
      }
    } catch {
      // Plik w trakcie rotacji potrafi zniknąć między `readdir` a `read`.
      continue;
    }
  }

  entries.sort((a, b) => a.at - b.at);
  return { entries, available: true };
}

export interface SuspiciousSource {
  network: string;
  requests: number;
  blocked: number;
  paths: string[];
  agent: string;
}

export interface AccessSummary {
  available: boolean;
  note?: string;
  total: number;
  byStatusClass: Record<string, number>;
  serverFnAnonymous: number;
  mcpAttempts: number;
  notFound: number;
  serverErrors: number;
  topPaths: Array<{ path: string; hits: number }>;
  /** Sieci, które dostały najwięcej odmów — to one wyglądają na skanowanie. */
  suspicious: SuspiciousSource[];
}

/**
 * Podsumowanie do raportu. **Tu kończy się droga surowych danych** — dalej idą
 * już tylko liczby i ścieżki po redakcji.
 */
export function summarise(
  entries: AccessEntry[],
  available: boolean,
  note?: string,
): AccessSummary {
  const byStatusClass: Record<string, number> = {};
  const pathHits = new Map<string, number>();
  const sources = new Map<
    string,
    { requests: number; blocked: number; paths: Set<string>; agent: string }
  >();

  let serverFnAnonymous = 0;
  let mcpAttempts = 0;
  let notFound = 0;
  let serverErrors = 0;

  for (const e of entries) {
    const cls = `${Math.floor(e.status / 100)}xx`;
    byStatusClass[cls] = (byStatusClass[cls] ?? 0) + 1;
    pathHits.set(e.path, (pathHits.get(e.path) ?? 0) + 1);

    if (e.status === 404) notFound += 1;
    if (e.status >= 500) serverErrors += 1;
    if (e.path.startsWith("/.mcp") || e.path === "/mcp") mcpAttempts += 1;
    // Odmowa na funkcji serwerowej znaczy „ktoś próbował bez sesji".
    if (e.path.startsWith("/_serverFn") && (e.status === 307 || e.status === 401)) {
      serverFnAnonymous += 1;
    }

    const network = coarseIp(e.ip);
    const source = sources.get(network) ?? {
      requests: 0,
      blocked: 0,
      paths: new Set<string>(),
      agent: e.userAgent.slice(0, 60),
    };
    source.requests += 1;
    // Odmowa to nie tylko 401/403/404. Funkcja serwerowa wywołana bez sesji
    // odpowiada **przekierowaniem 307** na ekran logowania — gdyby to nie
    // liczyło się jako odmowa, systematyczne obmacywanie `/_serverFn/…`
    // (czyli dokładnie to, co było groźne) nie pojawiłoby się w raporcie wcale.
    const odmowa =
      e.status === 404 ||
      e.status === 403 ||
      e.status === 401 ||
      (e.path.startsWith("/_serverFn") && e.status === 307);
    if (odmowa) {
      source.blocked += 1;
      source.paths.add(e.path);
    }
    sources.set(network, source);
  }

  const suspicious = [...sources.entries()]
    .filter(([, v]) => v.blocked >= 5)
    .sort((a, b) => b[1].blocked - a[1].blocked)
    .slice(0, 5)
    .map(([network, v]) => ({
      network,
      requests: v.requests,
      blocked: v.blocked,
      paths: [...v.paths].slice(0, 8),
      agent: v.agent,
    }));

  const topPaths = [...pathHits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([p, hits]) => ({ path: p, hits }));

  return {
    available,
    note,
    total: entries.length,
    byStatusClass,
    serverFnAnonymous,
    mcpAttempts,
    notFound,
    serverErrors,
    topPaths,
    suspicious,
  };
}
