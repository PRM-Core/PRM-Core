# Adding an integration to PRM Core

> **🇵🇱 Po polsku w skrócie.** Najpierw sprawdź, czy wystarczy webhook bez kodu
> (sekcja A) — większość systemów, które potrafią wysłać JSON, podłączysz w kilka
> minut przez n8n, Make albo Zapier. Nowa usługa z kluczem API to jeden wpis
> w `src/lib/credentials/catalog.ts` i odczyt przez `getCredential()` (sekcja C).
> Nowy krok w automatyzacjach: sekcja D. Zasady, bez których PR nie przejdzie:
> sekcja F. Pytania i propozycje — zakładka _Issues_, szablon „Integration
> request”, także po polsku.

PRM Core is used by clinics that already run other systems: online booking,
phone systems, accounting, calendars, ad platforms. Every one of them is a
potential integration, and nobody knows those systems better than the people
who use them. This guide shows the shortest honest path for each kind.

## Which path do you need?

| You want to…                                                             | Path                                               | Code needed |
| ------------------------------------------------------------------------ | -------------------------------------------------- | ----------- |
| Create or update contacts from another system (forms, ads, CRM, booking) | [A. Lead webhook](#a-lead-webhook-no-code)         | none        |
| Push visit bookings from a booking system                                | [B. Booking webhook](#b-booking-webhook)           | none        |
| Use a service that needs an API key (SMS gateway, AI, email provider)    | [C. Credentials](#c-a-service-with-an-api-key)     | small       |
| Let an automation do something in another system                         | [D. Automation action](#d-a-new-automation-action) | medium      |
| Receive events a service pushes to you (signed callbacks)                | [E. Inbound endpoint](#e-a-new-inbound-endpoint)   | medium      |
| Give AI assistants access to PRM data                                    | [MCP tools](#mcp-tools)                            | small       |

Before writing code, open an issue with the **Integration request** template.
Someone may already be working on it, and a short design discussion saves a
rejected pull request.

---

## A. Lead webhook (no code)

`POST /api/webhooks/leads` creates a contact, or updates the existing one
matched by email or phone. It is built to be fed by n8n, Make, Zapier or any
system that can send an HTTP request.

**Authentication:** header `X-Webhook-Secret`. The secret is shown in the app
under _Integrations → Contact and booking webhook_ and can be rotated there.

```bash
curl -X POST https://your-prm.example.com/api/webhooks/leads \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <secret from the Integrations screen>" \
  -d '{
    "first_name": "Jan",
    "last_name": "Kowalski",
    "email": "jan.kowalski@example.com",
    "phone": "+48 000 000 001",
    "source": "Website",
    "campaign": "spring-checkup",
    "tags": "cardiology, newsletter",
    "consentEmail": true,
    "consentSms": false,
    "consentProfiling": false,
    "activity": "Contact form",
    "details": "Asked about a cardiology appointment"
  }'
```

| Field                                            | Notes                                                                                                                                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email` or `phone`                               | **At least one is required.** Used to find an existing contact, so retries do not create duplicates.                                                                                                                                |
| `first_name`, `last_name`                        | Or `name` / `full_name`, split on the first space.                                                                                                                                                                                  |
| `source`, `medium`, `campaign`                   | Attribution. Defaults: `Meta`, `paid_social`.                                                                                                                                                                                       |
| `tags`, `segments`                               | Array, or a string separated by commas, semicolons or vertical bars.                                                                                                                                                                |
| `status`                                         | `Lead`, `Pacjent` (patient), `Aktywny`, `Nieaktywny`. Unknown values come back as a warning, not a silent default.                                                                                                                  |
| `consentEmail`, `consentSms`, `consentProfiling` | `true` / `false`. **Send them explicitly.** A missing field means "the sender did not say" and the collector default applies (email and SMS: yes, profiling: no) — which is only right if your form really collects those consents. |
| `activity`, `details`                            | Lands on the contact timeline as a note and emits `form.submitted`, so automations can react (trigger _Form submitted_, filtered by `activity`).                                                                                    |
| custom fields                                    | By key or label of a field defined in _Settings → Tables / Data_, e.g. `"City": "London"`. Unknown `custom_*` keys come back as warnings.                                                                                           |

Field names are matched loosely: case, Polish diacritics, spaces, `_` and `-`
are ignored (`Tagi`, `tags`, `TAGS` all work).

**Default consents are a deliberate assumption, not a neutral value.** Every
inbound collector — this webhook, Meta Lead Ads, pop-up forms (`/api/forms/submit`)
and surveys (`/api/surveys/submit`) — creates a **new** contact with email and
SMS consent granted and profiling consent not granted, unless the sender says
otherwise. The reasoning: a person who filled in a sign-up form asked to be
contacted. It is set in one place, `createContactFromLead` in
`src/lib/contacts.server.ts`. For an **existing** contact a missing field never
changes anything; only an explicit `true` / `false` does. If your form does not
ask for these consents (a survey, a form that only asks for an email address),
send `false` explicitly — the default would record consent the person never gave.
Surveys and pop-up forms do not read consent fields yet — see the issue tracker.

**Response** — always read `warnings`. A `200` with warnings means the contact
was saved but part of the payload was not understood:

```json
{
  "ok": true,
  "contactId": "…",
  "created": true,
  "accepted": {
    "tags": ["cardiology", "newsletter"],
    "status": "lead",
    "customFields": [],
    "consents": { "email": true, "sms": false, "profiling": false }
  },
  "warnings": ["…"]
}
```

`401` — wrong or missing secret (logged, so repeated failures are visible to
the clinic). `400` — invalid JSON, or neither `email` nor `phone`.

**Share your recipe.** If you connected a system this way, a short guide in
`docs/recipes/<system>.md` (which fields map where, screenshots with demo data)
is a valuable contribution on its own.

## B. Booking webhook

`POST /api/webhooks/booking`, same `X-Webhook-Secret`. Creates or updates the
patient and records the visit, which triggers _Visit booked_ automations
(reminders, preparation instructions). The full field list, consent semantics
and deduplication rules are in [WEBHOOK-BOOKING.md](WEBHOOK-BOOKING.md)
(Polish, with an English summary). A booking system integration usually needs
only a field mapping — open an issue with a sample payload (demo data only).

## B2. Booking system API (provider)

Reading the clinic's booking system — patient records, visit history and
states, no-shows, cancellations, doctors' schedule occupancy — goes through a
**provider**: a few files in `src/lib/booking-system/providers/`, loaded
automatically. The mechanism (linking, merging with webhook visits, `visit.*`
events, schedules) is shared and does not change per system; a provider only
translates the system's API into the contract in
`src/lib/booking-system/provider.ts`. The product ships without one. See
[the providers README](../src/lib/booking-system/providers/README.md).

## C. A service with an API key

All integration credentials go through one catalog and one read function.
**Never read `process.env.YOUR_KEY` directly** — the admin panel would not see
it, the key could not be set without server access, and the connection check
would not exist.

### 1. Declare the fields

`src/lib/credentials/catalog.ts`:

```ts
// 1) the name — identical to the .env variable, which stays a fallback
export const CREDENTIAL_NAMES = [
  // …
  "SMSAPI_TOKEN",
] as const;

// 2) the integration entry
{
  id: "smsapi",                      // also add to the IntegrationId union
  name: "SMSAPI",
  purpose: "SMS sending via SMSAPI.pl.",
  fields: [
    {
      name: "SMSAPI_TOKEN",
      label: "Token OAuth",
      help: "SMSAPI panel → API → Tokens. Only the sms scope is needed.",
      secret: true,                  // never returned to the browser
      kind: "text",
    },
  ],
  checkable: true,
  required: ["SMSAPI_TOKEN"],
},
```

Add format validation for obvious mistakes in `credentialProblem()` (prefixes,
whitespace from copy-paste). The panel, encryption, audit log and `.env`
fallback work automatically.

### 2. Read the key on the server

```ts
import { getCredential } from "@/lib/credentials/store.server";

const token = await getCredential("SMSAPI_TOKEN");
if (!token)
  throw new Error("Brak tokenu SMSAPI — uzupełnij w Integracje → Klucze i dane dostępowe.");
```

Only in `*.server.ts` files. Read the key per call (it can change in the panel
at any time; values are cached for 30 s).

### 3. Add "Check connection"

`src/lib/credentials/checks.server.ts` — a function that proves the key works
**without side effects**: no message sent, no paid call, nothing created on the
other side. Typically "get account info" or "list resources". Keys go in
headers, never in the URL. Return a sentence a clinic employee understands.

### 4. Test it

Follow `checks.server.test.ts`: inject the credential reader and mock `fetch`.
**No test may call a real external service.** Cover at least: missing key (no
request is made), rejected key, success.

## D. A new automation action

Automations are graphs of trigger → conditions → actions. A new action needs:

1. **A catalog entry** in `src/lib/automation-catalog.ts` (`key`, label,
   description, icon, `fields` shown in the step inspector). Labels are in
   Polish, like the rest of the UI.
2. **An executor** — a `case` in `executeAction()` in
   `src/lib/engine/actions.server.ts`, ideally delegating to a function in your
   own `src/lib/<service>/…server.ts`.

The executor contract (`ActionResult`):

- **Never throw.** Return `{ status: "error", message }` — the runner logs it and
  the run continues or stops according to its rules.
- **`skipped` is not `ok`.** Missing configuration, missing consent or missing
  address → `skipped` with the reason. Do not report success for something that
  did not happen.
- **Marketing sends must pass `checkConsent()`** (`src/lib/consent/consent.server.ts`)
  and respect the "do not contact" flag. This is a legal requirement for clinics,
  not a nice-to-have.
- **Be idempotent.** A step can be retried after a crash; sending the same SMS
  twice to a patient is a real harm.
- `message` is shown to clinic staff in the engine log — Polish, one sentence,
  no patient data beyond what the log already shows.

If the engine cannot really perform a step yet, set `engineNote` in the catalog
so the UI says so, instead of shipping a step that silently does nothing.

## E. A new inbound endpoint

For services that push events (payment confirmations, call-center events,
delivery receipts): add a route file `src/routes/api.webhooks.<service>.ts`
(see `api.webhooks.inbound-sms.ts` for a signed callback and
`api.webhooks.leads.ts` for a shared-secret one).

- **Authenticate every request** — the provider's signature if it has one
  (compare in constant time), otherwise a secret in a header or in an
  unguessable URL segment. An unauthenticated endpoint that creates contacts is
  a way to inject data into a medical database.
- **Log rejections** with `logStep({ kind: "error", … })` — without values.
- **Never log payload values** (patient data). Field _names_ are fine and are
  exactly what helps debug a mapping.
- **Emit events** with `emitEvent()` using an existing `EngineEventType` so
  automations can react. A new event type also needs a trigger in the automation
  catalog — discuss it in the issue first.
- Respond fast and idempotently; providers retry.

## MCP tools

`src/lib/mcp/tools/` contains read-only tools for AI assistants
(`list_contacts`, `get_contact`, `list_automations`). MCP is disabled unless an
access token is set in the panel. New tools must be read-only
(`readOnlyHint: true`) and should return the minimum data needed — contacts are
patients.

## F. Rules every integration must follow

1. **Nothing pretends to work.** No mock data behind real-looking UI, no
   "Connected" badge without a real connection, no success message for a step
   that did not run.
2. **No real data anywhere in the repository** — code, tests, fixtures, commit
   messages, screenshots. Use `example.com`, phone numbers starting with
   `+48 000`, PESEL numbers with an invalid checksum. CI runs
   `bun run sprawdz:rozdzial` and blocks API keys and valid PESEL numbers.
3. **Secrets only through `getCredential()`**, never in code, logs, URLs or
   responses to the browser.
4. **Server code in `*.server.ts`**, RPC in `*.functions.ts` containing only
   `createServerFn` (see README → Project structure). Server functions are public
   HTTP endpoints: every one needs `requireUser` (or `allowReporter` for
   read-only), and admin-only operations must check the role on the server.
5. **Tests for the silent failure modes**: payload parsing, missing consent,
   missing key, retries. `bun test`, no network.
6. **UI text through `t()`.** Keys are the Polish texts, English goes to
   `src/lib/i18n/en` (`bun run i18n:check --strict`). If you do not speak
   Polish, write English in the PR and a maintainer will translate — do not
   let it stop you.

## Integrations we would love to see

**Medical systems come first.** A clinic already runs a practice management,
booking or EHR system; PRM Core becomes useful the day it can read it. The
whole mechanism is done — a provider only translates one API (section B2,
template in `src/lib/booking-system/providers/_template/`). Open an issue with
the **Medical system connector** form before starting, so work is not
duplicated.

| Priority | Connector                                                                           | Why                                                                                              |
| -------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ★★★      | **Generic FHIR R4 provider** (`Patient`, `Appointment`, `Schedule`/`Slot`)          | one standard, many systems — the highest-leverage contribution                                   |
| ★★★      | **Docplanner / ZnanyLekarz / Doctoralia** — visit sync                              | keys and connection test are in; the provider needs API access from Docplanner                   |
| ★★       | Practice management systems used in Poland (e.g. Medfile, KS-SOMED, mMedica, CGM)   | where most Polish clinics keep their calendar — only through the vendor's official API and terms |
| ★★       | International booking/PMS (e.g. Doctolib, Cliniko, Jane, Nookal)                    | same mechanism, other markets                                                                    |
| ★★       | HL7 v2 (ADT/SIU) through an interface engine → booking webhook                      | older hospital systems without a REST API                                                        |
| ★        | Outgoing webhook automation step                                                    | connects n8n, Make and Zapier in the other direction                                             |
| ★        | Polish SMS gateways (SMSAPI, SerwerSMS), email beyond SendGrid (SES, Mailgun, SMTP) | lower cost, local providers                                                                      |
| ★        | Google Calendar / Microsoft 365                                                     | visits in staff calendars                                                                        |
| ★        | Recipes in `docs/recipes/`                                                          | connecting common tools through the lead webhook, no code                                        |

Vendor names above are targets, not endorsements or claims of an existing
partnership. Build connectors only on documented APIs you are allowed to use,
test against a sandbox, and never commit real patient data.

## Known limitations

- `get_contact` (MCP) returns demo activity data for the timeline instead of the
  real contact history — tracked as an issue; do not rely on it.
- Credentials are global per installation (one clinic = one installation).
