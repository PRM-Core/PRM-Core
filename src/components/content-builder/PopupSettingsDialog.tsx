import { useEffect, useState } from "react";
import {
  AppWindow,
  PanelTop,
  PictureInPicture2,
  Monitor,
  Smartphone,
  Info,
  Globe,
  Link2,
  Plus,
  Trash2,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DEFAULT_POPUP_CONFIG,
  POPUP_FORMAT_LABELS,
  type PopupConfig,
  type PopupFormat,
} from "@/lib/content-builder";
import { t } from "@/lib/i18n";

const FORMAT_ICONS: Record<PopupFormat, typeof AppWindow> = {
  modal: AppWindow,
  corner: PictureInPicture2,
  bar: PanelTop,
};

export function PopupSettingsDialog({
  open,
  onOpenChange,
  value,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: PopupConfig;
  onSave: (config: PopupConfig) => void;
}) {
  const [cfg, setCfg] = useState<PopupConfig>(value);

  useEffect(() => {
    if (open) setCfg(value);
  }, [open, value]);

  const set = (patch: Partial<PopupConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const isBar = cfg.format === "bar";
  const isCorner = cfg.format === "corner";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Ustawienia pop-upu")}</DialogTitle>
          <DialogDescription>
            {t("Format, rozmiar, urządzenia i limit wyświetleń. Dotyczy tego jednego pop-upu.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Format")}</Label>
            <div className="grid gap-2">
              {(Object.keys(POPUP_FORMAT_LABELS) as PopupFormat[]).map((f) => {
                const Icon = FORMAT_ICONS[f];
                const meta = POPUP_FORMAT_LABELS[f];
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => set({ format: f })}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                      cfg.format === f
                        ? "border-primary bg-primary-soft/40"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <Icon className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{meta.label}</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        {meta.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {isCorner && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Róg ekranu")}</Label>
              <Select
                value={cfg.corner}
                onValueChange={(v) => set({ corner: v as PopupConfig["corner"] })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom-right">{t("Prawy dolny")}</SelectItem>
                  <SelectItem value="bottom-left">{t("Lewy dolny")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {!isBar && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Szerokość (px)")}</Label>
                <Input
                  type="number"
                  min={200}
                  max={1200}
                  value={cfg.width}
                  onChange={(e) => set({ width: Number(e.target.value) || 0 })}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("Na wąskich ekranach zmniejsza się automatycznie.")}
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">
                {isBar ? t("Wysokość belki (px)") : t("Wysokość (px)")}
              </Label>
              <Input
                type="number"
                min={0}
                max={800}
                value={cfg.height}
                onChange={(e) => set({ height: Number(e.target.value) || 0 })}
              />
              <p className="text-[11px] text-muted-foreground">{t("0 = dopasuj do treści.")}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t("Gdzie wyświetlać")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { key: "all", label: t("Wszędzie"), Icon: Monitor },
                  { key: "desktop", label: t("Desktop"), Icon: Monitor },
                  { key: "mobile", label: t("Mobile"), Icon: Smartphone },
                ] as const
              ).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  disabled={isCorner}
                  onClick={() => set({ devices: key })}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs transition-colors",
                    cfg.devices === key && !isCorner
                      ? "border-primary bg-primary-soft/40"
                      : "border-border hover:bg-muted/50",
                    isCorner && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            {isCorner && (
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />

                {t("Pop-up w rogu z założenia pokazuje się tylko na desktopie.")}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border/60 p-3 space-y-3">
            <div>
              <Label className="text-xs font-medium">{t("Na których stronach")}</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("Domyślnie wszędzie tam, gdzie wklejony jest kod śledzący.")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: "all", label: t("Cały serwis") },
                  { key: "match", label: t("Wybrane adresy") },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set({ urlMode: key })}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs transition-colors",
                    cfg.urlMode === key
                      ? "border-primary bg-primary-soft/40"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  {key === "all" ? (
                    <Globe className="h-3.5 w-3.5" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" />
                  )}
                  {label}
                </button>
              ))}
            </div>

            {cfg.urlMode === "match" && (
              <div className="space-y-1.5">
                {cfg.urlRules.map((rule, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input
                      value={rule}
                      onChange={(e) =>
                        set({
                          urlRules: cfg.urlRules.map((r, idx) => (idx === i ? e.target.value : r)),
                        })
                      }
                      placeholder={t("/kontakt albo https://twojadomena.pl/oferta")}
                      className="h-8 text-xs font-mono"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive"
                      onClick={() => set({ urlRules: cfg.urlRules.filter((_, idx) => idx !== i) })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full h-8 gap-1.5"
                  onClick={() => set({ urlRules: [...cfg.urlRules, ""] })}
                >
                  <Plus className="h-3.5 w-3.5" /> {t(" Dodaj adres")}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    "Możesz podać pełny adres albo samą ścieżkę. Gwiazdka działa jak dzika karta:",
                  )}{" "}
                  <code className="bg-muted px-1 rounded">{t("/blog/*")}</code>{" "}
                  {t(" obejmie wszystkie podstrony bloga. Parametry (?utm=…) są ignorowane.")}
                </p>
                {cfg.urlRules.filter((r) => r.trim()).length === 0 && (
                  <p className="flex items-start gap-1.5 text-[11px] text-warning-foreground bg-warning/15 rounded-md px-2 py-1.5">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" />

                    {t("Bez żadnego adresu pop-up nie pokaże się nigdzie.")}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/60 p-3 space-y-3">
            <div>
              <Label className="text-xs font-medium">{t("Tło pod tekstem")}</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t(
                  "Wygląd samego okna. Treść zostaje ta sama — belka i okno modalne mogą mieć różne tło bez poprawiania bloków.",
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Kolor tła")}</Label>
                <div className="flex items-center gap-2">
                  {/* Próbnik i pole tekstowe obok siebie: próbnik nie przyjmuje
                      `rgba()` ani `transparent`, a bywają potrzebne. */}
                  <Input
                    type="color"
                    className="h-9 w-12 p-1"
                    value={/^#[0-9a-f]{6}$/i.test(cfg.background) ? cfg.background : "#ffffff"}
                    onChange={(e) => set({ background: e.target.value })}
                  />
                  <Input
                    className="h-9 text-sm"
                    placeholder="#ffffff"
                    value={cfg.background}
                    onChange={(e) => set({ background: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Kolor tekstu")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    className="h-9 w-12 p-1"
                    value={/^#[0-9a-f]{6}$/i.test(cfg.textColor) ? cfg.textColor : "#111827"}
                    onChange={(e) => set({ textColor: e.target.value })}
                  />
                  <Input
                    className="h-9 text-sm"
                    placeholder={t("bez zmiany")}
                    value={cfg.textColor}
                    onChange={(e) => set({ textColor: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Obraz tła (adres URL)")}</Label>
              <Input
                className="h-9 text-sm"
                placeholder="https://…/tlo.jpg — opcjonalnie"
                value={cfg.backgroundImage}
                onChange={(e) => set({ backgroundImage: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                {t(
                  "Kładziony na kolorze tła, nie zamiast niego — kolor widać, dopóki obraz się ładuje, i zostaje, gdyby adres przestał działać.",
                )}
              </p>
            </div>
            {cfg.format === "modal" && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Przyciemnienie strony za oknem")}</Label>
                <Input
                  className="h-9 text-sm"
                  placeholder={t("rgba(15,23,42,.45) — domyślne")}
                  value={cfg.overlay}
                  onChange={(e) => set({ overlay: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/60 p-3 space-y-3">
            <div>
              <Label className="text-xs font-medium">{t("Harmonogram")}</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t(
                  "Kiedy pop-up ma się pokazywać. Puste pole = bez ograniczenia. Czas polski; o oknie czasowym decyduje serwer, więc przestawienie zegara na komputerze nie odsłoni kampanii przed startem.",
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Od")}</Label>
                <Input
                  type="datetime-local"
                  className="h-9 text-sm"
                  value={cfg.startsAt}
                  onChange={(e) => set({ startsAt: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Do")}</Label>
                <Input
                  type="datetime-local"
                  className="h-9 text-sm"
                  value={cfg.endsAt}
                  onChange={(e) => set({ endsAt: e.target.value })}
                />
              </div>
            </div>
            {cfg.startsAt && cfg.endsAt && cfg.endsAt <= cfg.startsAt ? (
              <p className="text-[11px] text-destructive">
                {t(
                  "Koniec wypada przed początkiem — przy takim ustawieniu pop-up nie pokaże się nigdy.",
                )}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {!cfg.startsAt && !cfg.endsAt
                  ? t("Bez harmonogramu — pop-up działa od publikacji do wyłączenia.")
                  : t('Widoczny {v0} {v1}. Godzina „do" liczy się włącznie.', {
                      v0: cfg.startsAt
                        ? `od ${cfg.startsAt.replace("T", ", godz. ")}`
                        : t("od razu"),
                      v1: cfg.endsAt ? `do ${cfg.endsAt.replace("T", ", godz. ")}` : "bezterminowo",
                    })}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border/60 p-3 space-y-3">
            <div>
              <Label className="text-xs font-medium">{t("Capping — limit wyświetleń")}</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("Ile razy ta sama osoba zobaczy pop-up, zanim przestanie się pokazywać.")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Okno czasowe")}</Label>
                <Select
                  value={cfg.cappingMode}
                  onValueChange={(v) => set({ cappingMode: v as PopupConfig["cappingMode"] })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="session">{t("Na sesję przeglądarki")}</SelectItem>
                    <SelectItem value="day">{t("Na 24 godziny")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Maks. wyświetleń")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={cfg.cappingLimit}
                  onChange={(e) => set({ cappingLimit: Number(e.target.value) || 1 })}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {cfg.cappingLimit === 1
                ? cfg.cappingMode === "session"
                  ? t("Raz na sesję — najczęstszy wybór.")
                  : t("Raz na dobę.")
                : t("Do {cappingLimit} wyświetleń {v1}.", {
                    cappingLimit: cfg.cappingLimit,
                    v1:
                      cfg.cappingMode === "session" ? t("w jednej sesji") : t("w ciągu 24 godzin"),
                  })}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            className="mr-auto"
            onClick={() => setCfg({ ...DEFAULT_POPUP_CONFIG })}
          >
            {t("Przywróć domyślne")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("Anuluj")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave(cfg);
              onOpenChange(false);
            }}
          >
            {t("Zapisz ustawienia")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
