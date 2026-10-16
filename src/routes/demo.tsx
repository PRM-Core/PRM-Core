import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Mail, MessageSquare, Webhook } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDemoOutbox, type DemoOutboxView } from "@/lib/api/demo.functions";
import { formatActivityDate } from "@/lib/activity-date";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: t("Wysłane w demo — PRM Core") },
      {
        name: "description",
        content: t("Wiadomości, które system wysłałby, gdyby to nie była wersja demonstracyjna."),
      },
    ],
  }),
  component: DemoOutboxPage,
});

/** New messages appear on their own — the simulator keeps the engine busy. */
const REFRESH_MS = 10_000;

function ChannelIcon({ channel }: { channel: string }) {
  const cls = "h-4 w-4 shrink-0 text-muted-foreground";
  if (channel === "sms") return <MessageSquare className={cls} />;
  if (channel === "webhook") return <Webhook className={cls} />;
  return <Mail className={cls} />;
}

const CHANNEL_LABEL = (c: string) =>
  c === "sms" ? t("SMS") : c === "webhook" ? t("Webhook") : t("E-mail");

function DemoOutboxPage() {
  const [data, setData] = useState<{ demo: boolean; items: DemoOutboxView[] } | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getDemoOutbox()
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setError("");
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        });
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (error)
    return (
      <Card className="p-6 text-sm text-destructive">
        {t("Nie udało się wczytać podglądu: {error}", { error })}
      </Card>
    );
  if (!data)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("Wczytywanie…")}
      </div>
    );
  if (!data.demo)
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        {t(
          "Ta instalacja nie działa w trybie demonstracyjnym — wiadomości wychodzą naprawdę, a ich historia jest w Raportach wysyłek.",
        )}
      </Card>
    );

  const current = data.items.find((i) => i.id === selected) ?? data.items[0] ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("Wysłane w demo")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "To, co PRM Core wysłałby pacjentom i do systemów zewnętrznych. W wersji demonstracyjnej nic nie wychodzi: e-maile, SMS-y i webhooki trafiają tutaj. Ostatnie 100, odświeżane co 10 sekund.",
          )}
        </p>
      </div>
      {data.items.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {t(
            "Jeszcze nic — pierwsze wiadomości pojawią się, gdy automatyzacje zareagują na nowych pacjentów z symulatora.",
          )}
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card className="divide-y overflow-hidden">
            {data.items.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelected(m.id)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50 ${
                  current?.id === m.id ? "bg-muted/60" : ""
                }`}
              >
                <ChannelIcon channel={m.channel} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{m.to}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatActivityDate(m.createdAt)}
                    </span>
                  </div>
                  <div className="truncate text-muted-foreground">
                    {m.channel === "email" ? m.subject : m.channel === "sms" ? m.body : m.to}
                  </div>
                </div>
              </button>
            ))}
          </Card>
          {current && (
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{CHANNEL_LABEL(current.channel)}</Badge>
                <span className="text-muted-foreground">{t("Do:")}</span>
                <span className="font-medium">{current.to}</span>
                {current.from && (
                  <>
                    <span className="text-muted-foreground">{t("Od:")}</span>
                    <span>{current.from}</span>
                  </>
                )}
              </div>
              {current.subject && <p className="font-medium">{current.subject}</p>}
              {current.channel === "email" ? (
                // Sandboxed with no permissions: the message is shown, nothing in it runs.
                <iframe
                  title={current.subject || t("Podgląd wiadomości")}
                  sandbox=""
                  srcDoc={current.body}
                  className="h-[560px] w-full rounded-md border bg-white"
                />
              ) : current.channel === "sms" ? (
                <div className="max-w-sm whitespace-pre-wrap rounded-2xl bg-muted px-4 py-3 text-sm">
                  {current.body}
                </div>
              ) : (
                <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(JSON.parse(current.body), null, 2)}
                </pre>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
