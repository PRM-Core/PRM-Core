import { createHash, randomBytes } from "node:crypto";
import process from "node:process";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { canvaConnections } from "../db/schema";
import { getCredential, getCredentials } from "@/lib/credentials/store.server";
import { t } from "@/lib/i18n";

/**
 * Logowanie do Canvy (OAuth 2.0 + PKCE).
 *
 * **Dlaczego PKCE, skoro mamy sekret klienta.** Wymiana kodu na token idzie
 * z serwera, więc sam sekret by wystarczył — ale Canva wymaga `code_challenge`,
 * a poza tym PKCE zamyka jedyne okno, w którym kod autoryzacyjny jest do
 * przechwycenia: przelot przez przeglądarkę użytkownika.
 *
 * **Adresy trzymamy w stałych, nie w kodzie rozsianym po pliku** — jeśli Canva
 * je przesunie, jest jedno miejsce do poprawienia, a błąd pierwszego logowania
 * powie dokładnie, który adres nie odpowiedział.
 */

const AUTHORIZE_URL = "https://www.canva.com/api/oauth/authorize";
export const TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
const PROFILE_URL = "https://api.canva.com/rest/v1/users/me/profile";

/**
 * Zakresy, o które prosimy — **tylko odczyt**.
 *
 * `design:meta` daje listę projektów, `design:content` jest wymagany do
 * eksportu, `folder` pozwala przeglądać projekty w folderach zamiast jednego
 * długiego ciągu, `profile` służy wyłącznie do pokazania, czyje konto jest
 * podłączone. Żadnego zapisu: gdyby token wyciekł, obcy najwyżej zobaczy
 * projekty — nie zmieni ich, nie skasuje i nie udostępni na zewnątrz.
 */
export const CANVA_SCOPES = [
  "design:meta:read",
  "design:content:read",
  "folder:read",
  "profile:read",
].join(" ");

export async function canvaConfigured(): Promise<boolean> {
  const c = await getCredentials("CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET");
  return !!c.CANVA_CLIENT_ID && !!c.CANVA_CLIENT_SECRET;
}

/** `code_verifier` + `code_challenge` w postaci, jakiej wymaga PKCE (S256). */
export function makePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function authorizeUrl(
  redirectUri: string,
  state: string,
  challenge: string,
): Promise<string> {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", await getCredential("CANVA_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CANVA_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
  message?: string;
}

/**
 * Wywołanie punktu tokenów. Sekret idzie nagłówkiem `Authorization: Basic`,
 * bo tak wymaga Canva dla klientów poufnych.
 */
async function tokenCall(body: Record<string, string>): Promise<TokenResponse> {
  const c = await getCredentials("CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET");
  const basic = Buffer.from(`${c.CANVA_CLIENT_ID}:${c.CANVA_CLIENT_SECRET}`).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  let parsed: TokenResponse = {};
  try {
    parsed = JSON.parse(text) as TokenResponse;
  } catch {
    // Odpowiedź nie-JSON przy błędzie bramy albo błędnej ścieżce. Treść
    // przycinamy, ale **nie gubimy** — bez niej pierwsze logowanie kończy się
    // komunikatem „nie udało się" bez żadnej wskazówki, co poprawić.
    throw new Error(
      t("Canva odpowiedziała nieczytelnie (HTTP {status}): {v1}", {
        status: res.status,
        v1: text.slice(0, 200),
      }),
    );
  }
  if (!res.ok || !parsed.access_token) {
    const powod =
      parsed.error_description || parsed.message || parsed.error || `HTTP ${res.status}`;
    throw new Error(t("Canva odrzuciła wymianę tokenu: {powod}", { powod: powod }));
  }
  return parsed;
}

async function fetchAccountName(accessToken: string): Promise<string> {
  try {
    const res = await fetch(PROFILE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { profile?: { display_name?: string } };
    return data.profile?.display_name ?? "";
  } catch {
    // Nazwa konta jest wygodą, nie warunkiem działania — brak nie może
    // przerwać połączenia.
    return "";
  }
}

/** Wymiana kodu autoryzacyjnego na tokeny i zapis połączenia. */
export async function completeConnection(input: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<{ accountName: string; scopes: string }> {
  const token = await tokenCall({
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.verifier,
    redirect_uri: input.redirectUri,
  });

  const accessToken = token.access_token!;
  const accountName = await fetchAccountName(accessToken);
  const db = getDb();
  const wiersz = {
    id: "default",
    accountName,
    accessToken,
    refreshToken: token.refresh_token ?? "",
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
    scopes: token.scope ?? CANVA_SCOPES,
    connectedAt: Date.now(),
    lastError: null,
    lastErrorAt: null,
  };

  const istnieje = await db
    .select()
    .from(canvaConnections)
    .where(eq(canvaConnections.id, "default"))
    .get();
  if (istnieje) {
    await db.update(canvaConnections).set(wiersz).where(eq(canvaConnections.id, "default"));
  } else {
    await db.insert(canvaConnections).values(wiersz);
  }
  return { accountName, scopes: wiersz.scopes };
}

/**
 * Ważny token dostępu — odświeżany **z zapasem dwóch minut**.
 *
 * Odświeżanie dokładnie w chwili wygaśnięcia przegrywa z opóźnieniem sieci
 * i kończy się losowym „401" w środku importu.
 */
export async function validAccessToken(): Promise<string | null> {
  const db = getDb();
  const row = await db
    .select()
    .from(canvaConnections)
    .where(eq(canvaConnections.id, "default"))
    .get();
  if (!row) return null;
  if (row.expiresAt - 120_000 > Date.now()) return row.accessToken;
  if (!row.refreshToken) return null;

  try {
    const token = await tokenCall({ grant_type: "refresh_token", refresh_token: row.refreshToken });
    await db
      .update(canvaConnections)
      .set({
        accessToken: token.access_token!,
        // Canva potrafi oddać nowy refresh token; stary przestaje wtedy działać.
        refreshToken: token.refresh_token ?? row.refreshToken,
        expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
        lastError: null,
        lastErrorAt: null,
      })
      .where(eq(canvaConnections.id, "default"));
    return token.access_token!;
  } catch (err) {
    await db
      .update(canvaConnections)
      .set({
        lastError:
          err instanceof Error ? err.message.slice(0, 300) : t("nieznany błąd odświeżania"),
        lastErrorAt: Date.now(),
      })
      .where(eq(canvaConnections.id, "default"));
    return null;
  }
}

export async function getConnection() {
  return getDb().select().from(canvaConnections).where(eq(canvaConnections.id, "default")).get();
}

export async function disconnectCanva(): Promise<void> {
  await getDb().delete(canvaConnections).where(eq(canvaConnections.id, "default"));
}

/**
 * „Sprawdź połączenie” dla podłączonego konta: ważny token (w razie potrzeby
 * odświeżony — tak samo jak przed każdym importem) i nazwa konta z Canvy.
 * `null` — konta nie podłączono.
 */
export async function checkCanvaAccount(): Promise<{ ok: boolean; accountName: string } | null> {
  if (!(await getConnection())) return null;
  const token = await validAccessToken();
  if (!token) return { ok: false, accountName: "" };
  const res = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { ok: false, accountName: "" };
  const data = (await res.json().catch(() => null)) as {
    profile?: { display_name?: string };
  } | null;
  return { ok: true, accountName: data?.profile?.display_name ?? "" };
}
