import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { appSettings, metaConnections } from "../db/schema";
import { getBaseUrl } from "../engine/settings.server";
import {
  authorizeUrl,
  exchangeCodeForLongLivedToken,
  fetchPages,
  subscribePage,
} from "./graph.server";

/**
 * Podłączanie stron Facebooka.
 *
 * **Dlaczego OAuth, a nie wklejanie tokenu z Graph API Explorera.** Token
 * z Eksploratora żyje godzinę i po niej leady przestają przychodzić bez
 * żadnego komunikatu — a nikt nie zauważy braku leadów tak szybko jak braku
 * wysyłki. Token wyprowadzony z długożyciowego tokenu użytkownika nie wygasa
 * sam, dopóki placówka nie zmieni hasła albo nie cofnie zgody aplikacji.
 */

const STATE_KEY = "meta_oauth_state";

/** Adres, na który Meta odeśle po zalogowaniu. Musi być identyczny w obu krokach. */
export async function redirectUri(): Promise<string> {
  return `${await getBaseUrl()}/api/meta/callback`;
}

/**
 * Jednorazowy `state` chroniący przed podstawieniem cudzego przekierowania.
 *
 * Bez niego ktokolwiek mógłby podesłać administratorowi odnośnik kończący się
 * na naszym `/callback` i podłączyć **swoją** stronę do konta placówki.
 */
export async function startConnect(): Promise<string> {
  const db = getDb();
  const state = randomUUID();
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, STATE_KEY)).get();
  if (existing) {
    await db.update(appSettings).set({ value: state }).where(eq(appSettings.key, STATE_KEY));
  } else {
    await db.insert(appSettings).values({ key: STATE_KEY, value: state });
  }
  return await authorizeUrl(await redirectUri(), state);
}

export async function consumeState(state: string): Promise<boolean> {
  const db = getDb();
  const row = await db.select().from(appSettings).where(eq(appSettings.key, STATE_KEY)).get();
  if (!row || !row.value || row.value !== state) return false;
  // Zużyty od razu — ten sam kod nie ma prawa przejść dwa razy.
  await db.update(appSettings).set({ value: "" }).where(eq(appSettings.key, STATE_KEY));
  return true;
}

export interface ConnectOutcome {
  connected: { pageId: string; pageName: string; subscribed: boolean; error?: string }[];
}

/**
 * Kod z przekierowania → tokeny stron → subskrypcja `leadgen`.
 *
 * Podłączamy **wszystkie strony, do których osoba ma dostęp**, bo placówka
 * i tak wybiera je potem na liście; pytanie „którą" przed poznaniem nazw byłoby
 * pytaniem o identyfikatory. Strona już podłączona dostaje odświeżony token,
 * a nie duplikat.
 */
export async function finishConnect(code: string): Promise<ConnectOutcome> {
  const db = getDb();
  const userToken = await exchangeCodeForLongLivedToken(code, await redirectUri());
  const pages = await fetchPages(userToken);
  const out: ConnectOutcome = { connected: [] };

  for (const page of pages) {
    const existing = await db
      .select()
      .from(metaConnections)
      .where(eq(metaConnections.pageId, page.id))
      .get();

    if (existing) {
      await db
        .update(metaConnections)
        .set({ pageName: page.name, pageAccessToken: page.access_token })
        .where(eq(metaConnections.pageId, page.id));
    } else {
      await db.insert(metaConnections).values({
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token,
        subscribed: 0,
        connectedAt: Date.now(),
      });
    }

    // Subskrypcja osobno: brak uprawnienia na JEDNEJ stronie nie może
    // przewrócić podłączania pozostałych.
    try {
      await subscribePage(page.id, page.access_token);
      await db
        .update(metaConnections)
        .set({ subscribed: 1, lastError: null, lastErrorAt: null })
        .where(eq(metaConnections.pageId, page.id));
      out.connected.push({ pageId: page.id, pageName: page.name, subscribed: true });
    } catch (err) {
      const message = String(err instanceof Error ? err.message : err);
      await db
        .update(metaConnections)
        .set({ subscribed: 0, lastError: message, lastErrorAt: Date.now() })
        .where(eq(metaConnections.pageId, page.id));
      out.connected.push({
        pageId: page.id,
        pageName: page.name,
        subscribed: false,
        error: message,
      });
    }
  }

  return out;
}
