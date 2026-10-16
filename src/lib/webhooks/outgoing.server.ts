import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { webhookEndpoints } from "../db/schema";
import { logStep } from "../engine/log.server";
import {
  decryptCredential,
  encryptCredential,
  masterFor,
  readMasterKey,
} from "../credentials/crypto.server";
import { t } from "@/lib/i18n";
import {
  buildPayload,
  checkWebhookUrl,
  WEBHOOK_FIELDS,
  type WebhookContactSource,
  type WebhookContext,
} from "./outgoing";

// Outgoing webhook destinations and the delivery itself. Destinations are an
// administrator's business (address, secret, which fields may leave); an
// automation step only names one. The address and the secret are stored
// encrypted, read back only at the moment of sending, and the address is
// checked again then — an old row must not outlive a tightened rule.

const TIMEOUT_MS = 10_000;

export class WebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookError";
  }
}

/** HMAC-SHA256 of "<timestamp>.<body>" — see docs/WEBHOOK-OUTGOING.md for the receiver's check. */
export function signWebhook(secret: string, timestamp: number, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export interface WebhookEndpointView {
  id: string;
  name: string;
  host: string;
  fields: string[];
  updatedBy: string;
  updatedAt: number;
}

function master() {
  const state = readMasterKey();
  if (state.state !== "ok")
    throw new WebhookError(
      t(
        "Webhooki wychodzące wymagają klucza PRM_SECRETS_KEY w .env — adres i sekret są przechowywane zaszyfrowane.",
      ),
    );
  return state.master;
}

const urlName = (id: string) => `webhook:${id}:url`;
const secretName = (id: string) => `webhook:${id}:secret`;

function urlReason(reason: "invalid" | "insecure" | "credentials"): string {
  if (reason === "insecure")
    return t(
      "Adres poza siecią placówki musi zaczynać się od https:// — dane pacjenta nie mogą iść otwartym tekstem.",
    );
  if (reason === "credentials")
    return t("Adres nie może zawierać loginu ani hasła — do tego służy sekret podpisu.");
  return t("To nie jest poprawny adres http(s).");
}

export async function listWebhookEndpoints(): Promise<WebhookEndpointView[]> {
  const rows = await getDb().select().from(webhookEndpoints);
  return rows
    .map(({ id, name, host, fields, updatedBy, updatedAt }) => ({
      id,
      name,
      host,
      fields,
      updatedBy,
      updatedAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Creates or updates a destination. A new one needs an address; its secret
 * is generated here and returned once, to paste into the receiver — it is
 * never shown again. `rotateSecret` does the same for an existing one.
 */
export async function saveWebhookEndpoint(
  input: {
    id?: string;
    name: string;
    url?: string;
    fields: string[];
    rotateSecret?: boolean;
  },
  who: string,
): Promise<{ id: string; secret: string | null }> {
  const m = master();
  const db = getDb();
  const name = input.name.trim();
  if (!name) throw new WebhookError(t("Podaj nazwę odbiorcy."));
  const fields = input.fields.filter((f) => (WEBHOOK_FIELDS as readonly string[]).includes(f));
  const existing = input.id
    ? await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, input.id)).get()
    : undefined;
  if (input.id && !existing) throw new WebhookError(t("Nie ma takiego odbiorcy."));
  const id = existing?.id ?? randomUUID();

  // A row still under the previous key (mid-rotation) is moved to the current
  // one here — the row's key id must describe every value in it.
  const reencrypt = (stored: string, field: string) => {
    if (!existing || existing.keyId === m.id) return stored;
    const old = masterFor(existing.keyId);
    if (!old) throw new WebhookError(t("Odbiorca zapisany innym kluczem — podaj adres ponownie."));
    return encryptCredential(decryptCredential(stored, field, existing.keyId, old), field, m);
  };
  let host = existing?.host ?? "";
  let urlEnc = existing ? reencrypt(existing.urlEnc, urlName(id)) : "";
  if (input.url !== undefined && input.url.trim() !== "") {
    const check = checkWebhookUrl(input.url);
    if (!check.ok) throw new WebhookError(urlReason(check.reason));
    host = check.host;
    urlEnc = encryptCredential(input.url.trim(), urlName(id), m);
  }
  if (!urlEnc) throw new WebhookError(t("Podaj adres odbiorcy."));

  let secret: string | null = null;
  let secretEnc =
    existing && !input.rotateSecret ? reencrypt(existing.secretEnc, secretName(id)) : "";
  if (!existing || input.rotateSecret) {
    secret = randomBytes(32).toString("hex");
    secretEnc = encryptCredential(secret, secretName(id), m);
  }

  const values = {
    name,
    host,
    urlEnc,
    secretEnc,
    keyId: m.id,
    fields,
    updatedBy: who,
    updatedAt: Date.now(),
  };
  if (existing) await db.update(webhookEndpoints).set(values).where(eq(webhookEndpoints.id, id));
  else await db.insert(webhookEndpoints).values({ id, ...values });
  // Where patient data may go is an administrator's decision; the log keeps
  // who made it, for which host and fields — never the address or secret.
  await logStep({
    kind: "action",
    message: t("{who}: odbiorca webhooka „{name}” ({host}) {what}; pola: numer PRM{fields}.", {
      who,
      name,
      host,
      what: !existing ? t("dodany") : input.rotateSecret ? t("— nowy sekret") : t("zmieniony"),
      fields: fields.length > 0 ? `, ${fields.join(", ")}` : "",
    }),
    detail: { webhook: id, host },
  });
  return { id, secret };
}

export async function deleteWebhookEndpoint(id: string, who: string): Promise<void> {
  const db = getDb();
  const row = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, id)).get();
  await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
  if (row)
    await logStep({
      kind: "action",
      message: t("{who}: odbiorca webhooka „{name}” ({host}) usunięty.", {
        who,
        name: row.name,
        host: row.host,
      }),
      detail: { webhook: id, host: row.host },
    });
}

export interface Delivery {
  status: number;
  host: string;
  name: string;
  fields: string[];
}

/**
 * Posts one patient's payload to a destination. Throws a WebhookError the
 * engine logs when the destination is gone, the address no longer passes,
 * the receiver does not answer in 10 s, redirects (a redirect could send the
 * data somewhere the administrator never approved) or answers with an error.
 */
export async function deliverWebhook(
  endpointId: string,
  contact: WebhookContactSource,
  context: WebhookContext,
  now = Date.now(),
): Promise<Delivery> {
  const row = await getDb()
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, endpointId))
    .get();
  if (!row)
    throw new WebhookError(t("Odbiorca webhooka nie istnieje — wybierz go ponownie w kroku."));
  // The row may still be under the previous key during a rotation.
  const m = masterFor(row.keyId) ?? master();
  const url = decryptCredential(row.urlEnc, urlName(row.id), row.keyId, m);
  const secret = decryptCredential(row.secretEnc, secretName(row.id), row.keyId, m);
  const check = checkWebhookUrl(url);
  if (!check.ok) throw new WebhookError(urlReason(check.reason));

  const body = JSON.stringify(buildPayload(contact, row.fields, context, now));
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PRM-Core-Webhook",
        "X-PRM-Timestamp": String(now),
        "X-PRM-Signature": signWebhook(secret, now, body),
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new WebhookError(
      t("{host} nie odpowiedział: {detail}", {
        host: row.host,
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
  if (response.status >= 300 && response.status < 400)
    throw new WebhookError(
      t("{host} przekierował zapytanie ({status}) — przekierowań nie wykonujemy.", {
        host: row.host,
        status: response.status,
      }),
    );
  if (!response.ok)
    throw new WebhookError(
      t("{host} odrzucił zapytanie ({status}).", { host: row.host, status: response.status }),
    );
  return { status: response.status, host: row.host, name: row.name, fields: row.fields };
}
