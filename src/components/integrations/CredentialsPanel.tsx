import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
  FileInput,
  KeyRound,
  Loader2,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  INTEGRATIONS,
  integrationState,
  type CredentialField,
  type CredentialName,
  type CredentialStatus,
  type IntegrationDef,
  type IntegrationState,
} from "@/lib/credentials/catalog";
import {
  checkIntegrationConnection,
  clearIntegrationCredential,
  generateMcpAccessToken,
  getCredentialsPanel,
  importIntegrationCredentialsFromEnv,
  saveIntegrationCredentials,
} from "@/lib/api/credentials.functions";
import { intlLocale, t } from "@/lib/i18n";

/**
 * Integracje → Klucze i dane dostępowe (1.64.0).
 *
 * Jedno miejsce na wszystko, czego integracje potrzebują do połączenia.
 * Sekrety są tu wyłącznie do **wpisania** — serwer nigdy ich nie odsyła, więc
 * panel pokazuje tylko, skąd wartość pochodzi i jej końcówkę.
 */

type PanelData = Awaited<ReturnType<typeof getCredentialsPanel>>;
type Allowed = Extract<PanelData, { allowed: true }>;

const stateLabel = (state: IntegrationState): string =>
  ({
    ready: t("Skonfigurowane"),
    partial: t("Niekompletne"),
    missing: t("Nie skonfigurowano"),
    problem: t("Wymaga uwagi"),
  })[state];

function StateBadge({ state }: { state: IntegrationState }) {
  const cls =
    state === "ready"
      ? "bg-success/10 text-success border-success/20"
      : state === "missing"
        ? "text-muted-foreground"
        : "bg-warning/15 text-warning-foreground border-warning/30";
  return (
    <Badge variant="outline" className={`shrink-0 border ${cls}`}>
      {state === "ready" && <CheckCircle2 className="h-3 w-3 mr-1" />}
      {(state === "partial" || state === "problem") && <AlertTriangle className="h-3 w-3 mr-1" />}
      {stateLabel(state)}
    </Badge>
  );
}

const formatWhen = (ms: number) =>
  new Date(ms).toLocaleString(intlLocale(), {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function CredentialsPanel() {
  const [data, setData] = useState<PanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setData(await getCredentialsPanel());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Nie udało się wczytać stanu kluczy."));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (error) {
    return (
      <Card id="klucze" className="border-border/60">
        <CardContent className="p-5 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card id="klucze" className="border-border/60">
        <CardContent className="p-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t(" Wczytywanie kluczy…")}
        </CardContent>
      </Card>
    );
  }
  if (!data.allowed) {
    return (
      <Card id="klucze" className="border-border/60">
        <CardContent className="p-5 flex items-start gap-2 text-sm text-muted-foreground">
          <KeyRound className="h-4 w-4 mt-0.5 shrink-0" />

          {t("Klucze i dane dostępowe integracji ustawia administrator.")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="klucze" className="border-border/60 shadow-[var(--shadow-card)] scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" /> {t(" Klucze i dane dostępowe")}
        </CardTitle>
        <CardDescription>
          {t(
            "Zapisane tu wartości są szyfrowane w bazie i nigdy nie wracają do przeglądarki — widać tylko ich końcówkę. Mają pierwszeństwo przed plikiem ",
          )}{" "}
          <code>{t(".env")}</code>{" "}
          {t(" na serwerze. Każda zmiana trafia do dziennika zdarzeń (kto i kiedy, bez wartości).")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <MasterKeyNotice state={data.masterKey} />
        <EnvImport data={data} onChanged={refresh} />
        <div className="divide-y rounded-lg border">
          {INTEGRATIONS.map((def) => (
            <IntegrationRow
              key={def.id}
              def={def}
              data={data}
              expanded={open === def.id}
              onToggle={() => setOpen((cur) => (cur === def.id ? null : def.id))}
              onChanged={refresh}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * „Przenieś z .env do panelu” — żeby nie przepisywać ręcznie kluczy, które
 * już działają. Pokazywane tylko, gdy jest co przenosić.
 */
function EnvImport({ data, onChanged }: { data: Allowed; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const fromEnv = data.statuses.filter((s) => s.source === "env");
  if (fromEnv.length === 0) return null;

  const integrations = INTEGRATIONS.filter((i) =>
    i.fields.some((f) => fromEnv.some((s) => s.name === f.name)),
  ).map((i) => i.name);

  const run = async () => {
    setBusy(true);
    try {
      const r = await importIntegrationCredentialsFromEnv();
      if (r.imported.length) {
        toast.success(t("Przeniesiono do panelu: {length}", { length: r.imported.length }), {
          description: t("Integracje działają dalej bez przerwy."),
        });
      }
      if (r.skipped.length) {
        toast.warning(
          t("Pominięto: {length} — zostają w pliku .env", { length: r.skipped.length }),
          {
            description: r.skipped.map((s) => `${s.label}: ${s.problem}`).join(" "),
            duration: 15000,
          },
        );
      }
      await onChanged();
    } catch (err) {
      toast.error(t("Nie przeniesiono"), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <p className="text-sm">
        <b>{integrations.join(", ")}</b> {t(" — działają na danych z pliku ")}{" "}
        <code>{t(".env")}</code>
        {t(". Nie trzeba ich łączyć od nowa.")}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("Możesz przenieść te wartości do panelu jednym kliknięciem — bez przepisywania. Plik")}{" "}
        <code>{t(".env")}</code>{" "}
        {t(" zostaje nietknięty, a to, co już ustawiono w panelu, nie zostanie nadpisane.")}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5"
        disabled={busy || data.masterKey !== "ok"}
        onClick={() => void run()}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileInput className="h-3.5 w-3.5" />
        )}
        {t("Przenieś z .env do panelu (")}
        {fromEnv.length})
      </Button>
    </div>
  );
}

function MasterKeyNotice({ state }: { state: Allowed["masterKey"] }) {
  if (state === "ok") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-success" />{" "}
        {t(" Klucz szyfrujący jest ustawiony — zapis z panelu działa.")}
      </p>
    );
  }
  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm space-y-1.5">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 text-warning-foreground" />
        {state === "missing"
          ? t("Zapis z panelu jest wyłączony — brak klucza szyfrującego")
          : t("Klucz szyfrujący ma zły format")}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("Na serwerze dopisz do pliku ")} <code>{t(".env")}</code> {t(" zmienną ")}{" "}
        <code>{t("PRM_SECRETS_KEY")}</code> {t(" — 64 znaki szesnastkowe (polecenie")}{" "}
        <code>head -c 32 /dev/urandom | od -An -tx1 | tr -d &apos; \n&apos;</code>
        {t(") — i odtwórz kontener poleceniem ")} <code>{t("docker compose up -d")}</code>
        {t(". Do tego czasu integracje działają na kluczach z ")} <code>{t(".env")}</code>
        {t(", a panel tylko pokazuje ich stan.")}
      </p>
    </div>
  );
}

function IntegrationRow({
  def,
  data,
  expanded,
  onToggle,
  onChanged,
}: {
  def: IntegrationDef;
  data: Allowed;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const statuses = useMemo(
    () => data.statuses.filter((s) => def.fields.some((f) => f.name === s.name)),
    [data.statuses, def],
  );
  const state = integrationState(def, statuses);
  const panelId = `klucze-${def.id}`;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm">{def.name}</div>
          <div className="text-xs text-muted-foreground">{def.purpose}</div>
          {/* Na wąskim ekranie plakietka pod opisem — obok ściskała opis do
              kilkunastu znaków w linii. */}
          <div className="mt-1.5 sm:hidden">
            <StateBadge state={state} />
          </div>
        </div>
        <div className="hidden sm:block">
          <StateBadge state={state} />
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div id={panelId} className="px-4 pb-4 pt-1">
          <IntegrationForm
            def={def}
            statuses={statuses}
            canWrite={data.masterKey === "ok"}
            state={state}
            onChanged={onChanged}
          />
        </div>
      )}
    </div>
  );
}

function initialValues(def: IntegrationDef, statuses: CredentialStatus[]) {
  const out: Partial<Record<CredentialName, string>> = {};
  for (const f of def.fields) {
    const st = statuses.find((s) => s.name === f.name);
    if (f.kind === "flag") out[f.name] = st?.hint === "1" ? "1" : "0";
    else out[f.name] = f.secret ? "" : (st?.hint ?? "");
  }
  return out;
}

function IntegrationForm({
  def,
  statuses,
  canWrite,
  state,
  onChanged,
}: {
  def: IntegrationDef;
  statuses: CredentialStatus[];
  canWrite: boolean;
  state: IntegrationState;
  onChanged: () => Promise<void>;
}) {
  const initial = useMemo(() => initialValues(def, statuses), [def, statuses]);
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [toClear, setToClear] = useState<CredentialField | null>(null);
  const [generated, setGenerated] = useState<string | null>(null);

  useEffect(() => setValues(initial), [initial]);

  const changed = def.fields.filter((f) => {
    const v = values[f.name] ?? "";
    if (f.secret) return v !== "";
    return v !== (initial[f.name] ?? "");
  });

  const save = async () => {
    setSaving(true);
    setCheck(null);
    try {
      const payload: Record<string, string> = {};
      for (const f of changed) payload[f.name] = values[f.name] ?? "";
      await saveIntegrationCredentials({ data: { values: payload } });
      toast.success(t("{name}: zapisano", { name: def.name }));
      await onChanged();
    } catch (err) {
      toast.error(t("Nie zapisano"), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const runCheck = async () => {
    setChecking(true);
    setCheck(null);
    try {
      setCheck(await checkIntegrationConnection({ data: { integration: def.id } }));
    } catch (err) {
      setCheck({
        ok: false,
        message: err instanceof Error ? err.message : t("Sprawdzenie nie powiodło się."),
      });
    } finally {
      setChecking(false);
    }
  };

  const clear = async (field: CredentialField) => {
    try {
      await clearIntegrationCredential({ data: { name: field.name } });
      toast.success(t("{label}: usunięto z panelu", { label: field.label }));
      setCheck(null);
      await onChanged();
    } catch (err) {
      toast.error(t("Nie usunięto"), {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const generate = async () => {
    try {
      const { token } = await generateMcpAccessToken();
      setGenerated(token);
      await onChanged();
    } catch (err) {
      toast.error(t("Nie wygenerowano"), {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    // method="post": bez skryptu przeglądarka wysłałaby klucze w adresie (GET).
    <form
      method="post"
      className="space-y-4"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed.length && canWrite) void save();
      }}
    >
      {def.fields.map((f) => (
        <FieldRow
          key={f.name}
          field={f}
          status={statuses.find((s) => s.name === f.name)}
          value={values[f.name] ?? ""}
          disabled={!canWrite || saving}
          onChange={(v) => setValues((cur) => ({ ...cur, [f.name]: v }))}
          onClear={() => setToClear(f)}
        />
      ))}

      {generated && (
        <div className="rounded-md border border-success/30 bg-success/5 p-3 space-y-2">
          <p className="text-sm font-medium">
            {t("Nowy token — skopiuj go teraz, później nie będzie widoczny.")}
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={generated}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 shrink-0"
              onClick={() => {
                void navigator.clipboard?.writeText(generated).then(
                  () => toast.success(t("Skopiowano")),
                  () => toast.error(t("Nie udało się skopiować — zaznacz i skopiuj ręcznie.")),
                );
              }}
            >
              <Copy className="h-3.5 w-3.5" /> {t(" Kopiuj")}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="submit"
          size="sm"
          disabled={!canWrite || saving || changed.length === 0}
          className="gap-1.5"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}

          {t("Zapisz")}
          {changed.length > 1 ? ` (${changed.length})` : ""}
        </Button>
        {def.checkable && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={checking || state === "missing" || changed.length > 0}
            title={
              changed.length > 0
                ? t("Najpierw zapisz zmiany — sprawdzane są zapisane dane.")
                : undefined
            }
            onClick={() => void runCheck()}
          >
            {checking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlugZap className="h-3.5 w-3.5" />
            )}

            {t("Sprawdź połączenie")}
          </Button>
        )}
        {def.generate && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={!canWrite}
            onClick={() => void generate()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {statuses.some((s) => s.source !== "none")
              ? t("Wygeneruj nowy token")
              : t("Wygeneruj token")}
          </Button>
        )}
      </div>

      {check && (
        <p
          role="status"
          className={`flex items-start gap-1.5 text-sm ${check.ok ? "text-success" : "text-destructive"}`}
        >
          {check.ok ? (
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          {check.message}
        </p>
      )}
      {!def.checkable && def.checkNote && (
        <p className="text-xs text-muted-foreground">{def.checkNote}</p>
      )}

      <AlertDialog open={!!toClear} onOpenChange={(o) => !o && setToClear(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Usunąć „")}
              {toClear?.label}
              {t("” z panelu?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("System wróci do wartości z pliku ")} <code>{t(".env")}</code>{" "}
              {t(
                " na serwerze, a jeśli jej tam nie ma — integracja przestanie działać do czasu ponownego wpisania.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Anuluj")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toClear) void clear(toClear);
                setToClear(null);
              }}
            >
              {t("Usuń")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function SourceLine({ field, status }: { field: CredentialField; status?: CredentialStatus }) {
  if (!status) return null;
  const problem =
    status.problem === "key-missing"
      ? t("Wpis z panelu jest nieczytelny: brak klucza szyfrującego na serwerze.")
      : status.problem === "key-mismatch"
        ? t("Wpis z panelu zapisano innym kluczem szyfrującym — wpisz wartość ponownie.")
        : status.problem === "corrupt"
          ? t("Wpis z panelu jest uszkodzony — wpisz wartość ponownie.")
          : null;

  const tail =
    field.secret && status.hint ? t(" · kończy się na …{hint}", { hint: status.hint }) : "";
  const flag =
    field.kind === "flag" ? ` · ${status.hint === "1" ? t("włączone") : t("wyłączone")}` : "";
  let text: string;
  if (status.source === "panel") {
    text = `Zapisane w panelu${tail}${flag}${status.updatedAt ? ` · ${formatWhen(status.updatedAt)}` : ""}${status.updatedBy ? `, ${status.updatedBy}` : ""}`;
  } else if (status.source === "env") {
    text = t("Z pliku .env na serwerze{tail}{flag} — zapisanie tutaj zastąpi tę wartość", {
      tail: tail,
      flag: flag,
    });
  } else {
    text = "Nie ustawiono";
  }
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground">{text}</p>
      {problem && (
        <p className="flex items-start gap-1 text-[11px] text-warning-foreground">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          {problem}
          {status.source === "env" ? t(" Do tego czasu używana jest wartość z .env.") : ""}
        </p>
      )}
    </div>
  );
}

function FieldRow({
  field,
  status,
  value,
  disabled,
  onChange,
  onClear,
}: {
  field: CredentialField;
  status?: CredentialStatus;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  const inputId = `pole-${field.name}`;
  const hasPanelEntry = status?.source === "panel" || !!status?.problem;

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor={inputId} className="text-sm">
            {field.label}
          </Label>
          <SourceLine field={field} status={status} />
        </div>
        {hasPanelEntry && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-destructive hover:text-destructive shrink-0"
            onClick={onClear}
          >
            <Trash2 className="h-3.5 w-3.5" /> {t(" Usuń z panelu")}
          </Button>
        )}
      </div>
      {field.kind === "flag" ? (
        <div className="flex items-center gap-2">
          <Switch
            id={inputId}
            checked={value === "1"}
            disabled={disabled}
            onCheckedChange={(v) => onChange(v ? "1" : "0")}
          />
          <span className="text-xs text-muted-foreground">
            {value === "1" ? t("Włączone") : t("Wyłączone")}
          </span>
        </div>
      ) : (
        <Input
          id={inputId}
          // Losowa nazwa + wyłączenia menedżerów haseł: bez tego przeglądarka
          // proponuje zapisanie klucza API jako hasła do strony albo wpisuje
          // w to pole hasło logowania do PRM.
          name={`prm-${field.name.toLowerCase()}`}
          type={field.secret ? "password" : "text"}
          autoComplete={field.secret ? "new-password" : "off"}
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          value={value}
          disabled={disabled}
          placeholder={
            field.secret
              ? status?.source === "none"
                ? (field.placeholder ?? t("Wpisz wartość"))
                : t("Wpisz nową wartość, żeby zmienić")
              : field.placeholder
          }
          className="font-mono text-xs"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <p className="text-[11px] text-muted-foreground">{field.help}</p>
    </div>
  );
}
