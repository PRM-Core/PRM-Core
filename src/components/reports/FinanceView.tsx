import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getFinanceView, saveUnitPricesFn } from "@/lib/api/roles.functions";
import { intlLocale, localized, t } from "@/lib/i18n";

/**
 * Finance: what went out, what it cost, what the visits brought and what
 * no-shows lost — the last 30 days against the 30 before. A cost needs a
 * unit price; until an administrator sets one, it is shown as not set, not
 * as zero.
 */

type Data = Awaited<ReturnType<typeof getFinanceView>>;

const SOURCE: Record<string, string> = localized(() => ({
  "email:campaign": t("E-mail — kampanie"),
  "email:other": t("E-mail — automatyzacje, skrzynka, testy"),
  "sms:automation": t("SMS — automatyzacje"),
  "sms:campaign": t("SMS — kampanie"),
  "sms:other": t("SMS — pozostałe"),
}));

function zl(grosze: number | null): string {
  if (grosze === null) return "—";
  return (grosze / 100).toLocaleString(intlLocale(), { style: "currency", currency: "PLN" });
}

function Delta({ now, before }: { now: number | null; before: number | null }) {
  if (now === null || before === null || before === 0)
    return <span className="text-[11px] text-muted-foreground">{t("brak porównania")}</span>;
  const d = Math.round(((now - before) / before) * 100);
  return (
    <span className="text-[11px] text-muted-foreground">
      {t("{d}% wobec poprzednich 30 dni", { d: d > 0 ? `+${d}` : String(d) })}
    </span>
  );
}

export function FinanceView({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [sms, setSms] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    getFinanceView().then((d) => {
      setData(d);
      setSms(d.prices.smsPartGrosze ? (d.prices.smsPartGrosze / 100).toFixed(2) : "");
      setEmail(d.prices.emailPer1000Grosze ? (d.prices.emailPer1000Grosze / 100).toFixed(2) : "");
    });
  useEffect(() => {
    void load();
  }, []);

  if (!data)
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );

  const save = async () => {
    setSaving(true);
    try {
      const toGrosze = (v: string) => Math.round((Number(v.replace(",", ".")) || 0) * 100);
      await saveUnitPricesFn({
        data: { smsPartGrosze: toGrosze(sms), emailPer1000Grosze: toGrosze(email) },
      });
      toast.success(t("Ceny zapisane."));
      await load();
    } catch (err) {
      toast.error(t("Nie udało się zapisać cen"), { description: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const v = data.visits;
  const tiles = [
    {
      label: t("Koszt komunikacji"),
      value: zl(data.totalCost),
      hint:
        data.totalCost === null ? (
          <span className="text-[11px] text-muted-foreground">
            {t("ustaw ceny kanałów poniżej")}
          </span>
        ) : (
          <Delta now={data.totalCost} before={data.totalCostPrevious} />
        ),
    },
    {
      label: t("Przychód z odbytych wizyt"),
      value: zl(v.revenue),
      hint: <Delta now={v.revenue} before={v.revenuePrevious} />,
    },
    {
      label: t("Utracone na nieobecnościach"),
      value: zl(v.lostRevenue),
      hint: (
        <span className="text-[11px] text-muted-foreground">
          {t("{n} nieobecności", { n: v.noShows })}
        </span>
      ),
    },
    {
      label: t("Koszt komunikacji na odbytą wizytę"),
      value: zl(data.costPerVisit),
      hint: (
        <span className="text-[11px] text-muted-foreground">
          {t("{n} odbytych wizyt", { n: v.completed })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t(
          "Ostatnie {n} dni wobec poprzednich {n}. Koszt liczony z cen jednostkowych ustawionych niżej; przychód — z cen wizyt podanych przy rezerwacji.",
          { n: data.windowDays },
        )}
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((k) => (
          <Card key={k.label} className="border-border/60 shadow-[var(--shadow-card)]">
            <CardContent className="p-5 space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                {k.label}
              </p>
              <p className="text-2xl font-semibold tracking-tight">{k.value}</p>
              {k.hint}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("Wolumeny i koszt per kanał")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Kanał")}</TableHead>
                  <TableHead className="text-right">{t("Wysłano")}</TableHead>
                  <TableHead className="text-right">{t("Poprzednio")}</TableHead>
                  <TableHead className="text-right">{t("Części SMS")}</TableHead>
                  <TableHead className="text-right">{t("Koszt")}</TableHead>
                  <TableHead className="text-right">{t("Poprzednio")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.channels.map((c) => (
                  <TableRow key={`${c.channel}:${c.source}`}>
                    <TableCell>
                      {SOURCE[`${c.channel}:${c.source}`] ?? `${c.channel} — ${c.source}`}
                    </TableCell>
                    <TableCell className="text-right">{c.sent}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{c.previous}</TableCell>
                    <TableCell className="text-right">
                      {c.channel === "sms" ? c.parts : "—"}
                    </TableCell>
                    <TableCell className="text-right">{zl(c.cost)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {zl(c.costPrevious)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {data.unicodeSmsShare !== null && data.unicodeSmsShare > 0 && (
            <p className="text-xs text-muted-foreground">
              {t(
                "{p} SMS-ów zawiera polskie znaki — operator liczy wtedy części po 70 znaków zamiast 160. Szablony bez ogonków są nawet o połowę tańsze.",
                { p: `${Math.round(data.unicodeSmsShare * 100)}%` },
              )}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {data.aiCostUsd > 0
              ? t("Koszt modelu językowego: {v} USD.", { v: data.aiCostUsd.toFixed(2) })
              : t("Model językowy: 0 zł — działa w sieci placówki albo jest wyłączony.")}
          </p>
          {v.unpriced > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("{n} rozstrzygniętych wizyt bez ceny — nie są wliczone do przychodu.", {
                n: v.unpriced,
              })}
            </p>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("Ceny kanałów")}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t(
                "Z faktury operatora. Puste = nieustawione — koszt pokazujemy jako brak danych, nie zero.",
              )}
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label htmlFor="price-sms-part" className="block text-xs font-medium">
                {t("Część SMS (zł)")}
              </label>
              <Input
                id="price-sms-part"
                value={sms}
                onChange={(e) => setSms(e.target.value)}
                className="w-32"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="price-email-1000" className="block text-xs font-medium">
                {t("1000 e-maili (zł)")}
              </label>
              <Input
                id="price-email-1000"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-32"
                inputMode="decimal"
              />
            </div>
            <Button size="sm" className="gap-1.5" disabled={saving} onClick={() => void save()}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {t("Zapisz ceny")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
