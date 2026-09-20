import { readMediaFile } from "../media/media.server";
import { MAX_ATTACHMENTS_BYTES, type EmailAttachment } from "./sendgrid.server";
import { t } from "@/lib/i18n";

/**
 * Zamiana identyfikatorów z biblioteki Media na załączniki gotowe do wysyłki.
 *
 * Bajty są doczytywane **dopiero tutaj**, przy wysyłce. Treść wiadomości trzyma
 * same identyfikatory, więc ten sam cennik dopięty do pięciu kampanii leży
 * w bazie raz, a wersje treści nie puchną o megabajty.
 */

export interface AttachmentsResult {
  attachments: EmailAttachment[];
  /** Łączna waga plików w bajtach, przed zakodowaniem. */
  totalBytes: number;
  /** Pliki, których nie udało się dołączyć — wraz z powodem. */
  problems: string[];
}

export async function collectAttachments(mediaIds: string[]): Promise<AttachmentsResult> {
  const attachments: EmailAttachment[] = [];
  const problems: string[] = [];
  let totalBytes = 0;

  for (const id of mediaIds) {
    const found = await readMediaFile(id);
    if (!found) {
      // Plik skasowany z biblioteki po dopięciu do wiadomości. Mówimy o tym
      // wprost — cicha wysyłka bez obiecanego załącznika jest gorsza niż błąd.
      problems.push(t("Plik {id} nie istnieje już w bibliotece Media.", { id: id }));
      continue;
    }
    if (totalBytes + found.bytes.length > MAX_ATTACHMENTS_BYTES) {
      problems.push(
        t('„{fileName}" nie zmieścił się — łączny limit załączników to 22 MB.', {
          fileName: found.row.fileName,
        }),
      );
      continue;
    }
    totalBytes += found.bytes.length;
    attachments.push({
      fileName: found.row.fileName,
      mimeType: found.row.mimeType,
      contentBase64: found.bytes.toString("base64"),
    });
  }

  return { attachments, totalBytes, problems };
}

/** Waga załączników bez ich czytania w całości — do pokazania w interfejsie. */
export async function attachmentsWeight(
  mediaIds: string[],
): Promise<{ bytes: number; missing: number }> {
  let bytes = 0;
  let missing = 0;
  for (const id of mediaIds) {
    const found = await readMediaFile(id);
    if (!found) missing++;
    else bytes += found.bytes.length;
  }
  return { bytes, missing };
}
