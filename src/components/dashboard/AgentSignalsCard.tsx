import { useEffect, useState } from "react";
import { Link, useRouteContext } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight, Bot, Loader2, Minus, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAgentOverview, runAgentNow, type AgentOverview } from "@/lib/api/agent.functions";
import type { ListKey } from "@/lib/agent/drafts.server";
import { factorLabel } from "@/lib/agent/factor-labels";
import { intlLocale, t } from "@/lib/i18n";

/**
 * PRM_Agent on the dashboard — what the nightly signals say.
 *
 * Three groups: how patients are responding (rates with a trend), who needs
 * attention (counts that are also lists), and which upcoming visits are at
 * risk of a no-show, each with the factors behind the number. No model is
 * involved in any of it, so the card is the same whatever PRM_AI_MODE says.
 */

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Trend({
  value,
  previous,
  lowerIsBetter,
}: {
  value: number;
  previous: number | null;
  lowerIsBetter?: boolean;
}) {
  if (previous === null || previous === undefined)
    return <span className="text-xs text-muted-foreground">—</span>;
  const delta = value - previous;
  if (Math.abs(delta) < 0.0005)
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-label={t("bez zmian")} />;
  const up = delta > 0;
  const good = lowerIsBetter ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <Icon
      className={`h-3.5 w-3.5 ${good ? "text-success" : "text-destructive"}`}
      aria-label={up ? t("wzrost") : t("spadek")}
    />
  );
}

export function AgentSignalsCard() {
  const { user } = useRouteContext({ from: "__root__" });
  const [data, setData] = useState<AgentOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = user?.role === "admin";

  const load = () =>
    getAgentOverview()
      .then(setData)
      .catch(() => setData(null));
  useEffect(() => {
    void load();
  }, []);

  const recompute = async () => {
    setBusy(true);
    try {
      const r = await runAgentNow();
      toast.success(
        t("Policzono {n} wskaźników; model nieobecności: {mode}.", {
          n: r.signals,
          mode:
            r.mode === "trained"
              ? t("nauczony na {m} wizytach", { m: r.samples })
              : t("za mało historii, częstość bazowa"),
        }),
      );
      await load();
    } catch (err) {
      toast.error(t("Nie udało się policzyć sygnałów"), { description: String(err) });
    } finally {
      setBusy(false);
    }
  };

  const signal = (key: string) => data?.signals.find((s) => s.key === key && s.dimension === "");
  const noShow = signal("no_show_rate");
  const open = signal("email.open_rate");
  const click = signal("email.click_rate");
  const attention: { key: ListKey; label: string }[] = [
    { key: "recall_due", label: t("Recall do zrobienia") },
    { key: "first_visit_no_followup", label: t("Pierwsza wizyta bez kolejnej") },
    { key: "post_visit_no_reply", label: t("Po wizycie, bez odpowiedzi") },
    { key: "drifting", label: t("Pacjenci dryfujący") },
  ];

  return (
    <Card className="border-border/60 shadow-[var(--shadow-card)]">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            {t("PRM_Agent — sygnały")}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {data?.computed
              ? t("Policzono {when}. Ostatnie 30 dni wobec poprzednich 30.", {
                  when: new Date(data.computed.computedAt).toLocaleString(intlLocale(), {
                    timeZone: "Europe/Warsaw",
                  }),
                })
              : t("Jeszcze nie policzono — liczy się co noc po 2:00.")}
          </p>
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            disabled={busy}
            onClick={() => void recompute()}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {t("Przelicz teraz")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {!data || !data.computed ? (
          <p className="text-sm text-muted-foreground">
            {t(
              "Sygnały pokażą, jak pacjenci reagują i kto wymaga uwagi — bez żadnego modelu AI, z danych tej instalacji.",
            )}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: t("Nieobecności"),
                  s: noShow,
                  lowerIsBetter: true,
                  hint: t("z {n} rozstrzygniętych wizyt", { n: noShow?.count ?? 0 }),
                },
                {
                  label: t("Otwarcia e-maili"),
                  s: open,
                  hint: t("z {n} wysyłek", { n: open?.count ?? 0 }),
                },
                {
                  label: t("Kliknięcia"),
                  s: click,
                  hint: t("z {n} wysyłek", { n: click?.count ?? 0 }),
                },
              ].map(({ label, s, lowerIsBetter, hint }) => (
                <div key={label} className="rounded-lg border border-border p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {label}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-xl font-semibold">{s ? pct(s.value) : "—"}</span>
                    {s && (
                      <Trend value={s.value} previous={s.previous} lowerIsBetter={lowerIsBetter} />
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {s?.previous !== null && s?.previous !== undefined
                      ? t("wcześniej {v} · ", { v: pct(s.previous) })
                      : ""}
                    {hint}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="text-xs font-medium mb-2">{t("Kto wymaga uwagi")}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {attention.map(({ key, label }) => {
                  const s = signal(key);
                  return (
                    <Link
                      key={key}
                      to="/agent"
                      search={{ tab: "lists", list: key }}
                      className="rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors"
                    >
                      <div className="text-xl font-semibold flex items-center gap-1.5">
                        {s ? Math.round(s.value) : "—"}
                        {s && <Trend value={s.value} previous={s.previous} lowerIsBetter />}
                      </div>
                      <div className="text-xs text-muted-foreground">{label}</div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {data.directionsPending > 0 && (
              <Link
                to="/agent"
                search={{ tab: "directions" }}
                className="block rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm hover:bg-primary/10 transition-colors"
              >
                {t("Agent proponuje {n} kierunków rozwoju — czekają na Twoją decyzję.", {
                  n: data.directionsPending,
                })}
              </Link>
            )}

            <div>
              <div className="text-xs font-medium mb-2 flex items-center justify-between">
                <span>{t("Nadchodzące wizyty najbardziej zagrożone nieobecnością")}</span>
                {data.model && (
                  <span className="text-[11px] text-muted-foreground font-normal">
                    {data.model.mode === "trained"
                      ? t("model nauczony na {n} wizytach", { n: data.model.samples })
                      : t("za mało historii ({n} wizyt) — pokazana częstość bazowa", {
                          n: data.model.samples,
                        })}
                  </span>
                )}
              </div>
              {data.risks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("Brak nadchodzących wizyt w ciągu 30 dni.")}
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {data.risks.slice(0, 5).map((r) => {
                    const factors = r.factors.map((f) =>
                      factorLabel(f.feature, f.contribution > 0),
                    );
                    return (
                      <li key={r.visitId} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span
                          className={`w-12 text-right font-semibold ${r.probability >= 0.3 ? "text-destructive" : ""}`}
                        >
                          {pct(r.probability)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link
                            to="/contacts/$id"
                            params={{ id: r.contactId }}
                            className="font-medium hover:underline"
                          >
                            {r.patient}
                          </Link>
                          <span className="text-muted-foreground">
                            {" · "}
                            {r.startsAt
                              ? new Date(r.startsAt).toLocaleString(intlLocale(), {
                                  timeZone: "Europe/Warsaw",
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })
                              : "—"}
                            {r.doctor ? ` · ${r.doctor}` : ""}
                          </span>
                          {factors.length > 0 && (
                            <div className="text-xs text-muted-foreground truncate">
                              {factors.join(" · ")}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
