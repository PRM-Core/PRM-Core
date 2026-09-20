import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Facebook,
  Loader2,
  Plug,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  beginMetaConnect,
  disconnectMetaPage,
  getMetaStatus,
  runMetaBackfill,
  saveMetaPageSettings,
  type MetaConnectionView,
} from "@/lib/api/meta.functions";
import { intlLocale, t } from "@/lib/i18n";

/**
 * Facebook Lead Ads — połączenie bezpośrednie, bez Zapiera.
 *
 * **Karta odpowiada na pytanie „czy stamtąd cokolwiek przychodzi",** a nie
 * tylko „czy jest podłączone". Deklaracja i fakt to dwie różne rzeczy — ta sama
 * zasada co przy domenach śledzących i przy systemie rezerwacji.
 */

function when(ms: number | null): string {
  if (!ms) return t("jeszcze nic nie przyszło");
  return new Date(ms).toLocaleString(intlLocale(), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PageRow({ conn, onChanged }: { conn: MetaConnectionView; onChanged: () => void }) {
  const [tags, setTags] = useState(conn.leadTags);
  const [status, setStatus] = useState(conn.leadStatus);
  const [saving, setSaving] = useState(false);
  const dirty = tags !== conn.leadTags || status !== conn.leadStatus;

  return (
    <div className="space-y-3 rounded-lg border px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{conn.pageName || conn.pageId}</span>
            {conn.subscribed ? (
              <Badge variant="secondary" className="gap-1 font-normal">
                <CheckCircle2 className="h-3 w-3" /> {t(" nasłuchuje")}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 font-normal text-amber-600">
                <AlertTriangle className="h-3 w-3" /> {t(" bez subskrypcji")}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t("Ostatni lead: ")} {when(conn.lastLeadAt)}
          </p>
          {conn.lastError && (
            <p className="mt-0.5 text-[11px] leading-snug text-destructive">
              {conn.lastError} ({when(conn.lastErrorAt)})
            </p>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-destructive"
          title={t("Odłącz stronę")}
          onClick={async () => {
            await disconnectMetaPage({ data: { pageId: conn.pageId } });
            toast.success(t("Strona odłączona."), {
              description: t("Kontakty, które już weszły, zostają."),
            });
            onChanged();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("Tagi dla leadów z tej strony")}</Label>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t("np. meta-lead, kardiologia")}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("Status")}</Label>
          <Input
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder={t("lead / patient / puste")}
            className="h-8 text-xs"
          />
        </div>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {t(
          "Po przecinku. Zostaw puste, jeśli lead ma wejść bez tagu albo bez statusu — kontakt bez statusu nie trafi jednak do segmentu filtrującego po statusie.",
        )}
      </p>

      {dirty && (
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await saveMetaPageSettings({
              data: { pageId: conn.pageId, leadTags: tags, leadStatus: status },
            });
            setSaving(false);
            toast.success(t("Zapisane."));
            onChanged();
          }}
        >
          {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}

          {t("Zapisz")}
        </Button>
      )}
    </div>
  );
}

export function MetaLeadsDirectCard() {
  const [state, setState] = useState<{
    configured: boolean;
    connections: MetaConnectionView[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getMetaStatus()
      .then(setState)
      .catch(() => setState({ configured: false, connections: [] }));
  }, []);

  useEffect(refresh, [refresh]);

  return (
    <Card className="border-border/60 shadow-[var(--shadow-card)]">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Facebook className="h-4 w-4" /> {t(" Facebook Lead Ads")}
            </CardTitle>
            <CardDescription>
              {t(
                "Leady z kampanii wpadają wprost do systemu — bez Zapiera i bez opłaty za zadanie.",
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={busy || !state?.configured || (state?.connections.length ?? 0) === 0}
              onClick={async () => {
                setBusy(true);
                const r = await runMetaBackfill().catch(() => null);
                setBusy(false);
                if (!r) {
                  toast.error(t("Nie udało się pobrać zaległych."));
                  return;
                }
                toast.success(
                  t("Pobrano {leads} leadów z {pages} stron.", { leads: r.leads, pages: r.pages }),
                );
                refresh();
              }}
            >
              <RefreshCw className="h-4 w-4" /> {t(" Pobierz zaległe")}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={busy || !state?.configured}
              onClick={async () => {
                setBusy(true);
                try {
                  const { url } = await beginMetaConnect();
                  window.location.href = url;
                } catch (err) {
                  setBusy(false);
                  toast.error(t("Nie można rozpocząć"), { description: String(err) });
                }
              }}
            >
              <Plug className="h-4 w-4" /> {t(" Podłącz stronę")}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {state === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !state.configured ? (
          <p className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            {t("Brak App ID albo App Secret aplikacji Meta — uzupełnij je w sekcji")}{" "}
            <a href="#klucze" className="underline underline-offset-2">
              {t("Klucze i dane dostępowe")}
            </a>
            {t(". Bez nich logowanie do Facebooka nie ruszy.")}
          </p>
        ) : state.connections.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            {t("Nie podłączono żadnej strony. Kliknij ")} <b>{t("Podłącz stronę")}</b>{" "}
            {t(
              " — Facebook zapyta o zgodę, a my zapiszemy się na powiadomienia o leadach ze wszystkich stron, na których możesz reklamować.",
            )}
          </p>
        ) : (
          state.connections.map((c) => <PageRow key={c.pageId} conn={c} onChanged={refresh} />)
        )}
      </CardContent>
    </Card>
  );
}
