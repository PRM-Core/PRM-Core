import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, FileText, Folder, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getMediaFiles, removeMediaFile, uploadMedia } from "@/lib/api/media.functions";
import { MEDIA_FOLDERS, MEDIA_FOLDER_LABELS, type MediaFolder } from "@/lib/media/media-shared";
import type { MediaFileRow } from "@/lib/db/schema";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/media")({
  head: () => ({ meta: [{ title: t("Media — PRM Core") }] }),
  component: MediaPage,
});

// Biblioteka Media — wcześniej ta strona była atrapą (sztuczne foldery
// i pliki generowane w pętli). Teraz jest prawdziwym zapleczem studia kreacji:
// grafiki wgrane tutaj (albo prosto z okna studia) dostają publiczny adres
// /media-file/:id, którego PRM_Agent używa w kodowanych wiadomościach.

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function MediaPage() {
  const [files, setFiles] = useState<MediaFileRow[]>([]);
  const [folder, setFolder] = useState<MediaFolder | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    getMediaFiles({ data: {} })
      .then((rows) => {
        setFiles(rows);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);
  useEffect(() => refresh(), [refresh]);

  async function handleUpload(list: FileList) {
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let raw = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          raw += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        await uploadMedia({
          data: {
            fileName: file.name,
            mimeType: file.type,
            folder: folder ?? "inne",
            bytesBase64: btoa(raw),
          },
        });
      }
      toast.success(
        list.length === 1
          ? t("Plik w bibliotece.")
          : t("{length} plików w bibliotece (folder {v1}).", {
              length: list.length,
              v1: MEDIA_FOLDER_LABELS[folder ?? "inne"],
            }),
      );
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Nie udało się wgrać pliku."));
    } finally {
      setUploading(false);
    }
  }

  function copyPath(row: MediaFileRow) {
    // Ścieżka względna — pełny adres zależy od domeny, a względna działa
    // i lokalnie, i na produkcji. Studio kreacji samo skleja adres absolutny.
    void navigator.clipboard.writeText(`/media-file/${row.id}`);
    setCopiedId(row.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const visible = folder ? files.filter((f) => f.folder === folder) : files;
  const countIn = (f: MediaFolder) => files.filter((x) => x.folder === f).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{t("Media")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Grafiki dla e-maili, newsletterów i pop-upów. Studio kreacji bierze pliki stąd.")}
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleUpload(e.target.files);
            e.target.value = "";
          }}
        />
        <Button className="gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}

          {t("Wgraj pliki")}
          {folder ? ` → ${MEDIA_FOLDER_LABELS[folder]}` : ""}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {MEDIA_FOLDERS.map((f) => (
          <Card
            key={f}
            className={cn(
              "border-border/60 shadow-[var(--shadow-card)] cursor-pointer transition-colors",
              folder === f ? "border-primary" : "hover:border-primary/40",
            )}
            onClick={() => setFolder(folder === f ? null : f)}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                <Folder className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-medium">{MEDIA_FOLDER_LABELS[f]}</div>
                <div className="text-xs text-muted-foreground">
                  {countIn(f)} {t(" plików")}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardContent className="p-4">
          {!loaded ? (
            <div className="py-12 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {folder
                ? t("Folder {v0} jest pusty.", { v0: MEDIA_FOLDER_LABELS[folder] })
                : t("Biblioteka jest pusta — wgraj pierwszą grafikę.")}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {visible.map((f) => (
                <div
                  key={f.id}
                  className="group rounded-xl border overflow-hidden hover:shadow-[var(--shadow-elevated)] transition-shadow"
                >
                  <div className="aspect-[4/3] bg-muted/40 flex items-center justify-center overflow-hidden">
                    {/* Podgląd tylko dla grafik — dokument w `<img>` dawał
                        złamaną ikonę i wyglądał jak plik, który się nie wgrał. */}
                    {f.mimeType.startsWith("image/") ? (
                      /* Prawdziwy podgląd spod publicznego adresu — ten sam,
                         który dostają klienty pocztowe. Jak tu działa, to tam też. */
                      <img
                        src={`/media-file/${f.id}`}
                        alt={f.fileName}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                        <FileText className="h-8 w-8" />
                        <span className="text-[11px] font-medium uppercase">
                          {f.fileName.split(".").pop()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-medium truncate" title={f.fileName}>
                      {f.fileName}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {fmtSize(f.sizeBytes)} ·{" "}
                        {MEDIA_FOLDER_LABELS[f.folder as MediaFolder] ?? f.folder}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={t("Kopiuj ścieżkę")}
                          onClick={() => copyPath(f)}
                        >
                          {copiedId === f.id ? (
                            <Check className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          title={t("Usuń")}
                          onClick={() => {
                            // Bez okna potwierdzenia, ale z ostrzeżeniem w treści:
                            // skasowanie grafiki łamie obrazki w JUŻ WYSŁANYCH
                            // e-mailach — one ładują się z tego adresu.
                            if (
                              !window.confirm(
                                t(
                                  'Usunąć „{fileName}"? Jeśli grafika jest użyta w wysłanych e-mailach, przestanie się w nich wyświetlać.',
                                  { fileName: f.fileName },
                                ),
                              )
                            )
                              return;
                            void removeMediaFile({ data: { id: f.id } }).then(() => {
                              toast.success(t("Usunięto."));
                              refresh();
                            });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t("Pliki są serwowane publicznie pod ")} <code>{t("/media-file/…")}</code>{" "}
        {t(
          " — tego wymagają klienty pocztowe pacjentów. Nie wgrywaj tu dokumentów ani niczego prywatnego; od tego są Dokumenty na karcie kontaktu.",
        )}
      </p>
    </div>
  );
}
