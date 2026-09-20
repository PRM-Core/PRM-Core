import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  PauseCircle,
  PlayCircle,
  Ban,
  CheckCircle2,
  Clock,
  Gauge,
  Loader2,
  Mail,
  MessageSquare,
  MoonStar,
  Newspaper,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  getCampaigns,
  killCampaign,
  resumeCampaignFn,
  stopCampaign,
} from "@/lib/api/campaigns.functions";
import { windowLabel } from "@/lib/campaigns/throttle";
import type { CampaignRow } from "@/lib/db/schema";
import { intlLocale, t, localized } from "@/lib/i18n";

export const Route = createFileRoute("/campaigns")({
  head: () => ({ meta: [{ title: t("Wysyłki — PRM Core") }] }),
  component: CampaignsPage,
});

/**
 * Lista wysyłek do segmentów.
 *
 * **Powstała razem z limitami tempa i to one ją wymusiły.** Wysyłka bez limitu
 * kończy się w minutę i nie ma czego oglądać. Wysyłka „100 na godzinę,
 * maksymalnie 600 dziennie" trwa dniami — a przez ten czas ktoś musi widzieć,
 * ile już poszło, czemu w tej chwili nic się nie dzieje i mieć gdzie kliknąć
 * „zatrzymaj", jeśli treść okazała się błędna.
 */

const KIND: Record<string, { label: string; icon: typeof Mail }> = localized(() => ({
  newsletter: { label: t("Newsletter"), icon: Newspaper },
  email: { label: t("E-mail"), icon: Mail },
  sms: { label: "SMS", icon: MessageSquare },
}));

const STATUS: Record<string, { label: string; className: string; icon: typeof Clock }> = localized(
  () => ({
    scheduled: { label: t("Zaplanowana"), className: "bg-muted text-foreground", icon: Clock },
    sending: { label: t("W trakcie"), className: "bg-primary/10 text-primary", icon: Send },
    paused: {
      label: t("Wstrzymana"),
      className: "bg-amber-500/10 text-amber-600",
      icon: PauseCircle,
    },
    sent: { label: t("Zakończona"), className: "bg-success/10 text-success", icon: CheckCircle2 },
    cancelled: { label: t("Odwołana"), className: "bg-muted text-muted-foreground", icon: Ban },
    failed: { label: t("Błąd"), className: "bg-destructive/10 text-destructive", icon: XCircle },
  }),
);

function timeOf(ms: number): string {
  return new Date(ms).toLocaleString(intlLocale(), {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Limity opisane jednym zdaniem — albo cisza, gdy żadnego nie ma. */
function limitText(c: CampaignRow): string | null {
  const parts: string[] = [];
  if (c.perHourLimit) parts.push(`${c.perHourLimit}/h`);
  if (c.perDayLimit) parts.push(t("{perDayLimit}/dobę", { perDayLimit: c.perDayLimit }));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Czy kampania stoi z powodu godzin, czy z powodu limitu.
 *
 * Liczone tu, a nie zapisywane w bazie: to samo `throttledUntil` obsługuje oba
 * powody, a dopisywanie do wiersza jeszcze jednej kolumny tylko po to, żeby
 * dobrać zdanie, znaczyłoby trzecie miejsce, które może się rozjechać
 * z pozostałymi dwoma.
 */
function outsideHours(c: CampaignRow): boolean {
  if (!windowLabel(c.sendFrom, c.sendTo)) return false;
  const now = new Date().toLocaleTimeString("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return c.sendFrom < c.sendTo
    ? now < c.sendFrom || now >= c.sendTo
    : now < c.sendFrom && now >= c.sendTo;
}

function CampaignsPage() {
  const [rows, setRows] = useState<CampaignRow[] | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getCampaigns()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  useEffect(() => {
    refresh();
    // Wysyłka z limitem rusza się co kilkadziesiąt sekund, więc odświeżanie co
    // 15 s wystarcza, żeby liczniki nie kłamały, i nie obciąża serwera.
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function handleResume(c: CampaignRow) {
    setStopping(c.id);
    const r = await resumeCampaignFn({ data: { id: c.id } });
    setStopping(null);
    if (!r.ok) {
      toast.error(t("Nie udało się wznowić"), { description: r.error });
      return;
    }
    toast.success(t("Wysyłka wznowiona."), {
      description: t(
        "Ruszy od miejsca, w którym stanęła — nikt nie dostanie wiadomości drugi raz.",
      ),
    });
    refresh();
  }

  async function handleKill(c: CampaignRow) {
    setStopping(c.id);
    const r = await killCampaign({ data: { id: c.id } });
    setStopping(null);
    if (!r.ok) {
      toast.error(t("Nie udało się anulować"), { description: r.error });
      return;
    }
    toast.success(t("Wysyłka anulowana."), {
      description: t("Tego już nie da się cofnąć. Wiadomości, które wyszły, zostają."),
    });
    refresh();
  }

  async function handleStop(c: CampaignRow) {
    setStopping(c.id);
    const r = await stopCampaign({ data: { id: c.id } });
    setStopping(null);
    if (!r.ok) {
      toast.error(t("Nie udało się zatrzymać"), { description: r.error });
      return;
    }
    toast.success(t("Wysyłka wstrzymana."), {
      description: t(
        "Wiadomości, które wyszły, zostają. Możesz ją wznowić albo anulować na dobre.",
      ),
    });
    refresh();
  }

  /**
   * Statusy, które **nie są końcem wysyłki**.
   *
   * `paused` musi tu być: wstrzymana kampania czeka na decyzję człowieka, a nie
   * jest zakończona. Bez niej lądowała w sekcji „Zakończone", gdzie karty
   * dostawały puste funkcje obsługi — przycisk „Wznów" rysował się i nie robił
   * nic.
   */
  const OPEN: string[] = ["sending", "scheduled", "paused"];
  const running = (rows ?? []).filter((c) => OPEN.includes(c.status));
  const done = (rows ?? []).filter((c) => !OPEN.includes(c.status));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Wysyłki")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            "Kampanie do segmentów — zaplanowane, trwające i zakończone. Wysyłka z ustawionym limitem tempa rozkłada się na godziny albo dni; tutaj widać, na czym stoi.",
          )}
        </p>
      </div>

      {rows === null ? (
        <p className="text-sm text-muted-foreground">{t("Wczytywanie…")}</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t(
              'Nie ma jeszcze żadnej wysyłki. Otwórz szablon w module Newsletter, E-mail albo SMS i wybierz „Wyślij do segmentu".',
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {running.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">{t("W toku")}</h2>
              {running.map((c) => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  stopping={stopping === c.id}
                  onStop={() => void handleStop(c)}
                  onResume={() => void handleResume(c)}
                  onKill={() => void handleKill(c)}
                />
              ))}
            </div>
          )}
          {done.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">{t("Zakończone")}</h2>
              {done.map((c) => (
                // Prawdziwe funkcje obsługi także tutaj. Karta i tak pokazuje
                // przyciski tylko dla statusów, które na nie pozwalają — a puste
                // funkcje były zaproszeniem do dokładnie tego błędu, który
                // wyszedł na produkcji.
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  stopping={stopping === c.id}
                  onStop={() => void handleStop(c)}
                  onResume={() => void handleResume(c)}
                  onKill={() => void handleKill(c)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CampaignCard({
  campaign: c,
  stopping,
  onStop,
  onResume,
  onKill,
}: {
  campaign: CampaignRow;
  stopping: boolean;
  onStop: () => void;
  onResume: () => void;
  onKill: () => void;
}) {
  const kind = KIND[c.kind] ?? KIND.email;
  const status = STATUS[c.status] ?? STATUS.scheduled;
  const KindIcon = kind.icon;
  const StatusIcon = status.icon;

  const handled = c.sentCount + c.skippedCount + c.failedCount;
  const total = c.audienceCount ?? handled;
  const percent = total > 0 ? Math.min(100, Math.round((handled / total) * 100)) : 0;
  const limits = limitText(c);
  const hours = windowLabel(c.sendFrom, c.sendTo);
  const active = c.status === "sending" || c.status === "scheduled";
  // `throttledUntil` z przeszłości znaczy tylko tyle, że silnik nie zdążył
  // jeszcze przepisać wiersza — nie ma sensu straszyć nim człowieka.
  const waiting = active && c.throttledUntil !== null && c.throttledUntil > Date.now();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <KindIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{c.templateName}</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {t("segment „")}
              {c.segmentName}
              {t('" · zlecona ')} {timeOf(c.createdAt)}
              {c.scheduledAt ? t(" · start {v0}", { v0: timeOf(c.scheduledAt) }) : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className={`font-normal gap-1 ${status.className}`}>
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </Badge>
            {active && (
              <Button size="sm" variant="outline" disabled={stopping} onClick={onStop}>
                {stopping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("Zatrzymaj")}
              </Button>
            )}
            {/* Po zatrzymaniu dwie drogi, a nie jedna. „Anuluj" jest wyróżniony
                na czerwono, bo to jedyna nieodwracalna z nich. */}
            {c.status === "paused" && (
              <>
                <Button size="sm" disabled={stopping} onClick={onResume} className="gap-1.5">
                  {stopping ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlayCircle className="h-3.5 w-3.5" />
                  )}

                  {t("Wznów")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-destructive"
                  disabled={stopping}
                  onClick={onKill}
                >
                  <Ban className="h-3.5 w-3.5" /> {t(" Anuluj")}
                </Button>
              </>
            )}
            {/* Raport tej konkretnej wysyłki — otwiera się od razu na niej,
                a nie na liście, na której trzeba jej szukać. */}
            {(c.status === "sent" || c.sentCount > 0) && (
              <Button size="sm" variant="ghost" className="gap-1.5" asChild>
                <Link to="/reports" search={{ send: c.id }}>
                  <BarChart3 className="h-3.5 w-3.5" /> {t(" Raport")}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {total > 0 && (
          <div className="space-y-1.5">
            <Progress value={percent} className="h-2" />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                <strong className="text-foreground">{c.sentCount}</strong> {t(" wysłanych")}
              </span>
              {c.skippedCount > 0 && (
                <span>
                  {c.skippedCount} {t(" pominiętych (brak zgody)")}
                </span>
              )}
              {c.failedCount > 0 && (
                <span className="text-destructive">
                  {c.failedCount} {t(" błędów")}
                </span>
              )}
              <span>
                {t("z ")} {total} {t(" odbiorców")}
              </span>
            </div>
          </div>
        )}

        {(limits || hours) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {hours && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <MoonStar className="h-3.5 w-3.5" /> {t(" wysyłka ")} {hours}
              </span>
            )}
            {limits && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Gauge className="h-3.5 w-3.5" /> {t(" limit ")} {limits}
              </span>
            )}
            {c.perHourLimit !== null && (
              <span className="text-muted-foreground">
                {t("w tej godzinie: ")} {c.hourSentCount}/{c.perHourLimit}
              </span>
            )}
            {c.perDayLimit !== null && (
              <span className="text-muted-foreground">
                {t("dziś: ")} {c.daySentCount}/{c.perDayLimit}
              </span>
            )}
          </div>
        )}

        {waiting && (
          <p className="text-xs rounded-md border bg-muted/40 px-3 py-2">
            {outsideHours(c) ? (
              <>
                {t("Poza godzinami wysyłki — kampania wznowi się")}{" "}
                <strong>{timeOf(c.throttledUntil!)}</strong>
                {t(". To nie jest błąd: czeka na otwarcie okna ")} {hours}.
              </>
            ) : (
              <>
                {t("Limit wyczerpany — wysyłka wznowi się ")}{" "}
                <strong>{timeOf(c.throttledUntil!)}</strong>
                {t(". To nie jest błąd: kampania czeka na wolne miejsce w limicie.")}
              </>
            )}
          </p>
        )}

        {c.error && (
          <p className="text-xs rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
            {c.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
