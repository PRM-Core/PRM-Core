import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getDb } from "@/lib/db/client.server";
import { contacts } from "@/lib/db/schema";
import { ensureSeeded } from "@/lib/contacts.server";
import { toAssistantContact } from "@/lib/mcp/contact-view";
import { t } from "@/lib/i18n";

export default defineTool({
  name: "list_contacts",
  title: t("List contacts"),
  description: t(
    "List PRM Core contacts (patients and leads). Optionally filter by status or free-text search across name, email, phone, and PRM ID.",
  ),
  inputSchema: {
    status: z
      .enum(["active", "lead", "patient", "inactive"])
      .optional()
      .describe("Filter contacts by status."),
    search: z.string().optional().describe("Free-text search."),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, search, limit }) => {
    await ensureSeeded();
    const db = getDb();
    const all = await db.select().from(contacts);
    const q = search?.toLowerCase().trim();
    const rows = all
      .filter((c) => (status ? c.status === status : true))
      .filter((c) =>
        !q
          ? true
          : [c.firstName, c.lastName, c.email, c.phone, c.prmId]
              .join(" ")
              .toLowerCase()
              .includes(q),
      )
      .slice(0, limit)
      .map(toAssistantContact);
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { contacts: rows, total: rows.length },
    };
  },
});
