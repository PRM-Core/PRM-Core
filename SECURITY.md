# Security policy

PRM Core processes patient data: contacts, visits, consents and, in some
installations, national ID numbers (PESEL) and documents. A security bug in this
project is potentially a leak of medical data, so please report it
**privately**, not in a public issue.

## How to report a vulnerability

Use GitHub's **private vulnerability reporting**: _Security_ tab → _Report a
vulnerability_. Only the maintainers can see the report.

**Do not** open a public issue or pull request describing the vulnerability
until a fix is released.

Helpful details:

- version (bottom of _Settings_, or `/health`),
- steps to reproduce,
- impact — read, modify, authentication bypass, privilege escalation (e.g. a
  read-only account making changes),
- whether it requires being logged in.

**Do not include real patient data.** Use fictional data to reproduce.

## Scope

- The application in this repository: server functions, API routes, webhooks,
  authentication and roles, the automation engine, reports, integration
  credentials storage.
- The default configuration in `Dockerfile`, `docker-compose.yml` and
  `Caddyfile.example`.

Out of scope: the configuration of a specific installation (server, `.env`,
firewall rules), third-party services (SendGrid, Twilio, Meta, booking systems)
and attacks requiring physical access to the server.

## What happens after you report

- **Within 3 working days**: we confirm we have the report.
- **Within 10 working days**: our assessment — whether it is a vulnerability,
  how severe, and the plan.
- **The fix**: critical and high — a release as soon as a fix is ready, aimed
  at 14 days from the assessment; medium and low — in a regular release. We
  tell you before the release and credit you in the release notes unless you
  prefer not.
- After the release, the advisory is published on GitHub, and installations
  learn about it through the update notice.

Dependencies are checked on every change: `bun audit` in CI fails on high and
critical advisories, pull requests go through GitHub's dependency review, and
Dependabot opens weekly updates.

## Supported versions

Security fixes go into the latest released version. Version and changes:
[`package.json`](package.json), [CHANGELOG.md](CHANGELOG.md).

---

## 🇵🇱 Po polsku

Podatności zgłaszaj **poufnie**: zakładka _Security_ → _Report a vulnerability_.
Nie zakładaj publicznego zgłoszenia ani pull requesta z opisem podatności, dopóki
poprawka nie zostanie wydana. Podaj wersję, kroki do odtworzenia, skutek i to,
czy potrzebne jest zalogowanie. **Nie dołączaj prawdziwych danych pacjentów.**

Potwierdzamy otrzymanie zgłoszenia w ciągu **3 dni roboczych**, ocenę i plan
podajemy w ciągu **10 dni roboczych**. Poprawki krytyczne i wysokie wydajemy,
gdy tylko są gotowe — celem jest 14 dni od oceny; średnie i niskie trafiają do
zwykłego wydania. Zależności sprawdza CI (`bun audit`, przegląd zależności
w pull requestach) i Dependabot.
