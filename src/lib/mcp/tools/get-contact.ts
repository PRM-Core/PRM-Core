import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { activities } from "@/lib/mock-data";
import { findContactByIdOrPrmId } from "@/lib/contacts.server";
import { toAssistantContact } from "@/lib/mcp/contact-view";
import { t } from "@/lib/i18n";

export default defineTool({
  name: "get_contact",
  title: t("Get contact"),
  description: t(
    "Get a single PRM Core contact by id or PRM ID, including their recent activity timeline.",
  ),
  inputSchema: {
    id: z.string().describe('Contact id (e.g. "1") or PRM ID (e.g. "PRM-00231").'),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }) => {
    const contact = await findContactByIdOrPrmId(id);
    if (!contact) {
      return {
        content: [{ type: "text", text: t("No contact found for id: {id}", { id: id }) }],
        isError: true,
      };
    }
    const timeline = activities.filter((a) => a.contactId === contact.id);
    const payload = { contact: toAssistantContact(contact), activities: timeline };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
