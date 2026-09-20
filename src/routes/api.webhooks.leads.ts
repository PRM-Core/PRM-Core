import { createFileRoute } from "@tanstack/react-router";
import { getWebhookSecret } from "@/lib/leads/lead-webhook.server";
import { createContactFromLead } from "@/lib/contacts.server";
import { logStep } from "@/lib/engine/log.server";
import { addNote } from "@/lib/notes/notes.server";
import { emitEvent } from "@/lib/engine/events.server";
import { listContactFields } from "@/lib/fields/contact-fields.server";
import {
  CONSENT_HEADERS,
  CONSENT_SOURCE_HEADERS,
  csvBool,
  parseStatus,
} from "@/lib/contacts-import";
import { t as tr } from "@/lib/i18n";

// Inbound webhook for ad leads (built for Zapier's "Webhooks by Zapier" action
// feeding off its native Facebook Lead Ads trigger — see the SMS API/Email API
// integrations for the outbound equivalent of this pattern). Real endpoint,
// not simulated: POST /api/webhooks/leads, secret in the X-Webhook-Secret
// header (configured in Integracje > Meta Ads), creates a real row in
// `contacts` (status "lead"), upsert-by-email so a retried Zap doesn't create
// duplicates.

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Polskie znaki na łacińskie + małe litery — klucz porównania nazw pól.
 *
 * Ten sam fold, co przy imporcie CSV. Bez niego „Tagi" nie trafiało w `tags`,
 * a „Zgoda e-mail" w `consentEmail` — a wysyłka i tak kończyła się sukcesem,
 * więc nadawca nie miał jak zauważyć, że pole przepadło.
 */
function foldKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => "acelnoszz"["ąćęłńóśźż".indexOf(ch)])
    .replace(/[\s_-]+/g, "");
}

/**
 * Wartość z payloadu po **dowolnym** z aliasów, niezależnie od wielkości liter,
 * polskich znaków, spacji i podkreśleń.
 *
 * `data.tags` działało, `data.Tagi` nie. Skoro payload układa człowiek w n8n
 * albo Zapierze, dopasowanie musi wybaczać — inaczej literówka w wielkości
 * litery kosztuje ciche zgubienie danych.
 */
function pick(data: Record<string, unknown>, ...aliases: string[]): unknown {
  const wanted = new Set(aliases.map(foldKey));
  for (const [key, value] of Object.entries(data)) {
    if (wanted.has(foldKey(key))) return value;
  }
  return undefined;
}

function pickText(data: Record<string, unknown>, ...aliases: string[]): string {
  const v = pick(data, ...aliases);
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

/**
 * Zgoda z payloadu: `true`, `false` albo `undefined` (nadawca nic nie powiedział).
 *
 * Rozróżnienie „nie" od „nie wiem" jest tu **istotne prawnie**: brak pola zostawia
 * domyślne założenie kolektora, a jawne `false` je znosi. Zlanie obu w `false`
 * kasowałoby zgody wszystkim integracjom, które o zgodach nie mówią nic.
 *
 * Aliasy nazw są te same, co w imporcie CSV (`CONSENT_HEADERS`) — jeden słownik
 * dla obu dróg wejścia, więc placówka uczy się nazw raz.
 */
function pickConsent(data: Record<string, unknown>, field: string): boolean | undefined {
  const aliases = Object.entries(CONSENT_HEADERS)
    .filter(([, target]) => target === field)
    .map(([header]) => header);
  const raw = pick(data, ...aliases, field);
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "boolean") return raw;
  return csvBool(String(raw));
}

function firstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return "";
}

/**
 * Tags off the payload. Zapier sends a plain string far more easily than an
 * array, so both are accepted and a separated list is split.
 */
function tagList(...values: unknown[]): string[] {
  for (const v of values) {
    if (Array.isArray(v)) {
      const out = v.map((t) => String(t).trim()).filter(Boolean);
      if (out.length > 0) return out;
    }
    if (typeof v === "string" && v.trim()) {
      const out = v
        .split(/[;,|]/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (out.length > 0) return out;
    }
  }
  return [];
}

export const Route = createFileRoute("/api/webhooks/leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const providedSecret = request.headers.get("x-webhook-secret") ?? "";
        const expectedSecret = await getWebhookSecret();
        if (!providedSecret || providedSecret !== expectedSecret) {
          // Logged, not just refused: a series of these is either a broken
          // integration after a secret rotation or somebody probing the
          // endpoint, and the M4 supervisor can only report what was recorded.
          await logStep({
            kind: "error",
            message: tr(
              "Odrzucono wywołanie webhooka leadów — nieprawidłowy lub brakujący sekret.",
            ),
            detail: { source: "lead-webhook", secretProvided: providedSecret ? "tak" : "nie" },
          });
          return json(
            { ok: false, error: tr("Nieprawidłowy lub brakujący X-Webhook-Secret.") },
            401,
          );
        }

        let data: Record<string, unknown>;
        try {
          data = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ ok: false, error: tr("Body musi być poprawnym JSON-em.") }, 400);
        }

        const email = firstNonEmpty(data.email, data.email_address);
        const phoneRaw = firstNonEmpty(data.phone, data.phone_number);
        // E-mail ALBO telefon — ta sama zasada, co przy dodawaniu kontaktu
        // ręcznie i przy imporcie: jedna droga kontaktu wystarczy. Lead bez
        // żadnej z nich jest odrzucany, bo nie ma ani jak się odezwać, ani czym
        // rozpoznać, że to ta sama osoba przy ponowieniu.
        if (!email && !phoneRaw) {
          return json(
            {
              ok: false,
              error: tr("Wymagany jest „email” albo „phone” — przyszedł payload bez obu."),
            },
            400,
          );
        }

        let firstName = firstNonEmpty(data.firstName, data.first_name);
        let lastName = firstNonEmpty(data.lastName, data.last_name);
        if (!firstName && !lastName) {
          const full = firstNonEmpty(data.fullName, data.full_name, data.name);
          const [f, ...rest] = full.split(" ").filter(Boolean);
          firstName = f ?? "";
          lastName = rest.join(" ");
        }

        const campaign = firstNonEmpty(data.campaign, data.campaign_name, data.ad_campaign_name);
        const source = firstNonEmpty(data.source) || "Meta";
        const medium = firstNonEmpty(data.medium) || "paid_social";
        // Tag z payloadu, a domyślny tylko wtedy, gdy nadawca żadnego nie podał.
        // Ten sam adres webhooka obsługuje kilka Zapów, więc przyklejanie
        // wszystkim „meta-lead" opisywałoby lead z testu słuchu jako reklamę.
        const tags = tagList(pick(data, "tags", "tag", "tagi"), data.tags, data.tag);
        const segments = tagList(pick(data, "segments", "segmenty", "segment"));

        // Status: te same nazwy, co w imporcie CSV („Pacjent", „Lead", „Aktywny",
        // „Nieaktywny"). Nierozpoznana wartość NIE jest po cichu zamieniana na
        // leada — wraca w odpowiedzi jako ostrzeżenie, bo cichy „lead" zamiast
        // „pacjent" był realnym błędem przy imporcie.
        const statusRaw = pickText(data, "status");
        const parsedStatus = statusRaw ? parseStatus(statusRaw) : null;

        // Pola własne placówki. Dopasowanie po **kluczu albo etykiecie**, tak jak
        // w imporcie: n8n może przysłać `custom_miasto` albo po prostu „Miasto".
        const fieldDefs = await listContactFields();
        const customFields: Record<string, string> = {};
        const unknownFields: string[] = [];
        for (const def of fieldDefs) {
          if (def.builtin) continue;
          const value = pickText(data, def.key, def.label);
          if (value) customFields[def.key] = value;
        }
        // Klucze `custom_*`, dla których nie ma definicji pola — nadawca myśli,
        // że coś wysyła, a system nie ma gdzie tego zapisać. Milczenie w tym
        // miejscu było przyczyną błędu.
        for (const key of Object.keys(data)) {
          if (!/^custom[_\s-]/i.test(key)) continue;
          const known = fieldDefs.some(
            (d) =>
              !d.builtin && (foldKey(d.key) === foldKey(key) || foldKey(d.label) === foldKey(key)),
          );
          if (!known) unknownFields.push(key);
        }

        const result = await createContactFromLead({
          firstName,
          lastName,
          email,
          phone: phoneRaw,
          source,
          medium,
          campaign,
          tags: tags.length > 0 ? tags : undefined,
          segments: segments.length > 0 ? segments : undefined,
          status: parsedStatus?.recognised ? parsedStatus.status : undefined,
          consentEmail: pickConsent(data, "consentEmail"),
          consentSms: pickConsent(data, "consentSms"),
          consentProfiling: pickConsent(data, "consentProfiling"),
          consentSource: pickText(data, ...CONSENT_SOURCE_HEADERS, "consentSource"),
          customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
        });

        // Co pacjent zrobił — nazwane przez nadawcę, bo ten sam adres obsługuje
        // kilka Zapów i tylko nadawca wie, czy to test słuchu, czy zapis na
        // newsletter. Trafia na oś czasu jako notatka i na szynę zdarzeń jako
        // `form.submitted`, więc automatyzacja może na to zareagować.
        const activity = firstNonEmpty(data.activity, data.aktywnosc);
        const details = firstNonEmpty(data.activityDetails, data.details, data.note, data.notatka);

        // Notatka powstaje, gdy przyszło CHOĆ JEDNO z tych pól. Wcześniej samo
        // `note` było ciche: ktoś dopisywał je w Zapierze, wysyłka kończyła się
        // sukcesem, a na karcie nie było nic. Pole, które nic nie robi, jest
        // gorsze niż brak pola — nie ma po czym poznać, że się nie udało.
        if (activity || details) {
          const title = activity || "Notatka z formularza";
          await addNote({
            contactId: result.contactId,
            text: details ? `${title}\n${details}` : title,
            source: "form",
          });
        }

        // Zdarzenie tylko przy nazwanej aktywności — `form.submitted` niesie
        // nazwę formularza, po której filtruje wyzwalacz. Sama notatka nie jest
        // wypełnieniem formularza i nie ma czym takiego filtra nakarmić.
        if (activity) {
          await emitEvent({
            type: "form.submitted",
            contactId: result.contactId,
            payload: { form: activity, source, campaign },
          });
        }

        // **Odpowiedź mówi, co naprawdę weszło.** n8n i Zapier pokazują ciało
        // odpowiedzi w podglądzie kroku, więc to jedyne miejsce, w którym
        // konfigurujący zobaczy, że pole nie trafiło nigdzie. Milczące „ok"
        // przy zgubionych polach było przyczyną błędu.
        const warnings: string[] = [];
        if (statusRaw && parsedStatus && !parsedStatus.recognised) {
          warnings.push(
            tr(
              'Nieznany status „{statusRaw}" — kontakt został leadem. Dozwolone: Lead, Pacjent, Aktywny, Nieaktywny.',
              { statusRaw: statusRaw },
            ),
          );
        }
        if (unknownFields.length > 0) {
          warnings.push(
            tr(
              "Pola bez odpowiednika w Ustawieniach → Pola kontaktu (zignorowane): {v0}. Załóż je w systemie albo popraw nazwę.",
              { v0: unknownFields.join(", ") },
            ),
          );
        }

        return json(
          {
            ok: true,
            ...result,
            activity: activity || undefined,
            accepted: {
              tags,
              segments,
              status: parsedStatus?.recognised ? parsedStatus.status : "lead",
              customFields: Object.keys(customFields),
              consents: {
                email: pickConsent(data, "consentEmail") ?? tr("(domyślnie: tak)"),
                sms: pickConsent(data, "consentSms") ?? tr("(domyślnie: tak)"),
                profiling: pickConsent(data, "consentProfiling") ?? tr("(domyślnie: nie)"),
              },
            },
            warnings: warnings.length > 0 ? warnings : undefined,
          },
          200,
        );
      },
    },
  },
});
