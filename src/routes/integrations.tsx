import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Check,
  Settings as SettingsIcon,
  Loader2,
  AlertTriangle,
  Send,
  Copy,
  RefreshCw,
  Inbox,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { getEmailIntegrationStatus, saveEmailSettings } from "@/lib/api/email.functions";
import { getSmsIntegrationStatus, sendTestSms } from "@/lib/api/sms.functions";
import { SmsSendersManager } from "@/components/settings/SmsSendersManager";
import { SmsSenderPicker } from "@/components/content-builder/SmsSenderPicker";
import { getLeadsWebhookStatus, regenerateWebhookSecret } from "@/lib/api/leads-webhook.functions";
import { MetaLeadsDirectCard } from "@/components/integrations/MetaLeadsDirectCard";
import { ContactWebhookCard } from "@/components/integrations/ContactWebhookCard";
import { BookingPauseCard } from "@/components/integrations/BookingPauseCard";
import { CanvaCard } from "@/components/integrations/CanvaCard";
import { DocplannerCard } from "@/components/integrations/DocplannerCard";
import { CredentialsPanel } from "@/components/integrations/CredentialsPanel";
import {
  getInboundChannelStatus,
  rotateInboundEmailWebhookSecret,
} from "@/lib/api/inbox.functions";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/integrations")({
  head: () => ({ meta: [{ title: t("Integrations — PRM Core") }] }),
  /**
   * Wynik powrotu z logowania Facebooka.
   *
   * **Bez tego przekierowanie wracało z komunikatem, którego nic nie
   * wyświetlało** — nieudane podłączenie strony wyglądało dokładnie tak samo
   * jak nieudane kliknięcie: pusta lista i żadnego śladu.
   */
  validateSearch: (search: Record<string, unknown>): { meta?: string; msg?: string } => ({
    meta: typeof search.meta === "string" ? search.meta : undefined,
    msg: typeof search.msg === "string" ? search.msg : undefined,
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const search = Route.useSearch();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{t("Integracje")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("Klucze dostępowe i ustawienia usług, z którymi PRM Core wymienia dane.")}
        </p>
      </div>

      {/* Wynik powrotu z Facebooka. Pokazywany na górze strony, bo błąd
          podłączenia trzeba zobaczyć zanim zacznie się szukać go gdzie
          indziej. */}
      {search.meta && (
        <div
          className={
            search.meta === "ok"
              ? "rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm"
              : "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm"
          }
        >
          <b>
            {search.meta === "ok" ? t("Facebook: podłączono.") : t("Facebook: nie podłączono.")}
          </b>
          {search.msg ? ` ${search.msg}` : ""}
        </div>
      )}

      <CredentialsPanel />

      {/* Tylko integracje, za którymi stoi działający kod. Makiety z danych
          przykładowych (Google Ads, Google Analytics, „CRM", „Calendars",
          „Webhooks" z plakietką „Połączono") usunięte w 1.64.0 — pokazywały
          połączenia, których nie było. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <EmailApiCard name="Email API" category="Komunikacja" />
        <SmsApiCard name="SMS API" category="Komunikacja" />
        <MetaLeadsDirectCard />
        <ContactWebhookCard />
        <BookingPauseCard />
        <DocplannerCard />
        <CanvaCard />
        <InboundChannelsCard />
      </div>
    </div>
  );
}

/**
 * Where patient replies come back in. Not one vendor's card — it is the set
 * of endpoints that feed the omnichannel inbox, one per provider.
 */
function InboundChannelsCard() {
  const [status, setStatus] = useState<{
    emailSecret: string;
    eventSecret: string;
    smsConfigured: boolean;
    baseUrl: string;
  } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    getInboundChannelStatus().then(setStatus);
    setOrigin(window.location.origin);
  }, []);

  // The address the providers will call is the deployed one, not whatever this
  // browser happens to be pointing at — engine settings hold it, and the local
  // origin is only a fallback for a fresh install.
  const base = (status?.baseUrl || origin).replace(/\/$/, "");
  const smsUrl = `${base}/api/webhooks/inbound-sms`;
  const emailUrl = status ? `${base}/api/webhooks/inbound-email/${status.emailSecret}` : "";
  const eventUrl = status?.eventSecret
    ? `${base}/api/webhooks/sendgrid-events/${status.eventSecret}`
    : "";
  const isLocal = /localhost|127\.0\.0\.1/.test(base);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("Skopiowano {label}", { label: label }));
    } catch {
      toast.error(t("Nie udało się skopiować {label}", { label: label }));
    }
  };

  const handleRotate = async () => {
    setRotating(true);
    try {
      const { secret } = await rotateInboundEmailWebhookSecret();
      setStatus((s) => (s ? { ...s, emailSecret: secret } : s));
      setRevealed(true);
      setConfirmOpen(false);
      toast.success(t("Nowy adres webhooka — zaktualizuj go w SendGrid Inbound Parse"));
    } catch (err) {
      toast.error(t("Nie udało się wygenerować nowego adresu"), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRotating(false);
    }
  };

  return (
    <Card className="border-border/60 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow sm:col-span-2 lg:col-span-3">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <div className="font-medium">{t("Wiadomości przychodzące")}</div>
              <div className="text-xs text-muted-foreground">{t("Skrzynka omnichannel")}</div>
            </div>
          </div>
          {!status ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : isLocal ? (
            <Badge
              className="bg-[oklch(0.78_0.15_75)]/15 text-[oklch(0.48_0.15_75)] border-[oklch(0.78_0.15_75)]/30 border"
              variant="outline"
            >
              <AlertTriangle className="h-3 w-3 mr-1" /> {t(" Czeka na deployment")}
            </Badge>
          ) : (
            <Badge
              className="bg-success/10 text-success border-success/20 border"
              variant="outline"
            >
              <Check className="h-3 w-3 mr-1" /> {t(" Adresy publiczne")}
            </Badge>
          )}
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          {t("Odpowiedzi pacjentów wpadają do zakładki ")} <b>{t("Omnichannel Inbox")}</b>{" "}
          {t(
            " i wyzwalają automatyzacje („Wiadomość od pacjenta”). Formularze i ankiety z pop-upów działają od razu — poniższe dwa adresy dokładają SMS-y i e-maile.",
          )}
        </p>

        {isLocal && (
          <p className="mt-2 text-xs text-[oklch(0.48_0.15_75)]">
            {t(
              "Adres wskazuje na localhost, więc ani Twilio, ani SendGrid go nie dosięgną. Te dwa kanały zaczną przyjmować wiadomości dopiero po wdrożeniu aplikacji pod publicznym HTTPS.",
            )}
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">
              {t("Twilio — SMS przychodzące")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("(numer → „A message comes in”, metoda POST)")}
              </span>
            </Label>
            <div className="flex items-center gap-2">
              <Input readOnly value={smsUrl} className="font-mono text-xs" />
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0"
                title={t("Kopiuj URL")}
                onClick={() => copy(smsUrl, "adres")}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t(
                "Bez sekretu w adresie — Twilio podpisuje każde wywołanie tokenem konta (Auth Token), a endpoint odrzuca wszystko, co się nie zgadza.",
              )}
              {status && !status.smsConfigured && " Najpierw ustaw numer nadawcy w karcie SMS API."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              {t("SendGrid — e-maile przychodzące")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("(Inbound Parse, wymaga rekordu MX)")}
              </span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                type={revealed ? "text" : "password"}
                value={emailUrl}
                className="font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => setRevealed((r) => !r)}
              >
                {revealed ? t("Ukryj") : t("Pokaż")}
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0"
                title={t("Kopiuj URL")}
                onClick={() => emailUrl && copy(emailUrl, "adres")}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0"
                title={t("Wygeneruj nowy adres")}
                onClick={() => setConfirmOpen(true)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t(
                "SendGrid nie podpisuje Inbound Parse, więc losowy fragment adresu jest tu jedynym zabezpieczeniem — traktuj cały URL jak hasło.",
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              {t("SendGrid — zdarzenia doręczenia")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("(Event Webhook — bounce, spam, dostarczone)")}
              </span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                type={revealed ? "text" : "password"}
                value={eventUrl}
                className="font-mono text-xs"
              />
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0"
                title={t("Kopiuj URL")}
                onClick={() => eventUrl && copy(eventUrl, "adres")}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("Wklej w ")} <b>{t("SendGrid → Settings → Mail Settings → Event Webhook")}</b>{" "}
              {t(
                " i zaznacz zdarzenia: Delivered, Bounced, Dropped, Spam Reports, Unsubscribed. Bez tego raporty nie mają skąd wziąć ",
              )}{" "}
              <b>{t("bounce rate")}</b>{" "}
              {t(
                ' ani liczby dostarczonych — o tym wie wyłącznie serwer pocztowy, a my pokażemy wtedy „brak danych", nie zmyśloną wartość.',
              )}
            </p>
          </div>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Wygenerować nowy adres?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Stary adres przestanie działać natychmiast. Jeśli masz już skonfigurowany Inbound Parse w SendGrid, przychodzące e-maile przestaną trafiać do skrzynki, dopóki nie wkleisz tam nowego adresu.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Anuluj")}</AlertDialogCancel>
            <AlertDialogAction disabled={rotating} onClick={handleRotate}>
              {rotating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}

              {t("Wygeneruj nowy")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

interface EmailStatus {
  apiKeyConfigured: boolean;
  fromEmail: string;
  fromName: string;
}

function EmailApiCard({ name, category }: { name: string; category: string }) {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    const s = await getEmailIntegrationStatus();
    setStatus(s);
    setFromEmail(s.fromEmail);
    setFromName(s.fromName);
    setReplyTo(s.replyTo);
  };

  useEffect(() => {
    refresh();
  }, []);

  const connected = !!status?.apiKeyConfigured && !!status?.fromEmail;

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveEmailSettings({ data: { fromEmail, fromName, replyTo } });
      toast.success(t("Zapisano ustawienia nadawcy"));
      setConfigOpen(false);
      await refresh();
    } catch (err) {
      toast.error(t("Nie udało się zapisać"), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border/60 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary-soft text-primary flex items-center justify-center font-semibold">
              {name
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div>
              <div className="font-medium">{name}</div>
              <div className="text-xs text-muted-foreground">{category}</div>
            </div>
          </div>
          {!status ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : connected ? (
            <Badge
              className="bg-success/10 text-success border-success/20 border"
              variant="outline"
            >
              <Check className="h-3 w-3 mr-1" /> {t(" Połączono")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              {t("Nie połączono")}
            </Badge>
          )}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {t(
            "Wysyłka maili przez SendGrid — realna, nie symulowana. Klucz API ustawia się w sekcji",
          )}{" "}
          <a href="#klucze" className="underline underline-offset-2">
            {t("Klucze i dane dostępowe")}
          </a>
          .
        </p>
        {status && !status.apiKeyConfigured && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-foreground bg-warning/15 rounded-md px-2 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />

            {t(
              "Brak klucza SendGrid — wysyłka zwróci błąd, dopóki nie uzupełnisz go w sekcji Klucze i dane dostępowe.",
            )}
          </p>
        )}
        {status && status.apiKeyConfigured && !status.fromEmail && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-foreground bg-warning/15 rounded-md px-2 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />

            {t("Ustaw adres nadawcy poniżej, żeby wysyłka działała.")}
          </p>
        )}
        <div className="mt-4 flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setConfigOpen(true)}
          >
            <SettingsIcon className="h-3.5 w-3.5" /> {t(" Konfiguruj")}
          </Button>
        </div>
      </CardContent>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Konfiguracja Email API (SendGrid)")}</DialogTitle>
            <DialogDescription>
              {t(
                "Adres i nazwa nadawcy używane przy każdej wysyłce — także testowej z Newslettera i Email. Klucz API ustawia się osobno, w sekcji Klucze i dane dostępowe na tej stronie.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Adres e-mail nadawcy *")}</Label>
              <Input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder={t("kontakt@klinika-abc.pl")}
              />
              <p className="text-[11px] text-muted-foreground">
                {t("Musi być zweryfikowanym nadawcą/domeną w SendGrid.")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Nazwa nadawcy")}</Label>
              <Input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder={t("Klinika ABC")}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Adres dla odpowiedzi")}</Label>
              <Input
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="listonosz@poczta.klinika-abc.pl"
              />
              <p className="text-[11px] text-muted-foreground">
                {t(
                  "Tu trafią odpowiedzi pacjentów. Zostaw puste, żeby odpowiadali na adres nadawcy. Żeby odpowiedzi wpadały do Skrzynki, ten adres musi być wpięty w SendGrid Inbound Parse.",
                )}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfigOpen(false)}>
              {t("Anuluj")}
            </Button>
            <Button
              size="sm"
              disabled={saving || !fromEmail}
              onClick={handleSave}
              className="gap-1.5"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}

              {t("Zapisz")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface SmsStatus {
  apiKeyConfigured: boolean;
  senderCount: number;
  hasReplyCapableSender: boolean;
}

function SmsApiCard({ name, category }: { name: string; category: string }) {
  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testBody, setTestBody] = useState("");
  const [testSender, setTestSender] = useState("");
  const [sending, setSending] = useState(false);

  const refresh = async () => {
    setStatus(await getSmsIntegrationStatus());
  };

  useEffect(() => {
    refresh();
  }, []);

  const connected = !!status?.apiKeyConfigured && (status?.senderCount ?? 0) > 0;

  const handleSendTest = async () => {
    setSending(true);
    try {
      const result = await sendTestSms({
        data: { to: testTo, body: testBody, sender: testSender },
      });
      toast.success(t("Wysłano testowego SMS-a na {testTo}", { testTo: testTo }), {
        description: t("Nadawca: {sender}", { sender: result.sender }),
      });
      setTestOpen(false);
      setTestTo("");
      setTestBody("");
    } catch (err) {
      toast.error(t("Nie udało się wysłać SMS-a"), {
        description: err instanceof Error ? err.message : t("Spróbuj ponownie."),
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="border-border/60 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary-soft text-primary flex items-center justify-center font-semibold">
              {name
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div>
              <div className="font-medium">{name}</div>
              <div className="text-xs text-muted-foreground">{category}</div>
            </div>
          </div>
          {!status ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : connected ? (
            <Badge
              className="bg-success/10 text-success border-success/20 border"
              variant="outline"
            >
              <Check className="h-3 w-3 mr-1" /> {t(" Połączono")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              {t("Nie połączono")}
            </Badge>
          )}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {t(
            "Wysyłka SMS przez Twilio — realna, nie symulowana. Account SID i Auth Token ustawia się w sekcji",
          )}{" "}
          <a href="#klucze" className="underline underline-offset-2">
            {t("Klucze i dane dostępowe")}
          </a>
          .
        </p>
        {status && !status.apiKeyConfigured && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-foreground bg-warning/15 rounded-md px-2 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />

            {t(
              "Brak danych Twilio — wysyłka zwróci błąd, dopóki nie uzupełnisz ich w sekcji Klucze i dane dostępowe.",
            )}
          </p>
        )}
        {status && status.apiKeyConfigured && status.senderCount === 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-foreground bg-warning/15 rounded-md px-2 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />

            {t("Dodaj co najmniej jednego nadawcę poniżej, żeby wysyłka działała.")}
          </p>
        )}
        {status && status.senderCount > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Skonfigurowanych nadawców: ")} <b>{status.senderCount}</b>
            {status.hasReplyCapableSender
              ? t(" — w tym numer zdolny odbierać odpowiedzi.")
              : t(" — żaden nie odbierze odpowiedzi (same nazwy alfanumeryczne).")}
          </p>
        )}
        <div className="mt-4 flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setConfigOpen(true)}
          >
            <SettingsIcon className="h-3.5 w-3.5" /> {t(" Nadawcy")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={!connected}
            onClick={() => setTestOpen(true)}
          >
            <Send className="h-3.5 w-3.5" /> {t(" Wyślij testowo")}
          </Button>
        </div>
      </CardContent>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("Nadawcy SMS (Twilio)")}</DialogTitle>
            <DialogDescription>
              {t(
                "Możesz mieć kilku nadawców równocześnie. Domyślny jest używany wszędzie tam, gdzie krok automatyzacji nie wskazuje innego. Dane uwierzytelniające ustawia się osobno, w sekcji Klucze i dane dostępowe na tej stronie.",
              )}
            </DialogDescription>
          </DialogHeader>
          <SmsSendersManager onChanged={refresh} />
        </DialogContent>
      </Dialog>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Wyślij testowego SMS-a")}</DialogTitle>
            <DialogDescription>{t("Numer w formacie E.164, np. +48123456789.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <SmsSenderPicker value={testSender} onChange={setTestSender} />
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Numer odbiorcy *")}</Label>
              <Input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="+48123456789"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Treść *")}</Label>
              <Input
                value={testBody}
                onChange={(e) => setTestBody(e.target.value)}
                placeholder={t("Wiadomość testowa z PRM Core")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTestOpen(false)}>
              {t("Anuluj")}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={sending || !testTo || !testBody}
              onClick={handleSendTest}
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {sending ? t("Wysyłanie…") : t("Wyślij test")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
