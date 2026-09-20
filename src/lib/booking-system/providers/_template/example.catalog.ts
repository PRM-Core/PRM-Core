/**
 * TEMPLATE — credential fields of the example provider, shown in
 * Integrations → Keys and credentials. `name` values are the keys in the
 * encrypted store and in `.env`; never rename them once released.
 */
import type { IntegrationDef } from "../../../credentials/catalog";

export const integration: IntegrationDef = {
  id: "example",
  name: "Example System",
  purpose: "Patients, visits and schedules from Example System.",
  fields: [
    {
      name: "EXAMPLE_API_URL",
      label: "API URL",
      help: "From the system's developer settings, e.g. https://api.example.test/v1.",
      secret: false,
      kind: "text",
      format: "url",
      placeholder: "https://…",
    },
    {
      name: "EXAMPLE_API_TOKEN",
      label: "API token",
      help: "A read-only token. Shown once in the system — paste it here.",
      secret: true,
      kind: "text",
    },
  ],
  checkable: true,
  required: ["EXAMPLE_API_URL", "EXAMPLE_API_TOKEN"],
};
