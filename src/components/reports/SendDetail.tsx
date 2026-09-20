import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSendReportDetail, type SendReportDetail } from "@/lib/api/reports.functions";
import { count } from "@/lib/plural";
import { dateTime, num, pageMath, pct, zloty, NO_DATA } from "./format";
import { t as tr } from "@/lib/i18n";

/**
 * Raport pojedynczej wysyłki.
 *
 * Układ z projektu placówki (makieta z Lovable), liczby z bazy. Wszędzie, gdzie
 * makieta zakładała dane, których nie zbieramy, kafelek pokazuje **kreskę
 * i powód** zamiast wyliczonej z niczego wartości — patrz `format.ts`.
 */

function Metric({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${warn ? "text-amber-600" : ""}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/**
 * Stronicowanie listy odbiorców.
 *
 * **Osobny stan dla każdej zakładki**, bo przełączenie z „Otworzyli" na
 * „Wszyscy" przy zapamiętanej stronie 4 pokazywałoby ludzi z zupełnie innego
 * miejsca listy — a wygląda to jak błąd danych, nie jak zachowanie interfejsu.
 */
function Paged<T>({ rows, children }: { rows: T[]; children: (visible: T[]) => React.ReactNode }) {
  const [page, setPage] = useState(0);
  const { page: current, pages, from, to } = pageMath(rows.length, page);
  const visible = rows.slice(from, to);

  return (
    <div className="space-y-3">
      {children(visible)}
      {pages > 1 && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground tabular-nums">
            {from + 1}–{to} {tr(" z ")} {rows.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> {tr(" Wstecz")}
            </Button>
            <span className="px-1 tabular-nums text-muted-foreground">
              {current + 1} / {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              {tr("Dalej ")} <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Eksport listy odbiorców. Średnik i BOM — inaczej Excel po polsku rozjeżdża kolumny. */
function exportCsv(report: SendReportDetail) {
  // **Z „nie wysłano" włącznie.** Plik z samymi odbiorcami odpowiadałby na
  // pytanie „kto dostał", a przy analizie zasięgu równie ważne jest „kto nie".
  const head = [
    tr("Imię i nazwisko"),
    "Kontakt",
    "Status",
    tr("Otworzył"),
    tr("Kliknął"),
    tr("Kliknięty adres"),
  ];
  const quote = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    ...report.recipients.map((r) =>
      [
        r.name,
        r.email,
        tr("wysłano"),
        dateTime(r.openedAt),
        dateTime(r.clickedAt),
        r.clickedUrl ?? "",
      ]
        .map(quote)
        .join(";"),
    ),
    ...report.notSent.map((r) => [r.name, r.email, r.reason, "", "", ""].map(quote).join(";")),
  ];
  const csv = "﻿" + [head.join(";"), ...lines].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}-odbiorcy.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function SendDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [report, setReport] = useState<SendReportDetail | null | "loading">("loading");

  useEffect(() => {
    setReport("loading");
    getSendReportDetail({ data: { id } })
      .then(setReport)
      .catch(() => setReport(null));
  }, [id]);

  const opened = useMemo(
    () => (report && report !== "loading" ? report.recipients.filter((r) => r.openedAt) : []),
    [report],
  );
  const clicked = useMemo(
    () => (report && report !== "loading" ? report.recipients.filter((r) => r.clickedAt) : []),
    [report],
  );

  if (report === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!report) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">{tr("Nie ma takiej wysyłki.")}</p>
        <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> {tr(" Wszystkie wysyłki")}
        </Button>
      </div>
    );
  }

  const tabs = [
    { key: "opened", label: tr("Otworzyli ({length})", { length: opened.length }), rows: opened },
    { key: "clicked", label: tr("Kliknęli ({length})", { length: clicked.length }), rows: clicked },
    {
      key: "all",
      label: tr("Wszyscy ({length})", { length: report.recipients.length }),
      rows: report.recipients,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1 gap-1.5 text-muted-foreground"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" /> {tr(" Wszystkie wysyłki")}
          </Button>
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{report.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="font-normal">
              {report.channel}
            </Badge>
            <span>
              {tr("Segment: ")} {report.segmentName || NO_DATA} ({num(report.segmentSize)})
            </span>
            <span>
              {tr("· Wysłano: ")} {dateTime(report.sentAt)}
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={report.recipients.length === 0 && report.notSent.length === 0}
          onClick={() => exportCsv(report)}
        >
          <Download className="h-4 w-4" /> {tr(" Eksport CSV")}
        </Button>
      </div>

      {!report.hasDeliveryData && report.channel !== "sms" && (
        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p className="leading-relaxed">
            <b>{tr("Brak danych o doręczeniach.")}</b>{" "}
            {tr(
              " Odbicia, dostarczone i zgłoszenia spamu zna wyłącznie serwer pocztowy. Wklej adres z ",
            )}{" "}
            <b>{tr("Integracje → SendGrid — zdarzenia doręczenia")}</b>{" "}
            {tr(
              " w SendGrid → Settings → Mail Settings → Event Webhook. Do tego czasu OR i CTR liczą się od wysłanych, nie od dostarczonych — czyli są ",
            )}{" "}
            <b>{tr("lekko zaniżone")}</b>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Metric
          label={tr("Segment")}
          value={num(report.segmentSize)}
          sub={tr("w chwili wysyłki")}
        />
        <Metric
          label={tr("Wysłane")}
          value={num(report.sent)}
          sub={
            report.delivered === null
              ? "dostarczone: brak danych"
              : `dostarczone ${num(report.delivered)}`
          }
        />
        <Metric
          label="OR"
          value={pct(report.openRate)}
          sub={`${num(report.uniqueOpens)} unikalnych`}
        />
        <Metric
          label="CTR"
          value={pct(report.clickRate)}
          sub={`${num(report.uniqueClicks)} unikalnych`}
        />
        <Metric label="CTOR" value={pct(report.clickToOpenRate)} sub="klik / otwarcie" />
        <Metric
          label={tr("Bounce rate")}
          value={pct(report.bounceRate)}
          sub={
            report.bounced === null
              ? "wymaga webhooka"
              : tr("{v0} odrzuceń", { v0: num(report.bounced) })
          }
          warn={report.bounceRate !== null && report.bounceRate > 0.05}
        />
        <Metric
          label={tr("Wypisy")}
          value={num(report.unsubscribed)}
          sub={report.unsubscribed === null ? "wymaga webhooka" : tr("osób")}
        />
        <Metric
          label={tr("Konwersje")}
          value={num(report.conversions)}
          sub={
            report.conversionsWithoutPrice > 0
              ? `${zloty(report.revenueGrosze)} · ${count(report.conversionsWithoutPrice, "wizyta bez ceny", "wizyty bez ceny", "wizyt bez ceny")}`
              : zloty(report.revenueGrosze)
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-border/60 shadow-[var(--shadow-card)] lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{tr("Otwarcia i kliknięcia w czasie")}</CardTitle>
          </CardHeader>
          <CardContent>
            {report.hourly.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {tr("Nikt jeszcze nie otworzył tej wiadomości.")}
              </p>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.hourly}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    {/* Godziny OD WYSYŁKI, nie pora dnia: wysyłka rozłożona
                        limitami trwa godzinami, więc „o 10:00" nic nie znaczy. */}
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(h: number) => `+${h} h`}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <ReTooltip
                      labelFormatter={(h) => tr("{h} h po wysyłce", { h: h })}
                      formatter={(v: number, n) => [
                        v,
                        n === "opens" ? "otwarcia" : tr("kliknięcia"),
                      ]}
                    />
                    <Bar dataKey="opens" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="clicks" fill="var(--chart-2, #5C7080)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">{tr("Najczęściej klikane")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.links.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {tr("Żaden odnośnik nie został jeszcze kliknięty.")}
              </p>
            ) : (
              report.links.map((l) => (
                <div key={l.url} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate" title={l.url}>
                    {l.url}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{l.clicks}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">{tr("Odbiorcy")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="opened">
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                </TabsTrigger>
              ))}
              <TabsTrigger value="notsent">
                {tr("Nie wysłano (")}
                {report.notSent.length})
              </TabsTrigger>
            </TabsList>
            {tabs.map((t) => (
              <TabsContent key={t.key} value={t.key} className="mt-4">
                {t.rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">{tr("Pusto.")}</p>
                ) : (
                  <Paged rows={t.rows}>
                    {(visible) => (
                      <div className="overflow-auto rounded-lg border border-border/60">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 font-medium">{tr("Kontakt")}</th>
                              <th className="px-3 py-2 font-medium">{tr("Otworzył")}</th>
                              <th className="px-3 py-2 font-medium">{tr("Kliknął")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visible.map((r) => (
                              <tr key={r.email} className="border-b border-border/40 last:border-0">
                                <td className="px-3 py-2">
                                  <div>{r.name}</div>
                                  <div className="text-[11px] text-muted-foreground">{r.email}</div>
                                </td>
                                <td className="px-3 py-2 text-xs tabular-nums">
                                  {dateTime(r.openedAt)}
                                </td>
                                <td className="px-3 py-2 text-xs tabular-nums">
                                  {dateTime(r.clickedAt)}
                                  {r.clickedUrl && (
                                    <div className="max-w-[220px] truncate text-[11px] text-muted-foreground">
                                      {r.clickedUrl}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Paged>
                )}
              </TabsContent>
            ))}

            {/* „Nie wysłano" ma inną kolumnę (powód zamiast czasów), więc jest
                osobną zakładką, a nie czwartym wariantem tej samej tabeli. */}
            <TabsContent value="notsent" className="mt-4">
              {report.notSent.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {tr("Wiadomość wyszła do wszystkich z segmentu.")}
                </p>
              ) : (
                <>
                  <p className="mb-3 rounded-lg bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    <b>{tr("Segment liczony jest dziś, nie w chwili wysyłki")}</b>{" "}
                    {tr(
                      " — audytorium nie jest nigdzie zapisywane, mamy tylko jego liczebność. Kto wszedł do segmentu po wysyłce, pojawi się tutaj, choć wtedy go nie było. Powód też jest odczytywany teraz: zgodę pacjent mógł cofnąć już po wysyłce.",
                    )}
                  </p>
                  <Paged rows={report.notSent}>
                    {(visible) => (
                      <div className="overflow-auto rounded-lg border border-border/60">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 font-medium">{tr("Kontakt")}</th>
                              <th className="px-3 py-2 font-medium">{tr("Dlaczego nie wyszła")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visible.map((r) => (
                              <tr
                                key={r.contactId}
                                className="border-b border-border/40 last:border-0"
                              >
                                <td className="px-3 py-2">
                                  <div>{r.name}</div>
                                  <div className="text-[11px] text-muted-foreground">{r.email}</div>
                                </td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                  {r.reason}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Paged>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
