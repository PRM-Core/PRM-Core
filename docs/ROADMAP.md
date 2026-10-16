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
  changed, asset downloaded, inbound message — and, since 2.13.0, dates:
  N months since the last visit (recall, preventive care, "no visit in a
  year") and the patient's birthday (from the PESEL).
- **Conditions**: in segment, has tag, field value, email opened, do-not-contact.
- **Waiting** (since 2.14.0): a fixed delay, or a wait for the patient's
  event — a reply, a booking, an opened e-mail, with that trigger's filters
  — for at most a set time, with two ways out: "event" at once, or "time ran
  out" at the deadline. Only an event after the wait began counts.
- **Channel fallback** (since 2.18.0): one step, "e-mail, then SMS if
  unopened": an open or a click of that very e-mail within the set time
  means no SMS; no e-mail at all (no address, no consent, the cap) means
  the SMS at once. Both halves pass the same consent, cap, trial and
  sending-window rules as ordinary message steps.
- **Actions**: email, newsletter, SMS, pop-up, tags, segments, field update,
  score, funnel stage, do-not-contact, delete contact, end — and, since
  2.17.0, send to a webhook (n8n, Make, Zapier, your code): destinations and
  the fields allowed out are an administrator's, the address and secret are
  stored encrypted, every request is signed, redirects are refused
  (`docs/WEBHOOK-OUTGOING.md`).
- **Safety**: consent checked on the server before every marketing send, not
  in the flow; delays; retries with attempt counts; dry run before activation;
  a supervisor that reviews automations and reports findings.
- **Sending window and pace** (since 2.12.0): automation messages keep the
  installation's hours (08:00–20:00 on a new installation) and an hourly and
  daily limit across all flows — the campaigns' arithmetic. A step outside
  the window waits for it and says so once in the log; an automation whose
  message is useless later can opt out of the window, never out of the
  limits.
- **Frequency cap** (since 2.15.0): at most N marketing messages per patient
  in 7 days, counted across every automation and campaign, e-mail and SMS.
  An automation's marketing step past it is skipped and the run goes on;
  administrative messages never count; campaigns count but are not held
  back.
- **Goals and conversion** (since 2.16.0): an automation's goal is the
  patient's event (a trigger with its filters) within N days of entering;
  conversion per automation and per A/B split variant, with a
  two-proportion test once each variant has 30 runs, counted from the runs
  and the event bus. Reaching the goal can end the run, so a patient who
  booked stops getting reminders to book.

### Next

1. **Re-entry rules** — whether a patient may enter the same automation again,
   and after how long.
2. **Queue observability** — a view of delayed, failed and dead-lettered
   steps with the reason, and a safe retry button.

## PRM_Agent — the AI layer

PRM_Agent is the product's AI under one budget and one key catalog. It never
sends anything the consent rules would not allow: the check is in the code
that sends, not in the prompt, because a model talked into ignoring an
instruction must still be unable to message someone who opted out.

The full design — three layers, the `PRM_AI_MODE` data boundary, the
pseudonymisation layer, and what the agent does with no model at all — is in
[AGENT.md](AGENT.md). The list below is the order of work.

### Today

- **Agent node in automations** — reads the contact and routes them down the
  right path; on a provider outage or an exceeded budget it fails to the first
  path instead of stopping the run.
- **Reply suggestions in the inbox**, grounded in the clinic's knowledge base.
- **Copilot** — read-only answers about data on screen.
- **Supervisor** — reviews automations and reports findings (broken graphs,
  automations that never fire, consent risks).
- **Data boundary** — `PRM_AI_MODE` (off / local), a local model adapter
  with an egress guard, pseudonymised prompts; no external provider in the
  product at all.
- **Signals and predictions without a model** — nightly: no-show rate and
  trend (overall, by doctor, by specialisation), e-mail open and click rates,
  recall due, first visit without a follow-up, post-visit without a reply,
  drifting patients; a no-show risk per upcoming visit with its factors,
  from a model trained on the installation's own history.
- **Recommendations, drafts, lists and the brief** — rules over the signals
  become findings with evidence and one proposed action; audiences become
  campaign drafts a person approves (the campaign is created by the sending
  code, with its limits and consent gate) or rejects; call lists for the
  front desk with CSV export; a leadership brief from a template. No model
  involved.
- **The language layer** — a model inside the perimeter polishes the brief
  and writes draft texts from the facts; accepted only when every number of
  the template survives and the draft rules hold, so the screen is correct
  with AI off.
- **Triage of inbound messages** — urgency, topic and suggested owner for
  every patient message within a minute, from rules always and from a model
  inside the perimeter when there is one; urgent conversations first in
  the inbox.
- **Directions** — the agent trains itself nightly, keeps approved drafts as
  examples, and proposes what it could start doing (model capabilities, data
  gaps) with the evidence; the administrator enables or declines.
- **Location as a dimension** — no-show rate and its trend per site
  (`placowka` / `location` on the booking webhook), beside per doctor and
  per specialisation; the largest rise, wherever it is, in the brief.
- **Learning from the team's decisions** — approved drafts, triages the
  front desk corrected (pseudonymised) and dismissed recommendations become
  examples and thresholds; used only with the direction enabled.
- **Automations on trial** — the first N messages of a new automation wait
  in the drafts queue with the exact text; approved ones go out through the
  ordinary send code, rejected ones skip the step.
- **Decision log a human can read** — PRM_Agent → Dziennik with who acted
  (person, agent, model) and links; a "why" on every list row; on the
  patient's card, what the agent holds about them and why.
- **Reports for every role** — Reports → Finance (volumes and cost per
  channel from the provider's unit prices, SMS parts with the Polish-letter
  rate, revenue from completed visits and the loss on no-shows) and
  Marketing (per campaign: opens, clicks, unsubscribes, recipients who
  booked within 14 days; split variants with a two-proportion test).
- **Knowledge base as the single source of facts** — every price, hour,
  date, phone number, duration, percentage and link a model writes is
  checked in code against the base and the patient's data; the automation
  agent sends nothing with an unbacked fact, the inbox suggestion flags it;
  questions the base cannot answer become a list to fill, and a
  recommendation when they pile up.
- **The patient in three sentences** — visits, what is ahead (with the
  no-show risk when it matters), where the correspondence stands; from the
  record only, no model; before the call on every call list, in the inbox
  header and on the patient's card.
- **Model budgets and a hard stop** — counted in model runs a day, since a
  local model costs nothing per token and its time is the resource: a
  limit for the installation and one per automation (0 = no model); past
  it, model steps are skipped until midnight and agent nodes take the
  first path; one log entry a day and a supervisor alarm at 80%.
- **Evaluation harness** — fixed cases for drafts, the brief and triage,
  traps included, put to the model in reach and judged by code; from the
  screen before enabling a direction, or `bun run agent:eval` in CI.
- **A real local model through the harness** — Bielik 11B on Ollama, on a
  16 GB laptop: from 8/18 to 17/18 in Polish and 18/18 in English,
  with what failed moved into code (medical advice, internal identifiers,
  triage owner and urgency, the knowledge-base marker). Results and setup in
  `docs/AGENT.md`.
- **Three models compared** — Bielik 11B, Qwen 2.5 14B and Gemma 3 12B
  through the same 18 cases on a 16 GB machine, one model in memory at a
  time; all three usable, results in `docs/AGENT.md`.
- **One model, chosen** — Bielik 11B as the starting point (smallest,
  trained for Polish, every miss caught in code); measured without a GPU
  too: the same quality at about twice the time.

### Next

The order is what stands between the agent and "ready": first proof that
it writes well, then the dimensions and inputs the website promises, then
the rest.

1. **A clinic server through the harness** — measured so far on a laptop
   (with and without its GPU); a typical clinic server with DDR4 memory
   is the number the documentation still estimates. _(help wanted)_

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
