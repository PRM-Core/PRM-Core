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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";
import { t } from "@/lib/i18n";

export interface HeaderFooterDefaults {
  logoText: string;
  tagline: string;
  logoImageUrl: string;
  footerText: string;
  footerImageUrl: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("https://… lub wgraj plik")}
          className="text-xs"
        />
        <label className="shrink-0">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) onChange(await readFileAsDataUrl(f));
            }}
          />
          <span className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-input hover:bg-accent cursor-pointer">
            <Upload className="h-4 w-4" />
          </span>
        </label>
      </div>
      {value && (
        <img src={value} alt="" className="h-12 rounded-md border border-border object-cover" />
      )}
    </div>
  );
}

export function HeaderFooterDialog({
  open,
  onOpenChange,
  value,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: HeaderFooterDefaults;
  onSave: (next: HeaderFooterDefaults) => void;
}) {
  const set = (patch: Partial<HeaderFooterDefaults>) => onSave({ ...value, ...patch });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Domyślny nagłówek i stopka")}</DialogTitle>
          <DialogDescription>
            {t(
              "Tak jak w Outlooku — ustaw raz swój nagłówek i stopkę, a każda nowa wiadomość zacznie się od razu z nimi. Nadal możesz je edytować lub usunąć w konkretnej wiadomości.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t("Nagłówek")}
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Nazwa / logo (tekst)")}</Label>
            <Input value={value.logoText} onChange={(e) => set({ logoText: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Slogan")}</Label>
            <Input value={value.tagline} onChange={(e) => set({ tagline: e.target.value })} />
          </div>
          <ImageField
            label={t("Logo (obraz)")}
            value={value.logoImageUrl}
            onChange={(v) => set({ logoImageUrl: v })}
          />
        </div>

        <div className="space-y-3 pt-2 border-t border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">
            {t("Stopka")}
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Treść stopki")}</Label>
            <Textarea
              value={value.footerText}
              onChange={(e) => set({ footerText: e.target.value })}
              className="min-h-[80px]"
            />
          </div>
          <ImageField
            label={t("Baner / podpis")}
            value={value.footerImageUrl}
            onChange={(v) => set({ footerImageUrl: v })}
          />
        </div>

        <DialogFooter>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            {t("Gotowe")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
