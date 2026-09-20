import { useState } from "react";
import { toast } from "sonner";
import { FileArchive, Upload, FileText, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importZipFile } from "@/lib/zip-import";
import { KIND_LABELS, type BuilderKind } from "@/lib/content-builder";
import { count } from "@/lib/plural";
import { t } from "@/lib/i18n";

export function ImportZipDialog({
  open,
  onOpenChange,
  kind,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: BuilderKind;
  onImport: (name: string, html: string | null, fileNames: string[]) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [name, setName] = useState("");
  const [parsedHtml, setParsedHtml] = useState<string | null>(null);
  const [parsedFiles, setParsedFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFileName("");
    setName("");
    setParsedHtml(null);
    setParsedFiles([]);
    setBusy(false);
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setFileName(file.name);
    setName(file.name.replace(/\.zip$/i, ""));
    try {
      const result = await importZipFile(file);
      setParsedFiles(result.fileNames);
      setParsedHtml(result.html);
      if (result.fileNames.length === 0) toast.error(t("Archiwum ZIP jest puste."));
    } catch {
      toast.error(t("Nie udało się odczytać pliku ZIP."), {
        description: t("Upewnij się, że to poprawne archiwum .zip."),
      });
      setParsedFiles([]);
      setParsedHtml(null);
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    onImport(name.trim() || fileName, parsedHtml, parsedFiles);
    onOpenChange(false);
    reset();
  };

  const label = KIND_LABELS[kind];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("Importuj ")} {label.singular} {t(" z pliku ZIP")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Wgraj archiwum .zip zawierające plik HTML (np. wyeksportowany z innego narzędzia). Znaleziony plik HTML zostanie pokazany w podglądzie — resztę plików (obrazy, style) potraktujemy jako załączniki.",
            )}
          </DialogDescription>
        </DialogHeader>

        {!fileName ? (
          <label className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:bg-muted/30 transition cursor-pointer block">
            <input
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <FileArchive className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">{t("Kliknij, aby wybrać plik .zip")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("lub przeciągnij plik tutaj")}</p>
          </label>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <FileArchive className="h-4 w-4 text-primary" />
              <span className="font-medium truncate">{fileName}</span>
            </div>

            {busy ? (
              <p className="text-xs text-muted-foreground">{t("Odczytywanie archiwum…")}</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {t("Nazwa ")} {label.singular}
                  </Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>

                <div className="flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {t(" Znaleziono")}{" "}
                  {count(parsedFiles.length, "plik", "pliki", "plików")} {t(" w archiwum")}
                  {parsedHtml && ", w tym plik HTML"}
                </div>

                {parsedFiles.length > 0 && (
                  <div className="max-h-28 overflow-y-auto rounded-md border p-2 space-y-1">
                    {parsedFiles.slice(0, 30).map((f) => (
                      <div
                        key={f}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground"
                      >
                        <FileText className="h-3 w-3 shrink-0" />{" "}
                        <span className="truncate">{f}</span>
                      </div>
                    ))}
                  </div>
                )}

                {parsedHtml && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("Podgląd")}</Label>
                    <iframe
                      title={t("Podgląd importu")}
                      srcDoc={parsedHtml}
                      sandbox="allow-same-origin"
                      className="w-full h-56 rounded-md border border-border bg-white"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("Anuluj")}
          </Button>
          <label>
            <input
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {fileName && (
              <span className="inline-flex items-center justify-center h-8 gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-accent cursor-pointer">
                <Upload className="h-3.5 w-3.5" /> {t(" Zmień plik")}
              </span>
            )}
          </label>
          <Button size="sm" disabled={!fileName || busy} onClick={confirm}>
            {t("Importuj")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
