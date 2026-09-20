import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, PauseCircle, PlayCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  getBookingPauseState,
  setBookingPause,
  replayParked,
  discardParked,
} from "@/lib/api/booking-pause.functions";
import { t } from "@/lib/i18n";

/**
 * Wstrzymanie wymiany danych z systemem rezerwacji.
 *
 * Na czas porządków w dokumentacji po stronie systemu rezerwacji trzeba
 * móc wstrzymać wymianę na kilka dni.
 *
 * **Dwa przełączniki, nie jeden**, bo to dwa różne ryzyka. Synchronizacja
 * pobiera — po włączeniu dociągnie stan, więc jej wyłączenie nic nie kosztuje.
 * Webhook przyjmuje rezerwacje, których nikt drugi raz nie wyśle, więc jego
 * wyłączenie musi coś z nimi zrobić: **odkładamy je**, zamiast odrzucać.
 */
export function BookingPauseCard() {
  const [stan, setStan] = useState<{
    syncPaused: boolean;
    webhookPaused: boolean;
    parked: number;
  } | null>(null);
  const [zajete, setZajete] = useState(false);

  const odswiez = () => void getBookingPauseState().then(setStan);
  useEffect(odswiez, []);

  const przelacz = async (co: "sync" | "webhook", wstrzymane: boolean) => {
    setZajete(true);
    try {
      const r = await setBookingPause({ data: { co, wstrzymane } });
      setStan((s) =>
        s
          ? { ...s, [co === "sync" ? "syncPaused" : "webhookPaused"]: wstrzymane, parked: r.parked }
          : s,
      );
      toast.success(wstrzymane ? t("Wstrzymano") : t("Wznowiono"));
    } catch (err) {
      toast.error(t("Nie udało się przestawić"), {
        description: err instanceof Error ? err.message : t("Spróbuj ponownie."),
      });
    } finally {
      setZajete(false);
    }
  };

  const przetworz = async () => {
    setZajete(true);
    try {
      const r = await replayParked();
      toast.success(
        t("Przetworzono {przetworzone}, odrzucono {odrzucone}, błędów {bledy}.", {
          przetworzone: r.przetworzone,
          odrzucone: r.odrzucone,
          bledy: r.bledy,
        }),
      );
      odswiez();
    } catch (err) {
      toast.error(t("Przetwarzanie nie powiodło się"), {
        description: err instanceof Error ? err.message : t("Spróbuj ponownie."),
      });
    } finally {
      setZajete(false);
    }
  };

  const odrzuc = async () => {
    setZajete(true);
    try {
      const r = await discardParked();
      toast.success(t("Odrzucono {odrzucone} zaległych rezerwacji.", { odrzucone: r.odrzucone }));
      odswiez();
    } finally {
      setZajete(false);
    }
  };

  if (!stan) return null;
  const cokolwiekWstrzymane = stan.syncPaused || stan.webhookPaused;

  return (
    <Card className="border-border/60 shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {cokolwiekWstrzymane ? (
            <PauseCircle className="h-4 w-4 text-amber-600" />
          ) : (
            <PlayCircle className="h-4 w-4 text-emerald-600" />
          )}

          {t("System rezerwacji — wstrzymanie wymiany")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-sm">{t("Synchronizacja przez API")}</Label>
            <p className="text-xs text-muted-foreground">
              {t(
                "Pobieranie historii wizyt, statusów i danych pacjentów. Po wznowieniu dociągnie to, co się zmieniło — nic nie przepada.",
              )}
            </p>
          </div>
          <Switch
            checked={!stan.syncPaused}
            disabled={zajete}
            onCheckedChange={(v) => void przelacz("sync", !v)}
          />
        </div>

        <div className="flex items-start justify-between gap-4 border-t pt-5">
          <div className="space-y-0.5">
            <Label className="text-sm">{t("Webhook rezerwacji")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("Przyjmowanie nowych rezerwacji. Po wyłączeniu zgłoszenia są")}{" "}
              <strong>{t("odkładane, nie odrzucane")}</strong>{" "}
              {t(
                " — system rezerwacji dostaje potwierdzenie, więc nie ponawia, a Ty decydujesz później, co z nimi zrobić.",
              )}
            </p>
          </div>
          <Switch
            checked={!stan.webhookPaused}
            disabled={zajete}
            onCheckedChange={(v) => void przelacz("webhook", !v)}
          />
        </div>

        {stan.parked > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <p className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              {t("Odłożonych rezerwacji: ")} <strong>{stan.parked}</strong>
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                "Przetworzenie użyje aktualnych reguł i kolejności, w jakiej przyszły. Duplikaty rozpoznają się same, więc nic się nie zdublicuje.",
              )}
            </p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" disabled={zajete} onClick={() => void przetworz()}>
                {t("Przetwórz zaległe (")}
                {stan.parked})
              </Button>
              <Button size="sm" variant="outline" disabled={zajete} onClick={() => void odrzuc()}>
                {t("Odrzuć")}
              </Button>
            </div>
          </div>
        )}

        {cokolwiekWstrzymane && (
          <p className="text-xs text-amber-700 dark:text-amber-500">
            {t(
              "Pamiętaj o włączeniu z powrotem — dopóki jest wstrzymane, karty pacjentów nie dostają statusów wizyt ani historii.",
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
