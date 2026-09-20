import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { mediaFiles, type MediaFileRow } from "../db/schema";

/**
 * Pliki biblioteki Media — bajty na dysku, metadane w bazie.
 *
 * Ten sam wzorzec co dokumenty pacjentów (`documents.server.ts`): katalog obok
 * pliku bazy, więc kopia zapasowa katalogu `data` zabiera oba naraz. Osobny
 * katalog `media`, bo dokumenty są prywatne, a te pliki **publiczne** —
 * mieszanie ich w jednym katalogu prosiłoby się o pomyłkę w serwowaniu.
 */

export { MEDIA_FOLDERS, MEDIA_FOLDER_LABELS, type MediaFolder } from "./media-shared";
import type { MediaFolder } from "./media-shared";
import { t } from "@/lib/i18n";

/**
 * Grafiki osadzane w treści.
 *
 * Tylko formaty, które klienty pocztowe naprawdę wyświetlają. SVG celowo poza
 * listą — Gmail i Outlook go nie renderują, a jako XML z obcego źródła bywa
 * wektorem ataku; grafik i tak eksportuje do PNG/JPG.
 */
const ALLOWED_IMAGE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/**
 * Dokumenty **do załączania**, nie do osadzania w treści.
 *
 * Biblioteka przyjmowała wyłącznie obrazy, więc PDF-a nie dało się do niej
 * wgrać — a załączniki wybiera się właśnie z niej. Wyglądało to
 * jak „dodawanie załącznika nie działa": okno wyboru było puste i nie miało prawa
 * być inne, bo pliku nie było jak tam umieścić.
 *
 * Lista jest wąska świadomie. To, co placówka naprawdę wysyła pacjentowi, to
 * PDF (plan leczenia, cennik, zalecenia); reszta jest tu, bo bywa wynikiem
 * eksportu z gabinetu, a odsyłanie kogoś do konwersji na PDF przy zaleceniach
 * na jutro jest gorsze niż przyjęcie pliku.
 */
const ALLOWED_DOC: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/plain": ".txt",
};

const ALLOWED_MIME: Record<string, string> = { ...ALLOWED_IMAGE, ...ALLOWED_DOC };

/** Czy ten plik nadaje się do osadzenia w treści (obraz), czy tylko do załączenia. */
export function isImageMime(mimeType: string): boolean {
  return mimeType in ALLOWED_IMAGE;
}

/**
 * 8 MB dla grafik, 20 MB dla dokumentów.
 *
 * Grafika: hero e-maila waży setki kilobajtów, większy plik to znak, że poszedł
 * oryginał z Photoshopa. Dokument: 20 MB to ten sam sufit, którego pilnuje
 * wysyłka — plik, którego i tak nie da się wysłać, nie ma po co zajmować dysku.
 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_DOC_BYTES = 20 * 1024 * 1024;

function mediaDir(): string {
  const url = process.env.DATABASE_URL ?? "file:./local.db";
  return path.join(path.dirname(url.replace(/^file:/, "")), "media");
}

export interface SavedMedia {
  id: string;
  /** Publiczna ścieżka względna — pełny adres skleja się z `getBaseUrl()`. */
  publicPath: string;
}

export async function saveMediaFile(input: {
  fileName: string;
  mimeType: string;
  folder: MediaFolder;
  bytesBase64: string;
}): Promise<SavedMedia> {
  const ext = ALLOWED_MIME[input.mimeType];
  if (!ext) {
    throw new Error(
      t(
        "Nieobsługiwany format: {mimeType}. Grafiki: PNG, JPG, GIF, WebP. Dokumenty: PDF, DOC(X), XLS(X), TXT.",
        { mimeType: input.mimeType },
      ),
    );
  }
  const isImage = isImageMime(input.mimeType);
  const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
  const bytes = Buffer.from(input.bytesBase64, "base64");
  if (bytes.length === 0) throw new Error(t("Pusty plik."));
  if (bytes.length > maxBytes) {
    throw new Error(
      isImage
        ? t(
            "Grafika ma {v0} MB — limit to 8 MB. Do e-maila i tak potrzebna jest wersja zoptymalizowana.",
            { v0: (bytes.length / 1024 / 1024).toFixed(1) },
          )
        : t("Dokument ma {v0} MB — limit to 20 MB, bo tyle wynosi sufit załączników w wysyłce.", {
            v0: (bytes.length / 1024 / 1024).toFixed(1),
          }),
    );
  }

  const id = randomUUID();
  const storedName = `${id}${ext}`;
  const dir = mediaDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, storedName), bytes);

  await getDb()
    .insert(mediaFiles)
    .values({
      id,
      folder: input.folder,
      fileName: input.fileName || `grafika${ext}`,
      storedName,
      mimeType: input.mimeType,
      sizeBytes: bytes.length,
      createdAt: Date.now(),
    });

  return { id, publicPath: `/media-file/${id}` };
}

export async function listMediaFiles(folder?: MediaFolder): Promise<MediaFileRow[]> {
  const db = getDb();
  if (folder) {
    return db
      .select()
      .from(mediaFiles)
      .where(eq(mediaFiles.folder, folder))
      .orderBy(desc(mediaFiles.createdAt));
  }
  return db.select().from(mediaFiles).orderBy(desc(mediaFiles.createdAt));
}

export async function readMediaFile(
  id: string,
): Promise<{ row: MediaFileRow; bytes: Buffer } | null> {
  const row = await getDb().select().from(mediaFiles).where(eq(mediaFiles.id, id)).get();
  if (!row) return null;
  try {
    const bytes = await readFile(path.join(mediaDir(), row.storedName));
    return { row, bytes };
  } catch {
    // Wiersz jest, pliku nie ma — skasowany ręcznie na dysku. Zachowujemy się
    // jak przy braku wiersza; wysłany e-mail pokaże wtedy tekst alternatywny.
    return null;
  }
}

export async function deleteMediaFile(id: string): Promise<boolean> {
  const db = getDb();
  const row = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).get();
  if (!row) return false;
  // Najpierw plik, potem wiersz — osierocony wiersz jest widoczny (i naprawialny),
  // osierocony plik na dysku jest niewidzialny na zawsze.
  await rm(path.join(mediaDir(), row.storedName), { force: true });
  await db.delete(mediaFiles).where(eq(mediaFiles.id, id));
  return true;
}
