import { createFileRoute } from "@tanstack/react-router";
import { verifyTwilioSignature } from "@/lib/sms/twilio.server";
import { getBaseUrl } from "@/lib/engine/settings.server";
import { findContactByPhone, recordInboundMessage } from "@/lib/inbox/inbox.server";
import { logStep } from "@/lib/engine/log.server";
import { t } from "@/lib/i18n";

// Inbound SMS from Twilio. Configure it as the "A MESSAGE COMES IN" webhook on
// the number in the Twilio console; it needs a public HTTPS address, so it only
// starts producing rows once this app is deployed.
//
// Unlike the lead webhook this endpoint holds no secret of its own: Twilio signs
// every request with the account auth token we already have in .env, which is
// strictly better than a shared secret in a URL — it authenticates the payload,
// not just the caller.

/** Twilio expects TwiML. An empty Response means "received, send nothing back". */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(status = 200) {
  return new Response(EMPTY_TWIML, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/webhooks/inbound-sms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const params: Record<string, string> = {};
        for (const [key, value] of new URLSearchParams(raw)) params[key] = value;

        // Signed over the address Twilio called, which behind a proxy is not
        // request.url — see verifyTwilioSignature.
        const baseUrl = await getBaseUrl();
        const path = new URL(request.url).pathname;
        const signedUrl = `${baseUrl.replace(/\/$/, "")}${path}`;

        const ok = await verifyTwilioSignature({
          url: signedUrl,
          params,
          signature: request.headers.get("x-twilio-signature") ?? "",
        });
        if (!ok) {
          // Logged as an engine error so the M4 supervisor's security detector
          // can see a run of rejected calls, exactly like the lead webhook.
          await logStep({
            kind: "error",
            message: t(
              "Odrzucono wywołanie webhooka SMS — niepoprawny podpis Twilio (nadawca {v0}).",
              { v0: params.From ?? "?" },
            ),
            detail: { endpoint: "inbound-sms", from: params.From ?? "" },
          });
          return new Response("Forbidden", { status: 403 });
        }

        const from = (params.From ?? "").trim();
        const body = (params.Body ?? "").trim();
        if (!from || !body) return twiml();

        const contact = await findContactByPhone(from);
        if (!contact) {
          // Deliberately NOT auto-creating a contact: a phone number with no
          // name, no e-mail and no consent trail is not a patient record, and
          // inventing one would quietly put a stranger into marketing lists.
          await logStep({
            kind: "skipped",
            message: t(
              "SMS od nieznanego numeru {from} — brak kontaktu w bazie, wiadomość nie została przypisana.",
              { from: from },
            ),
            detail: { endpoint: "inbound-sms", from },
          });
          return twiml();
        }

        await recordInboundMessage({
          contactId: contact.id,
          channel: "sms",
          subject: "SMS",
          body,
          source: "sms",
          externalId: params.MessageSid || null,
        });

        return twiml();
      },
    },
  },
});
