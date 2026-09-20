import { useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getMediaFiles } from "@/lib/api/media.functions";
import { parseAttachmentFiles, serializeAttachmentFiles } from "@/lib/content-builder-html";
import type { MediaFileRow } from "@/lib/db/schema";
import { t } from "@/lib/i18n";

/**
 * Wybór plików do bloku „Załączniki".
 *
 * **Nazwa i rozmiar są kopiowane w chwili wyboru**, nie doczytywane przy
 * renderowaniu. Powód: gdyby ktoś skasował plik z biblioteki, wiadomość ma
 * nadal pokazywać, czego brakuje, zamiast cichego pustego wiersza — a przy
 * wysyłce do tysiąca osób nie ma mowy o odpytywaniu bazy o każdą pozycję.
 *
 * Lista pokazuje **dokumenty przed grafikami**: blok służy do wysyłania PDF-ów,
 * a nie do osadzania zdjęć — od tego jest blok Obraz.
 */
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentBlockPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (fileIds: string) => void;
}) {
  const [files, setFiles] = useState<MediaFileRow[] | null>(null);
  const picked = parseAttachmentFiles(value);

  useEffect(() => {
    getMediaFiles({ data: {} })
      .then(setFiles)
      .catch(() => setFiles([]));
  }, []);

  const add = (row: MediaFileRow) => {
    if (picked.some((p) => p.id === row.id)) return;
    onChange(
      serializeAttachmentFiles([
        ...picked,
        // Przecinek i kreska pionowa rozdzielają zapis, więc w nazwie ich nie
        // zostawiamy — plik „Cennik, 2026.pdf" rozjechałby całą listę.
        { id: row.id, name: row.fileName.replace(/[,|]/g, " "), size: fmtSize(row.sizeBytes) },
      ]),
    );
  };

  const remove = (id: string) =>
    onChange(serializeAttachmentFiles(picked.filter((p) => p.id !== id)));

  const available = (files ?? [])
    .filter((f) => !picked.some((p) => p.id === f.id))
    .sort((a, b) => {
      const aDoc = a.mimeType.startsWith("image/") ? 1 : 0;
      const bDoc = b.mimeType.startsWith("image/") ? 1 : 0;
      return aDoc - bDoc || a.fileName.localeCompare(b.fileName, "pl");
    });

  return (
    <div className="space-y-2">
      <Label className="text-xs">{t("Pliki")}</Label>

      {picked.length > 0 && (
        <div className="space-y-1">
          {picked.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
            >
              <span className="text-xs truncate" title={f.name}>
                📎 {f.name}
                {f.size && <span className="text-muted-foreground"> ({f.size})</span>}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                title={t("Usuń z listy")}
                onClick={() => remove(f.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {files === null ? (
        <div className="py-3 flex justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : available.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {files.length === 0
            ? t("Biblioteka Media jest pusta — wgraj tam PDF, żeby go dołączyć.")
            : t("Wszystkie pliki z biblioteki są już na liście.")}
        </p>
      ) : (
        <div className="max-h-40 overflow-y-auto rounded-md border divide-y">
          {available.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => add(f)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-accent"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-xs truncate flex-1">{f.fileName}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {fmtSize(f.sizeBytes)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
