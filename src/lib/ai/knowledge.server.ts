import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { knowledgeEntries } from "../db/schema";
import type { KnowledgeEntryRow } from "../db/schema";
import { t } from "@/lib/i18n";

// The clinic's own knowledge base — what the PRM_Agent is allowed to state as
// fact when it writes to a patient. Server-only (`randomUUID`); the RPC layer
// in knowledge.functions.ts wraps it.

/** Hard ceiling on what gets injected into a prompt, so a growing base can't quietly balloon the cost of every AI node. */
const MAX_CONTEXT_CHARS = 12000;

export async function listKnowledge(): Promise<KnowledgeEntryRow[]> {
  const db = getDb();
  return db.select().from(knowledgeEntries).orderBy(asc(knowledgeEntries.title));
}

export async function saveKnowledgeEntry(input: {
  id?: string;
  title: string;
  content: string;
}): Promise<void> {
  const db = getDb();
  const now = Date.now();

  if (input.id) {
    await db
      .update(knowledgeEntries)
      .set({ title: input.title, content: input.content, updatedAt: now })
      .where(eq(knowledgeEntries.id, input.id));
    return;
  }

  await db.insert(knowledgeEntries).values({
    id: randomUUID(),
    title: input.title,
    content: input.content,
    createdAt: now,
    updatedAt: now,
  });
}

export async function deleteKnowledgeEntry(id: string): Promise<void> {
  const db = getDb();
  await db.delete(knowledgeEntries).where(eq(knowledgeEntries.id, id));
}

/**
 * The knowledge base rendered for a prompt. Returns null when empty so the
 * caller can leave the section out entirely rather than injecting a heading
 * with nothing under it.
 */
export async function knowledgeForPrompt(): Promise<string | null> {
  const entries = await listKnowledge();
  if (entries.length === 0) return null;

  const parts: string[] = [];
  let used = 0;
  let skipped = 0;

  for (const entry of entries) {
    const block = `### ${entry.title}\n${entry.content}`;
    if (used + block.length > MAX_CONTEXT_CHARS) {
      skipped += 1;
      continue;
    }
    parts.push(block);
    used += block.length;
  }

  // Say so out loud rather than silently truncating — an agent answering from
  // a partial knowledge base should know its knowledge is partial.
  if (skipped > 0) {
    parts.push(
      t(
        "(Pominięto {skipped} wpisów — baza wiedzy przekracza limit kontekstu. Jeśli pytanie dotyczy czegoś, czego tu nie ma, powiedz o tym zamiast zgadywać.)",
        { skipped: skipped },
      ),
    );
  }

  return parts.join("\n\n");
}
