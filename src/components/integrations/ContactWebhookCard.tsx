import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, RefreshCw, Webhook } from "lucide-react";
import { toast } from "sonner";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLeadsWebhookStatus, regenerateWebhookSecret } from "@/lib/api/leads-webhook.functions";
import { t } from "@/lib/i18n";

/**
 * Webhook kontaktów — adres i sekret dla systemów zewnętrznych.
 *
 * **Karta wróciła jako osobna** po tym, jak integracja z Metą przestała
 * chodzić przez Zapiera. Adres jest ten sam, ale odbiorca inny: korzysta
 * z niego system rezerwacji placówki i każdy system, który ma zakładać kontakty
 * i rezerwacje. To jedyne miejsce, z którego da się skopiować sekret.
 */
export function ContactWebhookCard() {
  const [secret, setSecret] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const refresh = useCallback(() => {
    getLeadsWebhookStatus()
      .then((s) => setSecret(s.secret))
      .catch(() => setSecret(""));
  }, []);

  useEffect(refresh, [refresh]);

  const copy = async (value: string, what: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(t("Skopiowano {what}.", { what: what }));
  };

  const leadsUrl = `${origin}/api/webhooks/leads`;
  const bookingUrl = `${origin}/api/webhooks/booking`;

  return (
    <Card className="border-border/60 shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Webhook className="h-4 w-4" /> {t(" Webhook kontaktów i rezerwacji")}
        </CardTitle>
        <CardDescription>
          {t(
            "Adresy dla systemu rezerwacji i innych systemów, które mają zakładać kontakty oraz zapisywać wizyty. Oba przyjmują JSON metodą POST i wymagają sekretu w nagłówku.",
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("Nowy kontakt / lead")}</Label>
          <div className="flex items-center gap-2">
            <Input readOnly value={leadsUrl} className="font-mono text-xs" />
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              title={t("Kopiuj adres")}
              onClick={() => copy(leadsUrl, "adres")}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("Rezerwacja wizyty")}</Label>
          <div className="flex items-center gap-2">
            <Input readOnly value={bookingUrl} className="font-mono text-xs" />
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              title={t("Kopiuj adres")}
              onClick={() => copy(bookingUrl, "adres")}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">
            {t("Sekret — nagłówek ")} <code className="text-[11px]">{t("X-Webhook-Secret")}</code>
          </Label>
          <div className="flex items-center gap-2">
            {secret === null ? (
              <div className="flex h-9 flex-1 items-center justify-center rounded-md border">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Input
                readOnly
                type={revealed ? "text" : "password"}
                value={secret}
                className="font-mono text-xs"
              />
            )}
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
              title={t("Kopiuj sekret")}
              disabled={!secret}
              onClick={() => secret && copy(secret, "sekret")}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              title={t("Wygeneruj nowy sekret")}
              onClick={() => setConfirmOpen(true)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t(
              "Ten sam sekret obsługuje oba adresy. Traktuj go jak hasło — kto go ma, może zakładać kontakty w bazie placówki.",
            )}
          </p>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Wygenerować nowy sekret?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Stary przestanie działać natychmiast. Każdy system, który go używa — w tym system rezerwacji — zacznie dostawać odmowę, dopóki nie wpiszecie tam nowego. Rób to wtedy, gdy sekret wyciekł.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Anuluj")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={rotating}
              onClick={async () => {
                setRotating(true);
                const r = await regenerateWebhookSecret().catch(() => null);
                setRotating(false);
                setConfirmOpen(false);
                if (!r) {
                  toast.error(t("Nie udało się wygenerować nowego sekretu."));
                  return;
                }
                setSecret(r.secret);
                setRevealed(true);
                toast.success(
                  t("Nowy sekret gotowy — zaktualizuj go w systemach, które go używają."),
                );
              }}
            >
              {t("Wygeneruj nowy")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
