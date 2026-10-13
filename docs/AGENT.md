# PRM_Agent — design

The agent the website promises, specified against the code that exists.
Three sentences from the landing page are the contract:

> Our agent reads how every patient responds, finds who needs attention, and
> prepares the message and a brief for your team. You approve.

> Patient data never leaves your walls.

> Routine messages run on your rules. New campaigns wait for your approval.

Everything below follows from taking those three literally.

## 1. Where intelligence runs

The agent has three layers. Two of them need no model at all, and the third
runs inside the clinic's perimeter by default.

| Layer                     | What it does                                                                 | Where it runs                                                                                                                                   | Needs a model? |
| ------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Rules** (PRM Engine)    | reminders, follow-ups, recalls on the clinic's rules                         | the installation                                                                                                                                | no             |
| **Signals & predictions** | reads replies, visits, no-shows; scores risk; finds who needs attention      | the installation, in TypeScript over the installation's own database                                                                            | no             |
| **Language**              | writes the draft, the brief, the reply suggestion; explains a recommendation | a model endpoint **inside the perimeter** (local by default); a hosted provider only as an explicit opt-in, and then only on pseudonymised text | yes            |

The consequence that matters for the product: **"Analyzes" and "Draws
conclusions" on the website are the signals layer, not the language model.**
Who is drifting, who is due for a recall, where no-shows went up — these are
counts, rates and a small scoring model over data the installation already
holds. They work with the AI switched off, and they are the same whether the
clinic runs a local model, a hosted one, or none. The language layer only
puts words on top.

## 2. The data boundary — `PRM_AI_MODE`

One setting decides where the language layer may send text:

| Mode                                         | Behaviour                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `off`                                        | No model calls at all. Signals, predictions, recommendations, call lists and the weekly brief still work — the brief is generated from a template, in plain language, from the numbers.                                                                                                                                                         |
| `local` (default when a model is configured) | Model calls go only to an **OpenAI-compatible endpoint whose host is loopback, a private network address (RFC 1918 / ULA) or an explicit allowlist** (`PRM_AI_LOCAL_URL`, `PRM_AI_EGRESS_ALLOW`). Any other host is refused by the client, not by convention. Ollama, vLLM, LM Studio, llama.cpp and a GPU box in the clinic's VPC all qualify. |
| `hosted`                                     | Anthropic, OpenAI or Google, as today — but every prompt passes through the pseudonymisation layer (section 3), and the setting screen says in one sentence what leaves the server. Never the default.                                                                                                                                          |

The mode is enforced in `src/lib/ai/provider.server.ts`, the one place every
model call already goes through. The daily security report and
`scripts/sprawdz-bezpieczenstwo.sh` state the mode and, in `local`, confirm
that no hosted provider key is set.

## 3. The model never sees who the patient is

Even in `local` mode the model does not need identities to write a recall
message, and in `hosted` mode it must not have them. A pseudonymisation layer
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

## 4. Nothing new goes out without a person

- Routine flows (reminders, confirmations, follow-ups) run on the engine's
  rules, as they do now.
- Everything the agent **proposes** — a campaign, a message text, a cadence
  change, a call list — is a **draft** with a status: proposed → approved /
  rejected → sent. Approval is one click and is logged with who and when.
- The consent check stays in the sending code, not in any prompt. A model
  talked into ignoring an instruction still cannot message someone who opted
  out. This exists today and does not change.
- Budgets: a shared daily limit (exists) plus a per-automation limit, and a
  hard stop that fails to the first path instead of stopping the run (exists
  for the agent node).

## 5. What the agent does — mapped to the website

| Website                                                               | Capability                                                                                                                                                                                                                              | How                                                                                                                                                                                                                                       | Model needed                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Analyzes** "every reply, visit and no-show, segment by segment"     | **Signals**: reply rate to reminders, no-show rate and its trend by location, doctor, service and weekday, recall due, post-op without a reply after 48 h, first visit without a follow-up, patients drifting (no activity N months)    | nightly job on the engine clock; SQL over contacts, visits, sends, events, inbox; stored in `agent_signals` with the period and the comparison                                                                                            | no                                                 |
| **Draws conclusions** "who is waiting, drifting or at risk, and why"  | **Predictions**: no-show risk per upcoming visit; best send time per patient; recall likelihood; reactivation score; expected replies for a campaign                                                                                    | small models trained on the installation's own history (logistic regression / rate tables with priors), retrained nightly, stored in `agent_models`, scores in `agent_scores`; each score carries its top factors so the UI can say _why_ | no                                                 |
| **Prepares** "the message for each patient and a brief for your team" | **Recommendations** with evidence and a proposed action ("no-shows up 8% at Downtown → second reminder 2 h before"); **campaign drafts** (segment, channel, message, schedule); **call lists** for the front desk; **the weekly brief** | recommendations are rules over signals (reuse the supervisor's `agent_insights`); message text and the brief's prose come from the language layer, or from templates in `off` mode                                                        | drafts and prose: yes (local); everything else: no |
| **You decide** "approve in one click"                                 | **Drafts queue**: a screen listing proposals with evidence, the audience count, the exact text and the schedule; approve, edit, reject                                                                                                  | `agent_drafts`; approval hands the campaign to the existing campaign runner with its throttle and consent gate                                                                                                                            | no                                                 |
| **Automates**                                                         | execution and monitoring of what was approved; the next brief reports the outcome                                                                                                                                                       | PRM Engine as today                                                                                                                                                                                                                       | no                                                 |
| **Reports for every role**                                            | CEO: weekly brief; CFO: volumes and cost per channel; Marketing: campaign performance and A/B; IT: the daily security report (exists)                                                                                                   | role views over the same signals                                                                                                                                                                                                          | no                                                 |

Two consequences for the product story:

- **The agent is in the Community Edition**, entire. There is no reason to
  hold back a layer that runs on the clinic's own server anyway.
- **"Agent you control — model hosting"** on the website resolves to: _local
  by default, hosted only by explicit choice, and never with identities._

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
  brief.server.ts        weekly brief: template first, model polish optional
```

Existing modules move onto the same foundation without changing what they
do: the agent node in automations (`contact-agent`), inbox reply suggestions
(`inbox-assist`), the Copilot, the supervisor, the creative coder and the
builders all call the provider through the mode switch and the redaction
layer.

## 7. Local models

The local adapter speaks the OpenAI chat-completions protocol, so any of
Ollama, vLLM, LM Studio or llama.cpp works unchanged. The product does not
ship a model; it documents what works:

- Polish and English drafts: an open-weights model with good Polish —
  candidates to evaluate include Bielik (Polish), Qwen 2.5 / 3 in the
  7–14B range and Gemma 3 12B. The evaluation harness (section 8) decides,
  not a brand name.
- Hardware: a 7–8B model quantised to 4 bits drafts a message in a few
  seconds on a CPU-only server with 16 GB RAM; a modest GPU brings it under
  a second. Signals and predictions need none of this.
- Enterprise can supply and size the model host inside the clinic's
  perimeter; Community brings its own endpoint.

## 8. How we know it holds

- **Egress test**: in `local` mode, every prompt builder is run against a
  fake `fetch`; any request to a public host fails the test suite.
- **Redaction test**: a contact with known identifiers goes through every
  prompt builder; the outgoing text is asserted to contain none of them.
- **Evaluation harness**: a fixed set of cases — consent traps, requests for
  medical advice, Polish and English, a rude patient reply — run against the
  prompts and the chosen local model before a prompt or a model changes.
- **Decision log**: every recommendation, draft and routing decision is a
  row in the engine log with its evidence, readable by a person.
- **Security report**: states the mode, the endpoint host class
  (loopback / private / allowlisted) and the absence of hosted keys in
  `local` mode.

## 9. Phases

1. **Foundation (no model required).** `PRM_AI_MODE`, the local adapter
   with the egress guard, the redaction layer applied to the existing prompt
   builders, the egress and redaction tests. Signals job; no-show prediction
   with factors; recall and call lists; the weekly brief from a template;
   the drafts queue screen. After this phase the website's "Analyzes →
   Draws conclusions → Prepares → You decide" is true with the AI off.
2. **Language on top.** Local model drafts for campaigns and replies; the
   brief polished by the model; recommendation explanations; triage of
   inbound messages (urgency, topic, owner).
3. **Roles and measurement.** CFO and Marketing views, A/B split with
   results in the brief, goals and conversion per campaign, the evaluation
   harness in CI.

## 10. The website — claims to correct before launch

The landing page describes a product that mostly exists; a few lines
describe one that does not. Each needs a decision, not a "to confirm":

| On the page                                                | In the product                                                                                                                      | Do                                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| "Built on NestJS, Node.js, TypeScript"                     | TanStack Start, React, Bun, SQLite (libSQL), Docker                                                                                 | replace the stack line                                                                       |
| "Open REST API"                                            | a booking webhook, a lead webhook and a read-only MCP endpoint; no general REST API                                                 | say "webhooks and a read-only assistant API" or put a REST API on the roadmap and label it   |
| "SSO [to confirm]"                                         | password + 2FA (SMS or authenticator); no SSO                                                                                       | mark as Enterprise roadmap                                                                   |
| "Agent you control — model hosting [to confirm]"           | this document, section 2                                                                                                            | "Local by default. Hosted providers only by your choice, and never with patient identities." |
| "[Agent availability in Community: to confirm]"            | section 5                                                                                                                           | the agent is in Community                                                                    |
| "Runs on HIPAA-eligible infrastructure under your own BAA" | true for self-hosting; the Polish page uses RODO                                                                                    | keep; legal review as the SEO spec already says                                              |
| "No copy of patient data at PRM Core"                      | true by architecture: no telemetry, update check downloads only                                                                     | keep, and link the README's "Update notices" section as the evidence                         |
| "Encryption at rest, SBOM, pen-test report"                | not provided today                                                                                                                  | decide what Enterprise delivers; remove the rest                                             |
| "Patient Communication Standards" PDF, 5 rules             | rules 01, 04 and 05 are enforced in code (consent gate, drafts queue, redaction); 02 and 03 are guidance plus quiet hours (roadmap) | write the PDF from what the code enforces, in that order                                     |
