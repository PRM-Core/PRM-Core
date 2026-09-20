import { createFileRoute } from "@tanstack/react-router";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client.server";
import { popupSettings, emailSends, contacts } from "@/lib/db/schema";
import type { ContactRow } from "@/lib/db/schema";
import { pendingPopupsForContact } from "@/lib/engine/popup-queue.server";
import {
  resolveMergeTagsInHtml,
  normalizePopupConfig,
  popupWithinSchedule,
  type PersonalizationSample,
} from "@/lib/content-builder";
import { warsawWallClockToIso } from "@/lib/visits/warsaw-time";

// Public endpoint polled by prm-tracker.js on tracked external pages: returns
// the currently published popup (or {popup:null}) together with its display
// config. CORS-open like /collect — it is called cross-origin from whatever
// site the tracking snippet is on.
//
// Personalization is resolved HERE rather than client-side: the tracker passes
// ?ct=<token> (the click token it stored from an email link, see
// e.click.$token.ts) and the server swaps merge-tag chips for real values, so
// contact data never has to be exposed to a public endpoint. Anonymous
// visitors get the neutral fallbacks ("Pacjencie") instead of raw chips.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ANONYMOUS_SAMPLE: PersonalizationSample = { firstName: "", email: "" };

/** The contact behind a click token, or null for anonymous traffic. */
async function contactForToken(token: string | null): Promise<ContactRow | null> {
  if (!token) return null;
  try {
    const db = getDb();
    const send = await db.select().from(emailSends).where(eq(emailSends.token, token)).get();
    if (!send) return null;
    return (await db.select().from(contacts).where(eq(contacts.email, send.toEmail)).get()) ?? null;
  } catch {
    return null;
  }
}

function sampleFor(contact: ContactRow | null): PersonalizationSample {
  if (!contact) return ANONYMOUS_SAMPLE;
  return {
    firstName: contact.firstName,
    lastName: contact.lastName || undefined,
    email: contact.email,
  };
}

export const Route = createFileRoute("/popup-active")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        // `popups` is ordered by priority; the tracker walks it and shows the
        // first one the visitor is eligible for (device + capping). `popup`
        // stays in the response for trackers deployed before multi-popup
        // support — an older snippet still shows the top-priority one.
        const popups: Array<{
          id: string;
          html: string;
          config: unknown;
          /** Set only for M5 popups queued for this one patient — the tracker echoes it back once shown. */
          queueId?: string;
          /** Wiersz `popup_settings`, do liczenia statystyk. `null` dla pop-upów z kolejki. */
          settingsId: number | null;
        }> = [];
        try {
          const db = getDb();
          const ct = new URL(request.url).searchParams.get("ct");
          const contact = await contactForToken(ct);
          const sample = sampleFor(contact);

          // Popups addressed to this specific patient come first: they were
          // queued by an automation for them personally, so they outrank
          // anything published to every visitor.
          const now = Date.now();

          if (contact) {
            for (const row of await pendingPopupsForContact(contact.id)) {
              const config = normalizePopupConfig(row.config);
              // Harmonogram obowiązuje także pop-up zakolejkowany przez
              // automatyzację: jeśli kampania się skończyła, pacjent nie ma
              // zobaczyć jej okna tylko dlatego, że akcja zdążyła go zakolejkować.
              if (!popupWithinSchedule(config, now, warsawWallClockToIso)) continue;
              popups.push({
                id: row.contentItemId,
                html: resolveMergeTagsInHtml(row.html, sample),
                config,
                queueId: row.id,
                settingsId: null,
              });
            }
          }

          const rows = await db.select().from(popupSettings).orderBy(asc(popupSettings.priority));
          for (const row of rows) {
            const config = normalizePopupConfig(row.config);
            if (!popupWithinSchedule(config, now, warsawWallClockToIso)) continue;
            popups.push({
              id: row.contentItemId,
              html: resolveMergeTagsInHtml(row.html, sample),
              config,
              // Identyfikator publikacji — po nim liczone są wyświetlenia
              // i kliknięcia. `contentItemId` by nie wystarczył: ta sama treść
              // może być opublikowana dwa razy, z różnymi ustawieniami.
              settingsId: row.id,
            });
          }
        } catch {
          // DB hiccup — treat as "no popup" rather than erroring on someone's site
        }
        return new Response(JSON.stringify({ popups, popup: popups[0] ?? null }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      },
    },
  },
});
