import { useEffect, useState } from "react";
import { Upload, Info } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/lib/i18n";

/**
 * Paste (or upload) raw HTML as a popup — the escape hatch for markup produced
 * in another tool. Doubles as the editor for items already created this way,
 * which is why `initialName`/`initialHtml` exist and the name field hides when
 * editing.
 */
export function HtmlSourceDialog({
  open,
  onOpenChange,
  onSave,
  initialName = "",
  initialHtml = "",
  mode = "create",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, html: string) => void;
  initialName?: string;
  initialHtml?: string;
  mode?: "create" | "edit";
}) {
  const [name, setName] = useState(initialName);
  const [html, setHtml] = useState(initialHtml);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setHtml(initialHtml);
    }
  }, [open, initialName, initialHtml]);

  const canSave = html.trim().length > 0 && (mode === "edit" || name.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? t("Edytuj kod HTML") : t("Wklej własny kod HTML")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Pop-up z gotowego HTML-a — np. wyeksportowanego z innego narzędzia. PRM Core wyświetli go na stronie w wybranym formacie i rozmiarze.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {mode === "create" && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Nazwa *")}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("np. Pop-up rabatowy — wersja z Figmy")}
                autoFocus
              />
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">{t("Kod HTML *")}</Label>
              <label className="shrink-0">
                <input
                  type="file"
                  accept=".html,.htm,text/html"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setHtml(await file.text());
                    if (mode === "create" && !name.trim()) {
                      setName(file.name.replace(/\.html?$/i, ""));
                    }
                  }}
                />
                <span className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-input hover:bg-accent cursor-pointer text-xs">
                  <Upload className="h-3.5 w-3.5" /> {t(" Wgraj plik .html")}
                </span>
              </label>
            </div>
            <Textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder="<div>…</div>"
              className="min-h-[260px] font-mono text-xs"
            />
          </div>
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {t("Wklej samą zawartość okna (bez ")} <code className="mx-1">&lt;html&gt;</code>/
            <code className="mr-1">&lt;body&gt;</code>
            {t(
              ') — ramkę, tło i przycisk zamykania dokłada PRM Core. Żeby formularz w tym kodzie zbierał kontakty, zajrzyj do „Formularze — instrukcja".',
            )}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("Anuluj")}
          </Button>
          <Button
            size="sm"
            disabled={!canSave}
            onClick={() => {
              onSave(name.trim(), html);
              onOpenChange(false);
            }}
          >
            {mode === "edit" ? t("Zapisz zmiany") : t("Utwórz pop-up")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
