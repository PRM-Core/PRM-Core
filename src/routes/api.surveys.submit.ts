import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client.server";
import { emailSends, contacts } from "@/lib/db/schema";
import { createContactFromLead, ensureSeeded } from "@/lib/contacts.server";
import { addNote } from "@/lib/notes/notes.server";
import { emitEvent } from "@/lib/engine/events.server";
import { recordInboundMessage } from "@/lib/inbox/inbox.server";
import { t as tr } from "@/lib/i18n";

// Collector for popup surveys. Answers aren't contact columns — they're written
// as a note on the contact card, which is the whole point of the feature.
//
// Identifying who answered, in order:
//   1. ct token (the visitor arrived from a tracked email link) → known contact
//   2. e-mail typed into the survey → existing contact, or a new lead
// If neither is available there's nobody to attach the note to, so the answers
// are rejected with a clear error rather than silently dropped.
//
// Posted as text/plain by the tracker to stay a CORS "simple request" — see
// api.forms.submit.ts for why.

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

/** Resolves the answering contact's id, creating a lead if we only have an e-mail. */
async function resolveContactId(ct: string, email: string, tags: string[]): Promise<string | null> {
  await ensureSeeded();
  const db = getDb();

  if (ct) {
    const send = await db.select().from(emailSends).where(eq(emailSends.token, ct)).get();
    if (send) {
      const contact = await db
        .select()
        .from(contacts)
        .where(eq(contacts.email, send.toEmail))
        .get();
      if (contact) return contact.id;
    }
  }

  if (email) {
    const existing = await db.select().from(contacts).where(eq(contacts.email, email)).get();
    if (existing) return existing.id;
    const created = await createContactFromLead({
      firstName: "",
      lastName: "",
      email,
      phone: "",
      source: "Ankieta",
      medium: "website",
      campaign: "",
      tags: tags.length > 0 ? tags : ["ankieta"],
    });
    return created.contactId;
  }

  return null;
}

export const Route = createFileRoute("/api/surveys/submit")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(await request.text()) as Record<string, unknown>;
        } catch {
          return json({ ok: false, error: tr("Body musi być poprawnym JSON-em.") }, 400);
        }

        const answers = Array.isArray(data.answers)
          ? (data.answers as Array<Record<string, unknown>>)
              .map((a) => ({ question: str(a.question), answer: str(a.answer) }))
              .filter((a) => a.question && a.answer)
          : [];

        if (answers.length === 0) {
          return json({ ok: false, error: tr("Brak odpowiedzi do zapisania.") }, 400);
        }

        const tags = str(data.tag)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);

        const contactId = await resolveContactId(str(data.ct), str(data.email), tags);
        if (!contactId) {
          return json(
            { ok: false, error: tr("Nie rozpoznano pacjenta — ankieta wymaga pola e-mail.") },
            400,
          );
        }

        const body = answers.map((a) => `• ${a.question}\n  ${a.answer}`).join("\n");
        await addNote({
          contactId,
          text: tr("Odpowiedzi z ankiety (pop-up):\n{body}", { body: body }),
          source: "survey",
        });

        await emitEvent({
          type: "survey.submitted",
          contactId,
          payload: { answers: String(answers.length), first: answers[0]?.answer ?? "" },
        });

        // Answers land in the inbox too — a poor NPS score with a written
        // comment is something somebody should read and reply to, not just a
        // note filed on a card nobody opens.
        await recordInboundMessage({
          contactId,
          channel: "survey",
          subject: tr("Ankieta"),
          body,
          source: "survey",
        });

        return json({ ok: true, contactId }, 200);
      },
    },
  },
});
