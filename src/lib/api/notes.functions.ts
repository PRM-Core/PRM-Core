import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contactNotes } from "../db/schema";
import { addNote, type NoteSource } from "../notes/notes.server";
import { formatActivityDate as formatDate } from "@/lib/activity-date";

export type { NoteSource };

export interface ContactNote {
  id: string;
  text: string;
  source: NoteSource;
  /** "YYYY-MM-DD HH:mm", same shape as the activity timeline uses. */
  date: string;
}

export const getNotesForContact = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ contactId: z.string() }))
  .handler(async ({ data }): Promise<ContactNote[]> => {
    const db = getDb();
    const rows = await db
      .select()
      .from(contactNotes)
      .where(eq(contactNotes.contactId, data.contactId))
      .orderBy(desc(contactNotes.createdAt));
    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      source: r.source as NoteSource,
      date: formatDate(r.createdAt),
    }));
  });

export const createNote = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ contactId: z.string(), text: z.string().min(1) }))
  .handler(async ({ data }) => {
    await addNote({ contactId: data.contactId, text: data.text, source: "manual" });
    return { ok: true };
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    await db.delete(contactNotes).where(eq(contactNotes.id, data.id));
    return { ok: true };
  });
