import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import {
  listKnowledge,
  saveKnowledgeEntry,
  deleteKnowledgeEntry,
  listOpenGaps,
  setGapStatus,
} from "../ai/knowledge.server";

// RPC for the knowledge base editor in Ustawienia → PRM_Agent. Only
// createServerFn here — the plain helpers live in knowledge.server.ts.

export interface KnowledgeEntryView {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

export const getKnowledge = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<KnowledgeEntryView[]> => {
    const rows = await listKnowledge();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      updatedAt: r.updatedAt,
    }));
  });

export const saveKnowledge = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      id: z.string().optional(),
      title: z.string().min(1).max(200),
      content: z.string().min(1).max(20000),
      /** The open question this entry answers, if it was written from one. */
      gapId: z.string().max(80).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { gapId, ...entry } = data;
    await saveKnowledgeEntry(entry);
    if (gapId) await setGapStatus(gapId, "resolved");
    return { ok: true };
  });

export const deleteKnowledge = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await deleteKnowledgeEntry(data.id);
    return { ok: true };
  });

export interface KnowledgeGapView {
  id: string;
  question: string;
  source: string;
  count: number;
  lastAt: number;
}

/** Questions patients asked that the base could not answer — newest and most asked first. */
export const getKnowledgeGaps = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<KnowledgeGapView[]> => {
    return (await listOpenGaps()).map((g) => ({
      id: g.id,
      question: g.question,
      source: g.source,
      count: g.count,
      lastAt: g.lastAt,
    }));
  });

export const dismissKnowledgeGap = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string().max(80) }))
  .handler(async ({ data }) => {
    await setGapStatus(data.id, "dismissed");
    return { ok: true };
  });
