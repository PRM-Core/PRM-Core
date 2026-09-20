import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  Timer,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getEngineOverview, runEngineTick, type EngineOverview } from "@/lib/api/engine.functions";
import { getBookingSchedule, runBookingSyncNow } from "@/lib/api/doctors.functions";
import { toast } from "sonner";
import { intlLocale, t, localized } from "@/lib/i18n";

// Live view of the deterministic engine: is the loop ticking, how much work is
// queued, and what did the last few steps actually do. The log is the honest
// part — every skipped or failed step says so in plain Polish rather than
// disappearing.

const POLL_MS = 4000;

function timeAgo(ms: number): string {
  const seconds = Math.round((Date.now() - ms) / 1000);
  if (seconds < 5) return t("przed chwilą");
  if (seconds < 60) return `${seconds} s temu`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min temu`;
  return new Date(ms).toLocaleString(intlLocale());
}

const KIND_STYLES: Record<string, { label: string; className: string }> = localized(() => ({
  run_started: { label: t("Start"), className: "bg-primary-soft text-primary border-primary/20" },
  run_ended: { label: t("Koniec"), className: "bg-muted text-muted-foreground" },
  action: { label: t("Akcja"), className: "bg-success/15 text-success border-success/20" },
  condition: { label: t("Warunek"), className: "bg-accent text-accent-foreground" },
  delay: { label: t("Opóźnienie"), className: "bg-warning/15 text-warning-foreground" },
  skipped: { label: t("Pominięto"), className: "bg-muted text-muted-foreground" },
  error: {
    label: t("Błąd"),
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  ai: { label: "AI", className: "bg-fuchsia-100 text-fuchsia-700" },
}));

export function EnginePanel() {
  const [data, setData] = useState<EngineOverview | null>(null);
  const [ticking, setTicking] = useState(false);

  const refresh = useCallback(() => {
    getEngineOverview()
      .then(setData)
      .catch(() => {
        /* a hiccup between polls shouldn't blank the panel */
      });
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const handleTick = async () => {
    setTicking(true);
    try {
      await runEngineTick();
      refresh();
    } finally {
      setTicking(false);
    }
  };

  if (!data) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = [
    {
      label: t("Kontakty w trakcie"),
      value: data.runsActive,
      icon: Activity,
      tone: "bg-primary-soft text-primary",
    },
    {
      label: t("Zakończone przebiegi"),
      value: data.runsCompleted,
      icon: CheckCircle2,
      tone: "bg-success/15 text-success",
    },
    {
      label: t("Nieudane przebiegi"),
      value: data.runsFailed,
      icon: AlertTriangle,
      tone: "bg-destructive/10 text-destructive",
    },
    {
      label: t("Kroki w kolejce"),
      value: data.jobsPending,
      icon: Timer,
      tone: "bg-warning/20 text-warning-foreground",
    },
    {
      label: t("Zdarzenia do przetworzenia"),
      value: data.eventsUnprocessed,
      icon: Zap,
      tone: "bg-accent text-accent-foreground",
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary-soft flex items-center justify-center text-primary">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{t("PRM Engine")}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("Silnik wykonuje aktywne automatyzacje — tick co ")}{" "}
                {Math.round(data.intervalMs / 1000)} {t("s.")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {data.running ? (
              <Badge
                variant="outline"
                className="bg-success/10 text-success border-success/20 uppercase text-[10px] tracking-wider"
              >
                <Play className="h-3 w-3 mr-1" /> {t(" Pętla działa")}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-destructive/10 text-destructive border-destructive/20 uppercase text-[10px] tracking-wider"
              >
                <AlertTriangle className="h-3 w-3 mr-1" /> {t(" Pętla zatrzymana")}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleTick}
              disabled={ticking}
            >
              {ticking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}

              {t("Uruchom teraz")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-border p-3 flex items-center gap-3"
              >
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${s.tone}`}>
                  <s.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-semibold tracking-tight leading-tight">
                    {s.value}
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-tight">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {t("Ostatni tick: ")}{" "}
              {data.lastTickAt ? timeAgo(data.lastTickAt) : t("jeszcze nie było")}
            </span>
            <span>
              {t("Wykonanych ticków: ")} {data.ticks}
            </span>
          </div>

          {data.lastError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {t("Ostatni tick zakończył się błędem: ")} {data.lastError}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {t(
              "Silnik żyje tak długo jak proces serwera — po restarcie wznawia pracę z kolejki (kroki opóźnione wykonają się z opóźnieniem, ale nie przepadną).",
            )}
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{t("Dziennik silnika")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.log.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t(
                "Nic jeszcze się nie wydarzyło. Aktywuj automatyzację i wywołaj jej wyzwalacz — kroki pojawią się tutaj.",
              )}
            </p>
          ) : (
            <div className="divide-y">
              {data.log.map((entry) => {
                const style = KIND_STYLES[entry.kind] ?? {
                  label: entry.kind,
                  className: "bg-muted text-muted-foreground",
                };
                return (
                  <div
                    key={entry.id}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-3"
                  >
                    <Badge
                      variant="outline"
                      className={`${style.className} uppercase text-[10px] tracking-wider shrink-0 mt-0.5`}
                    >
                      {style.label}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">{entry.message}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {timeAgo(entry.createdAt)}
                        {entry.contactId
                          ? t(" · kontakt {contactId}", { contactId: entry.contactId })
                          : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <BookingScheduleCard />
    </div>
  );
}

type BookingStatus = Awaited<ReturnType<typeof getBookingSchedule>>;

/**
 * Stan synchronizacji z systemem rezerwacji.
 *
 * Bez tego kafelka jedynym śladem przebiegu był wpis w dzienniku — czyli
 * **wyłącznie to, co się już wydarzyło**, i to tylko gdy doszło do końca.
 * Utknięty albo przerwany cykl wyglądał identycznie jak brak cyklu.
 */
function BookingScheduleCard() {
  const [ic, setIc] = useState<BookingStatus | null>(null);
  const [busy, setBusy] = useState<"" | "patients" | "slots">("");

  const load = useCallback(() => {
    getBookingSchedule()
      .then(setIc)
      .catch(() => setIc(null));
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  async function run(what: "patients" | "slots") {
    setBusy(what);
    try {
      const r = await runBookingSyncNow({ data: { what } });
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    } catch (err) {
      toast.error(String(err).slice(0, 160));
    } finally {
      setBusy("");
      load();
    }
  }

  if (!ic) return null;

  const when = (ms: number) =>
    ms > 0
      ? new Date(ms).toLocaleString(intlLocale(), { dateStyle: "short", timeStyle: "short" })
      : "—";

  return (
    <Card className="border-border/60 shadow-[var(--shadow-card)]">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">{ic.systemName || t("System rezerwacji")}</CardTitle>
        {ic.configured ? (
          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
            {ic.busy ? t("synchronizuje…") : t("połączona")}
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            {t("niepodłączony")}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!ic.configured ? (
          <p className="text-sm text-muted-foreground">
            {t(
              "Nie podłączono systemu rezerwacji — synchronizacja pacjentów, statusów wizyt i grafików lekarzy nie chodzi i nic nie jest odpytywane. Jak podłączyć system: src/lib/booking-system/providers/README.md.",
            )}
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">
                  {t("Pacjenci i wizyty — co ")} {ic.patientsEveryMinutes} {t(" min")}
                </div>
                <div className="mt-1 text-sm font-medium">{when(ic.lastPatientsAt)}</div>
                <div className="text-xs text-muted-foreground">
                  {ic.lastPatientsResult || t("jeszcze nie było przebiegu")}
                </div>
                {/* Powiązywanie idzie w tym samym przebiegu, tuż przed odświeżaniem
                    — bez niego nowy pacjent nigdy nie dostałby statusów z API. */}
                {ic.lastLinkResult ? (
                  <div className="text-xs text-muted-foreground">
                    {t("Powiązania: ")} {ic.lastLinkResult}
                  </div>
                ) : null}
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">
                  {t("Grafiki lekarzy — raz dziennie o ")} {ic.slotsAtHour}:00
                </div>
                <div className="mt-1 text-sm font-medium">{ic.slotsDoneFor || "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {ic.lastSlotsResult || t("jeszcze nie było przebiegu")}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={busy !== "" || ic.busy}
                onClick={() => run("patients")}
              >
                {busy === "patients" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}

                {t("Synchronizuj pacjentów teraz")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={busy !== "" || ic.busy}
                onClick={() => run("slots")}
              >
                {busy === "slots" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}

                {t("Odśwież grafiki")}
              </Button>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("Ręczne uruchomienie ")} <b>{t("omija")}</b>{" "}
              {t(
                ' ograniczenie „nie częściej niż" — cykliczny przebieg i tak pilnuje się sam. Przy kilkuset powiązanych pacjentach synchronizacja trwa kilka minut; okno można zamknąć, leci dalej.',
              )}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
