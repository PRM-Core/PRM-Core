import { useEffect, useState } from "react";
import { Bot, Loader2, AlertTriangle, ShieldCheck, Power } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAiSettings, saveDailyCallLimitFn, type AiSettingsView } from "@/lib/api/ai.functions";
import { useRouteContext } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { KnowledgeBase } from "@/components/settings/KnowledgeBase";
import { t } from "@/lib/i18n";

// Ustawienia → PRM_Agent: where the language layer runs, shown, not edited.
// The data boundary (PRM_AI_MODE) is a decision about where patient-related
// text may go, so it belongs to whoever runs the server, in .env, not to a
// settings form — and since 2.0.0 the only place it can go is a model inside
// the clinic's own network. Which capabilities the agent may use is decided
// on the PRM_Agent screen, under "Kierunki".

/** What the current mode means, in one sentence the administrator reads. */
function BoundaryCard({ data }: { data: AiSettingsView }) {
  if (data.mode === "off") {
    return (
      <div className="rounded-lg border border-border p-3 flex items-start gap-3">
        <Power className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="text-sm">
          <p className="font-medium">{t("Model językowy wyłączony (PRM_AI_MODE=off)")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t(
              "Żadne zapytanie do modelu nie wychodzi z serwera. Sygnały, przewidywania, rekomendacje, listy, drafty z szablonu i brief działają bez modelu. Aby włączyć warstwę językową, wskaż w .env serwer modelu w sieci placówki: PRM_AI_LOCAL_URL i PRM_AI_LOCAL_MODEL.",
            )}
          </p>
        </div>
      </div>
    );
  }
  const ok = data.local.configured;
  return (
    <div className="rounded-lg border border-border p-3 flex items-start gap-3">
      <ShieldCheck
        className={`h-4 w-4 mt-0.5 shrink-0 ${ok ? "text-success" : "text-warning-foreground"}`}
      />
      <div className="text-sm">
        <p className="font-medium">{t("Model w sieci placówki (PRM_AI_MODE=local)")}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {ok
            ? t(
                "Serwer modelu: {host} ({klasa}), model: {model}. Dane pacjentów nie opuszczają sieci placówki; prompty i tak nie zawierają nazwisk, e-maili, telefonów ani numerów PESEL.",
                { host: data.local.host, klasa: data.local.hostClass, model: data.local.model },
              )
            : data.local.hostClass === "public" && data.local.host
              ? t(
                  "Adres {host} jest poza siecią placówki — wywołania są odrzucane. Użyj adresu lokalnego albo dopisz host do PRM_AI_EGRESS_ALLOW.",
                  { host: data.local.host },
                )
              : t(
                  "Brak PRM_AI_LOCAL_URL albo PRM_AI_LOCAL_MODEL w .env — funkcje językowe nie działają, reszta agenta tak.",
                )}
        </p>
      </div>
    </div>
  );
}

export function AgentTab() {
  const [data, setData] = useState<AiSettingsView | null>(null);
  const [limit, setLimit] = useState("");
  const [saving, setSaving] = useState(false);
  const { user } = useRouteContext({ from: "__root__" });
  const isAdmin = user?.role === "admin";

  const load = () =>
    getAiSettings().then((d) => {
      setData(d);
      setLimit(String(d.dailyCallLimit));
    });
  useEffect(() => {
    void load();
  }, []);

  const saveLimit = async () => {
    setSaving(true);
    try {
      await saveDailyCallLimitFn({ data: { limit: Math.max(0, Math.round(Number(limit) || 0)) } });
      toast.success(t("Limit zapisany."));
      await load();
    } catch (err) {
      toast.error(t("Nie udało się zapisać limitu"), { description: String(err) });
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary-soft flex items-center justify-center text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">{t("PRM_Agent")}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                "Gdzie działa warstwa językowa agenta. Jedyna możliwość: model w sieci placówki — produkt nie ma dostawców zewnętrznych.",
              )}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <BoundaryCard data={data} />
          {data.stale.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-warning-foreground shrink-0" />
              <div className="text-sm">
                <p className="font-medium">{t("Pozostałości po wersjach sprzed 2.0.0 w .env")}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(
                    "Produkt nie używa: {list}. Usuń te wpisy — nic ich nie czyta, a klucz dostawcy zewnętrznego nie powinien leżeć na serwerze.",
                    { list: data.stale.join(", ") },
                  )}
                </p>
              </div>
            </div>
          )}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t("Limit uruchomień modelu na dobę")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    "Czas modelu w sieci placówki jest ograniczony: po przekroczeniu limitu kroki z modelem są pomijane do północy (węzły agenta idą pierwszą ścieżką), reszta systemu działa. Każda automatyzacja ma też własny limit w edytorze.",
                  )}
                </p>
              </div>
              {isAdmin && (
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <label htmlFor="ai-call-limit" className="block text-xs font-medium">
                      {t("Uruchomień na dobę")}
                    </label>
                    <Input
                      id="ai-call-limit"
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                      className="w-28"
                      inputMode="numeric"
                    />
                  </div>
                  <Button size="sm" disabled={saving} onClick={() => void saveLimit()}>
                    {t("Zapisz")}
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Progress
                value={
                  data.dailyCallLimit > 0
                    ? Math.min(100, (data.callsToday / data.dailyCallLimit) * 100)
                    : 100
                }
                className="h-2 flex-1"
              />
              <span>
                {t("dziś {used} z {limit}", { used: data.callsToday, limit: data.dailyCallLimit })}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "Co agent może robić z modelem — pisać treść draftów, wygładzać brief, oceniać wiadomości — włącza administrator na ekranie PRM_Agent → Kierunki. Agent sam proponuje, kiedy ma do tego podstawy.",
            )}
          </p>
        </CardContent>
      </Card>

      <KnowledgeBase />
    </div>
  );
}
