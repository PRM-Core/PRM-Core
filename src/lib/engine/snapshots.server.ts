import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contentSnapshots } from "../db/schema";
import type { ContentSnapshotRow } from "../db/schema";
import type { BuilderKind, PopupConfig } from "../content-builder";

// Templates are authored in the browser and stored in localStorage, so the
// server cannot read them. When an automation is activated the UI renders
// every template its nodes reference and pushes it here — the same
// snapshot-at-publish approach popups already use.
//
// The stored HTML deliberately keeps merge-tag chips UNRESOLVED: one snapshot
// then serves every recipient, with personalization resolved per contact at
// send time (resolveMergeTagsInHtml / resolvePersonalizationInText).

export function snapshotId(kind: BuilderKind, name: string): string {
  return `${kind}:${name.trim().toLowerCase()}`;
}

export async function saveSnapshot(input: {
  kind: BuilderKind;
  name: string;
  contentItemId: string;
  subject?: string;
  html?: string;
  smsBody?: string;
  /** Popups only — the engine needs the display settings, not just the markup. */
  config?: PopupConfig | null;
  /** E-maile — identyfikatory plików Media doklejanych do wysyłki. */
  attachments?: string[] | null;
  /** Nazwa nadawcy wybrana w edytorze wiadomości. */
  senderId?: string;
}): Promise<void> {
  const db = getDb();
  const id = snapshotId(input.kind, input.name);
  const row = {
    id,
    kind: input.kind,
    name: input.name,
    contentItemId: input.contentItemId,
    subject: input.subject ?? "",
    html: input.html ?? "",
    smsBody: input.smsBody ?? "",
    config: input.config ?? null,
    attachments: input.attachments ?? null,
    senderId: input.senderId ?? "",
    updatedAt: new Date().toISOString(),
  };

  const existing = await db
    .select()
    .from(contentSnapshots)
    .where(eq(contentSnapshots.id, id))
    .get();
  if (existing) {
    await db.update(contentSnapshots).set(row).where(eq(contentSnapshots.id, id));
  } else {
    await db.insert(contentSnapshots).values(row);
  }
}

/** Looks a template up by the name stored in a node's config. Null means "never published". */
export async function getSnapshot(
  kind: BuilderKind,
  name: string,
): Promise<ContentSnapshotRow | null> {
  if (!name.trim()) return null;
  const db = getDb();
  const row = await db
    .select()
    .from(contentSnapshots)
    .where(eq(contentSnapshots.id, snapshotId(kind, name)))
    .get();
  return row ?? null;
}

export async function listSnapshots(): Promise<ContentSnapshotRow[]> {
  const db = getDb();
  return db.select().from(contentSnapshots);
}
