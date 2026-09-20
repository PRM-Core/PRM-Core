import { defineMcp } from "@lovable.dev/mcp-js";
import listContactsTool from "./tools/list-contacts";
import getContactTool from "./tools/get-contact";
import listAutomationsTool from "./tools/list-automations";
import { t } from "@/lib/i18n";

export default defineMcp({
  name: "prm-core-mcp",
  title: t("PRM Core"),
  version: "0.1.0",
  instructions:
    "Tools for PRM Core, a healthcare CRM. Use `list_contacts` to browse patients and leads, `get_contact` to fetch a single contact with their activity timeline, and `list_automations` to inspect care/marketing automations.",
  tools: [listContactsTool, getContactTool, listAutomationsTool],
});
