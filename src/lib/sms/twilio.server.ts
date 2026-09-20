import process from "node:process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getCredential, getCredentials } from "@/lib/credentials/store.server";
import { t } from "@/lib/i18n";

export class TwilioError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "TwilioError";
  }
}

export interface SendSmsInput {
  to: string;
  fromNumber: string;
  body: string;
}

/** Real Twilio Messages API call. Server-only — the auth token never leaves this module. */
export async function sendSms(input: SendSmsInput): Promise<void> {
  const { TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: authToken } = await getCredentials(
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
  );
  if (!accountSid || !authToken) {
    throw new TwilioError(
      t(
        "Brak skonfigurowanych danych Twilio — uzupełnij je w Integracje → Klucze i dane dostępowe.",
      ),
    );
  }
  if (!input.fromNumber) {
    throw new TwilioError("Brak numeru nadawcy — ustaw go w Integracje > SMS API > Konfiguruj.");
  }

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: input.to,
        From: input.fromNumber,
        Body: input.body,
      }),
    },
  );

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body?.message || detail;
    } catch {
      // response body wasn't JSON — fall back to statusText
    }
    throw new TwilioError(
      t("Twilio odrzucił wysyłkę: {detail}", { detail: detail }),
      response.status,
    );
  }
}

// ── inbound webhook authentication ──────────────────────────────────────────

/**
 * Twilio's request signature: HMAC-SHA1 over the full request URL with every
 * POST parameter appended as key+value in alphabetical order, keyed by the
 * account's auth token.
 *
 * Exported so a test can reproduce it — the whole point of this endpoint is
 * that it rejects anything not signed by Twilio, which is impossible to check
 * by hand otherwise.
 */
export function twilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
): string {
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(Buffer.from(payload, "utf-8")).digest("base64");
}

/**
 * True when this request really came from Twilio.
 *
 * `url` must be the address **Twilio** called, not whatever the local process
 * sees: behind a reverse proxy the app is reached over plain http on an
 * internal port, while the signature was computed over the public https URL.
 * Callers pass the configured base URL for exactly this reason.
 */
export async function verifyTwilioSignature(input: {
  url: string;
  params: Record<string, string>;
  signature: string;
}): Promise<boolean> {
  const authToken = await getCredential("TWILIO_AUTH_TOKEN");
  if (!authToken || !input.signature) return false;
  const expected = Buffer.from(twilioSignature(input.url, input.params, authToken));
  const received = Buffer.from(input.signature);
  // Length check first — timingSafeEqual throws on mismatched buffers.
  return expected.length === received.length && timingSafeEqual(expected, received);
}
