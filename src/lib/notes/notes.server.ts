import { randomUUID } from "node:crypto";
import { getDb } from "../db/client.server";
import { contactNotes } from "../db/schema";

/**
 * Skąd wzięła się notatka. `import` doszedł razem z kolumnami „Notatka…"
 * w imporcie CSV — bez niego notatka z arkusza podpisywała się „Formularz",
 * czyli mówiła nieprawdę o swoim pochodzeniu.
 */
export type NoteSource = "manual" | "survey" | "form" | "import";

/**
 * Server-only (`.server.ts` — kept out of the client bundle, unlike
 * `notes.functions.ts` which is a normal shared module and would drag
 * `node:crypto` into the browser). Called directly by the survey/form
 * collectors as well as through the RPC wrapper.
 */
export async function addNote(input: {
  contactId: string;
  text: string;
  source: NoteSource;
}): Promise<void> {
  const db = getDb();
  await db.insert(contactNotes).values({
    id: randomUUID(),
    contactId: input.contactId,
    text: input.text,
    source: input.source,
    createdAt: Date.now(),
  });
}
