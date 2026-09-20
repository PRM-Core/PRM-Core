import { createFileRoute } from "@tanstack/react-router";
import { createContactFromLead } from "@/lib/contacts.server";
import { addNote } from "@/lib/notes/notes.server";
import { emitEvent } from "@/lib/engine/events.server";
import { recordInboundMessage } from "@/lib/inbox/inbox.server";
import { t as tr } from "@/lib/i18n";

// Public collector for popup forms — both the ones built in the Pop-Up section
// and hand-coded ones on external pages (see the form guide in the UI). Called
// cross-origin by prm-tracker.js, so CORS is open like /collect. No secret
// here on purpose: this is an unauthenticated opt-in form endpoint, the same
// trust model as any newsletter signup box. It only ever creates a contact,
// never reads or returns existing data.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Custom form fields whose label reads like "write to us" rather than "your postcode". */
const MESSAGE_LABEL = /wiadomo|message|tre[śs][ćc]|pytani|opis|komentarz|uwagi/i;

export const Route = createFileRoute("/api/forms/submit")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        // Read as text, then parse: the tracker posts with Content-Type
        // text/plain so the request stays a CORS "simple request" (no OPTIONS
        // preflight), same trick as /collect. Hand-rolled callers sending
        // application/json land here identically.
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(await request.text()) as Record<string, unknown>;
        } catch {
          return json({ ok: false, error: tr("Body musi być poprawnym JSON-em.") }, 400);
        }

        const email = str(data.email);
        if (!email || !email.includes("@")) {
          return json({ ok: false, error: tr("Pole „email” jest wymagane.") }, 400);
        }

        let firstName = str(data.firstName);
        let lastName = str(data.lastName);
        if (!firstName && !lastName) {
          const [f, ...rest] = str(data.name).split(" ").filter(Boolean);
          firstName = f ?? "";
          lastName = rest.join(" ");
        }

        // data-prm-tag carries a comma-separated list since multi-tag support.
        const tags = str(data.tag)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);

        const result = await createContactFromLead({
          firstName,
          lastName,
          email,
          phone: str(data.phone),
          source: str(data.source) || "Pop-up",
          medium: str(data.medium) || "website",
          campaign: str(data.campaign),
          tags: tags.length > 0 ? tags : ["popup-lead"],
        });

        // Fires for returning visitors too — createContactFromLead only emits
        // contact.created for genuinely new people, but every submission is a
        // form.submitted as far as automations are concerned.
        await emitEvent({
          type: "form.submitted",
          contactId: result.contactId,
          payload: {
            // `form` nazywa, CO zostało wypełnione — po tym filtruje wyzwalacz
            // „Wysłanie formularza”. Pop-up nie ma osobnej nazwy, więc służy nią
            // jego źródło (`data-prm-source`), a webhook leadów podaje ją wprost.
            form: str(data.source) || "Pop-up",
            email,
            source: str(data.source) || "Pop-up",
            campaign: str(data.campaign),
          },
        });

        // Custom fields have no column on `contacts` — they're preserved as a
        // note on the card instead (same destination as survey answers).
        const custom = data.custom;
        const customEntries =
          custom && typeof custom === "object" && !Array.isArray(custom)
            ? Object.entries(custom as Record<string, unknown>)
                .map(([label, value]) => [label, str(value)] as const)
                .filter(([, value]) => value.length > 0)
            : [];
        if (customEntries.length > 0) {
          await addNote({
            contactId: result.contactId,
            text: tr("Formularz z pop-upu — dodatkowe pola:\n{v0}", {
              v0: customEntries.map(([label, value]) => `${label}: ${value}`).join("\n"),
            }),
            source: "form",
          });
        }

        // A filled-in form is a patient reaching out, so it opens a conversation
        // in the inbox as well. If the form had a "your message" field that text
        // IS the message; otherwise the submitted fields are, because "someone
        // asked for contact and left a phone number" is the thing a receptionist
        // has to act on either way.
        const written = customEntries.find(([label]) => MESSAGE_LABEL.test(label));
        const body =
          written?.[1] ||
          [
            [firstName, lastName].filter(Boolean).join(" "),
            email,
            str(data.phone),
            ...customEntries.map(([label, value]) => `${label}: ${value}`),
          ]
            .filter(Boolean)
            .join("\n");
        await recordInboundMessage({
          contactId: result.contactId,
          channel: "form",
          subject: str(data.source) || tr("Formularz na stronie"),
          body,
          source: "form",
        });

        return json({ ok: true, ...result }, 200);
      },
    },
  },
});
