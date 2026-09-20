import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client.server";
import { contacts, emailSends } from "@/lib/db/schema";
import { withdrawAllConsents } from "@/lib/consent/consent.server";
import { currentLocale, t } from "@/lib/i18n";

// The unsubscribe page reached from the link in every marketing e-mail.
//
// Deliberately NOT a route that acts on GET. Corporate mail scanners and link
// preview bots fetch every URL in a message before the recipient ever sees it —
// a one-click GET opt-out would silently unsubscribe people who never opened
// the mail. So GET renders a confirmation page and POST does the work.
//
// Served as plain HTML rather than a React route: this page is opened from a
// mail client by someone who is not logged in, and it must not depend on the
// app shell, the session, or client-side JavaScript.

const PAGE_STYLE = `
  body { margin:0; padding:40px 20px; background:#f3f4f6; font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif; color:#111827; }
  .card { max-width:520px; margin:0 auto; background:#fff; border-radius:16px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
  h1 { font-size:20px; margin:0 0 12px; }
  p { font-size:14px; line-height:1.6; color:#4b5563; margin:0 0 16px; }
  .who { font-weight:600; color:#111827; }
  button { font:inherit; font-weight:600; font-size:14px; padding:10px 18px; border-radius:10px; border:0; background:#4f46e5; color:#fff; cursor:pointer; }
  .ok { color:#047857; font-weight:600; }
  .muted { font-size:12px; color:#6b7280; margin-top:20px; }
`;

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!DOCTYPE html><html lang="${currentLocale()}"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      // Keep this page out of search results and out of link previews.
      `<meta name="robots" content="noindex,nofollow">` +
      `<title>${title}</title><style>${PAGE_STYLE}</style></head>` +
      `<body><div class="card">${body}</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/** Resolves the contact behind a send token — same chain the tracking pixel uses. */
async function contactForToken(token: string) {
  const db = getDb();
  const send = await db.select().from(emailSends).where(eq(emailSends.token, token)).get();
  if (!send) return null;
  return db.select().from(contacts).where(eq(contacts.email, send.toEmail)).get() ?? null;
}

export const Route = createFileRoute("/unsubscribe/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const contact = await contactForToken(params.token);
        if (!contact) {
          return page(
            t("Link wygasł"),
            t(
              "<h1>Nie rozpoznajemy tego linku</h1>\n             <p>Mógł wygasnąć albo pochodzić z wiadomości, której już nie ma w naszym systemie.\n             Jeśli chcesz wycofać zgodę, odpowiedz na dowolną naszą wiadomość — zrobimy to ręcznie.</p>",
            ),
            404,
          );
        }

        const name = `${contact.firstName} ${contact.lastName}`.trim() || contact.email;
        const already = contact.consentEmail === 0 && contact.consentSms === 0;
        if (already) {
          return page(
            t("Zgody już wycofane"),
            t(
              '<h1>Zgody są już wycofane</h1>\n             <p>Adres <span class="who">{email}</span> nie otrzymuje od nas wiadomości\n             marketingowych. Nie musisz nic więcej robić.</p>\n             <p class="muted">Nadal możemy wysyłać wiadomości niemarketingowe dotyczące Twoich wizyt.</p>',
              { email: contact.email },
            ),
          );
        }

        return page(
          "Wypisanie z komunikacji marketingowej",
          t(
            '<h1>Wypisanie z komunikacji marketingowej</h1>\n           <p>Cześć <span class="who">{name}</span>. Po potwierdzeniu wycofamy Twoje zgody na\n           marketing e-mail i SMS oraz na profilowanie. Przestaniesz otrzymywać od nas newslettery\n           i oferty.</p>\n           <form method="POST"><button type="submit">Potwierdzam wypisanie</button></form>\n           <p class="muted">Nadal będziemy mogli wysyłać wiadomości niemarketingowe dotyczące\n           Twoich wizyt — np. przypomnienie o terminie. Jeśli nie chcesz żadnego kontaktu,\n           napisz do nas.</p>',
            { name: name },
          ),
        );
      },

      POST: async ({ params }) => {
        const contact = await contactForToken(params.token);
        if (!contact) {
          return page(t("Link wygasł"), `<h1>Nie rozpoznajemy tego linku</h1>`, 404);
        }

        await withdrawAllConsents(contact.id, t("Pacjent kliknął link wypisania w wiadomości."));

        return page(
          "Zgody wycofane",
          t(
            '<h1 class="ok">Gotowe — zgody wycofane</h1>\n           <p>Adres <span class="who">{email}</span> nie będzie już otrzymywać naszych\n           wiadomości marketingowych.</p>\n           <p class="muted">Zmiana obowiązuje od razu. Nadal możemy kontaktować się w sprawach\n           dotyczących Twoich wizyt.</p>',
            { email: contact.email },
          ),
        );
      },
    },
  },
});
