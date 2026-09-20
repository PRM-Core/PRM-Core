import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  Info,
  Loader2,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getInsights,
  runSupervisorNow,
  updateInsightStatus,
  type InsightView,
} from "@/lib/api/engine.functions";
import { notifyInsightsChanged } from "@/lib/insights-signal";
import { t, localized } from "@/lib/i18n";

// M4: what the PRM_Agent noticed while watching the engine. Deterministic
// detectors run on their own every 15 minutes; the model pass costs money and
// therefore only runs when someone presses the button that says so.

const SEVERITY = localized(
  () =>
    ({
      critical: {
        label: t("Krytyczne"),
        icon: AlertTriangle,
        card: "border-destructive/40 bg-destructive/5",
        badge: "bg-destructive/10 text-destructive border-destructive/20",
      },
      warning: {
        label: t("Ostrzeżenie"),
        icon: ShieldAlert,
        card: "border-warning/40 bg-warning/5",
        badge: "bg-warning/15 text-warning-foreground border-warning/30",
      },
      info: {
        label: t("Informacja"),
        icon: Info,
        card: "border-border",
        badge: "bg-muted text-muted-foreground",
      },
    }) as const,
);

const KIND_LABELS: Record<string, { label: string; icon: typeof TrendingUp }> = localized(() => ({
  performance: { label: t("Wydajność"), icon: TrendingUp },
  security: { label: t("Bezpieczeństwo"), icon: ShieldAlert },
  pattern: { label: t("Wzorzec"), icon: Sparkles },
}));

function severityOf(value: string) {
  return SEVERITY[value as keyof typeof SEVERITY] ?? SEVERITY.info;
}

export function SupervisorPanel() {
  const [insights, setInsights] = useState<InsightView[] | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getInsights()
      .then((data) => setInsights(data.insights))
      .catch(() => setInsights([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const analyse = async (withAi: boolean) => {
    setBusy(true);
    try {
      const result = await runSupervisorNow({ data: { withAi } });
      refresh();
      if (result.aiError) {
        // The sweep still produced its deterministic findings — say what was
        // skipped instead of pretending the whole thing failed.
        toast.warning(t("Przegląd zrobiony, analiza modelem pominięta"), {
          description: result.aiError,
        });
      } else {
        toast.success(t("Przegląd zakończony"), {
          description: t(
            "Sprawdzono {checked} sygnałów · nowych: {created} · zaktualizowanych: {updated}{v3}.",
            {
              checked: result.checked,
              created: result.created,
              updated: result.updated,
              v3:
                result.resolved > 0
                  ? t(" · zamkniętych: {resolved}", { resolved: result.resolved })
                  : "",
            },
          ),
        });
      }
    } catch (err) {
      toast.error(t("Przegląd nie powiódł się"), { description: String(err) });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: "acknowledged" | "dismissed") => {
    setInsights((prev) => prev?.filter((i) => i.id !== id) ?? prev);
    try {
      await updateInsightStatus({ data: { id, status } });
      // Dzwonek w pasku górnym liczy tylko otwarte krytyczne — niech przeliczy
      // teraz, zamiast czekać na swoje odpytanie.
      notifyInsightsChanged();
    } catch {
      refresh();
    }
  };

  const open = insights?.filter((i) => i.status !== "dismissed") ?? [];
  const rank = { critical: 0, warning: 1, info: 2 } as Record<string, number>;
  const sorted = [...open].sort(
    (a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3) || b.updatedAt - a.updatedAt,
  );

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" /> {t(" Nadzorca PRM_Agent")}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {t(
              "Przegląda silnik co 15 minut — bez AI i bez kosztów. Analiza modelem jest na żądanie.",
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => analyse(false)}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {t(" Sprawdź teraz")}
          </Button>
          <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => analyse(true)}>
            <Sparkles className="h-3.5 w-3.5" /> {t(" Analiza z AI")}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {insights === null && (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {insights !== null && sorted.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {t(
              "Nic nie wymaga uwagi. Nadzorca sprawdza nieudane przebiegi, błędy kroków, brakujące szablony i klucze, zablokowane przebiegi, koszty AI oraz anomalie w napływie kontaktów.",
            )}
          </p>
        )}

        {sorted.map((insight) => {
          const severity = severityOf(insight.severity);
          const SeverityIcon = severity.icon;
          const kind = KIND_LABELS[insight.kind] ?? KIND_LABELS.performance;
          return (
            <div key={insight.id} className={`rounded-lg border p-3 ${severity.card}`}>
              <div className="flex items-start gap-3">
                <SeverityIcon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{insight.title}</span>
                    <Badge variant="outline" className={`text-[10px] ${severity.badge}`}>
                      {severity.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">
                      {kind.label}
                    </Badge>
                    {insight.fromAi && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-fuchsia-100 text-fuchsia-700"
                      >
                        {t("AI")}
                      </Badge>
                    )}
                    {insight.status === "acknowledged" && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-muted text-muted-foreground"
                      >
                        {t("przyjęte")}
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {insight.detail}
                  </p>

                  {insight.proposedAction && (
                    <p className="text-xs mt-1.5">
                      <span className="font-medium">{t("Co zrobić: ")} </span>
                      <span className="text-muted-foreground">{insight.proposedAction}</span>
                    </p>
                  )}

                  {Object.keys(insight.evidence).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(insight.evidence).map(([key, value]) => (
                        <span
                          key={key}
                          className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {key.replace(/_/g, " ")}: {value}
                        </span>
                      ))}
                      {insight.seenCount > 1 && (
                        <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
                          {t("widziane ")} {insight.seenCount}×
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 gap-1">
                  {insight.status !== "acknowledged" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={t("Przyjmuję do wiadomości")}
                      onClick={() => setStatus(insight.id, "acknowledged")}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    title={t("Odrzuć — wróci tylko, jeśli sprawa się pogorszy")}
                    onClick={() => setStatus(insight.id, "dismissed")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
