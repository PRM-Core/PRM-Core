# Demo mode and the simulator

A public demo shows PRM Core working on patients who do not exist. Leads come
in, visits are booked and end, automations send, PRM_Agent finds who needs
attention, and the reports move. None of the patients is real, and nothing
the system "sends" leaves the server.

This document describes the mode the product provides. Where a demo runs, and
under which address, is the installation's business. It belongs in the
installation's own folder, not in this repository.

## Switching it on

```
PRM_DEMO=1
PRM_DEMO_TICK_SECONDS=30   # optional: a simulator step every 30 s (minimum 5)
PRM_DEMO_RESET_HOUR=3      # optional: Warsaw hour of the nightly reset
```

Start it on an **empty database**, with **no integration keys** (SendGrid,
Twilio, booking system, Meta, Canva) and no language model. On the first
engine tick the demo seeds itself, so nothing else needs to run.

**Never set `PRM_DEMO` on a clinic's installation.** The nightly reset deletes
patients. As a second line of defence, the reset refuses to run on a database
holding contacts that do not look like sample data. Sample data means
addresses on `example.test`/`example.com`/`example.org` and numbers starting
`+48 000`. A database the demo has already reset is marked as the demo's.

## What changes in demo mode

1. **Nothing is sent.** The e-mail and SMS transports and outgoing webhooks
   record what they would have sent in the demo outbox instead of calling
   SendGrid, Twilio or the receiver. The switch sits inside the transports, so
   every path is covered: automations, campaigns, inbox replies, the agent and
   login codes. The sender address is still required, so a demo shows the same
   errors a clinic would get.
2. **A banner** above every page says the data is simulated, when it resets,
   and links to **Sent in the demo** (`/demo`). That page shows the last 100
   messages: e-mails rendered as the patient would see them, SMS texts, and
   webhook bodies. The preview strips the tracking pixel and points tracked
   links straight at their target, so looking at a message never counts as an
   open or a click.
3. **The simulator** runs on the engine clock (below).
4. **The data is reset** every night after `PRM_DEMO_RESET_HOUR`, and at once
   on a database that has never been reset. Accounts, sessions, the
   installation's settings and secrets, and the audit trail survive the reset.
   Everything else is emptied and seeded again.
5. The supervisor stops flagging missing SendGrid and Twilio keys, since the
   demo needs none.

The demo outbox table (`demo_outbox`) is created on first use. It exists only
on a demo installation, so it has no migration.

## The seed

The seed is shaped so that every screen has something true to show from the
first minute:

- about 190 patients and leads with two years of visits across fictional
  doctors, services and two sites;
- **over 300 resolved visits**, so the no-show model trains for real (it needs
  40). No-shows follow a pattern the model can find: booking far ahead, an
  earlier no-show, no SMS consent and an early slot all raise the chance;
- **more no-shows in the last 30 days than in the 30 before**, and fewer e-mail
  opens, which produces the agent's "no-shows rising" and "opens falling"
  recommendations;
- patients due for a **recall**, after **one visit without a second**,
  **drifting**, **seen this week without a word since**, at **high risk of not
  showing up**, and **without a phone**, so every list on PRM_Agent → Lists
  has people on it;
- an inbox with a dozen conversations, a knowledge base with three entries and
  three unanswered questions, three segments, and six automations: lead
  welcome (e-mail, then an SMS when the e-mail is not clicked), booking
  confirmation, a survey after the visit, a no-show follow-up, a cancellation
  follow-up, and an inactive yearly recall.

After seeding, PRM_Agent's nightly pass runs at once, so the signals, the
model, the recommendations and the brief are ready when the first visitor
arrives.

Window rates (no-shows, opens) are produced by error diffusion, not by a coin
per visit. With about 60 visits a window, coins would let a recommendation
come and go from one night to the next.

## The simulator

Every `PRM_DEMO_TICK_SECONDS` one step of a clinic's day happens:

| What                     | How it enters                                                      |
| ------------------------ | ------------------------------------------------------------------ |
| a new lead               | the lead webhook's intake (`processLead`), as an ad form posts it  |
| a booking                | the booking webhook's intake (`processBooking`), new or returning  |
| a visit completed        | as a booking system reports it (`announceVisitState`)              |
| a no-show                | the visit stays booked 2 h past its start, then is reported        |
| a cancellation           | as a booking system reports it                                     |
| an e-mail opened/clicked | the tracking routes' recorder, on what the engine really sent      |
| a patient's reply        | the inbox (`recordInboundMessage`), often to a message just "sent" |

The simulator never writes an automation's result itself. The engine, the
automations and PRM_Agent react the way they would in a clinic. A third of
bookings start within the next two and a half hours, so a visitor also sees
visits end and the after-visit automations fire. Whether a visit becomes a
no-show, or a message is opened, is fixed by a hash of its id. A missed or
repeated step changes nothing.

At the default 30 s, a lead and a booking arrive every three to four minutes.

## Every identity is synthetic

`src/lib/demo/synthetic.ts` generates people so that none can be real:

- surnames only from a fictional list (Przykładowska, Testowy, Demowski…);
- e-mail addresses on `example.test`, a domain reserved by RFC 2606 that
  never receives mail;
- phone numbers `+48 000 …`, a prefix no Polish operator uses;
- PESEL numbers with a deliberately wrong check digit (the repository's
  boundary check flags only valid ones).

The tests check this over ten thousand generated people, and over every
contact after hours of simulated traffic.

## From the command line

The running application does all of this by itself. The script is for a
reset on demand, or for filling a fresh demo with an hour of traffic before
showing it:

```
PRM_DEMO=1 bun run demo -- --reset        # back to the seed state
PRM_DEMO=1 bun run demo -- --steps 120    # the last hour, replayed at once
PRM_DEMO=1 bun run demo -- --loop         # steps without the application
```

It refuses to run without `PRM_DEMO=1`. What the engine sends in response
happens in the running application's next tick.

## Accounts for visitors

Give visitors a **preview account** (role "reporter", read-only), created with
`bun scripts/konto-podgladu.ts --utworz <address> --do <YYYY-MM-DD>`. Without
`--do` it expires tomorrow. It sees every screen, PRM_Agent and Sent in the
demo, and can change nothing. Accounts survive the nightly reset.
