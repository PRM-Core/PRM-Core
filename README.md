# PRM Core — patient CRM for clinics

**Open-source CRM and marketing automation built for medical clinics.** Patient
records with consents (GDPR / RODO), email and SMS campaigns, a visual
automation engine, an omnichannel inbox, a design studio and reports —
self-hosted, in English and Polish.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Self-hosted](https://img.shields.io/badge/self--hosted-Docker-2496ED)
![Languages](https://img.shields.io/badge/UI-English%20%7C%20Polski-green)
![Integrations wanted](https://img.shields.io/badge/integrations-contributors%20wanted-orange)

> **🇵🇱 Po polsku.** PRM Core to otwarty system do komunikacji z pacjentem:
> kartoteka ze zgodami RODO, kampanie e-mail i SMS, automatyzacje, skrzynka
> odpowiedzi, studio projektów i raporty — instalowany na własnym serwerze,
> po polsku i po angielsku. **Szukamy osób, które podłączą systemy medyczne**
> (systemy gabinetowe, rejestracje online, EDM, FHIR) — sekcja
> [Contributors wanted](#contributors-wanted-connect-a-medical-system).
> Zgłoszenia i pull requesty po polsku są mile widziane.

## Why PRM Core

- **Your patients' data stays with you.** One Docker container and a SQLite
  file on your own server. No per-contact pricing, no third-party CRM holding
  medical context.
- **Built for healthcare, not adapted to it.** Consents are enforced on the
  server before every marketing send, visit states (booked, completed,
  no-show, cancelled) drive automations, and the national ID (PESEL) gives age
  and sex without asking twice.
- **Nothing in the UI pretends to work.** A number on screen comes from the
  database, or the screen says there is no data. A feature that does not
  exist is disabled and explained — never wired to a button that does nothing.
- **Connects to the systems a clinic already runs** — lead webhooks, a booking
  webhook, and pluggable connectors for booking / practice management systems.

## What it does

- **Automation engine.** Real events (form submitted, visit booked, visit
  completed, patient did not show up, visit cancelled, email opened, tag
  added) start flows drawn on a canvas. Delays survive restarts because the
  step queue lives in the database. A message cannot go out twice — a unique
  key in the schema guarantees it, not careful code.
- **Messaging.** Email via SendGrid and SMS via Twilio, with open and click
  tracking. An omnichannel inbox collects patient replies in one place.
- **Consent.** Any number of consents defined by the clinic, enforced on the
  server before every marketing send. The unsubscribe link works on POST, so
  mail scanners cannot unsubscribe people who never opened the message.
- **Dynamic segments.** A set of conditions, not a stored list — membership is
  computed on every read, so it cannot go stale.
- **Design Studio.** Newsletters, emails and website pop-ups from blocks, with
  fonts served from your own server (no Google Fonts).
- **Reports.** Built-in dashboards plus drag-and-drop custom reports over
  contacts, visits, emails, SMS, campaigns and the inbox (aggregates only).
- **AI.** An agent node in automations, reply suggestions in the inbox and a
  read-only Copilot. Pluggable providers (Anthropic, OpenAI, Google) with a
  shared daily cost limit.
- **Security.** Two-factor login (SMS or authenticator app), a read-only
  reviewer role, login throttling, 30-minute sessions, encrypted integration
  keys (AES-256-GCM) and a daily security report.

### Integrations today

| Integration                 | Direction | What for                                                     |
| --------------------------- | --------- | ------------------------------------------------------------ |
| SendGrid                    | out + in  | email sending, delivery events, replies to the inbox         |
| Twilio                      | out + in  | SMS sending, replies, SMS login codes                        |
| Anthropic / OpenAI / Google | out       | AI agent, Copilot, reply suggestions                         |
| Meta Lead Ads               | in        | leads from Facebook and Instagram ad forms                   |
| Canva                       | in        | importing designs into the content studio                    |
| Booking system connectors   | in        | patients, visits and schedules — pluggable providers         |
| Docplanner (ZnanyLekarz)    | in        | keys and connection test; visit sync in progress             |
| Generic lead webhook        | in        | any system that can send JSON (n8n, Make, Zapier, your code) |
| Booking webhook             | in        | visit bookings from an online booking system                 |
| MCP                         | out       | read-only access for AI assistants                           |

## Contributors wanted: connect a medical system

PRM Core becomes useful for a clinic the day it can read the clinic's own
system. **This is where help matters most**, and it is well scoped:

- The mechanism is finished — linking patients, visit history with states,
  no-shows, cancellations, merging with webhook bookings, schedules and
  automations. A connector only **translates one API** into a small
  TypeScript interface.
- A **tested template** is in
  [`src/lib/booking-system/providers/_template/`](src/lib/booking-system/providers/_template/):
  copy three files, replace the endpoints and the status table, run
  `bun test`. The system appears in the admin panel with its key fields and a
  "Test connection" button.
- Most wanted: a **generic FHIR R4 connector**, **Docplanner / ZnanyLekarz**
  visit sync, and practice management systems used in Poland and beyond. Full
  list with priorities: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md#integrations-we-would-love-to-see).

Beyond connectors, [docs/ROADMAP.md](docs/ROADMAP.md) lists what is next in
the automation engine (time-based triggers, quiet hours for automations,
goals) and in PRM_Agent (drafts with approval, prompt evaluation, local
models).

Pick one, open an issue with the **Medical system connector** form, and say
hi. Not a developer? Clinics that can test against a sandbox, and recipes for
no-code connections (`docs/recipes/`), help just as much.

## Quick start

Requires [Bun](https://bun.sh).

```bash
bun install
cp .env.example .env
bun run db:migrate
bun run db:seed        # prints the admin password once — save it
bun run dev            # http://localhost:8080
```

The app runs without any API key — it simply will not send messages and says so.
Outside production it seeds demo data (fictional patients and automations) so
there is something to click through.

To save integration keys from the admin panel, add an encryption key to `.env`:

```bash
echo "PRM_SECRETS_KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" >> .env
```

Losing this key does not break the system (it falls back to `.env`), but keys
saved in the panel will have to be entered again. Keep a copy of it separately
from database backups.

## Production deployment

Requirements: a server with Docker (a VPS, **not** shared hosting — the engine
needs a long-running process and a writable disk) and a domain pointing to it.
2 vCPU / 4 GB RAM / 30 GB disk is plenty in practice.

On AlmaLinux, Rocky and other RHEL derivatives open the HTTP ports:

```bash
sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload
```

Mounting the database directory needs the `:Z` suffix there (already in
`docker-compose.yml`) — without it SELinux blocks writes.

1. Fill in `.env` (`cp .env.example .env`, then `chmod 600 .env`).
2. Set up HTTPS, depending on whether Caddy already runs on the host:
   - **Caddy on the host**: copy the block from `Caddyfile.example` into
     `/etc/caddy/Caddyfile`, change `reverse_proxy app:3000` to
     `reverse_proxy 127.0.0.1:3000` and reload (`sudo systemctl reload caddy`).
     The app listens on loopback only, so it is reachable from outside only
     through HTTPS.
   - **Caddy in a container**: `cp Caddyfile.example Caddyfile`, put your domain
     in it and start with the profile:
     `docker compose --profile bundled-caddy up -d`.
3. Deploy:

```bash
./deploy.sh "v$(bun --print 'require(`./package.json`).version')"
```

The script backs up the database → builds the image → starts it (migrations
run on container start) → checks `/health` → on failure, tells you exactly how
to roll back. Caddy obtains and renews the certificate on its own.

After the first deployment create the administrator:

```bash
docker compose exec app bun run db:seed
```

The password is generated and printed **once** — there is no default password,
because a default password in a public repository is a published password.

### Data survives every release

The database is a file in `./data` **on the host**, mounted into the container.
A release replaces code only. On top of that:

- `deploy.sh` backs up to `./data/backups/` **before** touching anything,
- `scripts/backup.sh` makes a nightly backup from cron (below),
- migrations only add; the ones that drop a column first move its data
  (see migrations `0022` and `0025`),
- **`drizzle-kit push` is forbidden** on an installation with data — it forces
  the schema and silently drops columns with their contents. Production only
  gets `drizzle-kit migrate`, which applies numbered files and remembers which
  ones ran.

A clean test instance is the same image with a different `DATABASE_URL` and
domain — never a separate code branch.

### SMS verification at login

Applies to accounts with a phone number. An account without a number logs in
with the password alone, so enabling it cannot lock anyone out.

Staged rollout:

1. Set `PRM_2FA_DISABLED=1` in `.env` and deploy. Verification is off, the phone
   fields are already there.
2. _Settings → Users_: fill in the numbers of all accounts.
3. Set `PRM_2FA_DISABLED=0` and recreate the container:
   `docker compose up -d --force-recreate app`.

When the SMS gateway does not respond, login **proceeds without a code** and
administrators get an email (at most one per 30 minutes). An engine log entry
is always written. During such an outage accounts are protected by the password
alone — a deliberate trade-off between security and availability.

### Patient documents

Files uploaded on a contact card live in `data/documents/` — **next to the
database, on the same host volume**, so release and nightly backups cover them.
Download requires a session, and every file records who uploaded it and when.
PDFs, images, Office files, CSV and text up to 20 MB are accepted. HTML and SVG
are rejected on purpose: they can run scripts on our domain.

### Nightly backup

One-time setup on the server:

```bash
(crontab -l 2>/dev/null; echo "0 3 * * * /srv/prm-core/scripts/backup.sh >> /srv/prm-core/data/backups/backup.log 2>&1") | crontab -
```

Every day at 3:00 `data/backups/nightly-*.db.gz` is created — a consistent copy
via `VACUUM INTO`, checked with `quick_check` right after writing, and
compressed. The last 30 are kept; release backups have their own retention.

Restore:

```bash
docker compose down && gunzip -c data/backups/nightly-YYYYMMDD-HHMMSS.db.gz > data/prm-core.db && docker compose up -d
```

The nightly backup sits on the same disk as the database: it protects against
app bugs, failed migrations and human error, not against losing the server. For
that set `BACKUP_REMOTE=user@host:/backups` in `.env` — the newest copy is then
also sent over `scp`.

### Update notices

Administrators see a banner when a new version is out or when the PRM Core
owner publishes an important notice (for example a security fix). Twice a day
the server **downloads** one public file —
[`updates.json`](updates.json) from this repository — and shows what applies to
its version. **Nothing is sent:** no version, no identifier, no data; nobody
learns that your installation exists. Turn it off with `PRM_UPDATE_CHECK=0`,
or point `PRM_UPDATE_FEED_URL` at your own file.

### Versioning

SemVer. The version and commit hash are shown at the bottom of _Settings_ and
in `/health`, so you always know what runs on the server.

## Stack

React 19, TypeScript 5, TanStack Start (SSR) + Router, Tailwind CSS 4,
shadcn/ui (Radix), Recharts, Drizzle ORM + libSQL (SQLite), Bun.

## Project structure

| Directory              | Contents                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| `src/routes/`          | pages and public endpoints (file-based routing, `api.*` = HTTP API) |
| `src/lib/engine/`      | automation engine: events, queue, actions, supervisor               |
| `src/lib/api/`         | **only** `createServerFn` — the RPC layer                           |
| `src/lib/credentials/` | integration keys: catalog, encryption, connection checks            |
| `src/lib/*.server.ts`  | server code, never shipped to the browser bundle                    |
| `src/lib/db/`          | Drizzle schema and migrations                                       |
| `docs/`                | contributor guides                                                  |

**A convention to keep:** `*.functions.ts` files may contain only
`createServerFn`. A plain helper exported from there ends up in the browser
bundle and drags along everything it imports — including `node:crypto` and API
keys. Server code goes into `*.server.ts` files. The production build (OSS
config) enforces this and fails with an error.

## Tests

```bash
bun test
```

The suite targets places where a bug is **silent** — the code answers
"success" while data is lost or goes to the wrong place: webhook payload
parsing, consent handling, segment expiry, report queries, integration key
encryption. Tests that touch the database create their own in a temp directory
and never touch `local.db` or production. No test sends a message or calls a
real external service.

## Vite configuration

- `vite.config.oss.ts` — fully open, official plugins only. **The Dockerfile and
  CI use this one**, and it is what runs in production.
- `vite.config.ts` — development variant with the original environment's
  tooling.

## Language

The interface is available in **English** and **Polish**. Every user switches
the language in the account menu (or on the sign-in page); the choice is saved
on the account and follows the user to other devices. Dates and numbers follow
the same choice.

`PRM_LOCALE` in `.env` sets the installation default — the language of users
who have not chosen one yet and of work done without a user: the automation
engine, emails and pages for patients, the daily security report.

```bash
PRM_LOCALE=pl   # or en (default)
```

Code comments and the changelog are in Polish — the project started in
Poland. Documentation for contributors is in English. Issues and pull requests
are welcome in English or Polish.

## License and editions

PRM Core is owned and developed by **PRM CORE prosta spółka akcyjna** (Poland).

- **Community Edition** — this repository, under the [MIT license](./LICENSE).
  You may use, modify and sell it; keep the copyright notice.
- **PRM Core Enterprise** — the same product under a commercial license, with
  additions such as support and response times, a warranty, and help with
  deployment and integrations. Contact the owner through the repository
  profile.

The name and logo are covered by [TRADEMARKS.md](./TRADEMARKS.md).
Contributions are accepted under the [Contributor License Agreement](./CLA.md).

© 2026 PRM CORE prosta spółka akcyjna
