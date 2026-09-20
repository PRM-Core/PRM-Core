import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, ExternalLink, Palette } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getCanvaStatus,
  getCanvaConnection,
  startCanva,
  disconnectCanvaAccount,
} from "@/lib/api/canva.functions";
import { t } from "@/lib/i18n";

/**
 * Karta integracji z Canvą.
 *
 * Rozdziela dwa stany, które łatwo pomylić: **brak kluczy w `.env`** (robota po
 * stronie serwera) i **brak zalogowania** (jedno kliknięcie). Wcześniej jedno
 * i drugie wyglądało jak „niepodłączona", co kazało szukać problemu nie tam.
 */
export function CanvaCard() {
  const [klucze, setKlucze] = useState<{ configured: boolean; missing: string[] } | null>(null);
  const [polaczenie, setPolaczenie] = useState<{
    connected: boolean;
    accountName: string;
    scopes: string;
    lastError: string | null;
  } | null>(null);
  const [zajete, setZajete] = useState(false);

  const odswiez = () => {
    void getCanvaStatus().then(setKlucze);
    void getCanvaConnection().then(setPolaczenie);
  };
  useEffect(odswiez, []);

  // Komunikat po powrocie z logowania — trasa `/api/canva/callback` odsyła tu
  // z parametrami, a bez ich odczytania powrót wyglądałby jak zwykłe wejście.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const wynik = p.get("canva");
    if (!wynik) return;
    const msg = p.get("msg") ?? "";
    if (wynik === "ok") toast.success(msg || t("Połączono z Canvą."));
    else toast.error(t("Nie udało się połączyć z Canvą"), { description: msg });
    window.history.replaceState({}, "", window.location.pathname);
    odswiez();
  }, []);

  const polacz = async () => {
    setZajete(true);
    try {
      const { url } = await startCanva();
      // Pełne przeładowanie, nie router: wychodzimy poza aplikację.
      window.location.href = url;
    } catch (err) {
      toast.error(t("Nie udało się rozpocząć logowania"), {
        description: err instanceof Error ? err.message : t("Spróbuj ponownie."),
      });
      setZajete(false);
    }
  };

  const rozlacz = async () => {
    setZajete(true);
    try {
      await disconnectCanvaAccount();
      toast.success(t("Odłączono konto Canvy."));
      odswiez();
    } finally {
      setZajete(false);
    }
  };

  if (!klucze || !polaczenie) return null;

  return (
    <Card className="border-border/60 shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />

          {t("Canva")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!klucze.configured ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm space-y-1">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> {t(" Brak kluczy integracji")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("Uzupełnij Client ID i Client secret w sekcji")}{" "}
              <a href="#klucze" className="underline underline-offset-2">
                {t("Klucze i dane dostępowe")}
              </a>{" "}
              {t("na górze tej strony.")}
            </p>
          </div>
        ) : polaczenie.connected ? (
          <>
            <p className="text-sm flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600" />

              {t("Połączono")}
              {polaczenie.accountName
                ? t(" — konto {accountName}", { accountName: polaczenie.accountName })
                : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("Uprawnienia: ")} {polaczenie.scopes || "—"}
              {t(". Wyłącznie odczyt: projektów w Canvie nie da się stąd zmienić ani skasować.")}
            </p>
            {polaczenie.lastError && (
              <p className="text-xs text-destructive">
                {t("Ostatni błąd: ")} {polaczenie.lastError}
              </p>
            )}
            <Button variant="outline" size="sm" disabled={zajete} onClick={() => void rozlacz()}>
              {t("Odłącz konto")}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t(
                "Klucze są na miejscu. Zaloguj się do Canvy, żeby móc wybierać projekty i przenosić je do Design Studia.",
              )}
            </p>
            <Button size="sm" className="gap-1.5" disabled={zajete} onClick={() => void polacz()}>
              <ExternalLink className="h-4 w-4" /> {t(" Połącz z Canvą")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
