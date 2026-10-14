import { randomUUID } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { knowledgeEntries, knowledgeGaps } from "../db/schema";
import type { KnowledgeEntryRow, KnowledgeGapRow } from "../db/schema";
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

/** Every entry in full, for checking a model's facts — not truncated like the prompt. */
export async function knowledgeSources(): Promise<string[]> {
  return (await listKnowledge()).map((e) => `### ${e.title}\n${e.content}`);
}

// ── questions the base could not answer ─────────────────────────────────────

/** Record a question the model could not answer from the base; a repeat bumps the count. */
export async function recordGap(input: {
  question: string;
  source: "inbox" | "agent";
  threadId?: string | null;
  now?: number;
}): Promise<void> {
  const { gapKey } = await import("../agent/grounding");
  const question = input.question.trim().slice(0, 300);
  const key = gapKey(question);
  if (!key) return;
  const now = input.now ?? Date.now();
  const db = getDb();
  const existing = await db.select().from(knowledgeGaps).where(eq(knowledgeGaps.key, key)).get();
  if (existing) {
    await db
      .update(knowledgeGaps)
      .set({
        count: existing.count + 1,
        lastAt: now,
        // Answered once, asked again: the entry did not cover it after all.
        status: existing.status === "dismissed" ? "dismissed" : "open",
      })
      .where(eq(knowledgeGaps.id, existing.id));
    return;
  }
  await db.insert(knowledgeGaps).values({
    id: randomUUID(),
    key,
    question,
    source: input.source,
    threadId: input.threadId ?? null,
    count: 1,
    status: "open",
    firstAt: now,
    lastAt: now,
  });
}

export async function listOpenGaps(): Promise<KnowledgeGapRow[]> {
  return getDb()
    .select()
    .from(knowledgeGaps)
    .where(eq(knowledgeGaps.status, "open"))
    .orderBy(desc(knowledgeGaps.count), desc(knowledgeGaps.lastAt))
    .limit(100);
}

export async function setGapStatus(id: string, status: "resolved" | "dismissed"): Promise<void> {
  await getDb().update(knowledgeGaps).set({ status }).where(eq(knowledgeGaps.id, id));
}
