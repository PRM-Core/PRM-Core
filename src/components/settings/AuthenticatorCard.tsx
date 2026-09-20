import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  confirmTotp,
  getTotpStatus,
  startTotpSetup,
  turnOffTotp,
} from "@/lib/api/authenticator.functions";
import { t } from "@/lib/i18n";

/**
 * Konfiguracja aplikacji uwierzytelniającej w Ustawieniach → Bezpieczeństwo.
 *
 * Trzy stany, celowo rozdzielone: wyłączona, w trakcie konfiguracji, włączona.
 * Środkowy istnieje, bo zeskanowanie kodu QR **nie wystarczy** — dopóki
 * użytkownik nie przepisze kodu, nie wiemy, czy aplikacja naprawdę działa,
 * a włączenie drugiego składnika „na wiarę" zamyka konto przy następnym
 * logowaniu.
 */
export function AuthenticatorCard() {
  const [status, setStatus] = useState<{
    enabled: boolean;
    pending: boolean;
    recoveryLeft: number;
  } | null>(null);
  const [setup, setSetup] = useState<{ qrDataUrl: string; manualKey: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [offPassword, setOffPassword] = useState("");
  const [askOff, setAskOff] = useState(false);

  const refresh = useCallback(() => {
    getTotpStatus()
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, pending: false, recoveryLeft: 0 }));
  }, []);
  useEffect(() => refresh(), [refresh]);

  async function begin() {
    setBusy(true);
    try {
      setSetup(await startTotpSetup());
      setCode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Nie udało się rozpocząć konfiguracji."));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const r = await confirmTotp({ data: { code } });
      if (!r.ok) {
        toast.error(r.error ?? t("Kod nie pasuje."));
        return;
      }
      setRecoveryCodes(r.recoveryCodes ?? []);
      setSetup(null);
      setCode("");
      refresh();
      toast.success(t("Aplikacja uwierzytelniająca włączona."));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const r = await turnOffTotp({ data: { password: offPassword } });
      if (!r.ok) {
        toast.error(r.error ?? t("Nie udało się wyłączyć."));
        return;
      }
      setAskOff(false);
      setOffPassword("");
      refresh();
      toast.success(t("Aplikacja uwierzytelniająca wyłączona."));
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardContent className="p-10 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 shadow-[var(--shadow-card)]">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-4 w-4" /> {t(" Aplikacja uwierzytelniająca")}
            </CardTitle>
            <CardDescription>
              {t(
                "Kody logowania z Google Authenticator, Authy, 1Password lub Microsoft Authenticator. Działają bez zasięgu i nie kosztują nic — w odróżnieniu od SMS-a.",
              )}
            </CardDescription>
          </div>
          {status.enabled ? (
            <Badge className="gap-1 bg-success/10 text-success border-success/20">
              <ShieldCheck className="h-3 w-3" /> {t(" Włączona")}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <ShieldOff className="h-3 w-3" /> {t(" Wyłączona")}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── kody zapasowe, pokazywane RAZ ── */}
        {recoveryCodes && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
              <KeyRound className="h-4 w-4" />{" "}
              {t(" Zapisz kody zapasowe — zobaczysz je tylko teraz")}
            </div>
            <p className="text-xs text-amber-800">
              {t(
                "Każdy działa raz i pozwala wejść, gdy nie masz telefonu. Wydrukuj je albo zapisz w menedżerze haseł. Po zamknięciu tego okna nie da się ich odtworzyć — także nam.",
              )}
            </p>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-sm">
              {recoveryCodes.map((c) => (
                <div key={c} className="rounded bg-white px-2 py-1 text-center">
                  {c}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  void navigator.clipboard.writeText(recoveryCodes.join("\n"));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}

                {t("Kopiuj wszystkie")}
              </Button>
              <Button size="sm" onClick={() => setRecoveryCodes(null)}>
                {t("Zapisałem je")}
              </Button>
            </div>
          </div>
        )}

        {/* ── konfiguracja w toku ── */}
        {setup && (
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <img
                src={setup.qrDataUrl}
                alt={t("Kod QR do zeskanowania w aplikacji uwierzytelniającej")}
                className="h-[200px] w-[200px] shrink-0 rounded border bg-white"
              />
              <div className="space-y-3 text-sm">
                <p className="font-medium">{t("1. Zeskanuj kod w aplikacji")}</p>
                <p className="text-xs text-muted-foreground">
                  {t('Google Authenticator → „+" → „Skanuj kod QR".')}
                </p>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {t("Nie możesz zeskanować? Wpisz klucz ręcznie:")}
                  </p>
                  <code className="block rounded bg-muted px-2 py-1.5 font-mono text-xs tracking-wider">
                    {setup.manualKey}
                  </code>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("2. Przepisz kod, który pokazała aplikacja")}
              </Label>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  maxLength={6}
                  inputMode="numeric"
                  placeholder="123456"
                  className="max-w-[160px] text-center font-mono text-lg tracking-[0.3em]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && code.length === 6) void confirm();
                  }}
                />
                <Button disabled={code.length !== 6 || busy} onClick={() => void confirm()}>
                  {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}

                  {t("Włącz")}
                </Button>
                <Button variant="ghost" onClick={() => setSetup(null)}>
                  {t("Anuluj")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Kod zmienia się co 30 sekund. Jeśli nie pasuje, sprawdź w telefonie automatyczne ustawianie czasu — to najczęstsza przyczyna.",
                )}
              </p>
            </div>
          </div>
        )}

        {/* ── stan spoczynkowy ── */}
        {!setup && !status.enabled && (
          <Button onClick={() => void begin()} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            <Smartphone className="h-4 w-4" /> {t(" Skonfiguruj aplikację")}
          </Button>
        )}

        {!setup && status.enabled && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("Przy logowaniu podajesz kod z aplikacji zamiast SMS-a. Kodów zapasowych zostało")}{" "}
              <b>{status.recoveryLeft}</b>.
              {status.recoveryLeft <= 2 && (
                <span className="text-warning-foreground">
                  {" "}
                  {t("Zostało ich mało — wyłącz i włącz aplikację, żeby wygenerować nowe.")}
                </span>
              )}
            </p>
            {askOff ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("Potwierdź hasłem")}</Label>
                  <Input
                    type="password"
                    value={offPassword}
                    onChange={(e) => setOffPassword(e.target.value)}
                    className="max-w-[220px]"
                    autoFocus
                  />
                </div>
                <Button
                  variant="destructive"
                  disabled={!offPassword || busy}
                  onClick={() => void turnOff()}
                >
                  {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}

                  {t("Wyłącz")}
                </Button>
                <Button variant="ghost" onClick={() => setAskOff(false)}>
                  {t("Anuluj")}
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setAskOff(true)}>
                {t("Wyłącz aplikację")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
