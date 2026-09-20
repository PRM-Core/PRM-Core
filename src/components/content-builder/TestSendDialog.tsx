import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, MailCheck, Loader2 } from "lucide-react";
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
import { BlockPreview } from "@/components/content-builder/BlockPreview";
import { cn } from "@/lib/utils";
import type { ContentItem, PersonalizationSample } from "@/lib/content-builder";
import {
  attachmentIdsFromBlocks,
  mergeAttachmentIds,
  renderContentItemToHtml,
} from "@/lib/content-builder-html";
import { sendTestEmail } from "@/lib/api/email.functions";
import { getEmailSenders, type EmailSenderRow } from "@/lib/api/email-senders.functions";
import { t } from "@/lib/i18n";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function TestSendDialog({
  open,
  onOpenChange,
  item,
  narrow = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ContentItem | null;
  narrow?: boolean;
}) {
  const [step, setStep] = useState<"form" | "preview">("form");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [sample, setSample] = useState<PersonalizationSample | null>(null);
  const [isSending, setIsSending] = useState(false);
  /**
   * Nadawca na czas tego testu — **niezależny od tego, co ustawiono przy
   * wiadomości.** Sens testu polega na sprawdzeniu, jak wiadomość wygląda
   * w skrzynce, a nazwa nadawcy jest pierwszą rzeczą, którą pacjent tam widzi.
   * Bez tego wyboru sprawdzenie drugiej nazwy wymagałoby przestawienia
   * wiadomości, wysłania testu i przestawienia z powrotem.
   */
  const [senderId, setSenderId] = useState("");
  const [senders, setSenders] = useState<EmailSenderRow[]>([]);

  useEffect(() => {
    if (!open) return;
    getEmailSenders()
      .then(setSenders)
      .catch(() => setSenders([]));
  }, [open]);

  // Domyślnie ten, którym pójdzie prawdziwa wysyłka — test ma odwzorowywać ją,
  // a nie zaczynać od czegoś innego.
  useEffect(() => {
    if (open) setSenderId(item?.senderId ?? "");
  }, [open, item?.senderId]);

  const reset = () => {
    setStep("form");
    setEmail("");
    setFirstName("");
    setLastName("");
    setSample(null);
    setIsSending(false);
    setSenderId(item?.senderId ?? "");
  };

  const isValidEmail = EMAIL_RE.test(email);
  const canSend = isValidEmail && firstName.trim().length > 0 && !isSending && !!item;

  const send = async () => {
    if (!canSend || !item) return;
    const s: PersonalizationSample = {
      email: email.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim() || undefined,
    };

    setIsSending(true);
    try {
      await sendTestEmail({
        data: {
          to: s.email,
          subject: item.name,
          html: renderContentItemToHtml(item, s),
          baseUrl: window.location.origin,
          contentItemId: item.id,
          // **Test ma iść dokładnie tak, jak pójdzie wysyłka.** Bez tych dwóch
          // pól podpisywał się nazwą z Ustawień → SMTP i szedł bez załączników,
          // czyli sprawdzał coś innego niż to, co dostanie pacjent.
          senderId,
          attachments: mergeAttachmentIds(
            item.attachments ?? [],
            attachmentIdsFromBlocks(item.blocks ?? []),
          ),
        },
      });
      setSample(s);
      setStep("preview");
      toast.success(t("Wysłano testową wiadomość na {email}", { email: s.email }), {
        description: t("Podgląd spersonalizowany dla: {firstName}{v1}", {
          firstName: s.firstName,
          v1: s.lastName ? " " + s.lastName : "",
        }),
      });
    } catch (err) {
      toast.error(t("Nie udało się wysłać wiadomości testowej"), {
        description: err instanceof Error ? err.message : t("Spróbuj ponownie."),
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-md">
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("Wyślij testową wiadomość")}</DialogTitle>
              <DialogDescription>
                {t(
                  "Podaj adres e-mail i dane testowego odbiorcy — zobaczysz wiadomość z podstawionymi danymi personalizacji, dokładnie tak jak zobaczyłby ją prawdziwy pacjent.",
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Adres e-mail *")}</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="test@example.com"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && canSend && send()}
                />
              </div>
              {senders.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("Nadawca")}</Label>
                  <select
                    value={senderId}
                    onChange={(e) => setSenderId(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">
                      {t("Domyślny")}
                      {senders.find((x) => x.isDefault === 1)
                        ? ` (${senders.find((x) => x.isDefault === 1)!.name})`
                        : ""}
                    </option>
                    {senders.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                        {x.email ? ` — ${x.email}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-1.5">
                <MailCheck className="h-4 w-4 text-success" /> {t(" Testowa wiadomość wysłana")}
              </DialogTitle>
              <DialogDescription>
                {t("Podgląd dla")}{" "}
                <b>
                  {sample?.firstName}
                  {sample?.lastName ? ` ${sample.lastName}` : ""}
                </b>{" "}
                ({sample?.email})
              </DialogDescription>
            </DialogHeader>

            {item?.source === "zip" ? (
              item.html ? (
                <iframe
                  title={t("Podgląd testowej wiadomości")}
                  srcDoc={item.html}
                  sandbox="allow-same-origin"
                  className="w-full h-[380px] rounded-md border border-border bg-white"
                />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {t("To archiwum nie zawierało pliku HTML do podglądu.")}
                </p>
              )
            ) : (
              <div className="rounded-lg border border-border bg-muted/20 p-4 max-h-[420px] overflow-y-auto">
                <div
                  className={cn(
                    "mx-auto space-y-3 bg-card rounded-md p-4 border border-border",
                    narrow ? "max-w-[340px]" : "max-w-[520px]",
                  )}
                >
                  {!item || item.blocks.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center">
                      {t("Ta wiadomość nie ma jeszcze żadnych bloków.")}
                    </p>
                  ) : (
                    item.blocks.map((b) => (
                      <BlockPreview key={b.id} block={b} sample={sample ?? undefined} />
                    ))
                  )}
                </div>
              </div>
            )}
            {item?.source === "zip" && (
              <p className="text-xs text-muted-foreground">
                {t(
                  "Ta wiadomość pochodzi z importu ZIP — personalizacja nie jest w niej dostępna, wysyłka testowa pokazuje oryginalny plik HTML.",
                )}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setStep("form")}>
                {t("Wyślij do innego adresu")}
              </Button>
              <Button size="sm" onClick={() => onOpenChange(false)}>
                {t("Zamknij")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
