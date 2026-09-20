import { useEffect, useState } from "react";
import { Loader2, Mail, MessageSquare, Newspaper, AppWindow, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSendReportsList, type SendReportSummary } from "@/lib/api/reports.functions";
import { pct, num, dateTime, NO_DATA } from "./format";
import { t, localized } from "@/lib/i18n";

/**
 * Lista wysyłek z podstawowymi wskaźnikami.
 *
 * Jedna tabela dla wszystkich kanałów, bo pytanie „która wysyłka zadziałała"
 * nie zna podziału na e-mail i SMS. Kanał jest kolumną, nie osobną zakładką.
 *
 * Puste komórki (`—`) znaczą **brak danych**, nie zero — przy SMS-ie nie ma
 * otwarć z natury kanału, a bounce rate nie istnieje, dopóki nie wpięto Event
 * Webhooka SendGrida.
 */

const CHANNEL = localized(
  () =>
    ({
      email: { label: t("E-mail"), icon: Mail },
      newsletter: { label: t("Newsletter"), icon: Newspaper },
      sms: { label: "SMS", icon: MessageSquare },
      popup: { label: t("Pop-up"), icon: AppWindow },
    }) as const,
);

const STATUS_LABEL: Record<string, string> = localized(() => ({
  scheduled: "zaplanowana",
  sending: "w trakcie",
  sent: t("wysłana"),
  cancelled: "anulowana",
  failed: "nieudana",
}));

export function SendsList({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<SendReportSummary[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    getSendReportsList()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (rows === null) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtered = rows.filter((r) =>
    `${r.name} ${r.segmentName}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  if (rows.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {t("Nie ma jeszcze żadnej wysyłki do segmentu. Raport powstaje sam, gdy pierwsza wyjdzie.")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder={t("Szukaj po nazwie wiadomości albo segmencie…")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />

      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">{t("Wysyłka")}</th>
              <th className="px-3 py-2 font-medium">{t("Kanał")}</th>
              <th className="px-3 py-2 font-medium">{t("Segment")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Wysłane")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("OR")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("CTR")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Odbicia")}</th>
              <th className="px-3 py-2 font-medium">{t("Kiedy")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const meta = CHANNEL[r.channel as keyof typeof CHANNEL] ?? CHANNEL.email;
              return (
                <tr
                  key={r.id}
                  onClick={() => onOpen(r.id)}
                  className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-accent/40"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{r.name}</div>
                    <Badge variant="outline" className="mt-0.5 font-normal text-[10px]">
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <meta.icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {meta.label}
                    </span>
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2.5 text-xs text-muted-foreground">
                    {r.segmentName || NO_DATA}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(r.sent)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pct(r.openRate)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pct(r.clickRate)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pct(r.bounceRate)}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {dateTime(r.sentAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={t("Otwórz raport")}
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {t("Kreska znaczy ")} <b>{t("brak danych")}</b>
        {t(
          ", nie zero. SMS nie ma otwarć z natury kanału; odbicia wymagają wpiętego Event Webhooka SendGrida (Integracje → SendGrid — zdarzenia doręczenia).",
        )}
      </p>
    </div>
  );
}
