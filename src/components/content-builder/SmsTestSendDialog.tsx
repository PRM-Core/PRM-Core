import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { resolvePersonalizationInText, type ContentItem } from "@/lib/content-builder";
import { sendTestSms } from "@/lib/api/sms.functions";
import { SmsSenderPicker } from "@/components/content-builder/SmsSenderPicker";
import { t } from "@/lib/i18n";

const PHONE_RE = /^\+?[0-9\s]{6,}$/;

export function SmsTestSendDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ContentItem | null;
}) {
  const [to, setTo] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [body, setBody] = useState("");
  /** Sender id; "" means the default one. */
  const [sender, setSender] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (open) setBody(item?.smsBody ?? "");
  }, [open, item]);

  const canSend =
    PHONE_RE.test(to) && firstName.trim().length > 0 && body.trim().length > 0 && !isSending;

  const resolvedBody = resolvePersonalizationInText(body, {
    firstName: firstName.trim(),
    lastName: lastName.trim() || undefined,
    email: "",
  });

  const send = async () => {
    if (!canSend) return;
    setIsSending(true);
    try {
      const result = await sendTestSms({
        data: { to: to.trim(), body: resolvedBody.trim(), sender },
      });
      toast.success(t("Wysłano testowego SMS-a na {v0}", { v0: to.trim() }), {
        description: t("Nadawca: {sender}", { sender: result.sender }),
      });
      onOpenChange(false);
      setTo("");
    } catch (err) {
      toast.error(t("Nie udało się wysłać SMS-a"), {
        description: err instanceof Error ? err.message : t("Spróbuj ponownie."),
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Wyślij testowego SMS-a")}</DialogTitle>
          <DialogDescription>
            {t(
              "Numer w formacie E.164, np. +48123456789. Imię/nazwisko służą tylko do podstawienia danych personalizacji w tym teście — nie nadpisują szablonu.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Numer odbiorcy *")}</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="+48123456789"
              autoFocus
            />
          </div>
          {/* Testing from the default sender while the campaign uses another one
              proves nothing — so the test picks a sender too. */}
          <SmsSenderPicker value={sender} onChange={setSender} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Imię *")}</Label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t("Jan")}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Nazwisko")}</Label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="opcjonalnie"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Treść *")}</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          </div>
          {resolvedBody !== body && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Podgląd z podstawionymi danymi")}</Label>
              <p className="text-sm rounded-md border border-border bg-muted/30 p-2">
                {resolvedBody}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("Anuluj")}
          </Button>
          <Button size="sm" className="gap-1.5" disabled={!canSend} onClick={send}>
            {isSending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {isSending ? t("Wysyłanie…") : t("Wyślij test")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
