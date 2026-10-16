import { useEffect, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAuditLog, type AuditEntry } from "@/lib/api/audit.functions";
import { formatActivityDate } from "@/lib/activity-date";
import { t, localized } from "@/lib/i18n";

// Settings → Security: who did what with accounts, credentials, exports,
// webhooks and patients' documents. Administrators only; kept for the
// retention period and then purged by the engine once a day.

const ACTIONS: Record<string, string> = localized(() => ({
  "user.added": t("dodanie konta"),
  "user.deleted": t("usunięcie konta"),
  "user.password_reset": t("reset hasła"),
  "user.phone_set": t("zmiana numeru do kodów"),
  "contacts.exported": t("eksport kontaktów"),
  "document.downloaded": t("pobranie dokumentu pacjenta"),
  "document.uploaded": t("dodanie dokumentu pacjenta"),
  "document.removed": t("usunięcie dokumentu pacjenta"),
  "credentials.saved": t("zapis kluczy integracji"),
  "credentials.cleared": t("usunięcie klucza integracji"),
  "credentials.imported": t("import kluczy z .env"),
  "mcp.token_generated": t("nowy token MCP"),
  "webhook.incoming_secret_rotated": t("wymiana sekretu webhooka"),
  "webhook.destination_saved": t("zapis odbiorcy webhooka"),
  "webhook.destination_deleted": t("usunięcie odbiorcy webhooka"),
}));

export function AuditLogCard() {
  const { user } = useRouteContext({ from: "__root__" });
  return user?.role === "admin" ? <AuditLog /> : null;
}

function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [retention, setRetention] = useState(365);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setEntries(null);
    getAuditLog({ data: { action: action || undefined, limit: 200 } })
      .then((r) => {
        setEntries(r.entries);
        setRetention(r.retentionDays);
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [action]);

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-primary-soft flex items-center justify-center text-primary">
          <ScrollText className="h-5 w-5" />
        </div>
        <div>
          <CardTitle className="text-base">{t("Dziennik działań administracyjnych")}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(
              "Kto i kiedy dodał lub usunął konto, zresetował hasło, wyeksportował kontakty, otworzył dokument pacjenta, zmienił klucze integracji albo webhook. Wpisy są przechowywane {days} dni (PRM_AUDIT_RETENTION_DAYS), potem usuwane.",
              { days: retention },
            )}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : (
          <>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {t("Działanie")}
              <select
                className="h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                <option value="">{t("wszystkie")}</option>
                {Object.entries(ACTIONS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {entries && entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("Brak wpisów.")}</p>
            ) : (
              <div className="divide-y rounded-lg border text-sm">
                {(entries ?? []).map((e) => (
                  <div key={e.id} className="flex flex-wrap gap-x-3 gap-y-0.5 p-2.5">
                    <span className="text-xs text-muted-foreground w-32 shrink-0">
                      {formatActivityDate(e.at)}
                    </span>
                    <span className="font-medium">{e.actorName || t("system")}</span>
                    <span>{ACTIONS[e.action] ?? e.action}</span>
                    {e.target && <span className="text-muted-foreground">{e.target}</span>}
                    {Object.keys(e.detail).length > 0 && (
                      <span className="w-full text-xs text-muted-foreground">
                        {Object.entries(e.detail)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {entries && entries.length >= 200 && (
              <Button size="sm" variant="outline" disabled>
                {t("Pokazano 200 najnowszych")}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
