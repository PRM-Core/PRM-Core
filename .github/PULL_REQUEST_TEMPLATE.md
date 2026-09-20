## What and why / Co i po co

<!-- Link the issue: Closes #123 -->

## Checklist

- [ ] `bun test` passes, and new behaviour has tests (no network calls in tests)
- [ ] `bun run lint` and `bun run sprawdz:rozdzial` pass
- [ ] No real data: emails at `example.com`, phones `+48 000…`, PESEL with an invalid checksum, screenshots with demo data only
- [ ] No secrets in code, logs, URLs or browser responses — credentials via `getCredential()` (docs/INTEGRATIONS.md → C)
- [ ] Server code in `*.server.ts`; new server functions use `requireUser` / `allowReporter`
- [ ] Nothing pretends to work: no mock data behind real UI, `skipped` instead of `ok` when a step did not happen
- [ ] Database changes only through a new migration (`bunx drizzle-kit generate`), additive
- [ ] UI text in Polish wrapped in `t()`, with English added in `src/lib/i18n/en` (`bun run i18n:check --strict`)
- [ ] I agree to the [Contributor License Agreement](../CLA.md)
