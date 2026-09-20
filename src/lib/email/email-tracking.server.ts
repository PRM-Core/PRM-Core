import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { UNSUBSCRIBE_PLACEHOLDER } from "../content-builder";
import { emailSends } from "../db/schema";

// Real open/click tracking for sent emails: a per-send token is generated
// before sending, links in the HTML are rewritten to redirect through
// /e/click/:token (logging the click, then forwarding to the real URL), and
// a 1x1 pixel pointing at /e/open/:token is appended (logging the open when
// the recipient's mail client loads images). See routes e.open.$token.ts /
// e.click.$token.ts for the logging side.

/** Records a new send and returns its tracking token. Call before injectTracking(). */
export async function createTrackedSend(input: {
  toEmail: string;
  subject: string;
  contentItemId?: string;
  /** Kampania, jeśli to wysyłka do segmentu. Puste dla testów i automatyzacji. */
  campaignId?: string;
}): Promise<string> {
  const token = randomUUID();
  const db = getDb();
  await db.insert(emailSends).values({
    token,
    toEmail: input.toEmail,
    subject: input.subject,
    contentItemId: input.contentItemId ?? null,
    campaignId: input.campaignId ?? null,
    sentAt: Date.now(),
  });
  return token;
}

/** Cleans up the send record if the actual delivery (sendEmail) failed after the token was already minted. */
export async function deleteTrackedSend(token: string): Promise<void> {
  const db = getDb();
  await db.delete(emailSends).where(eq(emailSends.token, token));
}

/**
 * Only `<a href>` — a `<link href>` (the font stylesheet) must stay a direct
 * address: routed through the click redirect it would count every open in
 * Apple Mail as a click.
 */
function rewriteLinks(html: string, token: string, baseUrl: string): string {
  return html.replace(
    /(<a\b[^>]*?\shref=)"(https?:\/\/[^"]+)"/gi,
    (_match, before: string, url: string) => {
      const redirect = `${baseUrl}/e/click/${token}?u=${encodeURIComponent(url)}`;
      return `${before}"${redirect}"`;
    },
  );
}

/**
 * Swaps the unsubscribe placeholder for the real one-per-send address.
 *
 * Runs AFTER link rewriting on purpose: an opt-out routed through click
 * tracking would still work, but every unsubscribe would also be counted as
 * campaign engagement, which is exactly backwards.
 */
function fillUnsubscribe(html: string, token: string, baseUrl: string): string {
  return html.split(UNSUBSCRIBE_PLACEHOLDER).join(`${baseUrl}/unsubscribe/${token}`);
}

/**
 * Adres instalacji w miejsce `%%BASE_URL%%`.
 *
 * Używa go blok „Załączniki": plik leży pod `/media-file/<id>`, a odnośnik
 * w wiadomości musi być bezwzględny — względny prowadziłby donikąd, bo klient
 * pocztowy nie zna naszej domeny. Ta sama sztuczka co przy wypisaniu:
 * treść zapisuje znacznik, adres dokleja się przy wysyłce.
 */
export const BASE_URL_PLACEHOLDER = "%%BASE_URL%%";

function fillBaseUrl(html: string, baseUrl: string): string {
  return html.split(BASE_URL_PLACEHOLDER).join(baseUrl);
}

function appendPixel(html: string, token: string, baseUrl: string): string {
  const pixel = `<img src="${baseUrl}/e/open/${token}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`;
  return html.includes("</body>") ? html.replace("</body>", `${pixel}</body>`) : html + pixel;
}

/** Rewrites real (http/https) links to click-tracking redirects and appends the open-tracking pixel. */
export function injectTracking(html: string, token: string, baseUrl: string): string {
  // Adres instalacji podstawiany PRZED przepisaniem odnośników, żeby link do
  // pliku też przeszedł przez śledzenie kliknięć — pobranie planu leczenia
  // jest sygnałem wartym policzenia.
  return fillUnsubscribe(
    appendPixel(rewriteLinks(fillBaseUrl(html, baseUrl), token, baseUrl), token, baseUrl),
    token,
    baseUrl,
  );
}
