import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SendsList } from "@/components/reports/SendsList";
import { SendDetail } from "@/components/reports/SendDetail";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { getReports, type ReportsData } from "@/lib/api/reports.functions";
import { CustomReports } from "@/components/reports/custom/CustomReports";
import { isReadOnlyRole } from "@/lib/auth/roles";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: t("Reports — PRM Core") }] }),
  // `?send=<id>` otwiera raport konkretnej wysyłki od razu — tak wchodzi się
  // tu z listy Wysyłek, zamiast szukać jej ponownie na liście raportów.
  validateSearch: (search: Record<string, unknown>): { send?: string } => ({
    send: typeof search.send === "string" ? search.send : undefined,
  }),
  component: ReportsPage,
});

const COLORS = [
  "oklch(0.58 0.18 250)",
  "oklch(0.68 0.16 220)",
  "oklch(0.72 0.14 180)",
  "oklch(0.65 0.16 160)",
  "oklch(0.78 0.15 75)",
];

const CHART_STYLE = {
  borderRadius: 12,
  border: "1px solid oklch(0.92 0.012 240)",
  fontSize: 12,
};

function ReportsPage() {
  const { user } = useRouteContext({ from: "__root__" });
  const [data, setData] = useState<ReportsData | null>(null);
  const search = Route.useSearch();
  // Wejście z adresu `?send=…` ma od razu pokazać raport tej wysyłki.
  const [tab, setTab] = useState(search.send ? "sends" : "overview");
  /** Otwarty raport wysyłki; `null` = lista. */
  const [openId, setOpenId] = useState<string | null>(search.send ?? null);

  useEffect(() => {
    getReports().then(setData);
  }, []);

  const noContacts = !!data && data.sources.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{t("Raporty")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("Pomiar skuteczności kampanii, źródeł i konwersji — liczony z bazy.")}
        </p>
      </div>

      {/* Zakładka „Wysyłki" to osobny ekran, nie kolejna sekcja przeglądu:
          raport pojedynczej wysyłki ma własne listy odbiorców i własną
          nawigację wstecz, a mieszanie tego z KPI całej placówki dawało jedną
          bardzo długą stronę o dwóch różnych rzeczach. */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">{t("Przegląd")}</TabsTrigger>
          <TabsTrigger value="sends">{t("Wysyłki")}</TabsTrigger>
          <TabsTrigger value="custom">{t("Własne raporty")}</TabsTrigger>
        </TabsList>

        <TabsContent value="custom" className="mt-5">
          <CustomReports canEdit={!isReadOnlyRole(user?.role)} />
        </TabsContent>

        <TabsContent value="sends" className="mt-5">
          {openId ? (
            <SendDetail id={openId} onBack={() => setOpenId(null)} />
          ) : (
            <SendsList onOpen={setOpenId} />
          )}
        </TabsContent>

        <TabsContent value="overview" className="mt-5 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {!data
              ? [0, 1, 2, 3].map((i) => (
                  <Card key={i} className="border-border/60 shadow-[var(--shadow-card)]">
                    <CardContent className="p-5 flex justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </CardContent>
                  </Card>
                ))
              : data.kpis.map((k) => {
                  const up = (k.delta ?? 0) >= 0;
                  return (
                    <Card key={k.label} className="border-border/60 shadow-[var(--shadow-card)]">
                      <CardContent className="p-5">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                          {k.label}
                        </p>
                        <p className="mt-2 text-2xl font-semibold tracking-tight">{k.value}</p>
                        {/* Same rule as the dashboard: no comparison, no percentage. */}
                        {k.delta !== null ? (
                          <div
                            className={`mt-1.5 inline-flex items-center gap-1 text-xs font-medium ${up ? "text-success" : "text-destructive"}`}
                          >
                            {up ? (
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowDownRight className="h-3.5 w-3.5" />
                            )}
                            {up ? "+" : ""}
                            {Math.round(k.delta * 100)}
                            {t("% vs poprzedni okres")}
                          </div>
                        ) : (
                          <div className="mt-1.5 text-xs text-muted-foreground">
                            {t("brak danych porównawczych")}
                          </div>
                        )}
                        {k.hint && (
                          <p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">
                            {k.hint}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 border-border/60 shadow-[var(--shadow-card)]">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">{t("Pozyskanie i konwersja")}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("Kontakty pozyskane w danym miesiącu i ilu z nich ma ")} <b>{t("dziś")}</b>{" "}
                    {t(" status Pacjent")}
                  </p>
                </div>
                <Badge variant="secondary" className="font-normal">
                  {t("Ostatnie 6 mies.")}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  {!data ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.months} margin={{ left: -20, right: 8, top: 8 }}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="oklch(0.92 0.012 240)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="month"
                          stroke="oklch(0.52 0.03 250)"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="oklch(0.52 0.03 250)"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                        />
                        <RTooltip contentStyle={CHART_STYLE} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line
                          type="monotone"
                          dataKey="pozyskane"
                          name="Pozyskane"
                          stroke="oklch(0.68 0.16 220)"
                          strokeWidth={2.5}
                          dot={{ r: 4 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="pacjenci"
                          name={t("Dziś pacjenci")}
                          stroke="oklch(0.58 0.18 250)"
                          strokeWidth={2.5}
                          dot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-[var(--shadow-card)]">
              <CardHeader>
                <CardTitle className="text-base">{t("Źródła pozyskania")}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("Pole „Źródło” na kartach kontaktów")}
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  {!data ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : noContacts ? (
                    <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                      {t("Brak kontaktów w bazie.")}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.sources}
                          dataKey="value"
                          nameKey="source"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={3}
                        >
                          {data.sources.map((_, i) => (
                            <Cell
                              key={i}
                              fill={COLORS[i % COLORS.length]}
                              stroke="var(--card)"
                              strokeWidth={2}
                            />
                          ))}
                        </Pie>
                        <RTooltip contentStyle={CHART_STYLE} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/60 shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">{t("Wysyłki i reakcje")}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  "Ostatnie 14 dni. Otwarcia i kliknięcia liczone przy dniu wysyłki, nie reakcji — dzięki temu słupki są porównywalne.",
                )}
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                {!data ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : data.sendsEmpty ? (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                    {t("Nic nie zostało wysłane w ostatnich 14 dniach.")}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.sends} margin={{ left: -20, right: 8, top: 8 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="oklch(0.92 0.012 240)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="day"
                        stroke="oklch(0.52 0.03 250)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="oklch(0.52 0.03 250)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <RTooltip contentStyle={CHART_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar
                        dataKey="wyslane"
                        name={t("Wysłane")}
                        fill="oklch(0.58 0.18 250)"
                        radius={[8, 8, 0, 0]}
                      />
                      <Bar
                        dataKey="otwarcia"
                        name="Otwarcia"
                        fill="oklch(0.68 0.16 220)"
                        radius={[8, 8, 0, 0]}
                      />
                      <Bar
                        dataKey="klikniecia"
                        name={t("Kliknięcia")}
                        fill="oklch(0.78 0.15 75)"
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
