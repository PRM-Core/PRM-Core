import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { listKnowledge, saveKnowledgeEntry, deleteKnowledgeEntry } from "../ai/knowledge.server";

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
    }),
  )
  .handler(async ({ data }) => {
    await saveKnowledgeEntry(data);
    return { ok: true };
  });

export const deleteKnowledge = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await deleteKnowledgeEntry(data.id);
    return { ok: true };
  });
