import { randomUUID } from "node:crypto";
import { desc, lt, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { getDb } from "../db/client.server";

/**
 * The demo outbox — what would have been sent, had this not been a demo.
 *
 * **Not in `schema.ts`, and without a migration, on purpose.** The table
 * exists only on a demo installation: every clinic's database would otherwise
 * carry an empty table that nothing writes to. It is created on first use with
 * `CREATE TABLE IF NOT EXISTS`, and the nightly reset empties it with the rest.
 */
export const demoOutbox = sqliteTable("demo_outbox", {
  id: text("id").primaryKey(),
  /** "email" | "sms" | "webhook" */
  channel: text("channel").notNull(),
  to: text("to_address").notNull(),
  from: text("from_address").notNull().default(""),
  subject: text("subject").notNull().default(""),
  /** E-mail: the HTML as it would have gone out (tracking included). SMS: the text. Webhook: the JSON body. */
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
});

export type DemoOutboxRow = typeof demoOutbox.$inferSelect;

/** Kept rows — older ones are dropped, so a demo running for months stays small. */
const KEEP = 1000;

let ensuredFor = "";

export async function ensureDemoOutbox(): Promise<void> {
  const url = process.env.DATABASE_URL || "file:./local.db";
  if (ensuredFor === url) return;
  await getDb().run(sql`CREATE TABLE IF NOT EXISTS demo_outbox (
    id text PRIMARY KEY NOT NULL,
    channel text NOT NULL,
    to_address text NOT NULL,
    from_address text DEFAULT '' NOT NULL,
    subject text DEFAULT '' NOT NULL,
    body text NOT NULL,
    created_at integer NOT NULL
  )`);
  await getDb().run(
    sql`CREATE INDEX IF NOT EXISTS idx_demo_outbox_created ON demo_outbox (created_at)`,
  );
  ensuredFor = url;
}

export async function recordDemoSend(input: {
  channel: "email" | "sms" | "webhook";
  to: string;
  from?: string;
  subject?: string;
  body: string;
  now?: number;
}): Promise<void> {
  await ensureDemoOutbox();
  const db = getDb();
  const at = input.now ?? Date.now();
  await db.insert(demoOutbox).values({
    id: randomUUID(),
    channel: input.channel,
    to: input.to,
    from: input.from ?? "",
    subject: input.subject ?? "",
    body: input.body,
    createdAt: at,
  });
  // Trim now and then, not on every insert.
  if (Math.random() < 0.05) {
    const cutoff = await db
      .select({ at: demoOutbox.createdAt })
      .from(demoOutbox)
      .orderBy(desc(demoOutbox.createdAt))
      .limit(1)
      .offset(KEEP)
      .get();
    if (cutoff) await db.delete(demoOutbox).where(lt(demoOutbox.createdAt, cutoff.at));
  }
}

export async function listDemoOutbox(limit = 100): Promise<DemoOutboxRow[]> {
  await ensureDemoOutbox();
  return getDb().select().from(demoOutbox).orderBy(desc(demoOutbox.createdAt)).limit(limit);
}

/**
 * An e-mail as it may be shown in the preview: the tracking pixel removed,
 * tracked links pointing straight at their target, the unsubscribe link dead.
 *
 * Shown as recorded, the preview itself would count: loading the pixel is an
 * open, a click through `/e/click/` is a click, and the unsubscribe link would
 * really unsubscribe the (synthetic) patient — a visitor looking at a message
 * would be changing the demo's statistics.
 */
export function previewSafeHtml(html: string): string {
  return html
    .replace(/<img\b[^>]*\/e\/open\/[^>]*>/gi, "")
    .replace(/href="[^"]*\/e\/click\/[^"?]+\?u=([^"&]+)[^"]*"/gi, (_m, u: string) => {
      let target = "#";
      try {
        const decoded = decodeURIComponent(u);
        if (/^https?:\/\//i.test(decoded)) target = decoded;
      } catch {
        // malformed — leave the link dead
      }
      return `href="${target.replace(/"/g, "&quot;")}"`;
    })
    .replace(/href="[^"]*\/unsubscribe\/[^"]*"/gi, 'href="#"');
}
