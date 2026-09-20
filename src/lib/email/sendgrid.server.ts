import process from "node:process";
import { getCredential } from "@/lib/credentials/store.server";
import { t } from "@/lib/i18n";

export class SendGridError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SendGridError";
  }
}

/** Plik doklejony do wiadomości. */
export interface EmailAttachment {
  /** Nazwa, którą zobaczy odbiorca. */
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface SendEmailInput {
  to: string;
  fromEmail: string;
  fromName?: string;
  subject: string;
  html: string;
  /**
   * Załączniki. Obsługiwane tylko tam, gdzie wywołujący je poda — kody
   * logowania, powiadomienia silnika i odpowiedzi ze skrzynki nie mają czego
   * dołączać i nic dla nich się nie zmienia.
   */
  attachments?: EmailAttachment[];
  /**
   * Nasz token śledzenia, odsyłany przez SendGrida w każdym zdarzeniu.
   *
   * **To jedyne, co łączy zdarzenie od SendGrida z konkretną wysyłką.**
   * Webhook dostaje adres odbiorcy i własny `sg_message_id`, ale ten sam
   * adres bywa w kilku wysyłkach tego samego dnia — bez tego pola „odbiło
   * się" nie da się przypisać do właściwej kampanii.
   */
  trackingToken?: string;
  /**
   * Adres dla odpowiedzi. **Pominięty = bierzemy ustawienie placówki.**
   * Jawny pusty ciąg wyłącza adres zwrotny dla tej jednej wiadomości.
   */
  replyTo?: string;
}

/**
 * Limit łącznej wagi załączników.
 *
 * **22 MB przed kodowaniem** — i to jest realny sufit, nie wybór.
 *
 * Więcej, np. 25 MB, się nie da: SendGrid liczy
 * **30 MB na całą wiadomość** — nagłówki, treść i załączniki razem — a bajty
 * jadą zakodowane base64, co powiększa je o jedną trzecią. 25 MB plików to
 * ~33 MB w żądaniu, czyli odrzucenie całej wysyłki. 22 MB daje ~29,3 MB
 * i zostawia margines na treść wiadomości.
 *
 * Limit sprawdzamy u siebie, przed zebraniem plików, żeby błąd pojawiał się
 * jako ostrzeżenie na starcie, a nie jako odrzucenie po stronie SendGrida.
 */
export const MAX_ATTACHMENTS_BYTES = 22 * 1024 * 1024;

/** Real SendGrid v3 mail/send call. Server-only — the API key never leaves this module. */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = await getCredential("SENDGRID_API_KEY");
  if (!apiKey) {
    throw new SendGridError(
      t(
        "Brak skonfigurowanego klucza SendGrid — uzupełnij go w Integracje → Klucze i dane dostępowe.",
      ),
    );
  }
  if (!input.fromEmail) {
    throw new SendGridError(
      "Brak adresu nadawcy — ustaw go w Integracje > Email API > Konfiguruj.",
    );
  }

  /**
   * **Domyślny adres zwrotny rozstrzygamy tutaj, w transporcie.**
   *
   * Wysyłek jest osiem miejsc w kodzie — kampanie, automatyzacje, skrzynka,
   * testy, agent, powiadomienia. Gdyby każde musiało pamiętać o dołożeniu
   * `replyTo`, wcześniej czy później któreś by nie pamiętało, a objaw byłby
   * niewidoczny: odpowiedź pacjenta poszłaby na adres nadawcy i nie trafiła do
   * Skrzynki. Ustawione raz tutaj obowiązuje wszędzie.
   */
  const replyTo = input.replyTo ?? (await defaultReplyTo());

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: input.to }],
          // `custom_args` wraca w każdym zdarzeniu Event Webhooka.
          ...(input.trackingToken ? { custom_args: { prm_token: input.trackingToken } } : {}),
        },
      ],
      from: { email: input.fromEmail, name: input.fromName || undefined },
      ...(replyTo ? { reply_to: { email: replyTo } } : {}),
      subject: input.subject,
      content: [{ type: "text/html", value: input.html }],
      ...(input.attachments && input.attachments.length > 0
        ? {
            attachments: input.attachments.map((a) => ({
              content: a.contentBase64,
              filename: a.fileName,
              type: a.mimeType,
              // `attachment`, nie `inline`: plik ma wylądować na liście
              // załączników, a nie zostać wklejony w treść. Obrazy w treści
              // idą przez adres z biblioteki Media, nie tędy.
              disposition: "attachment",
            })),
          }
        : {}),
    }),
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body?.errors?.map((e: { message: string }) => e.message).join("; ") || detail;
    } catch {
      // response body wasn't JSON — fall back to statusText
    }
    throw new SendGridError(
      t("SendGrid odrzucił wysyłkę: {detail}", { detail: detail }),
      response.status,
    );
  }
}

/**
 * Adres zwrotny z ustawień placówki. Awaria odczytu **nie może** wywalić
 * wysyłki — brak adresu zwrotnego znaczy tyle, że odpowiedź pójdzie na adres
 * nadawcy, czyli tak jak przed wprowadzeniem tego pola.
 */
async function defaultReplyTo(): Promise<string> {
  try {
    const { getDb } = await import("../db/client.server");
    const { emailSettings } = await import("../db/schema");
    const row = await getDb().select().from(emailSettings).get();
    return row?.replyTo ?? "";
  } catch {
    return "";
  }
}
