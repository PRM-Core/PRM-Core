import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FORM_FIELDS, FORM_ENDPOINT_PATH, FORM_MARKER_ATTRIBUTE } from "@/lib/content-builder";
import { t } from "@/lib/i18n";

const EXAMPLE = () =>
  t(
    '<form {FORM_MARKER_ATTRIBUTE}\n      data-prm-tag="popup-lead"\n      data-prm-success="Dziękujemy! Odezwiemy się wkrótce.">\n\n  <input type="text"  name="firstName" placeholder="Imię" />\n  <input type="email" name="email" placeholder="E-mail" required />\n  <input type="tel"   name="phone" placeholder="Telefon" />\n\n  <label>\n    <input type="checkbox" name="consent" required />\n    Wyrażam zgodę na kontakt.\n  </label>\n\n  <button type="submit">Zapisz się</button>\n</form>',
    { FORM_MARKER_ATTRIBUTE: FORM_MARKER_ATTRIBUTE },
  );

export function FormGuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(EXAMPLE());
      toast.success(t("Skopiowano przykładowy kod"));
    } catch {
      toast.error(t("Nie udało się skopiować"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("Jak zakodować formularz, żeby kontakty wpadały do PRM Core")}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Dotyczy pop-upów tworzonych poza PRM Core (własny HTML, zewnętrzne narzędzia). Formularze zbudowane blokiem „Formularz" mają to już ustawione automatycznie.',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <section className="space-y-2">
            <h3 className="font-medium">{t("Zasada działania")}</h3>
            <p className="text-muted-foreground text-[13px] leading-relaxed">
              {t(
                "Kod śledzący PRM Core, który masz już na stronie, sam przechwytuje wysyłkę takiego formularza — nie musisz ustawiać żadnego",
              )}{" "}
              <code className="text-xs bg-muted px-1 rounded">{t("action")}</code>{" "}
              {t(
                " ani pisać JavaScriptu. Wystarczy, że formularz spełnia dwa warunki poniżej, a każde wysłanie utworzy kontakt w zakładce ",
              )}{" "}
              <b>{t("Contacts")}</b> {t(' ze statusem „Lead".')}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium">{t("Warunek 1 — oznacz formularz")}</h3>
            <p className="text-muted-foreground text-[13px]">
              {t("Dodaj atrybut")}{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{FORM_MARKER_ATTRIBUTE}</code>{" "}
              {t("do znacznika")}{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">&lt;form&gt;</code>
              {t(
                ". Bez niego PRM Core nie ruszy formularza — Twoje pozostałe formularze na stronie działają bez zmian.",
              )}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium">{t("Warunek 2 — nazwij pola")}</h3>
            <p className="text-muted-foreground text-[13px]">
              {t("Liczy się atrybut ")}{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{t("name")}</code> {t("(nie ")}{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{t("id")}</code>
              {t(", nie placeholder). Rozpoznawane nazwy:")}
            </p>
            <div className="rounded-lg border border-border/60 divide-y">
              {FORM_FIELDS.map((f) => (
                <div key={f.name} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{f.name}</code>
                  <span className="text-muted-foreground">{f.label}</span>
                  {f.required && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-warning-foreground bg-warning/15 px-1.5 py-0.5 rounded">
                      {t("wymagane")}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="text-muted-foreground text-[12px]">
              {t(
                "Checkboxy (np. zgoda) nie trafiają do karty kontaktu — służą tylko walidacji po stronie strony.",
              )}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium">{t("Pola własne")}</h3>
            <p className="text-muted-foreground text-[13px]">
              {t("Potrzebujesz pola spoza listy? Nazwij je z przedrostkiem")}{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{t("custom_")}</code>{" "}
              {t(" (albo dodaj atrybut ")}{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{t("data-prm-label")}</code>{" "}
              {t(
                " z czytelną nazwą). Takie odpowiedzi nie mają swojej kolumny w karcie kontaktu — zapisują się jako ",
              )}{" "}
              <b>{t("notatka")}</b> {t(" w zakładce Notatki.")}
            </p>
            <pre className="rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed overflow-x-auto font-mono">
              {t('<input name="custom_skad_o_nas" data-prm-label="Skąd wiesz o nas?" />')}
            </pre>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium">{t("Opcjonalne atrybuty")}</h3>
            <div className="rounded-lg border border-border/60 divide-y text-[13px]">
              <div className="px-3 py-2">
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                  {t("data-prm-tag")}
                </code>
                <span className="text-muted-foreground ml-2">
                  {t("tagi nadawane nowemu kontaktowi, po przecinku (domyślnie")}{" "}
                  <code className="text-xs">{t("popup-lead")}</code>)
                </span>
              </div>
              <div className="px-3 py-2">
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                  {t("data-prm-success")}
                </code>
                <span className="text-muted-foreground ml-2">
                  {t("komunikat pokazywany zamiast formularza po wysłaniu")}
                </span>
              </div>
              <div className="px-3 py-2">
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                  {t("data-prm-campaign")}
                </code>
                <span className="text-muted-foreground ml-2">
                  {t("nazwa kampanii zapisywana przy kontakcie (domyślnie tytuł strony)")}
                </span>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">{t("Gotowy przykład")}</h3>
              <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={copy}>
                <Copy className="h-3.5 w-3.5" /> {t(" Kopiuj")}
              </Button>
            </div>
            <pre className="rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed overflow-x-auto font-mono">
              {EXAMPLE()}
            </pre>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium">{t("Dla programistów — bez kodu śledzącego")}</h3>
            <p className="text-muted-foreground text-[13px]">
              {t("Jeśli wolisz wysłać dane samodzielnie, zrób")}{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{t("POST")}</code> {t(" na")}{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{FORM_ENDPOINT_PATH}</code>{" "}
              {t(" z ciałem JSON zawierającym te same nazwy pól (")}
              <code className="text-xs">{t("email")}</code> {t("obowiązkowo) oraz opcjonalnie ")}{" "}
              <code className="text-xs">{t("tag")}</code> {t(" i")}{" "}
              <code className="text-xs">{t("campaign")}</code>.
            </p>
          </section>

          <div className="flex items-start gap-2 rounded-lg bg-success/10 text-success p-3 text-[13px]">
            <Check className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {t(
                "Duplikaty są odsiewane po adresie e-mail — ponowne wysłanie tego samego formularza nie utworzy drugiego kontaktu.",
              )}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            {t("Zamknij")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
