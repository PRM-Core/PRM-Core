# Provider template

A complete, tested provider for a fictional REST API. To connect a real
system:

1. Copy `example.server.ts`, `example.catalog.ts` (and `example.en.ts`,
   `example.test.ts` if you need them) to `providers/`, renaming `example` to
   the system's name — e.g. `acme.server.ts`.
2. Replace the endpoints, the field mapping and the status table.
3. `bun test`, then open Integrations → Keys and credentials: your system is
   there with its fields and "Test connection".

Files inside `_template/` are never loaded — only `providers/*.server.ts`,
`*.catalog.ts` and `*.en.ts` one level up are. See `../README.md` for the
contract.
