import { useMemo } from "react";
import { AlertTriangle, Check, Download, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderContentItemToHtml } from "@/lib/content-builder-html";
import {
  UNSUBSCRIBE_PLACEHOLDER,
  type ContentBlock,
  type ContentItem,
} from "@/lib/content-builder";
import { cn } from "@/lib/utils";
import { count } from "@/lib/plural";
import { t } from "@/lib/i18n";

/**
 * Zakładka „Testy" — kontrola wiadomości przed wysyłką.
 *
 * **Są tu wyłącznie sprawdzenia, które potrafimy policzyć na miejscu.**
 * W makiecie z Lovable ta zakładka pokazywała też podgląd w Gmailu, Outlooku
 * i Apple Mail oraz ocenę spamu — świadomie ich nie ma. Podgląd w kliencie
 * poczty wymaga usługi, która naprawdę otworzy wiadomość w tym kliencie
 * (Litmus, Email on Acid), a ocena spamu — filtra po stronie odbiorcy.
 * Wypisanie „Gmail OK", gdy nikt tej wiadomości w Gmailu nie otworzył, byłoby
 * stwierdzeniem nieprawdy o czymś, na czym placówka opiera decyzję o wysyłce
 * do tysięcy osób. Prawdziwy test klienta poczty robi przycisk „Wyślij test"
 * na górnym pasku — wiadomość ląduje w prawdziwej skrzynce.
 */

type Level = "ok" | "warn" | "info";

interface QaCheck {
  level: Level;
  label: string;
  detail: string;
}

/** Wszystkie bloki, także te w kolumnach — zagnieżdżenie jest płytkie. */
function flatten(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.flatMap((b) => [b, ...(b.columns ?? []).flat()]);
}

/** Względna luminancja wg WCAG 2.1 — potrzebna do stosunku kontrastu. */
function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function fmtBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`;
}

function runChecks(item: ContentItem, html: string): QaCheck[] {
  const blocks = flatten(item.blocks ?? []);
  const style = item.style ?? {};
  const checks: QaCheck[] = [];

  // 1. Waga wiadomości. Gmail ucina treść powyżej 102 kB i dokleja „[Wiadomość
  //    przycięta]" razem z odnośnikiem — czyli stopka z wypisem znika z widoku.
  const bytes = new TextEncoder().encode(html).length;
  checks.push(
    bytes > 102_000
      ? {
          level: "warn",
          label: t("Waga: {v0}", { v0: fmtBytes(bytes) }),
          detail: t("Gmail przycina wiadomości powyżej 102 kB — końcówka, w tym stopka, zniknie."),
        }
      : {
          level: "ok",
          label: t("Waga: {v0}", { v0: fmtBytes(bytes) }),
          detail: t("Poniżej progu przycinania w Gmailu (102 kB)."),
        },
  );

  // 2. Opisy obrazów. Domyślnie obrazy są blokowane w Outlooku i Gmailu do
  //    czasu kliknięcia „pokaż obrazy" — bez `alt` w tym miejscu jest pustka.
  const images = blocks.filter((b) => b.type === "image" && (b.data.url ?? "").trim());
  const noAlt = images.filter((b) => !(b.data.alt ?? "").trim() || b.data.alt === "Obraz");
  if (images.length > 0) {
    checks.push(
      noAlt.length > 0
        ? {
            level: "warn",
            label: t("Obrazy bez opisu: {length} z {length2}", {
              length: noAlt.length,
              length2: images.length,
            }),
            detail: t(
              "Zanim odbiorca kliknie „pokaż obrazy”, w ich miejscu widać tylko opis. Czytniki ekranu też czytają wyłącznie opis.",
            ),
          }
        : {
            level: "ok",
            label: t("Obrazy opisane: {length}", { length: images.length }),
            detail: t("Każdy obraz ma tekst zastępczy."),
          },
    );
  }

  // 3. Link wypisu. Brak to nie kwestia estetyki, tylko naruszenie —
  //    i najczęstsze niedopatrzenie przy szybkiej wysyłce.
  const hasUnsub = html.includes(UNSUBSCRIBE_PLACEHOLDER) || html.includes("unsubscribe");
  checks.push(
    hasUnsub
      ? {
          level: "ok",
          label: t("Link wypisu obecny"),
          detail: t("Wysyłka podmieni go na adres jednorazowy."),
        }
      : {
          level: "warn",
          label: t("Brak linku wypisu"),
          detail: t(
            "Wiadomość marketingowa musi dać się wypisać. Wstaw sekcję „Stopka RODO” albo pole „Link wypisania z listy”.",
          ),
        },
  );

  // 4. Puste odnośniki — „https://" to wartość domyślna przycisku, zostaje
  //    w treści zaskakująco często i prowadzi donikąd.
  const deadLinks = blocks.filter((b) => {
    const url = (b.data.url ?? b.data.href ?? "").trim();
    if (b.type === "button") return !url || url === "https://";
    return false;
  });
  if (blocks.some((b) => b.type === "button")) {
    checks.push(
      deadLinks.length > 0
        ? {
            level: "warn",
            label: t("Przyciski bez adresu: {length}", { length: deadLinks.length }),
            detail: t("Zostało domyślne „https://” — kliknięcie nic nie zrobi."),
          }
        : {
            level: "ok",
            label: t("Przyciski mają adresy"),
            detail: t("Każdy prowadzi pod konkretny adres."),
          },
    );
  }

  // 5. Kontrast tekstu. Liczony na tle treści z zakładki Style i domyślnym
  //    kolorze akapitu renderera (#4B5563); AA dla zwykłego tekstu to 4.5:1.
  const bgForText = style.contentBackground || "#FFFFFF";
  const textRatio = contrast(bgForText, "#4B5563");
  if (textRatio !== null) {
    checks.push(
      textRatio >= 4.5
        ? {
            level: "ok",
            label: t("Kontrast tekstu: {v0}:1", { v0: textRatio.toFixed(1) }),
            detail: t("Spełnia WCAG AA (wymagane 4,5:1)."),
          }
        : {
            level: "warn",
            label: t("Kontrast tekstu: {v0}:1", { v0: textRatio.toFixed(1) }),
            detail: t("Poniżej WCAG AA (4,5:1) na tle {bgForText}. Rozjaśnij tło treści.", {
              bgForText: bgForText,
            }),
          },
    );
  }

  // 6. Kontrast napisu na przycisku — przycisk jest biały w środku, więc
  //    jasny akcent robi z niego pustą plamę.
  if (blocks.some((b) => b.type === "button")) {
    const btnRatio = contrast(style.accent || "#4F46E5", "#FFFFFF");
    if (btnRatio !== null) {
      checks.push(
        btnRatio >= 4.5
          ? {
              level: "ok",
              label: t("Kontrast przycisku: {v0}:1", { v0: btnRatio.toFixed(1) }),
              detail: t("Biały napis czytelny na kolorze akcentu."),
            }
          : {
              level: "warn",
              label: t("Kontrast przycisku: {v0}:1", { v0: btnRatio.toFixed(1) }),
              detail: t("Biały napis na tym akcencie jest nieczytelny — przyciemnij kolor."),
            },
      );
    }
  }

  // 7. Proporcja tekstu do obrazów. Sama w sobie nie jest błędem, ale
  //    wiadomość złożona wyłącznie z grafik u odbiorcy z zablokowanymi
  //    obrazami jest pusta — dlatego to uwaga, nie ostrzeżenie.
  const textChars = blocks
    .filter((b) => b.type === "text" || b.type === "heading" || b.type === "html")
    .reduce((n, b) => n + (b.data.html ?? b.data.text ?? "").replace(/<[^>]*>/g, "").length, 0);
  if (images.length > 0 && textChars < 200) {
    checks.push({
      level: "info",
      label: t("Dużo grafiki, mało tekstu"),
      detail: t(
        "{textChars} znaków tekstu przy {length} obrazach. Z zablokowanymi obrazami zostanie prawie pusta strona.",
        { textChars: textChars, length: images.length },
      ),
    });
  }

  // 8. Blok „Załączniki" bez plików — pusta lista renderuje się jako nic.
  const emptyAttach = blocks.filter(
    (b) => b.type === "attachments" && !(b.data.fileIds ?? "").trim(),
  );
  if (emptyAttach.length > 0) {
    checks.push({
      level: "warn",
      label: t("Pusty blok załączników"),
      detail: t("Nie wybrano plików z biblioteki Media — blok nie pokaże się w wiadomości."),
    });
  }

  return checks;
}

const ICON: Record<Level, typeof AlertTriangle> = {
  ok: Check,
  warn: AlertTriangle,
  info: Info,
};

export function StudioQaPanel({ item }: { item: ContentItem | null }) {
  const html = useMemo(() => (item ? renderContentItemToHtml(item) : ""), [item]);
  const checks = useMemo(() => (item ? runChecks(item, html) : []), [item, html]);

  if (!item) {
    return (
      <p className="text-sm text-muted-foreground">{t("Wybierz wiadomość, żeby ją sprawdzić.")}</p>
    );
  }

  const warns = checks.filter((c) => c.level === "warn").length;

  /** Zapis gotowego HTML-a — tego samego, który pójdzie w wysyłce. */
  const exportHtml = () => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${item.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "wiadomosc"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
        <p className="text-sm font-medium">
          {warns === 0
            ? t("Bez zastrzeżeń")
            : t("{v0} do poprawy", { v0: count(warns, "rzecz", "rzeczy", "rzeczy") })}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {t("Sprawdzenia liczone na miejscu, na gotowym HTML-u wiadomości.")}
        </p>
      </div>

      <div className="space-y-2">
        {checks.map((c, i) => {
          const Icon = ICON[c.level];
          return (
            <div key={i} className="flex gap-2 rounded-lg border border-border/60 px-3 py-2">
              <Icon
                className={cn(
                  "mt-0.5 h-3.5 w-3.5 shrink-0",
                  c.level === "ok" && "text-emerald-600",
                  c.level === "warn" && "text-amber-600",
                  c.level === "info" && "text-muted-foreground",
                )}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium">{c.label}</p>
                <p className="text-[11px] leading-snug text-muted-foreground">{c.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={exportHtml}>
        <Download className="h-3.5 w-3.5" /> {t(" Eksportuj HTML")}
      </Button>

      <p className="text-[11px] leading-snug text-muted-foreground">
        {t(
          'Podglądu w Gmailu, Outlooku i oceny spamu tu nie ma — wymagałyby usługi, która naprawdę otworzy wiadomość w tych klientach. Prawdziwy test robi przycisk „Wyślij test" na górnym pasku.',
        )}
      </p>
    </div>
  );
}
