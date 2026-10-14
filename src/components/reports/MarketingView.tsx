import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMarketingView } from "@/lib/api/roles.functions";
import { intlLocale, t } from "@/lib/i18n";

/**
 * Marketing: how each campaign did — opens, clicks, unsubscribes and the
 * recipients who booked a visit in the days after — and which variant of
 * each automation split did better, with a test that refuses to call a
 * winner on too little data.
 */

type Data = Awaited<ReturnType<typeof getMarketingView>>;
type Test = { diff: number; p: number | null; significant: boolean } | null;

const pct = (hits: number | null, total: number) =>
  hits === null || total === 0 ? "—" : `${Math.round((hits / total) * 100)}%`;

function day(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(intlLocale(), {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function Verdict({ test }: { test: Test }) {
  if (!test) return <span className="text-muted-foreground">—</span>;
  if (test.p === null)
    return (
      <span className="text-muted-foreground text-xs">
        {t("za mało danych (min. 30 na wariant)")}
      </span>
    );
  const pp = Math.round(test.diff * 100);
  return test.significant ? (
    <Badge
      variant="secondary"
      className={pp > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}
    >
      {t("{pp} pp, różnica istotna (p = {p})", {
        pp: pp > 0 ? `+${pp}` : String(pp),
        p: test.p.toFixed(3),
      })}
    </Badge>
  ) : (
    <span className="text-muted-foreground text-xs">
      {t("{pp} pp, bez istotnej różnicy (p = {p})", {
        pp: pp > 0 ? `+${pp}` : String(pp),
        p: test.p.toFixed(2),
      })}
    </span>
  );
}

export function MarketingView() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    getMarketingView()
      .then(setData)
      .catch(() => setData({ windowDays: 90, bookingWindowDays: 14, campaigns: [], splits: [] }));
  }, []);
  if (!data)
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-6">
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t("Kampanie — ostatnie {n} dni", { n: data.windowDays })}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t(
              "„Umówili wizytę” — odbiorcy, którzy umówili wizytę w ciągu {d} dni po wysyłce. To zbieżność w czasie, nie dowód, że zadziałała kampania; porównuj kampanie między sobą.",
              { d: data.bookingWindowDays },
            )}
          </p>
        </CardHeader>
        <CardContent>
          {data.campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Brak kampanii w tym okresie.")}</p>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Kampania")}</TableHead>
                    <TableHead>{t("Data")}</TableHead>
                    <TableHead className="text-right">{t("Wysłano")}</TableHead>
                    <TableHead className="text-right">{t("Otwarcia")}</TableHead>
                    <TableHead className="text-right">{t("Kliknięcia")}</TableHead>
                    <TableHead className="text-right">{t("Wypisy")}</TableHead>
                    <TableHead className="text-right">{t("Umówili wizytę")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.campaigns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {c.kind} · {c.segmentName}
                        </div>
                      </TableCell>
                      <TableCell>{day(c.sentAt)}</TableCell>
                      <TableCell className="text-right">{c.sent}</TableCell>
                      <TableCell className="text-right">{pct(c.opened, c.sent)}</TableCell>
                      <TableCell className="text-right">{pct(c.clicked, c.sent)}</TableCell>
                      <TableCell className="text-right">{pct(c.unsubscribed, c.sent)}</TableCell>
                      <TableCell className="text-right">
                        {c.booked}{" "}
                        <span className="text-muted-foreground">({pct(c.booked, c.sent)})</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("Testy A/B w automatyzacjach")}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t(
              "Z kroku „Split”: każdy wariant porównany z pierwszym — odsetek pacjentów, którzy umówili wizytę w ciągu {d} dni, i otwarcia e-maili wysłanych dalej w tym przebiegu. Test dwóch proporcji; poniżej 30 pacjentów na wariant nie ogłaszamy zwycięzcy.",
              { d: data.bookingWindowDays },
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {data.splits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t(
                "Żadna automatyzacja nie przeprowadziła w tym okresie pacjentów przez krok „Split”.",
              )}
            </p>
          ) : (
            data.splits.map((s) => (
              <div key={`${s.automationId}:${s.nodeId}`} className="space-y-2">
                <div className="text-sm font-medium">{s.automationName || s.automationId}</div>
                <div className="rounded-lg border border-border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("Wariant")}</TableHead>
                        <TableHead className="text-right">{t("Pacjenci")}</TableHead>
                        <TableHead className="text-right">{t("Umówili wizytę")}</TableHead>
                        <TableHead>{t("Wobec pierwszego")}</TableHead>
                        <TableHead className="text-right">{t("Otwarcia")}</TableHead>
                        <TableHead>{t("Wobec pierwszego")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.variants.map((v, i) => (
                        <TableRow key={v.label}>
                          <TableCell className="font-medium">{v.label}</TableCell>
                          <TableCell className="text-right">{v.entered}</TableCell>
                          <TableCell className="text-right">{pct(v.booked, v.entered)}</TableCell>
                          <TableCell>
                            {i === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                {t("punkt odniesienia")}
                              </span>
                            ) : (
                              <Verdict test={v.bookedTest} />
                            )}
                          </TableCell>
                          <TableCell className="text-right">{pct(v.opened, v.emails)}</TableCell>
                          <TableCell>
                            {i === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                {t("punkt odniesienia")}
                              </span>
                            ) : (
                              <Verdict test={v.openTest} />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
