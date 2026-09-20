import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, CheckCircle2, Loader2, AlertTriangle, Save } from "lucide-react";
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

export function AgentTab() {
  const [data, setData] = useState<AiSettingsView | null>(null);
  const [provider, setProvider] = useState<AiProviderId>("anthropic");
  const [model, setModel] = useState("");
  const [limit, setLimit] = useState("5");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAiSettings().then((view) => {
      setData(view);
      setProvider(view.provider);
      setModel(view.model);
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

  const models = data.models[provider];
  const keyReady = data.keyConfigured[provider];
  const spent = data.spentTodayUsd;
  const limitNum = Number(limit) || 0;
  const usedPct = limitNum > 0 ? Math.min(100, (spent / limitNum) * 100) : 0;

  const handleProviderChange = (next: string) => {
    const id = next as AiProviderId;
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Dostawca")}</Label>
              <Select value={provider} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(data.models) as AiProviderId[]).map((id) => (
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
                ? t("Klucz jest ustawiony. Zmienia się go w Integracje → Klucze i dane dostępowe.")
                : t(
                    "Uzupełnij klucz w Integracje → Klucze i dane dostępowe. Bez klucza silnik działa dalej — pomija tylko węzły Agent AI.",
                  )}
            </p>
          </div>

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
              {t(
                "Po przekroczeniu limitu węzły Agent AI są pomijane (przebieg idzie pierwszą ścieżką i zapisuje to w dzienniku), a deterministyczna część silnika — maile, SMS-y, tagi, lejki — działa dalej bez zmian.",
              )}
            </p>
          </div>

          <div className="flex justify-end">
            <Button className="gap-1.5" onClick={handleSave} disabled={saving || !model}>
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
