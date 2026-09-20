import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { appSettings } from "../db/schema";
import { getBaseUrl } from "../engine/settings.server";
import { authorizeUrl, canvaConfigured, makePkce } from "./oauth.server";
import { t } from "@/lib/i18n";

/**
 * Rozpoczęcie logowania do Canvy.
 *
 * `state` i `code_verifier` odkładamy w ustawieniach aplikacji, nie w sesji
 * przeglądarki: powrót z Canvy to **nowe żądanie**, a przy zapisie w pamięci
 * procesu logowanie przestawałoby działać po każdym wdrożeniu w trakcie.
 * Jednorazowe — zużywane przy powrocie.
 */

const STATE_KEY = "canva_oauth_state";
const VERIFIER_KEY = "canva_oauth_verifier";

async function put(key: string, value: string): Promise<void> {
  const db = getDb();
  const istnieje = await db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  if (istnieje) {
    await db.update(appSettings).set({ value }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value });
  }
}

async function take(key: string): Promise<string> {
  const db = getDb();
  const row = await db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  if (!row) return "";
  await db.delete(appSettings).where(eq(appSettings.key, key));
  return row.value;
}

export async function canvaRedirectUri(): Promise<string> {
  const base = (await getBaseUrl()).replace(/\/$/, "");
  return `${base}/api/canva/callback`;
}

export async function startCanvaConnect(): Promise<string> {
  if (!(await canvaConfigured())) {
    throw new Error(
      t(
        "Brak Client ID albo Client secret Canvy — uzupełnij w Integracje → Klucze i dane dostępowe.",
      ),
    );
  }
  const state = randomBytes(16).toString("hex");
  const { verifier, challenge } = makePkce();
  await put(STATE_KEY, state);
  await put(VERIFIER_KEY, verifier);
  return await authorizeUrl(await canvaRedirectUri(), state, challenge);
}

/** Sprawdza `state` i oddaje `code_verifier`. Pusty ciąg = odrzucone. */
export async function consumeCanvaState(state: string): Promise<string> {
  const oczekiwany = await take(STATE_KEY);
  const verifier = await take(VERIFIER_KEY);
  if (!oczekiwany || oczekiwany !== state) return "";
  return verifier;
}
