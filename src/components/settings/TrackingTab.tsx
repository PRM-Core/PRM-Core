import { type KeyboardEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Check,
  Copy,
  Globe,
  Info,
  Loader2,
  Plus,
  Radar,
  RefreshCw,
  Save,
  SearchCheck,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getTrackingOverview,
  saveTrackingDomains,
  verifyInstallation,
  getRecentPings,
} from "@/lib/api/tracking.functions";
import type { DomainStatus, InstallCheck } from "@/lib/tracking/tracking.server";
import { buildEmbedSnippet } from "@/lib/tracking-script";
import type { TrackingPing } from "@/lib/db/schema";
import { intlLocale, t as tr } from "@/lib/i18n";

const WORKSPACE_ID = "prm_ws_8f21ac49";

function relative(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s} s temu`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min temu`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} godz. temu`;
  return `${Math.round(h / 24)} dni temu`;
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(tr("Skopiowano kod"));
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(tr("Nie udało się skopiować — zaznacz i skopiuj ręcznie."));
    }
  };
  return (
    <div className="relative rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
      <pre className="p-4 pr-24 overflow-x-auto text-xs leading-relaxed font-mono text-slate-100">
        <code>{code}</code>
      </pre>
      <Button
        variant="secondary"
        size="sm"
        className="absolute top-2 right-2 h-7 gap-1.5 bg-white/10 hover:bg-white/20 text-white border-0"
        onClick={copy}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? tr("Skopiowano") : tr("Kopiuj")}
      </Button>
    </div>
  );
}

/** Jeden wiersz listy domen: stan + wynik sprawdzenia instalacji. */
function DomainRow({
  row,
  onLabel,
  onRemove,
  onAdopt,
}: {
  row: DomainStatus;
  onLabel: (value: string) => void;
  onRemove: () => void;
  onAdopt: () => void;
}) {
  const [check, setCheck] = useState<InstallCheck | null>(null);
  const [checking, setChecking] = useState(false);

  const verify = async () => {
    setChecking(true);
    try {
      setCheck(await verifyInstallation({ data: { domain: row.domain } }));
    } catch (err) {
      toast.error(tr("Nie udało się sprawdzić strony"), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setChecking(false);
    }
  };

  const hasSignal = row.lastPingAt !== null;

  return (
    <div className="py-3 space-y-2 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div
          className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${
            row.live ? "bg-success" : hasSignal ? "bg-warning" : "bg-destructive"
          }`}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{row.domain}</span>
            {row.undeclared && (
              <Badge
                variant="outline"
                className="font-normal border-warning/40 bg-warning/10 text-warning-foreground"
              >
                {tr("spoza listy")}
              </Badge>
            )}
            {row.live ? (
              <Badge
                variant="outline"
                className="font-normal border-success/20 bg-success/10 text-success"
              >
                {tr("sygnał na żywo")}
              </Badge>
            ) : hasSignal ? (
              <Badge variant="outline" className="font-normal">
                {tr("ostatni sygnał ")} {relative(row.lastPingAt!)}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="font-normal border-destructive/30 bg-destructive/10 text-destructive"
              >
                {tr("brak sygnału")}
              </Badge>
            )}
            {row.pings24h > 0 && (
              <span className="text-xs text-muted-foreground">
                {row.pings24h} {tr(" wizyt w ciągu doby")}
              </span>
            )}
          </div>

          {row.lastPingUrl && (
            <p className="text-xs text-muted-foreground truncate mt-0.5" title={row.lastPingUrl}>
              {row.lastPingUrl}
            </p>
          )}

          {!row.undeclared && (
            <Input
              value={row.label}
              onChange={(e) => onLabel(e.target.value)}
              placeholder={tr("opis (opcjonalnie) — np. strona główna kliniki")}
              className="mt-2 h-8 text-xs"
            />
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            disabled={checking}
            onClick={() => void verify()}
          >
            {checking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SearchCheck className="h-3.5 w-3.5" />
            )}

            {tr("Sprawdź")}
          </Button>
          {row.undeclared ? (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={onAdopt}>
              <Plus className="h-3.5 w-3.5" /> {tr(" Dodaj")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onRemove}
              aria-label={tr("Usuń {domain}", { domain: row.domain })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {check && (
        <div
          className={`ml-6 rounded-md border px-3 py-2 text-xs ${
            check.snippetInHtml && !check.collectorInHtml?.includes("localhost")
              ? "border-success/30 bg-success/10"
              : "border-warning/40 bg-warning/10"
          }`}
        >
          <p>{check.message}</p>
          {check.collectorInHtml && (
            <p className="mt-1 text-muted-foreground">
              {tr("Kod wysyła dane na: ")}{" "}
              <code className="font-mono">{check.collectorInHtml}</code>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function TrackingTab() {
  const [rows, setRows] = useState<DomainStatus[] | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [totals, setTotals] = useState({ total: 0, identified: 0 });
  const [pings, setPings] = useState<TrackingPing[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const refresh = useCallback(async () => {
    const [overview, recent] = await Promise.all([
      getTrackingOverview(),
      getRecentPings({ data: { workspaceId: WORKSPACE_ID, limit: 10 } }),
    ]);
    setBaseUrl(overview.baseUrl);
    setTotals(overview.totals);
    setPings(recent);
    // Niezapisane zmiany mają pierwszeństwo — odświeżanie w tle nie może
    // podmienić listy pod palcami komuś, kto właśnie coś wpisuje.
    setRows((prev) => (dirty && prev ? prev : overview.domains));
  }, [dirty]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  const addDomain = () => {
    const value = newDomain.trim();
    if (!value || !rows) return;
    const host = value
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
    if (rows.some((r) => r.domain === host && !r.undeclared)) {
      toast.error(tr("Ta domena jest już na liście."));
      return;
    }
    setRows([
      ...rows.filter((r) => !(r.domain === host && r.undeclared)),
      { domain: host, label: "", lastPingAt: null, lastPingUrl: null, pings24h: 0, live: false },
    ]);
    setNewDomain("");
    setDirty(true);
  };

  const save = async () => {
    if (!rows) return;
    setSaving(true);
    try {
      const result = await saveTrackingDomains({
        data: {
          domains: rows
            .filter((r) => !r.undeclared)
            .map((r) => ({ domain: r.domain, label: r.label })),
        },
      });
      toast.success(
        tr("Zapisano {saved} {v1}.", {
          saved: result.saved,
          v1: result.saved === 1 ? tr("domenę") : tr("domeny/domen"),
        }),
      );
      setDirty(false);
      await refresh();
    } catch (err) {
      toast.error(tr("Nie udało się zapisać"), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const snippet = buildEmbedSnippet(WORKSPACE_ID, baseUrl || "https://…");
  const baseLooksLocal = /localhost|127\.0\.0\.1/.test(baseUrl);
  const declared = rows?.filter((r) => !r.undeclared) ?? [];
  const silent = declared.filter((r) => r.lastPingAt === null);

  return (
    <div className="space-y-4">
      {/* ── stan ogólny ───────────────────────────────────────────────── */}
      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary-soft flex items-center justify-center text-primary">
              <Radar className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{tr("Śledzenie stron")}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tr(
                  "Stan liczony z sygnałów, które naprawdę dotarły — nie z tego, co zadeklarowano.",
                )}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5" /> {tr(" Wszystkie wizyty")}
              </div>
              <p className="text-xl font-semibold mt-1">
                {totals.total.toLocaleString(intlLocale())}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserCheck className="h-3.5 w-3.5" /> {tr(" Przypisane do kontaktu")}
              </div>
              <p className="text-xl font-semibold mt-1">
                {totals.identified.toLocaleString(intlLocale())}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Globe className="h-3.5 w-3.5" /> {tr(" Domeny bez sygnału")}
              </div>
              <p
                className={`text-xl font-semibold mt-1 ${silent.length > 0 ? "text-destructive" : ""}`}
              >
                {silent.length}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              <strong>{tr("Czego śledzenie nie pokaże:")}</strong>{" "}
              {tr(
                " zwykła wizyta jest anonimowa i nie trafia na kartę żadnego pacjenta. Wizyta wiąże się z kontaktem dopiero wtedy, gdy przeglądarka niesie token z linku klikniętego w wiadomości z PRM Core. Własne wejście na stronę zobaczysz poniżej jako sygnał, ale nie w aktywnościach swojego kontaktu — i tak ma być.",
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── domeny ────────────────────────────────────────────────────── */}
      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{tr("Śledzone domeny")}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tr(
                "Wypisz strony, na których kod ma działać. Czerwona kropka znaczy, że stamtąd nic do nas nie dociera.",
              )}
            </p>
          </div>
          <Button
            className="gap-1.5 shrink-0"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}

            {tr("Zapisz")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDomain();
                }
              }}
              placeholder="klinika-abc.pl"
            />
            <Button variant="outline" className="gap-1.5 shrink-0" onClick={addDomain}>
              <Plus className="h-4 w-4" /> {tr(" Dodaj")}
            </Button>
          </div>

          {!rows ? (
            <div className="py-6 flex justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              {tr("Nie ma jeszcze żadnej domeny. Dodaj tę, na której wkleiłeś kod.")}
            </p>
          ) : (
            <div className="divide-y">
              {rows.map((row) => (
                <DomainRow
                  key={`${row.domain}-${row.undeclared ? "u" : "d"}`}
                  row={row}
                  onLabel={(value) => {
                    setRows(
                      rows.map((r) => (r.domain === row.domain ? { ...r, label: value } : r)),
                    );
                    setDirty(true);
                  }}
                  onRemove={() => {
                    setRows(rows.filter((r) => r.domain !== row.domain));
                    setDirty(true);
                  }}
                  onAdopt={() => {
                    setRows(
                      rows.map((r) => (r.domain === row.domain ? { ...r, undeclared: false } : r)),
                    );
                    setDirty(true);
                  }}
                />
              ))}
            </div>
          )}

          {dirty && (
            <p className="text-xs text-warning-foreground">
              {tr("Masz niezapisane zmiany — kliknij „Zapisz”.")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── kod ───────────────────────────────────────────────────────── */}
      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">{tr("Kod do wklejenia")}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tr("Przed ")}{" "}
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">&lt;/head&gt;</code>{" "}
            {tr(" na każdej śledzonej stronie — albo jako tag własny HTML w menedżerze tagów.")}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {baseLooksLocal && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
              <p>
                <strong>{tr("Nie wklejaj tego kodu na produkcyjną stronę.")}</strong>{" "}
                {tr(" Adres odbiorczy to")} <code className="font-mono">{baseUrl}</code>
                {tr(
                  ", czyli komputer, na którym to uruchomiono — u odwiedzającego taki kod nie wyśle niczego. Skopiuj kod z produkcyjnego PRM Core.",
                )}
              </p>
            </div>
          )}
          <CodeBlock code={snippet} />
          <p className="text-xs text-muted-foreground">
            {tr("Dane trafiają na ")} <code className="font-mono">{baseUrl || "—"}</code>
            {tr(". Ten adres jest wpisany w kod na stałe, więc")}{" "}
            <strong>{tr("kod skopiowany z innego środowiska nie zadziała")}</strong>{" "}
            {tr(" — zawsze bierz go z tego ekranu.")}
          </p>
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 text-xs space-y-1.5">
            <p className="font-medium">
              {tr("Instalacja przez Google Tag Managera — trzy kroki:")}
            </p>
            <ol className="list-decimal ml-4 space-y-1 text-muted-foreground">
              <li>
                <strong>{tr("Usuń wszystkie stare tagi")}</strong>{" "}
                {tr(
                  " z kodem PRM i zostaw dokładnie jeden, z kodem skopiowanym z tego ekranu (typ „Niestandardowy kod HTML”, reguła „All Pages”).",
                )}
              </li>
              <li>
                <strong>{tr("Opublikuj kontener")}</strong>{" "}
                {tr(
                  " — przycisk „Prześlij” w prawym górnym rogu GTM. Samo „Zapisz” zapisuje wersję roboczą, której odwiedzający nie widzą; to najczęstszy powód, dla którego „kod jest dodany, a nie działa”.",
                )}
              </li>
              <li>
                {tr("Wejdź na stronę z dopiskiem")}{" "}
                <code className="bg-muted px-1 py-0.5 rounded">{tr("?prm_debug=1")}</code>{" "}
                {tr(
                  " — w rogu pojawi się plakietka ze stanem: skąd załadował się skrypt, dokąd wysyła dane i czy serwer odebrał. Potem wróć tutaj — sygnał powinien być na liście.",
                )}
              </li>
            </ol>
            <p className="text-muted-foreground">
              {tr(
                "Kod v2 jest odporny na wpadkę z dwoma tagami: skrypt, który nie zdołał się załadować (np. ze starego, martwego adresu), nie blokuje już tego właściwego, a dane zawsze wracają na serwer, z którego skrypt przyszedł.",
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── ostatnie sygnały ──────────────────────────────────────────── */}
      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{tr("Ostatnie sygnały")}</CardTitle>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void refresh()}>
            <RefreshCw className="h-3.5 w-3.5" /> {tr(" Odśwież")}
          </Button>
        </CardHeader>
        <CardContent>
          {pings.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              {tr(
                "Nic jeszcze nie dotarło. Wejdź na śledzoną stronę i odśwież — sygnał powinien pojawić się w kilka sekund.",
              )}
            </p>
          ) : (
            <div className="divide-y text-xs">
              {pings.map((p) => (
                <div key={p.id} className="py-2 flex items-start gap-2">
                  {p.contactToken ? (
                    <UserCheck className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate" title={p.url}>
                      {p.url}
                    </p>
                    <p className="text-muted-foreground">
                      {p.host || "—"} · {relative(p.receivedAt)} ·{" "}
                      {p.contactToken ? tr("przypisany do kontaktu") : "anonimowy"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
