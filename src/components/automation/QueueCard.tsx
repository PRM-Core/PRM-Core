import { useCallback, useEffect, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { ListOrdered, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getEngineQueue,
  retryEngineJob,
  type Queue,
  type QueueBucket,
} from "@/lib/api/engine.functions";
import { formatActivityDate } from "@/lib/activity-date";
import { t, localized } from "@/lib/i18n";

// PRM Engine → the queue, as a person reads it: what is scheduled, what waits
// for the sending window or a limit, what waits for an approval, what failed
// and why, what got stuck mid-step. A failed step can be put back; a stuck
// one too, but only after a second click — it may already have sent.

const BUCKETS: QueueBucket[] = ["failed", "stuck", "held", "deferred", "scheduled"];
const LABELS: Record<QueueBucket, string> = localized(() => ({
  failed: t("Nieudane"),
  stuck: t("Przerwane"),
  held: t("Do zatwierdzenia"),
  deferred: t("Odłożone"),
  scheduled: t("Zaplanowane"),
}));
const POLL_MS = 15_000;

export function QueueCard() {
  const { user } = useRouteContext({ from: "__root__" });
  const canRetry = !!user && user.role !== "reporter";
  const [queue, setQueue] = useState<Queue | null>(null);
  const [bucket, setBucket] = useState<QueueBucket>("failed");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getEngineQueue()
      .then(setQueue)
      .catch(() => {
        /* the next poll tries again */
      });
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const retry = async (jobId: string, confirmStuck: boolean) => {
    setBusy(true);
    try {
      await retryEngineJob({ data: { jobId, confirmStuck } });
      toast.success(t("Krok wrócił do kolejki — silnik wykona go przy najbliższym takcie."));
      setConfirming(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const items = queue?.[bucket] ?? [];
  const shown = queue?.counts[bucket] ?? 0;
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-primary-soft flex items-center justify-center text-primary">
          <ListOrdered className="h-5 w-5" />
        </div>
        <div>
          <CardTitle className="text-base">{t("Kolejka kroków")}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(
              "Co silnik ma przed sobą i co poszło nie tak — z powodem. Nieudany krok można ponowić: wraca do kolejki i przechodzi przez te same zgody, limity i godziny wysyłki.",
            )}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {BUCKETS.map((b) => (
            <Button
              key={b}
              size="sm"
              variant={bucket === b ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setBucket(b)}
            >
              {LABELS[b]} · {queue?.counts[b] ?? "…"}
            </Button>
          ))}
        </div>
        {queue && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Pusto.")}</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {items.map((item) => (
              <div key={item.jobId} className="flex flex-wrap items-start gap-3 p-3 text-sm">
                <div className="flex-1 min-w-[220px]">
                  <div className="font-medium">
                    {item.automationName} · {item.contactLabel}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.stepTitle} · {formatActivityDate(item.dueAt)}
                    {item.attempts > 1 ? ` · ${t("próby: {n}", { n: item.attempts })}` : ""}
                  </div>
                  {item.reason && <div className="text-xs mt-0.5">{item.reason}</div>}
                </div>
                {canRetry && (bucket === "failed" || bucket === "stuck") && (
                  <Button
                    size="sm"
                    variant={confirming === item.jobId ? "destructive" : "outline"}
                    className="h-7 gap-1 text-xs"
                    disabled={busy}
                    onClick={() =>
                      bucket === "stuck" && confirming !== item.jobId
                        ? setConfirming(item.jobId)
                        : void retry(item.jobId, bucket === "stuck")
                    }
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {bucket === "stuck" && confirming === item.jobId
                      ? t("Potwierdź — mogła już wyjść wiadomość")
                      : t("Ponów")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {shown > items.length && (
          <p className="text-xs text-muted-foreground">
            {t("Pokazano {n} z {all}.", { n: items.length, all: shown })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
