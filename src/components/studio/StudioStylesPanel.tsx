import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { STUDIO_FONTS, type ContentItem } from "@/lib/content-builder";
import { t, localized } from "@/lib/i18n";

/**
 * Zakładka „Style" — wygląd całej wiadomości, nie pojedynczego bloku.
 *
 * **Te ustawienia realnie zmieniają wysyłany HTML.** Tło wchodzi do `body`,
 * kolor treści i zaokrąglenie do kontenera, krój do `font-family` razem
 * z arkuszem Google w nagłówku. W makiecie z Lovable ten panel tylko
 * przestawiał podgląd — tutaj podgląd i wiadomość czytają to samo pole
 * `item.style`, więc nie da się zapisać czegoś, czego pacjent nie zobaczy.
 *
 * Zapis jest płaską mapą napisów, bo tak wygląda kolumna `content_items.style`
 * — jeden JSON zamiast pięciu kolumn, które trzeba by dodawać migracją przy
 * każdym nowym suwaku.
 */

/** Gotowe zestawy z księgi znaku — szybciej niż dobieranie pięciu pól ręcznie. */
const PRESETS: { label: string; style: Record<string, string> }[] = localized(() => [
  {
    label: t("Klinika"),
    style: {
      background: "#F4F6F9",
      contentBackground: "#FFFFFF",
      accent: "#1B2A4A",
      radius: "12",
      font: "Inter",
    },
  },
  {
    label: t("Granat"),
    style: {
      background: "#1B2A4A",
      contentBackground: "#FFFFFF",
      accent: "#5C7080",
      radius: "16",
      font: "Inter",
    },
  },
  {
    label: t("Bez ramki"),
    style: {
      background: "#FFFFFF",
      contentBackground: "#FFFFFF",
      accent: "#1B2A4A",
      radius: "0",
      font: "Inter",
    },
  },
]);

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        {/* Próbnik i pole tekstowe obok siebie: kolor z brand booka wpisuje się
            szybciej kodem, a dobiera wygodniej myszą. */}
        <input
          type="color"
          value={value || fallback}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-0.5"
          aria-label={label}
        />
        <Input
          value={value}
          placeholder={fallback}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 font-mono text-xs"
        />
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  fallback,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: string;
  fallback: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: string) => void;
}) {
  const current = Number(value) || fallback;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {current}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-[var(--primary)]"
      />
    </div>
  );
}

export function StudioStylesPanel({
  item,
  onChange,
}: {
  item: ContentItem | null;
  onChange: (patch: Partial<ContentItem>) => void;
}) {
  if (!item) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("Wybierz wiadomość, żeby ustawić jej wygląd.")}
      </p>
    );
  }

  const style = item.style ?? {};
  const set = (key: string, value: string) => onChange({ style: { ...style, [key]: value } });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("Zestawy")}
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onChange({ style: { ...style, ...p.style } })}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("Kolory")}
        </Label>
        <ColorField
          label={t("Tło wiadomości")}
          value={style.background ?? ""}
          fallback="#F3F4F6"
          onChange={(v) => set("background", v)}
        />
        <ColorField
          label={t("Tło treści")}
          value={style.contentBackground ?? ""}
          fallback="#FFFFFF"
          onChange={(v) => set("contentBackground", v)}
        />
        <ColorField
          label={t("Akcent (przyciski)")}
          value={style.accent ?? ""}
          fallback="#4F46E5"
          onChange={(v) => set("accent", v)}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("Typografia")}
        </Label>
        <select
          value={style.font ?? ""}
          onChange={(e) => set("font", e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          {/* Pusto = Arial. Krój systemowy dociera wszędzie, więc zostaje
              domyślnym — webfonty Outlook i Gmail i tak wycinają. */}
          <option value="">{t("Systemowy (Arial)")}</option>
          {STUDIO_FONTS.map((f) => (
            <option key={f.family} value={f.family}>
              {f.family}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground">
          {t(
            "Outlook i Gmail nie pobierają krojów Google — pokażą zamiennik systemowy. Apple Mail i klienty mobilne wyświetlą wybrany krój.",
          )}
        </p>
      </div>

      <div className="space-y-3">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("Układ")}
        </Label>
        <SliderField
          label={t("Szerokość treści")}
          value={style.width ?? ""}
          fallback={560}
          min={320}
          max={760}
          step={10}
          unit=" px"
          onChange={(v) => set("width", v)}
        />
        <SliderField
          label={t("Zaokrąglenie")}
          value={style.radius ?? ""}
          fallback={12}
          min={0}
          max={32}
          step={1}
          unit=" px"
          onChange={(v) => set("radius", v)}
        />
        <p className="text-[11px] text-muted-foreground">
          {t(
            "Powyżej 640 px wiadomość zaczyna się przewijać w bok w wąskim oknie podglądu Outlooka.",
          )}
        </p>
      </div>
    </div>
  );
}
