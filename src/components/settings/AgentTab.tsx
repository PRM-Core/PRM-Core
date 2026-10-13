import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, CheckCircle2, Loader2, AlertTriangle, Save, ShieldCheck, Power } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAiSettings, saveAiSettings, type AiSettingsView } from "@/lib/api/ai.functions";
import { PROVIDER_LABELS } from "@/lib/ai/provider-labels";
import { KnowledgeBase } from "@/components/settings/KnowledgeBase";
import type { AiProviderId } from "@/lib/db/schema";
import { t } from "@/lib/i18n";

// Ustawienia → PRM_Agent: which model the AI node runs on, whether its key is
// present, and how much it may spend per day. Keys themselves are never shown
// or edited here — they live in .env, same as SendGrid and Twilio.
//
// The data boundary (PRM_AI_MODE) is shown, not edited: it is a decision
// about where patient-related text may go, so it belongs to whoever runs
// the server, in .env, not to a settings form.

type HostedProviderId = Exclude<AiProviderId, "local">;

/** What the current mode means, in one sentence the administrator reads. */
function BoundaryCard({ data }: { data: AiSettingsView }) {
  if (data.mode === "off") {
    return (
      <div className="rounded-lg border border-border p-3 flex items-start gap-3">
        <Power className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="text-sm">
          <p className="font-medium">{t("PRM_Agent jest wyłączony (PRM_AI_MODE=off)")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t(
              "Żadne zapytanie do modelu nie wychodzi z serwera. Automatyzacje, segmenty i wysyłki działają bez zmian. Aby włączyć AI, ustaw w .env PRM_AI_MODE=local z modelem w sieci placówki (PRM_AI_LOCAL_URL, PRM_AI_LOCAL_MODEL) albo PRM_AI_MODE=hosted.",
            )}
          </p>
        </div>
      </div>
    );
  }
  if (data.mode === "local") {
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
                  {
                    host: data.local.host,
                    klasa: data.local.hostClass,
                    model: data.local.model,
                  },
                )
              : data.local.hostClass === "public" && data.local.host
                ? t(
                    "Adres {host} jest poza siecią placówki — wywołania są odrzucane. Użyj adresu lokalnego albo dopisz host do PRM_AI_EGRESS_ALLOW.",
                    {
                      host: data.local.host,
                    },
                  )
                : t(
                    "Brak PRM_AI_LOCAL_URL albo PRM_AI_LOCAL_MODEL w .env — funkcje AI nie działają, reszta systemu tak.",
                  )}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-start gap-3">
      <AlertTriangle className="h-4 w-4 mt-0.5 text-warning-foreground shrink-0" />
      <div className="text-sm">
        <p className="font-medium">{t("Dostawca zewnętrzny (PRM_AI_MODE=hosted)")}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {t(
            "Prompty wychodzą do wybranego dostawcy. Przed wysłaniem system zamienia nazwiska, e-maile, telefony i numery PESEL na symbole zastępcze — model nie wie, o kim pisze. Jeśli dane mają w ogóle nie opuszczać serwera, przełącz na PRM_AI_MODE=local.",
          )}
        </p>
      </div>
    </div>
  );
}

export function AgentTab() {
  const [data, setData] = useState<AiSettingsView | null>(null);
  const [provider, setProvider] = useState<HostedProviderId>("anthropic");
  const [model, setModel] = useState("");
  const [limit, setLimit] = useState("5");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAiSettings().then((view) => {
      setData(view);
      if (view.provider !== "local") {
        setProvider(view.provider);
        setModel(view.model);
      }
      setLimit(String(view.dailyLimitUsd));
    });
  }, []);

  if (!data) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hostedIds = (Object.keys(data.models) as AiProviderId[]).filter(
    (id): id is HostedProviderId => id !== "local",
  );
  const models = data.models[provider];
  const keyReady = data.keyConfigured[provider];
  const spent = data.spentTodayUsd;
  const limitNum = Number(limit) || 0;
  const usedPct = limitNum > 0 ? Math.min(100, (spent / limitNum) * 100) : 0;
  const hostedChoice = data.mode === "hosted";

  const handleProviderChange = (next: string) => {
    const id = next as HostedProviderId;
    setProvider(id);
    // Model ids don't carry across providers — reset to that provider's first.
    setModel(data.models[id][0]?.id ?? "");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAiSettings({ data: { provider, model, dailyLimitUsd: limitNum } });
      const view = await getAiSettings();
      setData(view);
      toast.success(t("Zapisano ustawienia PRM_Agent"));
    } catch (err) {
      toast.error(t("Nie udało się zapisać ustawień"), { description: String(err) });
    } finally {
      setSaving(false);
    }
  };

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
              {t("Model, na którym działa węzeł Agent AI w automatyzacjach.")}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <BoundaryCard data={data} />

          {hostedChoice && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("Dostawca")}</Label>
                  <Select value={provider} onValueChange={handleProviderChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {hostedIds.map((id) => (
                        <SelectItem key={id} value={id}>
                          {PROVIDER_LABELS[id]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("Model")}</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("Wybierz…")} />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label} — ${m.inputPerMTok}/${m.outputPerMTok} {t(" za MTok")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  {keyReady ? (
                    <Badge
                      variant="outline"
                      className="bg-success/10 text-success border-success/20 uppercase text-[10px] tracking-wider"
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" /> {t(" Klucz skonfigurowany")}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-warning/15 text-warning-foreground border-warning/30 uppercase text-[10px] tracking-wider"
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" /> {t(" Brak klucza")}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {keyReady
                    ? t(
                        "Klucz jest ustawiony. Zmienia się go w Integracje → Klucze i dane dostępowe.",
                      )
                    : t(
                        "Uzupełnij klucz w Integracje → Klucze i dane dostępowe. Bez klucza silnik działa dalej — pomija tylko węzły Agent AI.",
                      )}
                </p>
              </div>
            </>
          )}

          <div className="space-y-2">
            <div className="flex items-end gap-3">
              <div className="space-y-1.5 w-40">
                <Label className="text-xs">{t("Dzienny limit kosztów (USD)")}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </div>
              <div className="flex-1 pb-1">
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>{t("Wydano dzisiaj")}</span>
                  <span className="font-medium">
                    ${spent.toFixed(4)} / ${limitNum.toFixed(2)}
                  </span>
                </div>
                <Progress value={usedPct} className="h-2" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {data.mode === "local"
                ? t(
                    "Model lokalny nie kosztuje nic za token, więc limit dotyczy tylko dostawców zewnętrznych. Zostaje na wypadek przełączenia trybu.",
                  )
                : t(
                    "Po przekroczeniu limitu węzły Agent AI są pomijane (przebieg idzie pierwszą ścieżką i zapisuje to w dzienniku), a deterministyczna część silnika — maile, SMS-y, tagi, lejki — działa dalej bez zmian.",
                  )}
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              className="gap-1.5"
              onClick={handleSave}
              disabled={saving || (hostedChoice && !model)}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}

              {t("Zapisz")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <KnowledgeBase />
    </div>
  );
}
