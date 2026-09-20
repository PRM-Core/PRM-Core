import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contactDocuments, type ContactDocumentRow } from "../db/schema";
import { formatActivityDate } from "../activity-date";
import { t } from "@/lib/i18n";

/**
 * Dokumenty pacjenta na dysku.
 *
 * Katalog leży OBOK bazy, na tym samym wolumenie hosta — dzięki temu obejmuje
 * go ta sama kopia zapasowa i tak samo przeżywa wydanie. Plik zapisany do
 * katalogu w obrazie kontenera zniknąłby przy najbliższym `deploy.sh`, a przy
 * dokumentacji medycznej to nie jest niedogodność, tylko utrata dowodu.
 */
function documentsDir(): string {
  const url = process.env.DATABASE_URL || "file:./data/prm-core.db";
  return path.join(path.dirname(url.replace(/^file:/, "")), "documents");
}

/**
 * Czego NIE przyjmujemy.
 *
 * Lista dozwolonych, nie zakazanych: zakazane trzeba by aktualizować po każdym
 * nowym pomyśle na rozszerzenie, dozwolone same zamykają resztę. Plik trafia na
 * wolumen serwera i jest potem oddawany przeglądarce — wpuszczenie tu HTML-a
 * albo SVG (który potrafi wykonać skrypt) oznaczałoby cudzy kod serwowany
 * z naszej domeny.
 */
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

/** 20 MB — wynik badania w PDF-ie mieści się z zapasem, a film z telefonu nie zapcha wolumenu. */
const MAX_BYTES = 20 * 1024 * 1024;

export interface DocumentView {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sizeLabel: string;
  note: string;
  uploadedBy: string;
  uploadedAt: string;
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toView(row: ContactDocumentRow): DocumentView {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sizeLabel: sizeLabel(row.sizeBytes),
    note: row.note,
    uploadedBy: row.uploadedBy,
    uploadedAt: formatActivityDate(row.uploadedAt),
  };
}

export async function listDocuments(contactId: string): Promise<DocumentView[]> {
  const rows = await getDb()
    .select()
    .from(contactDocuments)
    .where(eq(contactDocuments.contactId, contactId))
    .orderBy(desc(contactDocuments.uploadedAt));
  return rows.map(toView);
}

export interface UploadInput {
  contactId: string;
  fileName: string;
  mimeType: string;
  /** Zawartość zakodowana base64 — tak przechodzi przez warstwę RPC. */
  contentBase64: string;
  note: string;
  uploadedBy: string;
}

export async function uploadDocument(
  input: UploadInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const bytes = Buffer.from(input.contentBase64, "base64");
  if (bytes.length === 0) return { ok: false, error: t("Plik jest pusty.") };
  if (bytes.length > MAX_BYTES) {
    return {
      ok: false,
      error: t("Plik jest za duży (limit {v0} MB).", { v0: MAX_BYTES / 1024 / 1024 }),
    };
  }
  if (!ALLOWED_MIME.has(input.mimeType)) {
    return {
      ok: false,
      error: t(
        "Ten typ pliku nie jest przyjmowany ({v0}). Dozwolone: PDF, zdjęcia, dokumenty Office, CSV i pliki tekstowe.",
        { v0: input.mimeType || "nieznany" },
      ),
    };
  }

  const dir = documentsDir();
  await mkdir(dir, { recursive: true });

  // Nazwa na dysku jest losowa: nazwa od użytkownika nigdy nie dotyka ścieżki,
  // więc nie da się nią wyjść poza katalog ani nadpisać cudzego pliku.
  const id = randomUUID();
  const storedName = `${id}${path.extname(input.fileName).slice(0, 10)}`;
  await writeFile(path.join(dir, storedName), bytes);

  await getDb()
    .insert(contactDocuments)
    .values({
      id,
      contactId: input.contactId,
      fileName: input.fileName.slice(0, 200),
      storedName,
      mimeType: input.mimeType,
      sizeBytes: bytes.length,
      note: input.note.slice(0, 500),
      uploadedBy: input.uploadedBy,
      uploadedAt: Date.now(),
    });

  return { ok: true, id };
}

/** Plik do pobrania. Zwraca null, gdy wiersza nie ma albo plik zniknął z dysku. */
export async function readDocument(
  id: string,
): Promise<{ row: ContactDocumentRow; bytes: Buffer } | null> {
  const row = await getDb()
    .select()
    .from(contactDocuments)
    .where(eq(contactDocuments.id, id))
    .get();
  if (!row) return null;
  try {
    const full = path.join(documentsDir(), row.storedName);
    await stat(full);
    return { row, bytes: await readFile(full) };
  } catch {
    return null;
  }
}

export async function deleteDocument(id: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const row = await db.select().from(contactDocuments).where(eq(contactDocuments.id, id)).get();
  if (!row) return { ok: false, error: t("Dokument nie istnieje.") };

  // Wiersz znika po pliku: gdyby kasowanie pliku padło, dokument zostaje
  // widoczny i można spróbować ponownie. Odwrotna kolejność zostawiłaby plik
  // na dysku bez śladu w bazie — czyli dane pacjenta, o których nikt nie wie.
  try {
    await rm(path.join(documentsDir(), row.storedName), { force: true });
  } catch {
    return { ok: false, error: t("Nie udało się usunąć pliku z dysku.") };
  }
  await db.delete(contactDocuments).where(eq(contactDocuments.id, id));
  return { ok: true };
}

export { MAX_BYTES, ALLOWED_MIME };
