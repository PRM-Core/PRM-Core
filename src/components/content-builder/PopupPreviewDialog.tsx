import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PopupConfig } from "@/lib/content-builder";
import { t } from "@/lib/i18n";

/**
 * Okno testowe pop-upu — pokazuje, jak zobaczy go odwiedzający.
 *
 * **Udawana strona, nie sam pop-up.** Pop-up wyrwany z kontekstu nic nie mówi:
 * cały sens formatu „belka" polega na tym, że spycha treść strony w dół, a rogu
 * — że zasłania jej narożnik. Podgląd rysuje więc atrapę strony i kładzie
 * pop-up na niej, tak jak zrobi to tracker.
 *
 * ⚠️ **Style muszą się zgadzać z `showPopup()` w `lib/tracking-script.ts`.**
 * Tracker jest szablonem tekstowym doklejanym na cudzą stronę, więc nie może
 * zaimportować niczego z TypeScriptu — geometria jest tu powielona świadomie.
 * Zmiana wyglądu w jednym miejscu wymaga zmiany w drugim; gdyby okazało się to
 * uciążliwe, wyjściem jest liczenie stylu na serwerze i wysyłanie go w konfiguracji.
 */

/** Treść w iframe, żeby style strony PRM Core nie farbowały na podgląd. */
function frameDoc(html: string, textColor: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;font-family:Arial,Helvetica,sans-serif;${textColor ? `color:${textColor};` : ""}}
    img{max-width:100%;height:auto}
  </style></head><body>${html}</body></html>`;
}

export function PopupPreviewDialog({
  open,
  onOpenChange,
  name,
  html,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  html: string;
  config: PopupConfig;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const mobile = device === "mobile";

  // Ta sama arytmetyka co w trackerze: szerokość skaluje się w dół i nigdy nie
  // wychodzi poza ekran. Na podglądzie „ekranem" jest atrapa strony.
  const boxWidth = `min(${config.width || 480}px, calc(100% - 32px))`;

  const skin: React.CSSProperties = {
    background: config.background || "#fff",
    ...(config.backgroundImage
      ? {
          backgroundImage: `url(${JSON.stringify(config.backgroundImage)})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : {}),
    ...(config.textColor ? { color: config.textColor } : {}),
  };

  const boxStyle: React.CSSProperties =
    config.format === "bar"
      ? {
          ...skin,
          position: "relative",
          maxWidth: 1100,
          margin: "0 auto",
          padding: "12px 44px 12px 20px",
          boxSizing: "border-box",
          ...(config.height
            ? {
                minHeight: config.height,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }
            : {}),
        }
      : {
          ...skin,
          position: "relative",
          borderRadius: 12,
          boxShadow:
            config.format === "corner"
              ? "0 12px 40px rgba(0,0,0,.22)"
              : "0 20px 50px rgba(0,0,0,.25)",
          width: boxWidth,
          padding: config.format === "corner" ? "24px 20px 20px" : "28px 24px 24px",
          boxSizing: "border-box",
          maxHeight: "85%",
          overflow: "auto",
          ...(config.height ? { height: config.height } : {}),
        };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {t("Podgląd — ")} {name}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Tak zobaczy go odwiedzający. Odwzorowany jest format, rozmiar, położenie i tło; capping, reguły adresów i harmonogram sprawdza dopiero tracker na żywej stronie.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button
            variant={device === "desktop" ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setDevice("desktop")}
          >
            <Monitor className="h-4 w-4" /> {t(" Komputer")}
          </Button>
          <Button
            variant={mobile ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setDevice("mobile")}
          >
            <Smartphone className="h-4 w-4" /> {t(" Telefon")}
          </Button>
          {config.devices !== "all" && (
            <span className="ml-1 text-xs text-muted-foreground">
              {t("Ustawienia ograniczają wyświetlanie do:")}{" "}
              {config.devices === "desktop" ? t("komputerów") : t("telefonów")}
            </span>
          )}
        </div>

        {/* Atrapa strony: szare paski udają treść, żeby było widać, co pop-up
            zasłania, a w formacie „belka" — o ile spycha stronę w dół. */}
        <div
          className={cn(
            "relative mx-auto w-full overflow-hidden rounded-lg border bg-background",
            mobile ? "max-w-[380px]" : "max-w-full",
          )}
          style={{ height: 460 }}
        >
          <div
            className="space-y-3 p-6 opacity-40"
            style={{ paddingTop: config.format === "bar" ? 96 : 24 }}
          >
            <div className="h-6 w-2/3 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-11/12 rounded bg-muted" />
            <div className="h-3 w-4/5 rounded bg-muted" />
            <div className="h-32 w-full rounded bg-muted" />
            <div className="h-3 w-3/4 rounded bg-muted" />
          </div>

          {config.format === "modal" && (
            <div
              className="absolute inset-0 flex items-center justify-center p-4"
              style={{ background: config.overlay || "rgba(15,23,42,.45)" }}
            >
              <div style={boxStyle}>
                <PreviewFrame html={html} textColor={config.textColor} />
              </div>
            </div>
          )}

          {config.format === "corner" && (
            <div
              className="absolute bottom-5"
              style={config.corner === "bottom-left" ? { left: 20 } : { right: 20 }}
            >
              <div style={boxStyle}>
                <PreviewFrame html={html} textColor={config.textColor} />
              </div>
            </div>
          )}

          {config.format === "bar" && (
            <div
              className="absolute left-0 right-0 top-0"
              style={{ ...skin, boxShadow: "0 2px 12px rgba(0,0,0,.15)" }}
            >
              <div style={{ ...boxStyle, background: "transparent" }}>
                <PreviewFrame html={html} textColor={config.textColor} />
              </div>
            </div>
          )}

          {/* Krzyżyk jest częścią pop-upu, nie treści — rysowany tak samo jak w trackerze. */}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("Zamknij")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewFrame({ html, textColor }: { html: string; textColor: string }) {
  return (
    <iframe
      title={t("Podgląd pop-upu")}
      /*
       * `allow-same-origin` bez `allow-scripts`.
       *
       * Pusty `sandbox` nadaje ramce nieprzezroczyste pochodzenie i blokuje
       * pobieranie obrazów z naszego serwera — pop-up z grafiką z biblioteki
       * Media pokazywał w podglądzie puste miejsca. Bez `allow-scripts` żaden
       * kod z treści i tak się nie wykona.
       */
      sandbox="allow-same-origin"
      srcDoc={frameDoc(html, textColor)}
      className="w-full border-0"
      style={{ minHeight: 120, height: 180 }}
    />
  );
}
