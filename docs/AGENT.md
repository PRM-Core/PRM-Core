# PRM_Agent — design

The agent the website promises, specified against the code that exists.
Three sentences from the landing page are the contract:

> Our agent reads how every patient responds, finds who needs attention, and
> prepares the message and a brief for your team. You approve.

> Patient data never leaves your walls.

> Routine messages run on your rules. New campaigns wait for your approval.

Everything below follows from taking those three literally.

**Status.** Since 1.67.0 the foundation is in the product: `PRM_AI_MODE`
(section 2), the local adapter with its egress guard, the pseudonymisation
layer in front of every prompt builder (section 3), the boundary check in the
daily security report, and the tests of section 8. Since 1.68.0 the signals
layer runs nightly (`src/lib/agent/`): the measures of section 5, a no-show
risk per upcoming visit with its factors, and a dashboard card that shows
them. Since 1.69.0 the agent also recommends and prepares (section 4):
rules over the signals become findings on the supervisor's panel, audiences
become campaign drafts that a person approves or rejects, the "who needs
attention" counts are call lists for the front desk, and a leadership brief
is built from a template — all without a language model. Since 1.70.0 the
language layer sits on top (`language.ts`, `language.server.ts`): a model
inside the perimeter polishes the brief and writes draft texts from the
facts, and its output is accepted only when it keeps every number of the
template and follows the draft rules — otherwise the template stands. Since
1.71.0 inbound messages are triaged (`triage.ts`, `triage.server.ts`):
urgency, topic and owner from rules for every message, and from a model
inside the perimeter when one is in reach, accepted only within the three
vocabularies. Since 2.0.0 there is no external provider at all, and the
agent's development is governed by directions (section 11): it proposes,
the administrator enables.

## 1. Where intelligence runs

The agent has three layers. Two of them need no model at all, and the third
runs inside the clinic's perimeter by default.

| Layer                     | What it does                                                                 | Where it runs                                                                                                              | Needs a model? |
| ------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Rules** (PRM Engine)    | reminders, follow-ups, recalls on the clinic's rules                         | the installation                                                                                                           | no             |
| **Signals & predictions** | reads replies, visits, no-shows; scores risk; finds who needs attention      | the installation, in TypeScript over the installation's own database                                                       | no             |
| **Language**              | writes the draft, the brief, the reply suggestion; explains a recommendation | a model endpoint **inside the perimeter** — the only place it can run; the product has no adapter for an external provider | yes            |

The consequence that matters for the product: **"Analyzes" and "Draws
conclusions" on the website are the signals layer, not the language model.**
Who is drifting, who is due for a recall, where no-shows went up — these are
counts, rates and a small scoring model over data the installation already
holds. They work with the AI switched off, and they are the same whether the
clinic runs a local model or none. The language layer only puts words on top.

## 2. The data boundary — `PRM_AI_MODE`

One setting decides where the language layer may send text:

| Mode                                         | Behaviour                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `off`                                        | No model calls at all. Signals, predictions, recommendations, call lists and the weekly brief still work — the brief is generated from a template, in plain language, from the numbers.                                                                                                                                                         |
| `local` (default when a model is configured) | Model calls go only to an **OpenAI-compatible endpoint whose host is loopback, a private network address (RFC 1918 / ULA) or an explicit allowlist** (`PRM_AI_LOCAL_URL`, `PRM_AI_EGRESS_ALLOW`). Any other host is refused by the client, not by convention. Ollama, vLLM, LM Studio, llama.cpp and a GPU box in the clinic's VPC all qualify. |

There is no third mode. Until 1.71.0 a `hosted` mode could send pseudonymised
prompts to a cloud provider; 2.0.0 removed the adapters, so nothing in the
product can be configured to send text outside the perimeter. A `hosted` left
in an older `.env` is read as `off`, and the settings screen and the daily
security report say so.

The mode is enforced in `src/lib/ai/settings.server.ts`, the one place every
model call already goes through. The daily security report states the mode,
the endpoint's host class, and flags any leftover provider key in `.env`.

## 3. The model never sees who the patient is

Even in `local` mode the model does not need identities to write a recall
message, and it does not need them. A pseudonymisation layer
(`src/lib/ai/redact.ts`) sits between the database and every prompt builder:

- Names, e-mail addresses, phone numbers and the national ID are replaced by
  placeholders (`{{firstName}}`) or by a per-run pseudonym (`patient #A1F3`)
  before the prompt is built. The model drafts with placeholders; the engine
  personalises at send time — which it already does for every template.
- Free text the patient wrote (an inbox reply) is scanned for the same
  identifiers before it is quoted.
- Aggregates go through unchanged: "214 patients due for screening" carries
  no identity.
- Tests feed a contact with known identifiers through every prompt builder
  and assert none of them appears in the outgoing request.

Today this layer does not exist: `contact-agent`, `inbox-assist` and the
Copilot put the patient's name, e-mail and phone into the prompt. That is the
first thing to change, before any new capability.

## 3a. The knowledge base is the only source of facts (since 2.7.0)

A prompt asking a model to use only the knowledge base is a request; the
code makes it a rule (`grounding.ts`). Every checkable fact a model writes —
a price, an hour, a date, a phone number, a duration, a percentage, a link
or an address — must appear in what the model was given: the knowledge
base in full, the conversation, the patient's own data. An automation's
agent node sends nothing with an unbacked fact and is told why; an inbox
suggestion shows the unbacked facts above the reply box. When the base has
no answer, the model writes a line "BRAK W BAZIE: …" that never reaches
the patient and becomes an open question in Ustawienia → PRM_Agent → Baza
wiedzy; answering it closes it, and three or more open ones are a
recommendation. The evaluation harness has reply cases for both.

## 4. Nothing new goes out without a person

- Routine flows (reminders, confirmations, follow-ups) run on the engine's
  rules, as they do now.
- Everything the agent **proposes** — a campaign, a message text, a cadence
  change, a call list — is a **draft** with a status: proposed → approved /
  rejected → sent. Approval is one click and is logged with who and when.
- **A new automation starts on trial** (since 2.4.0): its first N messages
  (5 by default, set per automation in the editor, 0 = no trial) are held
  in the same drafts queue, each with the exact text the patient would get.
  Approved, the message goes out through the ordinary send code, consent
  gate included; rejected, the step is skipped and the run goes on. After
  N approvals the automation sends on its own. Automations created before
  2.4.0 have no trial and send as they did.
- The consent check stays in the sending code, not in any prompt. A model
  talked into ignoring an instruction still cannot message someone who opted
  out. This exists today and does not change.
- Budgets (since 2.9.0): counted in **model runs a day**, not in money — a
  model in the clinic's network costs nothing per token, and its time is
  what one flow could take from the others. A limit for the installation
  (Ustawienia → PRM_Agent, default 2000) and one per automation (in the
  editor, default 100, 0 = the agent never asks the model). Past either,
  model steps are skipped until midnight; agent nodes take the first path
  and the run goes on; the log says so once a day, and the supervisor warns
  at 80%.

## 5. What the agent does — mapped to the website

| Website                                                               | Capability                                                                                                                                                                                                                                                                                                                 | How                                                                                                                                                                                                                                       | Model needed                                       |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Analyzes** "every reply, visit and no-show, segment by segment"     | **Signals**: reply rate to reminders, no-show rate and its trend by location, doctor, service and weekday, recall due, post-op without a reply after 48 h, first visit without a follow-up, patients drifting (no activity N months)                                                                                       | nightly job on the engine clock; SQL over contacts, visits, sends, events, inbox; stored in `agent_signals` with the period and the comparison                                                                                            | no                                                 |
| **Draws conclusions** "who is waiting, drifting or at risk, and why"  | **Predictions**: no-show risk per upcoming visit; best send time per patient; recall likelihood; reactivation score; expected replies for a campaign                                                                                                                                                                       | small models trained on the installation's own history (logistic regression / rate tables with priors), retrained nightly, stored in `agent_models`, scores in `agent_scores`; each score carries its top factors so the UI can say _why_ | no                                                 |
| **Prepares** "the message for each patient and a brief for your team" | **Recommendations** with evidence and a proposed action ("no-shows up 8% at Downtown → second reminder 2 h before"); **campaign drafts** (segment, channel, message, schedule); **call lists** for the front desk; **the weekly brief**; **the patient in three sentences** for the front desk before a call (since 2.8.0) | recommendations are rules over signals (reuse the supervisor's `agent_insights`); message text and the brief's prose come from the language layer, or from templates in `off` mode                                                        | drafts and prose: yes (local); everything else: no |
| **You decide** "approve in one click"                                 | **Drafts queue**: a screen listing proposals with evidence, the audience count, the exact text and the schedule; approve, edit, reject                                                                                                                                                                                     | `agent_drafts`; approval hands the campaign to the existing campaign runner with its throttle and consent gate                                                                                                                            | no                                                 |
| **Automates**                                                         | execution and monitoring of what was approved; the next brief reports the outcome                                                                                                                                                                                                                                          | PRM Engine as today                                                                                                                                                                                                                       | no                                                 |
| **Reports for every role**                                            | CEO: weekly brief (PRM_Agent → Brief); CFO: volumes and cost per channel, revenue and the no-show loss (Reports → Finance, since 2.6.0); Marketing: campaign performance and A/B (Reports → Marketing, since 2.6.0); IT: the daily security report                                                                         | role views over the same signals                                                                                                                                                                                                          | no                                                 |

Two consequences for the product story:

- **The agent is in the Community Edition**, entire. There is no reason to
  hold back a layer that runs on the clinic's own server anyway.
- **"Agent you control — model hosting"** on the website resolves to: _a
  model inside your perimeter, or none; never an external provider, never
  with identities; and what the agent may start doing is your decision._

## 6. Modules

```
src/lib/ai/
  provider.server.ts     one interface, adapters: anthropic, openai, gemini (exist) + local (new)
  local.server.ts        OpenAI-compatible adapter with the egress guard
  redact.ts              pseudonymisation; used by every prompt builder
  settings.server.ts     PRM_AI_MODE, budgets (extend)

src/lib/agent/
  signals.server.ts      nightly metrics → agent_signals
  predict/no-show.ts     train + score; factors
  predict/send-time.ts   reply-time histograms per patient and channel
  predict/recall.ts      due dates and likelihood
  recommend.server.ts    rules over signals → agent_insights (reuse)
  drafts.server.ts       proposals with status; approval → campaign runner
  brief.ts / brief.server.ts  the brief: template first, stored nightly, model polish optional
  language.ts            the checks a model's text must pass (numbers kept, draft rules)
  language.server.ts     brief polish and draft text through the provider, budget and log
  triage.ts              urgency / topic / owner by rules; the model's answer parsed and checked
  triage.server.ts       triage of inbound threads on the engine clock, model optional
  eval/cases.ts          the fixed cases of the evaluation harness, with their checks
  eval/run.server.ts     a run against the model in reach, stored whole
```

Existing modules move onto the same foundation without changing what they
do: the agent node in automations (`contact-agent`), inbox reply suggestions
(`inbox-assist`), the Copilot, the supervisor, the creative coder and the
builders all call the provider through the mode switch and the redaction
layer.

## 7. Local models

The local adapter speaks the OpenAI chat-completions protocol, so any of
Ollama, vLLM, LM Studio or llama.cpp works unchanged. The product does not
ship a model; it documents what works.

**Measured (2.11.0):** three open-weights models on Ollama, on an Apple M2
with 16 GB of unified memory and no discrete GPU, one model in memory at a
time. The evaluation harness (section 8), all 18 cases, the same code and
prompts for each:

| Model (Ollama tag, 4-bit)                                      | Size   | Polish | English | Time PL / EN  |
| -------------------------------------------------------------- | ------ | ------ | ------- | ------------- |
| Bielik 11B v2.3 (`SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M`) | 6.7 GB | 17/18  | 17/18   | 7.7 / 3.9 min |
| Qwen 2.5 14B (`qwen2.5:14b-instruct-q4_K_M`)                   | 9.0 GB | 18/18  | 18/18   | 5.0 / 4.0 min |
| Gemma 3 12B (`gemma3:12b`)                                     | 8.1 GB | 18/18  | 18/18   | 7.4 / 3.9 min |

All three are usable. Bielik's misses were one case per language, and
the checks in code caught both: a Polish draft with an invented number
(refused, nothing sent) and an English brief opening with two percentages
not in the data (dropped; the brief keeps the code's numbers). A miss at
this size moves between cases from run to run — in 2.10.0 it was a reply
with two invented web addresses — which is why the checks live in code.
Bielik is the smallest and was trained for Polish; Qwen and Gemma had no
miss in this round, Qwen was the fastest in Polish.

**Where to start: Bielik 11B.** One model is enough for every capability
of the agent. Bielik is the smallest of the three (6.7 GB), so a 16 GB
server keeps the most room for the database and the application — and
memory was the only serious failure in these runs. It was trained for
Polish, and the harness checks the rules, not how natural the Polish
reads. Its misses differ from run to run and the code caught every one.
Qwen 2.5 14B scored 18/18 and is the alternative where there is memory to
spare; switching is one `ollama pull` and one line in `.env`.

**Without a GPU.** The same Bielik, forced onto the processor alone
(`PARAMETER num_gpu 0` in an Ollama Modelfile), on the same M2:

| Bielik 11B, CPU only | Polish | English | Time PL / EN   | Speed                                     |
| -------------------- | ------ | ------- | -------------- | ----------------------------------------- |
| Apple M2, 8 cores    | 18/18  | 17/18   | 13.4 / 5.7 min | ~19 tokens/s reading, ~7 tokens/s writing |

Quality does not depend on where the model runs; time does — about twice
as long here, a draft in under a minute. The English miss was again a
brief opening with a number not in the data, dropped by the code. The M2
has unusually fast memory for a CPU; a typical clinic server with two
channels of DDR4 writes at perhaps half that speed, which still suits
drafts, the brief and triage, since none of them is waited on live. The
local adapter allows a request five minutes for this reason.

**One model in memory at a time.** Ollama keeps a model loaded for five
minutes after its last request. Two models of this size together fill
16 GB: the first Gemma run, started while Qwen was still loaded, took
3.4 hours instead of 7 minutes and lost five cases to timeouts and
truncated answers. On a 16 GB server set `OLLAMA_MAX_LOADED_MODELS=1`,
and since 2.11.0 an empty or cut-off answer is "model unavailable" — the
agent falls back on its rules — rather than an error.

Tuning history (Bielik, 2.10.0): the first English run scored 8/18 before
any tuning, the first Polish run 11/18 after one round of fixes.

What the first runs taught, and where it now lives in code rather than in
a prompt: a small model greets the patient by the pseudonym it was shown
(identifiers are refused), writes doses when a template asks for them
(medical advice is refused), invents a phone number and an e-mail address
(grounding catches them), routes results to the front desk (the owner
follows the topic), and puts the "not in the knowledge base" marker in the
middle of a line (the parser accepts it). A brief is opened by the model in
2–4 sentences; the numbers stay the code's.

Setup used — the server listens on loopback only:

```bash
OLLAMA_HOST=127.0.0.1:11434 OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_NUM_PARALLEL=1 ollama serve
ollama pull SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M
PRM_AI_MODE=local PRM_AI_LOCAL_URL=http://127.0.0.1:11434/v1 PRM_AI_LOCAL_MODEL=SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M PRM_LOCALE=pl bun run agent:eval
```

- Swap the model by changing `PRM_AI_LOCAL_MODEL` and run the harness
  again; it decides, not a brand name.
- Hardware: an 11–14B model at 4 bits answers a case in about 13–26 seconds
  on 16 GB of unified memory with its GPU, and in about 20–45 seconds on
  the processor alone.
  Signals and predictions need none of this.
- Enterprise can supply and size the model host inside the clinic's
  perimeter; Community brings its own endpoint.

## 8. How we know it holds

- **Egress test**: in `local` mode, every prompt builder is run against a
  fake `fetch`; any request to a public host fails the test suite.
- **Redaction test**: a contact with known identifiers goes through every
  prompt builder; the outgoing text is asserted to contain none of them.
- **Evaluation harness** (`src/lib/agent/eval/`, since 2.1.0): a fixed set
  of cases — the product's own prompts for drafts, the brief and triage, with
  traps for medical advice, an invented link or phone number and a changed
  number — put to the model in reach and judged by code. Run from PRM_Agent
  → Kierunki before enabling a direction, or `bun run agent:eval` before a
  prompt or a model changes (exit code 1 on any failure, for CI). The last
  score is the evidence on every model direction and a line in the brief.
- **Decision log** (since 2.5.0): every recommendation, draft, direction,
  triage and trial decision is a row in the engine log with its evidence.
  PRM_Agent → Dziennik reads them with who acted — a person (by name), the
  agent's own rules, or a model — and where to look next. Every list row
  says why the patient is on it; the patient's card says what the agent
  holds about them and why (`explain.ts`, `explain.server.ts`).
- **Security report**: states the mode and the endpoint host class
  (loopback / private / allowlisted), and flags a leftover provider key or
  `hosted` setting in `.env`.

## 9. Phases

1. **Foundation (no model required).** `PRM_AI_MODE`, the local adapter
   with the egress guard, the redaction layer applied to the existing prompt
   builders, the egress and redaction tests. Signals job; no-show prediction
   with factors; recall and call lists; the weekly brief from a template;
   the drafts queue screen. After this phase the website's "Analyzes →
   Draws conclusions → Prepares → You decide" is true with the AI off.
2. **Language on top.** Local model drafts for campaigns (done in 1.70.0)
   and replies; the brief polished by the model (done in 1.70.0);
   recommendation explanations; triage of inbound messages (urgency,
   topic, owner — done in 1.71.0).
3. **Roles and measurement.** CFO and Marketing views, A/B split with
   results in the brief, goals and conversion per campaign, the evaluation
   harness in CI.

## 10. The website — claims to correct before launch

The landing page describes a product that mostly exists; a few lines
described one that does not. The decisions below were applied to the page
canvas on 2026-10-14; the table stays as the record of what was claimed
and why it changed. The "Open REST API" and "Audit trail" rows were
updated for 2.17.0–2.25.0 and are not on the page yet:

| On the page                                                                                                          | In the product                                                                                                                                                                                                   | Do                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| "Built on NestJS, Node.js, TypeScript"                                                                               | TanStack Start, React, Bun, SQLite (libSQL), Docker                                                                                                                                                              | replace the stack line                                                                                                |
| "Open REST API"                                                                                                      | a booking webhook, a lead webhook, outgoing webhooks to approved destinations (since 2.17.0) and a read-only MCP endpoint; no general REST API                                                                   | say "webhooks in and out and a read-only assistant API" or put a REST API on the roadmap and label it                 |
| "SSO [to confirm]"                                                                                                   | password + 2FA (SMS or authenticator); no SSO                                                                                                                                                                    | marked as Enterprise roadmap                                                                                          |
| "Audit trail", "Hardened API"                                                                                        | daily security report, signed webhooks and rate limits; since 2.21.0–2.25.0 sign-in required by construction (checked in CI), an enforced CSP, key rotation, an administrative actions log and dependency review | keep both, say what each means; the audit trail is in since 2.24.0                                                    |
| "no-shows up 8% at Downtown", "Post-op, no reply after 48 h", "Screening due in 30 days", "Replied to reminders 71%" | per doctor / specialisation / site (site since 2.2.0, from the booking webhook's `placowka`); "after a visit, no reply" (7 days); recall = a year since the last visit; e-mail opens and clicks                  | copy changed to what the agent measures; "at Downtown" restored in 2.2.0                                              |
| "Agent you control — model hosting [to confirm]"                                                                     | sections 2 and 11                                                                                                                                                                                                | "No external AI provider in the product. The model, if any, runs in your network; what the agent may do, you enable." |
| "[Agent availability in Community: to confirm]"                                                                      | section 5                                                                                                                                                                                                        | the agent is in Community                                                                                             |
| "Runs on HIPAA-eligible infrastructure under your own BAA"                                                           | true for self-hosting; the Polish page uses RODO                                                                                                                                                                 | keep; legal review as the SEO spec already says                                                                       |
| "No copy of patient data at PRM Core"                                                                                | true by architecture: no telemetry, update check downloads only                                                                                                                                                  | keep, and link the README's "Update notices" section as the evidence                                                  |
| "Encryption at rest, SBOM, pen-test report"                                                                          | not provided today                                                                                                                                                                                               | decide what Enterprise delivers; remove the rest                                                                      |
| "Patient Communication Standards" PDF, 5 rules                                                                       | rules 01, 04 and 05 are enforced in code (consent gate, drafts queue, redaction); 02 and 03 are guidance, plus a sending window and pace for campaigns and, since 2.12.0, for automations                        | write the PDF from what the code enforces, in that order                                                              |

## 11. The agent develops itself; the administrator sets the direction

The agent improves inside the installation, on the installation's data, and
asks a person only about _what it may start doing_:

- **It trains itself.** The no-show model is retrained every night on the
  clinic's own visits; its skill against the base rate is a signal with
  yesterday's value beside it (`model.no_show_skill`), and the brief reports
  it. Signals, thresholds and lists follow the data with no training at all.
- **It learns from decisions.** Three kinds, all kept in `agent_examples`
  and used only with the "learn from the team's decisions" direction
  enabled (since 2.3.0):
  - the final text of every approved draft — the model sees the latest
    ones when it writes the next draft: the house style, not a constraint;
  - a triage the front desk corrected in the inbox — the message,
    pseudonymised before it is stored, with the team's verdict
    (urgency/topic/owner); the model sees the latest ones when it triages:
    "this is how we sort". The verdict stands on the thread until the
    patient writes again;
  - a dismissed recommendation — the numbers it was dismissed at become the
    bar: the same finding returns only when a count is half as large again
    or a rate has risen by another 5 pp, and then as new. Without the
    direction a dismissal stays final, as before.
    Examples never leave the database.
- **It proposes directions.** When the state gives grounds — a model in
  reach, a first approval, a data gap such as a fifth of contacts without a
  phone — the agent proposes a direction (`agent_directions`, `directions.ts`):
  what would change and why now, with the evidence. The administrator
  enables or declines it on PRM_Agent → Kierunki; the proposal is refreshed
  nightly while it waits and never enabled by the agent itself. Every model
  capability (drafts, the brief, triage) is such a direction, so a model that
  appears on the network changes nothing until someone says so.
- **It reports on itself.** The brief's last section says how the model is
  doing, how many examples it has, and what waits for a decision.
