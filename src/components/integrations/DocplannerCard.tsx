import { useEffect, useState } from "react";
import { AlertTriangle, CalendarCheck, Check, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDocplannerStatus, type DocplannerStatus } from "@/lib/api/docplanner.functions";
import { t } from "@/lib/i18n";

/**
 * Docplanner (ZnanyLekarz, Doctoralia) — Integrations API.
 *
 * Says only what is true today: the keys and the connection test work; reading
 * bookings comes once Docplanner grants API access and a sandbox. Until then
 * the card must not look like a working sync.
 */
export function DocplannerCard() {
  const [stan, setStan] = useState<DocplannerStatus | null>(null);
  useEffect(() => {
    void getDocplannerStatus().then(setStan);
  }, []);
  if (!stan) return null;

  return (
    <Card className="border-border/60 shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-primary" />
          Docplanner – Integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {t(
            "Rezerwacje z ZnanyLekarz i Doctoralia: lekarze, wolne terminy i wizyty umówione przez pacjentów w serwisie.",
          )}
        </p>
        {stan.configured ? (
          <p className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600" />
            {t("Klucze zapisane — serwis {host}.", { host: stan.host || "—" })}
          </p>
        ) : (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> {t("Brak kluczy integracji")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("Client ID i Client secret wydaje Docplanner. Wpisz je w sekcji")}{" "}
              <a href="#klucze" className="underline underline-offset-2">
                {t("Klucze i dane dostępowe")}
              </a>
              {t(" — tam jest też „Sprawdź połączenie”.")}
            </p>
          </div>
        )}
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {t(
            "Synchronizacja wizyt: w przygotowaniu. Ruszy po otrzymaniu od Docplanner dostępu do API i środowiska testowego.",
          )}
        </p>
      </CardContent>
    </Card>
  );
}
