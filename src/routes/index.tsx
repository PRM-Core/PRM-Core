import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { isReadOnlyRole } from "@/lib/auth/roles";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Users,
  TrendingUp,
  Zap,
  Mail,
  MessageSquare,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  CalendarPlus,
  Send,
  Tag,
  Activity,
  Loader2,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDashboard, type DashboardData } from "@/lib/api/dashboard.functions";
import { PatientActivityCard } from "@/components/dashboard/PatientActivityCard";
import { intlLocale, t, localized } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: t("Dashboard — PRM Core") },
      {
        name: "description",
        content: t("Przegląd kontaktów, kampanii i automatyzacji w PRM Core."),
      },
    ],
  }),
  component: Dashboard,
});

/**
 * Ikona na kafelku wskaźnika. Kolejność odpowiada kolejności wskaźników
 * z serwera — etykiety idą stamtąd.
 *
 * **Jeden kolor dla wszystkich, nie tęcza.** Wcześniej każdy kafelek miał
 * własny pastelowy gradient (niebieski, miętowy, bursztynowy…), co w palecie
 * opartej na jednym granacie i jednym piaskowym wyglądało jak resztka po
 * poprzednim motywie. Wskaźniki różnią się treścią, a nie barwą — kolor niósł
 * tu zero informacji, a rozbijał spójność ekranu.
 */
const KPI_LOOK = [
  { icon: Users },
  { icon: TrendingUp },
  { icon: Zap },
  { icon: Mail },
  { icon: MessageSquare },
];

/**
 * Skróty na dashboardzie. `edycja: true` znaczy „prowadzi do czegoś, czego
 * konto podglądu i tak nie zrobi" — takie skróty są dla niego ukrywane.
 */
const quickActions = localized(() => [
  { label: t("Dodaj kontakt"), icon: Plus, to: "/contacts", edycja: true },
  { label: t("Zaplanuj kampanię"), icon: CalendarPlus, to: "/automation" },
  { label: t("Nowa treść e-mail"), icon: Send, to: "/email" },
  { label: t("Zarządzaj segmentami"), icon: Tag, to: "/segments" },
  { label: t("Raporty wysyłek"), icon: BarChart3, to: "/reports" },
]);

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function Dashboard() {
  const { user } = useRouteContext({ from: "__root__" });
  const podglad = isReadOnlyRole(user?.role);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    getDashboard().then(setData);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{t("Dashboard")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Witaj z powrotem. Oto co dzieje się dziś w PRM Core.")}
          </p>
        </div>
        {!podglad && (
          <Button className="gap-1.5" asChild>
            <Link to="/contacts">
              <Plus className="h-4 w-4" /> {t(" Nowy kontakt")}
            </Link>
          </Button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {!data
          ? KPI_LOOK.map((look, i) => (
              <Card key={i} className="border-border/60 shadow-[var(--shadow-card)]">
                <CardContent className="p-5 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            ))
          : data.kpis.map((k, i) => {
              const look = KPI_LOOK[i] ?? KPI_LOOK[0];
              const Icon = look.icon;
              const up = (k.delta ?? 0) >= 0;
              return (
                <Card key={k.label} className="border-border/60 shadow-[var(--shadow-card)]">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                          {k.label}
                        </p>
                        <p className="mt-2 text-2xl font-semibold tracking-tight">
                          {k.value.toLocaleString(intlLocale())}
                        </p>
                        {/* No invented movement: a metric with nothing to compare
                            against simply says so. */}
                        {k.delta !== null ? (
                          <div
                            className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${up ? "text-success" : "text-destructive"}`}
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
                        ) : k.isNew ? (
                          <div className="mt-2 text-xs font-medium text-success">
                            {t("pierwsze w tym okresie")}
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-muted-foreground">
                            {t("brak danych porównawczych")}
                          </div>
                        )}
                        {k.hint && (
                          <p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">
                            {k.hint}
                          </p>
                        )}
                      </div>
                      <div className="h-11 w-11 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* Chart + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PatientActivityCard statusTotals={data?.statusTotals ?? null} />

        <Card className="border-border/60 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">{t("Szybkie akcje")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {quickActions
              .filter((a) => !(podglad && a.edycja))
              .map((a) => (
                <Link
                  key={a.label}
                  to={a.to}
                  className="group flex flex-col items-start gap-2 rounded-xl border border-border/60 bg-card p-4 hover:border-primary/40 hover:shadow-[var(--shadow-card)] transition-all"
                >
                  <div className="h-9 w-9 rounded-lg bg-primary-soft flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                    <a.icon className="h-4.5 w-4.5" />
                  </div>
                  <span className="text-sm font-medium">{a.label}</span>
                </Link>
              ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent events + campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60 shadow-[var(--shadow-card)]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("Ostatnie zdarzenia")}</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs" asChild>
              <Link to="/automation" search={{ tab: "engine" }}>
                {t("Zobacz dziennik")}
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {!data ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : data.events.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                {t(
                  "Nic się jeszcze nie wydarzyło. Zdarzenia pojawią się tu, gdy silnik wykona krok albo pacjent napisze.",
                )}
              </p>
            ) : (
              data.events.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg p-2 -mx-2 hover:bg-muted/60 transition-colors"
                >
                  <div className="h-9 w-9 shrink-0 rounded-full bg-primary-soft flex items-center justify-center text-primary">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      <span className="font-medium">{r.who}</span>{" "}
                      <span className="text-muted-foreground">{r.what}</span>
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{r.when}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">{t("Wysyłki automatyzacji")}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {t("Ostatnie ")} {data?.windowDays ?? 30} {t(" dni")}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {!data ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : data.campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                {t("Żadna automatyzacja nie wysłała jeszcze e-maila w tym okresie.")}
              </p>
            ) : (
              data.campaigns.map((c) => (
                <div key={c.id}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {c.sent} {t(" wysłanych")}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round((c.openRate ?? 0) * 100)}%`,
                        background: "var(--gradient-primary)",
                      }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      {t("Otwarcia ")} <b className="text-foreground">{percent(c.openRate)}</b>
                    </span>
                    <span>
                      {t("Kliknięcia ")} <b className="text-foreground">{percent(c.clickRate)}</b>
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
