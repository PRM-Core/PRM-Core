# Contributing to PRM Core

Thank you for helping! PRM Core is used by medical clinics, so a few rules
below matter more than in a typical project — especially around patient data.

> **🇵🇱 Po polsku.** Zgłoszenia i pull requesty po polsku są mile widziane.
> Najważniejsze zasady: żadnych prawdziwych danych w repozytorium (e-maile
> `example.com`, telefony `+48 000…`, PESEL z błędną sumą kontrolną), klucze
> wyłącznie przez `getCredential()`, testy bez połączeń z prawdziwymi usługami.
> Integracje: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

## Where to start

- **Medical system connectors — the most wanted contribution.** Connect a
  practice management, booking or EHR system (or FHIR R4) by copying the tested
  template in `src/lib/booking-system/providers/_template/`. Open an issue with
  the _Medical system connector_ form first.
- **Integrations** — [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) explains every
  path, from a no-code webhook recipe to a new automation action.
- Issues labelled `good first issue`, `automation` and `integration`.
- [docs/ROADMAP.md](docs/ROADMAP.md) — what is planned for the engine and for
  PRM_Agent, with the open items marked.
- A recipe in `docs/recipes/` for a system you already connected — no code
  needed and very useful to other clinics.

For anything bigger than a small fix, **open an issue first** so we can agree on
the approach before you invest time.

## Development

```bash
bun install
cp .env.example .env
bun run db:migrate
bun run db:seed
bun run dev            # http://localhost:8080 — demo data included
```

Before opening a pull request:

```bash
bun test && bun run lint && bun run sprawdz:rozdzial
```

Workflow: fork → branch (`feat/smsapi-integration`) → pull request to `main`.
CI runs the boundary check, tests and the production build.

## Code style

- TypeScript strict mode, functional components and hooks.
- Tailwind through the semantic tokens in `src/styles.css` (no hard-coded
  colours); shadcn/ui for new components.
- Server code in `*.server.ts`; `*.functions.ts` contains only `createServerFn`.
  Every server function is a public HTTP endpoint — protect it with
  `requireUser` (or `allowReporter` for read-only) and check roles on the server.
- Database changes only through a new, additive migration
  (`bunx drizzle-kit generate`). Never `drizzle-kit push`.
- Every UI text goes through `t()` from `@/lib/i18n` — screens, toasts, emails,
  error messages shown to users, AI prompts. Keys are the Polish texts; the
  English version lives in `src/lib/i18n/en`. If you do not speak Polish, use
  the English text as the key, add the same text as its English entry, and say
  so in the pull request — a maintainer will provide the Polish key.
  `bun run i18n:check` lists texts without an English entry; CI runs it too.
- Do not translate values the code stores or compares (automation option values,
  consent sources, CSV header aliases, log markers). Translate them where they
  are displayed, e.g. `t(option)` in the label only.
- Comments explain **why**, especially when the obvious approach was tried and
  failed. Polish or English are both fine.

## The project's rule: nothing pretends to work

No mock data behind a real-looking screen, no "Connected" badge without a
connection, no success message for something that did not happen. If a feature
cannot work yet, disable it and say why. Pull requests that fake behaviour will
be asked to change.

## Data in the repository

This is software for medical clinics — **no real data may enter the
repository**: not in code, tests, fixtures, commit messages or screenshots.

- example emails at `example.com` / `przyklad.pl`,
- example PESEL numbers with an **invalid checksum**,
- example phone numbers starting with `+48 000`,
- screenshots with demo data only.

CI runs `bun run sprawdz:rozdzial`, which blocks API keys and valid PESEL
numbers, including in the git history of your branch.

Tests must never call real external services or send messages — inject
dependencies and mock `fetch` (see `src/lib/credentials/checks.server.test.ts`).

## Reporting bugs

Use GitHub Issues (templates provided). **Security vulnerabilities must be
reported privately** — see [SECURITY.md](./SECURITY.md).

## License

Contributions are published under the [MIT license](./LICENSE) and accepted
under the [Contributor License Agreement](./CLA.md): you keep your copyright
and grant the owner the right to include your work in PRM Core Enterprise as
well. Opening a pull request means you agree to it.
