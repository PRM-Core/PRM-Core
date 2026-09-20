/**
 * A booking system used only by tests — the same shape a real provider has:
 * an address, a user, a password with meaningful edge spaces and an optional
 * flag. Registered from code, because unit tests run outside Vite and do not
 * see `./providers/`.
 */
import { registerCatalogExtension, type IntegrationDef } from "../credentials/catalog";

export const TEST_SYSTEM: IntegrationDef = {
  id: "testsys",
  name: "Test booking system",
  purpose: "Tests only.",
  fields: [
    { name: "TESTSYS_URL", label: "URL", help: "", secret: false, kind: "text", format: "url" },
    { name: "TESTSYS_USER", label: "User", help: "", secret: false, kind: "text" },
    {
      name: "TESTSYS_PASSWORD",
      label: "Password",
      help: "",
      secret: true,
      kind: "text",
      allowEdgeSpaces: true,
    },
    { name: "TESTSYS_INSECURE", label: "Insecure", help: "", secret: false, kind: "flag" },
  ],
  checkable: true,
  required: ["TESTSYS_URL", "TESTSYS_USER", "TESTSYS_PASSWORD"],
};

registerCatalogExtension({ integration: TEST_SYSTEM });
