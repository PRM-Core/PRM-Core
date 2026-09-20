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

## Supported versions

Security fixes go into the latest released version. Version and changes:
[`package.json`](package.json), [CHANGELOG.md](CHANGELOG.md).

---

## 🇵🇱 Po polsku

Podatności zgłaszaj **poufnie**: zakładka _Security_ → _Report a vulnerability_.
Nie zakładaj publicznego zgłoszenia ani pull requesta z opisem podatności, dopóki
poprawka nie zostanie wydana. Podaj wersję, kroki do odtworzenia, skutek i to,
czy potrzebne jest zalogowanie. **Nie dołączaj prawdziwych danych pacjentów.**
