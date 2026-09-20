import { useCallback, useEffect, useState } from "react";
import { Check, FileText, Loader2, Paperclip } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { getMediaFiles } from "@/lib/api/media.functions";
import type { MediaFileRow } from "@/lib/db/schema";
import { t } from "@/lib/i18n";

/**
 * Wybór załączników wiadomości z biblioteki Media.
 *
 * **Tylko moduł Email.** Newsletter i pop-up ich nie mają: newsletter idzie do
 * segmentu i załącznik pomnożyłby wagę przez liczbę odbiorców, a pop-up jest
 * oknem na stronie, do którego nie ma czego dołączać.
 *
 * Pliki wybiera się z biblioteki, a nie wgrywa tutaj — dzięki temu ten sam
 * cennik dopięty do pięciu wiadomości leży w bazie raz, a podmiana pliku
 * w Media zmienia go we wszystkich.
 */

/** Limit łącznej wagi — ten sam, którego pilnuje serwer przy wysyłce. */
const MAX_BYTES = 20 * 1024 * 1024;

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentsDialog({
  open,
  onOpenChange,
  selected,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string[];
  onSave: (ids: string[]) => void;
}) {
  const [files, setFiles] = useState<MediaFileRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [picked, setPicked] = useState<string[]>(selected);

  const refresh = useCallback(() => {
    getMediaFiles({ data: {} })
      .then((rows) => {
        setFiles(rows);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (open) {
      setPicked(selected);
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const total = files.filter((f) => picked.includes(f.id)).reduce((sum, f) => sum + f.sizeBytes, 0);
  const overLimit = total > MAX_BYTES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" /> {t(" Załączniki wiadomości")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Pliki z biblioteki Media doklejane do e-maila. Łącznie do 20 MB — powyżej tej wagi część serwerów pocztowych odrzuca wiadomość, zamiast dostarczyć ją bez załącznika.",
            )}
          </DialogDescription>
        </DialogHeader>

        {!loaded ? (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("Biblioteka Media jest pusta. Wgraj pliki w module Media, a potem wróć tutaj.")}
          </p>
        ) : (
          <div className="max-h-[45vh] space-y-1 overflow-y-auto">
            {files.map((f) => {
              const on = picked.includes(f.id);
              return (
                <label
                  key={f.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2",
                    on ? "border-primary bg-primary-soft/40" : "hover:bg-muted/50",
                  )}
                >
                  <Checkbox
                    checked={on}
                    onCheckedChange={(v) =>
                      setPicked((prev) =>
                        v === true ? [...prev, f.id] : prev.filter((x) => x !== f.id),
                      )
                    }
                  />
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm" title={f.fileName}>
                    {f.fileName}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmt(f.sizeBytes)}</span>
                </label>
              );
            })}
          </div>
        )}

        <div
          className={cn(
            "rounded-md px-3 py-2 text-sm",
            overLimit ? "bg-destructive/10 text-destructive" : "bg-muted/40 text-muted-foreground",
          )}
        >
          {picked.length === 0
            ? t("Nie wybrano żadnego załącznika.")
            : t("{length} {v1} · łącznie {v2} z 20 MB", {
                length: picked.length,
                v1: picked.length === 1 ? "plik" : "pliki",
                v2: fmt(total),
              })}
          {overLimit && t(" — przekroczono limit, odznacz część plików.")}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Anuluj")}
          </Button>
          <Button
            disabled={overLimit}
            className="gap-1.5"
            onClick={() => {
              onSave(picked);
              onOpenChange(false);
            }}
          >
            <Check className="h-4 w-4" /> {t(" Zapisz")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
