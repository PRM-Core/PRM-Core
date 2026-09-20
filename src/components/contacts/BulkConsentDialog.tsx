import { useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { bulkSetConsents } from "@/lib/api/consent.functions";
import { t, localized } from "@/lib/i18n";

/**
 * Zmiana zgód wielu zaznaczonym kontaktom.
 *
 * **Trzy stany, nie przełącznik.** „Bez zmian" jest domyślne dla każdego
 * kanału — gdyby okno działało na zwykłych przełącznikach, otwarcie go
 * i zapisanie odebrałoby zgody wszystkim, których nie dotknięto. Przy zgodzie
 * marketingowej znaczy to cichą utratę możliwości kontaktu z pacjentem.
 *
 * **Podstawa wymagana przy nadawaniu.** Nadanie zgody hurtem bez wskazania, skąd
 * pochodzi, jest bezużyteczne przy kontroli — a to jedyny moment, w którym ta
 * informacja jest jeszcze pod ręką.
 */

type Choice = "keep" | "grant" | "revoke";

const CHANNELS: { key: "email" | "sms" | "profiling"; label: string; hint: string }[] = localized(
  () => [
    { key: "email", label: t("Marketing e-mail"), hint: t("newslettery i kampanie e-mailowe") },
    { key: "sms", label: t("Marketing SMS"), hint: t("kampanie SMS") },
    { key: "profiling", label: t("Profilowanie"), hint: t("dobór treści na podstawie zachowania") },
  ],
);

const CHOICES: { value: Choice; label: string }[] = localized(() => [
  { value: "keep", label: t("Bez zmian") },
  { value: "grant", label: t("Nadaj") },
  { value: "revoke", label: t("Wycofaj") },
]);

export function BulkConsentDialog({
  open,
  onOpenChange,
  contactIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactIds: string[];
  onDone: () => void;
}) {
  const [email, setEmail] = useState<Choice>("keep");
  const [sms, setSms] = useState<Choice>("keep");
  const [profiling, setProfiling] = useState<Choice>("keep");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);

  const value = (key: string) => (key === "email" ? email : key === "sms" ? sms : profiling);
  const setValue = (key: string, v: Choice) =>
    key === "email" ? setEmail(v) : key === "sms" ? setSms(v) : setProfiling(v);

  const grants = [email, sms, profiling].some((v) => v === "grant");
  const revokes = [email, sms, profiling].some((v) => v === "revoke");
  const nothing = email === "keep" && sms === "keep" && profiling === "keep";
  const canSave = !nothing && !busy && (!grants || source.trim().length > 0);

  function reset() {
    setEmail("keep");
    setSms("keep");
    setProfiling("keep");
    setSource("");
  }

  async function handleSave() {
    setBusy(true);
    const r = await bulkSetConsents({
      data: { ids: contactIds, email, sms, profiling, source: source.trim() },
    });
    setBusy(false);
    if (!r.ok) {
      toast.error(t("Nie zmieniono zgód"), { description: r.error });
      return;
    }
    toast.success(
      r.changed > 0
        ? t("Zmieniono zgody: {changed} kontaktów.", { changed: r.changed })
        : t("Nic się nie zmieniło."),
      {
        description:
          r.untouched > 0
            ? t(
                "{untouched} kontaktów miało już takie ustawienia — ich kartoteki zostały nietknięte.",
                { untouched: r.untouched },
              )
            : t("Każda zmiana trafiła na oś czasu pacjenta."),
      },
    );
    reset();
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> {t(" Zgody — ")} {contactIds.length}{" "}
            {contactIds.length === 1 ? "kontakt" : t("kontaktów")}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Kanały zostawione na „Bez zmian" nie zostaną dotknięte. Każda faktyczna zmiana trafia na oś czasu pacjenta razem z podstawą i nazwiskiem osoby, która ją wprowadziła.',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {CHANNELS.map((ch) => (
            <div key={ch.key} className="rounded-md border px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{ch.label}</p>
                  <p className="text-xs text-muted-foreground">{ch.hint}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {CHOICES.map((c) => (
                    <Button
                      key={c.value}
                      type="button"
                      size="sm"
                      variant={value(ch.key) === c.value ? "default" : "outline"}
                      className={
                        value(ch.key) === c.value && c.value === "revoke"
                          ? "bg-destructive hover:bg-destructive/90"
                          : ""
                      }
                      onClick={() => setValue(ch.key, c.value)}
                    >
                      {c.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ))}

          <div className="space-y-1.5">
            <Label>
              {t("Podstawa zgody ")} {grants && <span className="text-destructive">*</span>}
            </Label>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={t("np. Zgody papierowe zebrane w rejestracji, marzec 2026")}
            />
            <p className="text-xs text-muted-foreground">
              {grants
                ? t("Wymagana przy nadawaniu — to jedyny ślad, czym zgodę wykazać przy kontroli.")
                : t("Opcjonalna przy wycofywaniu. Warto zapisać, skąd wzięła się decyzja.")}
            </p>
          </div>

          {grants && (
            <div className="flex items-start gap-2 rounded-md border border-[oklch(0.78_0.15_75)]/40 bg-[oklch(0.78_0.15_75)]/10 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.48_0.15_75)]" />
              <p className="text-xs leading-relaxed text-[oklch(0.38_0.1_75)] dark:text-[oklch(0.85_0.1_75)]">
                {t("Nadajesz zgodę ")} <b>{contactIds.length}</b>{" "}
                {t(
                  " osobom naraz. Zrób to tylko wtedy, gdy naprawdę jej udzieliły — sam fakt, że ktoś jest w bazie, zgodą nie jest.",
                )}
              </p>
            </div>
          )}

          {revokes && !grants && (
            <p className="text-xs text-muted-foreground">
              {t(
                "Wycofanie zadziała od razu: te osoby przestaną dostawać kampanie na wskazanych kanałach.",
              )}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Anuluj")}
          </Button>
          <Button disabled={!canSave} onClick={() => void handleSave()} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}

            {t("Zapisz zgody")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
