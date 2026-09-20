import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getDb } from "@/lib/db/client.server";
import { automations, automationRuns } from "@/lib/db/schema";
import { ensureSeeded } from "@/lib/automations.server";
import { triggerLabel } from "@/lib/automation-catalog";
import { t } from "@/lib/i18n";

export default defineTool({
  name: "list_automations",
  title: t("List automations"),
  description: t(
    "List PRM Core marketing/care automations with status, trigger, and how many contacts have entered them.",
  ),
  inputSchema: {
    status: z.enum(["active", "inactive"]).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status }) => {
    await ensureSeeded();
    const db = getDb();
    const [all, runs] = await Promise.all([
      db.select().from(automations),
      db.select({ automationId: automationRuns.automationId }).from(automationRuns),
    ]);

    // Counted from real engine runs — the `users` column this used to report
    // was a seed-time placeholder and has been dropped from the schema.
    const contactsEntered: Record<string, number> = {};
    for (const run of runs) {
      contactsEntered[run.automationId] = (contactsEntered[run.automationId] ?? 0) + 1;
    }

    const rows = all
      .filter((a) => (status ? a.status === status : true))
      .map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        trigger: triggerLabel(a.flow),
        contactsEntered: contactsEntered[a.id] ?? 0,
      }));
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { automations: rows },
    };
  },
});
