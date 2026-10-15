import { useEffect, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { Loader2, Moon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getSendWindow, saveSendWindow, type SendWindowView } from "@/lib/api/engine.functions";
import { paceLabel } from "@/lib/campaigns/throttle";
import { t } from "@/lib/i18n";

// PRM Engine → when automation messages may go out. The same window and
// pace campaigns have, for the whole installation: a message step outside
// the window waits for it to open, and past a limit for the next free slot.
// An automation may opt out of the window (a reminder an hour before an
// early visit), never out of the limits.

function limitOrNull(value: string): number | null {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function SendWindowCard() {
  const { user } = useRouteContext({ from: "__root__" });
  const isAdmin = user?.role === "admin";
  const [data, setData] = useState<SendWindowView | null>(null);
  const [windowOn, setWindowOn] = useState(false);
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("20:00");
  const [perHour, setPerHour] = useState("");
  const [perDay, setPerDay] = useState("");
  const [perPatient, setPerPatient] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    getSendWindow().then((d) => {
      setData(d);
      setWindowOn(!!(d.sendFrom && d.sendTo));
      if (d.sendFrom) setFrom(d.sendFrom);
      if (d.sendTo) setTo(d.sendTo);
      setPerHour(d.perHourLimit ? String(d.perHourLimit) : "");
      setPerDay(d.perDayLimit ? String(d.perDayLimit) : "");
      setPerPatient(d.marketingPerWeek ? String(d.marketingPerWeek) : "");
    });
  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveSendWindow({
        data: {
          sendFrom: windowOn ? from : "",
          sendTo: windowOn ? to : "",
          perHourLimit: limitOrNull(perHour),
          perDayLimit: limitOrNull(perDay),
          marketingPerWeek: limitOrNull(perPatient),
        },
      });
      toast.success(t("Godziny wysyłki zapisane."));
      await load();
    } catch (err) {
      toast.error(t("Nie udało się zapisać godzin wysyłki"), { description: String(err) });
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <Card className="border-border/60 shadow-sm">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const hours = data.sendFrom && data.sendTo ? `${data.sendFrom}–${data.sendTo}` : "";
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-primary-soft flex items-center justify-center text-primary">
          <Moon className="h-5 w-5" />
        </div>
        <div>
          <CardTitle className="text-base">{t("Godziny wysyłki automatyzacji")}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hours
              ? t(
                  "Wiadomości automatyzacji wychodzą {hours}. Krok poza tymi godzinami czeka do otwarcia okna; automatyzacja może to wyłączyć dla siebie w edytorze.",
                  { hours },
                )
              : t(
                  "Okno nie jest ustawione — wiadomości automatyzacji wychodzą o każdej porze, także w nocy.",
                )}{" "}
            {t("Dziś wysłano: {n}.", { n: data.sentToday })}
          </p>
        </div>
      </CardHeader>
      {isAdmin && (
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={windowOn} onCheckedChange={setWindowOn} />
              {t("Tylko w godzinach")}
            </label>
            <div className="space-y-1">
              <label htmlFor="send-from" className="block text-xs font-medium">
                {t("od")}
              </label>
              <Input
                id="send-from"
                type="time"
                value={from}
                disabled={!windowOn}
                onChange={(e) => setFrom(e.target.value)}
                className="w-28"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="send-to" className="block text-xs font-medium">
                {t("do")}
              </label>
              <Input
                id="send-to"
                type="time"
                value={to}
                disabled={!windowOn}
                onChange={(e) => setTo(e.target.value)}
                className="w-28"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="send-per-hour" className="block text-xs font-medium">
                {t("Na godzinę")}
              </label>
              <Input
                id="send-per-hour"
                inputMode="numeric"
                placeholder={t("bez limitu")}
                value={perHour}
                onChange={(e) => setPerHour(e.target.value)}
                className="w-28"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="send-per-day" className="block text-xs font-medium">
                {t("Na dobę")}
              </label>
              <Input
                id="send-per-day"
                inputMode="numeric"
                placeholder={t("bez limitu")}
                value={perDay}
                onChange={(e) => setPerDay(e.target.value)}
                className="w-28"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="send-per-patient" className="block text-xs font-medium">
                {t("Marketing na pacjenta / 7 dni")}
              </label>
              <Input
                id="send-per-patient"
                inputMode="numeric"
                placeholder={t("bez limitu")}
                value={perPatient}
                onChange={(e) => setPerPatient(e.target.value)}
                className="w-28"
              />
            </div>
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              {t("Zapisz")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "Limity liczą wiadomości wszystkich automatyzacji razem, e-mail i SMS; tempo: {pace}. Kampanie mają własne limity w Wysyłkach.",
              { pace: paceLabel(limitOrNull(perHour)) },
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Marketing na pacjenta: ile wiadomości marketingowych jeden pacjent może dostać w ciągu 7 dni — ze wszystkich automatyzacji i kampanii razem. Krok automatyzacji ponad limit jest pomijany, przebieg idzie dalej. Wiadomości administracyjne (przypomnienia o wizycie) nie liczą się nigdy; kampanie liczą się, ale nie są wstrzymywane.",
            )}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
