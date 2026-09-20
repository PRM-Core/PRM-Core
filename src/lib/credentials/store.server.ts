import process from "node:process";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { integrationCredentials, type IntegrationCredentialRow } from "../db/schema";
import { logStep } from "../engine/log.server";
import {
  CREDENTIAL_NAMES,
  credentialHint,
  credentialProblem,
  fieldOf,
  integrationOf,
  isCredentialName,
  type CredentialName,
  type CredentialStatus,
} from "./catalog";
import {
  CredentialCryptoError,
  decryptCredential,
  encryptCredential,
  readMasterKey,
} from "./crypto.server";
import { t } from "@/lib/i18n";

/**
 * Odczyt i zapis danych dostępowych integracji.
 *
 * **Jedyna droga do klucza w kodzie serwera: `getCredential(nazwa)`.** Kolejność:
 * wpis z panelu (odszyfrowany) → ta sama nazwa z `.env` → pusty napis.
 * Pusty napis znaczy „nie skonfigurowano" i każdy klient integracji zgłasza to
 * po swojemu, jak dotąd.
 *
 * **Wpis, którego nie da się odszyfrować, nie blokuje systemu** — odczyt spada
 * na `.env`, a panel pokazuje problem. Zmiana `PRM_SECRETS_KEY` nie może
 * zatrzymać wysyłek, jeśli w `.env` nadal są stare klucze.
 *
 * **Pamięć podręczna 30 s na proces.** Wysyłka kampanii czyta klucz tysiące
 * razy; zapytanie do bazy przy każdej wiadomości nie ma sensu. Zapis z panelu
 * czyści pamięć od razu, więc w tym procesie zmiana działa natychmiast; skrypty
 * uruchamiane obok zobaczą ją najpóźniej po 30 s.
 */

const TTL_MS = 30_000;

let cache: { url: string; loadedAt: number; rows: Map<string, IntegrationCredentialRow> } | null =
  null;

function forget(): void {
  cache = null;
}

async function rows(): Promise<Map<string, IntegrationCredentialRow>> {
  const url = process.env.DATABASE_URL ?? "";
  if (cache && cache.url === url && Date.now() - cache.loadedAt < TTL_MS) return cache.rows;
  let loaded: IntegrationCredentialRow[] = [];
  try {
    loaded = await getDb().select().from(integrationCredentials).all();
  } catch (err) {
    // Tabela może nie istnieć w bazie sprzed migracji 0065 (np. skrypt
    // uruchomiony na starej kopii). Wtedy działamy jak przed panelem: `.env`.
    console.error(t("[PRM] nie udało się odczytać integration_credentials — używam .env"), err);
  }
  cache = { url, loadedAt: Date.now(), rows: new Map(loaded.map((r) => [r.name, r])) };
  return cache.rows;
}

function envValue(name: CredentialName): string {
  return process.env[name] ?? "";
}

type Resolved =
  | { source: "panel"; value: string; row: IntegrationCredentialRow }
  | {
      source: "env" | "none";
      value: string;
      problem: CredentialStatus["problem"];
      row?: IntegrationCredentialRow;
    };

async function resolve(name: CredentialName): Promise<Resolved> {
  const row = (await rows()).get(name);
  let problem: CredentialStatus["problem"] = null;
  if (row) {
    const master = readMasterKey();
    if (master.state === "ok") {
      try {
        return {
          source: "panel",
          value: decryptCredential(row.ciphertext, name, row.keyId, master.master),
          row,
        };
      } catch (err) {
        problem =
          err instanceof CredentialCryptoError && err.reason === "key-mismatch"
            ? "key-mismatch"
            : "corrupt";
      }
    } else {
      problem = "key-missing";
    }
  }
  const env = envValue(name);
  return { source: env ? "env" : "none", value: env, problem, row };
}

/** Wartość pola: panel → `.env` → "". Tylko po stronie serwera. */
export async function getCredential(name: CredentialName): Promise<string> {
  return (await resolve(name)).value;
}

export async function getCredentials<N extends CredentialName>(
  ...names: N[]
): Promise<Record<N, string>> {
  const out = {} as Record<N, string>;
  for (const name of names) out[name] = await getCredential(name);
  return out;
}

export type MasterKeyStatus = "ok" | "missing" | "invalid";

export function masterKeyStatus(): MasterKeyStatus {
  return readMasterKey().state;
}

/** Stan wszystkich pól dla panelu — bez wartości sekretów. */
export async function listCredentialStatuses(): Promise<CredentialStatus[]> {
  const out: CredentialStatus[] = [];
  for (const name of CREDENTIAL_NAMES) {
    const r = await resolve(name);
    const problem = r.source === "panel" ? null : r.problem;
    out.push({
      name,
      source: r.source,
      hint: r.source === "panel" ? r.row.hint : r.value ? credentialHint(name, r.value) : "",
      updatedAt: r.row?.updatedAt ?? null,
      updatedBy: r.row?.updatedBy ?? "",
      problem,
    });
  }
  return out;
}

export class CredentialStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialStoreError";
  }
}

function requireMaster() {
  const master = readMasterKey();
  if (master.state === "missing") {
    throw new CredentialStoreError(
      t("Zapis z panelu wymaga klucza głównego PRM_SECRETS_KEY w pliku .env na serwerze."),
    );
  }
  if (master.state === "invalid") {
    throw new CredentialStoreError(
      t("PRM_SECRETS_KEY w pliku .env ma zły format — potrzebne 64 znaki szesnastkowe."),
    );
  }
  return master.master;
}

function describe(names: CredentialName[]): string {
  const groups = new Map<string, string[]>();
  for (const name of names) {
    const integration = integrationOf(name).name;
    groups.set(integration, [...(groups.get(integration) ?? []), fieldOf(name).label]);
  }
  return [...groups].map(([i, labels]) => `${i} (${labels.join(", ")})`).join("; ");
}

/**
 * Zapis kilku pól naraz. Najpierw sprawdzenie wszystkich — przy błędzie
 * w jednym nie zapisuje się żadne, żeby nie zostawić integracji z nowym
 * identyfikatorem i starym sekretem.
 */
export async function saveCredentials(
  values: Record<string, string>,
  who: string,
  logPrefix = t("Zmieniono dane dostępowe w panelu"),
): Promise<CredentialName[]> {
  const master = requireMaster();
  const entries: [CredentialName, string][] = [];
  const problems: string[] = [];
  for (const [name, value] of Object.entries(values)) {
    if (!isCredentialName(name))
      throw new CredentialStoreError(t("Nieznane pole: {name}.", { name: name }));
    const problem = credentialProblem(name, value);
    if (problem) problems.push(`${fieldOf(name).label}: ${problem}`);
    else entries.push([name, value]);
  }
  if (problems.length) throw new CredentialStoreError(problems.join(" "));
  if (!entries.length) return [];

  const db = getDb();
  const now = Date.now();
  for (const [name, value] of entries) {
    const row = {
      name,
      ciphertext: encryptCredential(value, name, master),
      keyId: master.id,
      hint: credentialHint(name, value),
      updatedBy: who,
      updatedAt: now,
    };
    await db
      .insert(integrationCredentials)
      .values(row)
      .onConflictDoUpdate({ target: integrationCredentials.name, set: row });
  }
  forget();

  const names = entries.map(([n]) => n);
  // Do dziennika trafia kto i co — nigdy wartość ani jej końcówka.
  await logStep({
    kind: "security",
    message: `${logPrefix}: ${describe(names)}.`,
    detail: { source: "integracje-klucze", pola: names.join(","), kto: who },
  });
  return names;
}

export interface EnvImportResult {
  imported: CredentialName[];
  /** Wartości z `.env`, których format się nie zgadza — zostają w `.env`. */
  skipped: { name: CredentialName; label: string; problem: string }[];
}

/**
 * Przeniesienie do panelu wartości, z których system dziś korzysta z `.env`.
 *
 * Bierze **tylko** pola, dla których obowiązuje `.env`: bez wpisu w panelu
 * albo z wpisem nieczytelnym (np. po zmianie klucza szyfrującego). Wpisu
 * czytelnego nigdy nie nadpisuje — to, co ktoś świadomie ustawił w panelu,
 * wygrywa z plikiem. Plik `.env` zostaje nietknięty.
 *
 * Wartość, która nie przechodzi sprawdzenia formatu, jest pomijana i zgłaszana,
 * a nie zapisywana „bo przecież działała” — `.env` dalej ją obsługuje, więc nic
 * się nie psuje.
 */
export async function importCredentialsFromEnv(who: string): Promise<EnvImportResult> {
  requireMaster();
  const values: Record<string, string> = {};
  const skipped: EnvImportResult["skipped"] = [];
  for (const name of CREDENTIAL_NAMES) {
    const r = await resolve(name);
    if (r.source !== "env") continue;
    const problem = credentialProblem(name, r.value);
    if (problem)
      skipped.push({
        name,
        label: `${integrationOf(name).name} — ${fieldOf(name).label}`,
        problem,
      });
    else values[name] = r.value;
  }
  const imported = await saveCredentials(
    values,
    who,
    t("Przeniesiono dane dostępowe z .env do panelu"),
  );
  return { imported, skipped };
}

/** Usunięcie wpisu z panelu — system wraca do wartości z `.env`, jeśli jest. */
export async function clearCredential(name: string, who: string): Promise<void> {
  if (!isCredentialName(name))
    throw new CredentialStoreError(t("Nieznane pole: {name}.", { name: name }));
  const deleted = await getDb()
    .delete(integrationCredentials)
    .where(eq(integrationCredentials.name, name))
    .returning({ name: integrationCredentials.name });
  forget();
  if (!deleted.length) return;
  await logStep({
    kind: "security",
    message: t("Usunięto z panelu dane dostępowe: {v0}.", { v0: describe([name]) }),
    detail: { source: "integracje-klucze", pola: name, kto: who },
  });
}

/**
 * Nowy token MCP. Zwracany **raz** — w bazie zostaje tylko zaszyfrowany,
 * a panel pokazuje później już tylko końcówkę.
 */
export async function generateMcpToken(who: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await saveCredentials({ PRM_MCP_TOKEN: token }, who);
  return token;
}

/** Tylko dla testów. */
export function __forgetCredentialCache(): void {
  forget();
}
