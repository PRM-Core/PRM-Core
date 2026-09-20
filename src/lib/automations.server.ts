import { getDb } from "./db/client.server";
import { automations } from "./db/schema";
import { createInitialRecords } from "./automation-records";
import { shouldSeedDemoData } from "./db/demo-seed.server";

/**
 * Plain (non-RPC) automation helpers, called straight from server-only code —
 * today the `list_automations` MCP tool, which queries the table directly
 * rather than going through the RPC layer meant for the browser.
 *
 * It lives here and not in `automation.functions.ts` for the reason written up
 * in contacts.server.ts: TanStack Start strips `createServerFn` handler bodies
 * from the client bundle, but **a plain exported function survives**, dragging
 * every module it imports into the browser with it. The build's import
 * protection refuses that outright, which is how this one was found.
 */

/** Seeds the starter automations on first touch. Safe to call repeatedly. */
export async function ensureSeeded() {
  if (!shouldSeedDemoData()) return;
  const db = getDb();
  const existing = await db.select().from(automations).limit(1);
  if (existing.length > 0) return;
  const now = new Date().toISOString();
  for (const r of createInitialRecords()) {
    await db.insert(automations).values({
      id: r.id,
      name: r.name,
      status: r.status,
      flow: r.flow,
      updatedAt: now,
    });
  }
}
