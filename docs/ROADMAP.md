# Roadmap

What PRM Core does today, and what we want next. Two engines drive the
product: **PRM Engine** (deterministic automation) and **PRM_Agent** (the AI
layer). They are separate on purpose — a clinic must be able to run the whole
product with the AI turned off.

Items marked **help wanted** are open for contributors; open an issue before
starting.

## PRM Engine — deterministic automation

The engine turns real events into steps, on a 4-second clock, with the queue
in the database so delays survive restarts. A message cannot go out twice: a
unique key in the schema guarantees it, not careful code.

### Today

- **Triggers**: contact created, visit booked / completed / no-show /
  cancelled, tag added, segment joined, form or survey submitted, email opened
  or clicked, page visited, field changed, funnel stage changed, score
  changed, asset downloaded, inbound message.
- **Conditions**: in segment, has tag, field value, email opened, do-not-contact.
- **Actions**: email, newsletter, SMS, pop-up, tags, segments, field update,
  score, funnel stage, do-not-contact, delete contact, end.
- **Safety**: consent checked on the server before every marketing send, not
  in the flow; delays; retries with attempt counts; dry run before activation;
  a supervisor that reviews automations and reports findings.

### Next

1. **Time-based triggers** — recall after N months, birthday, anniversary of
   the last visit, "no visit in 12 months". Today every trigger reacts to an
   event that just happened, so recurring preventive care cannot be automated
   at all. _(help wanted)_
2. **Quiet hours and rate limits for automation sends.** Campaigns already
   have both (`src/lib/campaigns/throttle.ts`); automations bypass them, so a
   visit booked at 23:40 sends a confirmation at 23:40. Reuse the same
   arithmetic for engine actions. _(help wanted)_
3. **Wait for an event, with a timeout** — "wait up to 48 h for the visit to
   be confirmed, otherwise call reception". Today only fixed delays exist, so
   every branch has to guess how long to wait.
4. **Frequency capping across automations** — at most N marketing messages per
   patient per week, counted across all flows and channels. Each automation is
   reasonable on its own; together they are not.
5. **Goals and conversion** — mark a step as the goal (visit booked, form
   submitted) and measure how many patients reached it, per automation and per
   variant.
6. **A/B split step** — two subject lines or two channels, with the result
   visible in the same statistics.
7. **Outgoing webhook action** — one step that POSTs to a URL, which connects
   PRM Core to n8n, Make and Zapier in the other direction. _(help wanted)_
8. **Channel fallback** — "if the email is not opened in 24 h, send an SMS",
   as one step instead of a hand-built branch.
9. **Re-entry rules** — whether a patient may enter the same automation again,
   and after how long.
10. **Queue observability** — a view of delayed, failed and dead-lettered
    steps with the reason, and a safe retry button.

## PRM_Agent — the AI layer

PRM_Agent is the product's AI under one budget and one key catalog. It never
sends anything the consent rules would not allow: the check is in the code
that sends, not in the prompt, because a model talked into ignoring an
instruction must still be unable to message someone who opted out.

### Today

- **Agent node in automations** — reads the contact and routes them down the
  right path; on a provider outage or an exceeded budget it fails to the first
  path instead of stopping the run.
- **Reply suggestions in the inbox**, grounded in the clinic's knowledge base.
- **Copilot** — read-only answers about data on screen.
- **Supervisor** — reviews automations and reports findings (broken graphs,
  automations that never fire, consent risks).
- **Cost control** — shared daily limit, provider chosen per installation
  (Anthropic, OpenAI, Google), spend visible in settings.

### Next

1. **Drafts with approval** — the agent proposes a message, a person approves
   it; the first N messages of every new automation go through this queue.
2. **Decision log a human can read** — why the agent routed this patient this
   way, kept next to the run in the engine log, not only as tokens spent.
3. **Knowledge base as the single source of facts** — services, prices,
   preparation instructions and opening hours, with the answer refusing to
   invent what the base does not contain.
4. **Evaluation harness for prompts** — a set of cases (consent traps,
   medical-advice traps, Polish and English) run against a prompt change
   before it ships. Today a prompt edit is unverified.
5. **Triage of inbound messages** — urgency, topic and suggested owner, so
   reception sees what needs a human first.
6. **Patient history summary for reception** — three sentences before the
   call, from visits and correspondence only.
7. **Per-automation budgets and a hard stop** — one flow must not consume the
   installation's whole daily limit.
8. **Local model support** (Ollama or a compatible endpoint) for clinics that
   will not send anything to a hosted provider.

## Security

Security work is not a phase; these are the open items.

1. **Authentication by construction** — a check in CI that every server
   function either uses the `requireUser` / `allowReporter` middleware or is
   on an explicit public allowlist. Today the guarantee is convention plus a
   runtime probe against a deployed instance
   (`scripts/sprawdz-bezpieczenstwo.sh`). _(help wanted)_
2. **Enforce the Content-Security-Policy.** `Caddyfile.example` ships it in
   Report-Only with `'unsafe-inline'`; the goal is nonces for our own scripts
   and an enforcing header. _(help wanted)_
3. **Key rotation runbook** — rotating `PRM_SECRETS_KEY` (re-encrypting stored
   credentials) and the webhook secret, without an outage.
4. **Audit trail for administrator actions** — who changed a role, reset a
   password, exported contacts, read a document. Parts are in the engine log
   today; it should be one view with retention.
5. **Automated dependency review** in CI, and a documented response time for
   reports that arrive through private vulnerability reporting.

## What we will not build

- Medical advice to patients, diagnosis or triage of symptoms. PRM Core talks
  about appointments and administration.
- Anything that sends without a consent check on the server.
- A hidden count of installations. The update check only downloads a file
  (see README → Update notices).
