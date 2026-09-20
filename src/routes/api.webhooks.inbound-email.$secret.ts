import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import {
  findContactByEmail,
  getInboundEmailSecret,
  htmlToText,
  parseEmailAddress,
  recordInboundMessage,
  stripQuotedReply,
} from "@/lib/inbox/inbox.server";
import { logStep } from "@/lib/engine/log.server";
import { t } from "@/lib/i18n";

// Inbound e-mail from SendGrid Inbound Parse. Point an MX record at SendGrid for
// a subdomain (e.g. reply.przyklad.pl) and set this URL as the parse destination;
// like the SMS webhook it needs a public HTTPS address to ever fire.
//
// Inbound Parse signs nothing — there is no signature header and no shared HMAC,
// unlike Twilio's webhook. The unguessable path segment IS the authentication,
// which is the mechanism SendGrid's own docs recommend, and it is why the secret
// can be rotated from the Integrations page the moment it leaks.

function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** The Message-ID out of the raw header blob — SendGrid retries, and a retry is not a new e-mail. */
function messageId(headers: string): string | null {
  const match = /^Message-I[Dd]:\s*(.+)$/m.exec(headers);
  return match ? match[1].trim() : null;
}

export const Route = createFileRoute("/api/webhooks/inbound-email/$secret")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const expected = await getInboundEmailSecret();
        if (!secretsMatch(params.secret ?? "", expected)) {
          await logStep({
            kind: "error",
            message: t("Odrzucono wywołanie webhooka poczty przychodzącej — niepoprawny sekret."),
            detail: { endpoint: "inbound-email" },
          });
          return new Response("Forbidden", { status: 403 });
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        const from = parseEmailAddress(field(form, "from"));
        if (!from) return new Response("OK", { status: 200 });

        const text = field(form, "text");
        const html = field(form, "html");
        const body = stripQuotedReply(text || htmlToText(html));
        if (!body) return new Response("OK", { status: 200 });

        const contact = await findContactByEmail(from);
        if (!contact) {
          // Same reasoning as inbound SMS: an unrecognised sender is not a
          // reason to create a patient record. SendGrid still gets its 200 —
          // a non-2xx makes it retry an e-mail we will keep declining.
          await logStep({
            kind: "skipped",
            message: t(
              "E-mail od nieznanego adresu {from} — brak kontaktu w bazie, wiadomość nie została przypisana.",
              { from: from },
            ),
            detail: { endpoint: "inbound-email", from },
          });
          return new Response("OK", { status: 200 });
        }

        await recordInboundMessage({
          contactId: contact.id,
          channel: "email",
          subject: field(form, "subject") || t("(bez tematu)"),
          body,
          html: html || null,
          source: "email",
          externalId: messageId(field(form, "headers")),
        });

        return new Response("OK", { status: 200 });
      },
    },
  },
});
