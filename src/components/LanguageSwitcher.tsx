import { useState } from "react";
import { Check, Languages, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { setMyLocale } from "@/lib/api/locale.functions";
import { currentLocale, LOCALES, t, type Locale } from "@/lib/i18n";

/**
 * Language names are shown in their own language on purpose: someone who
 * cannot read the current interface still has to find theirs.
 */
const NAMES: Record<Locale, string> = { en: "English", pl: "Polski" };

function useSwitchLocale() {
  const [pending, setPending] = useState<Locale | null>(null);
  const change = async (locale: Locale) => {
    if (locale === currentLocale() || pending) return;
    setPending(locale);
    try {
      await setMyLocale({ data: { locale } });
      // A full reload: texts rendered on the server and cached queries must all
      // come from the new language, not a mix of both.
      window.location.reload();
    } catch {
      setPending(null);
      toast.error(t("Nie udało się zmienić języka."));
    }
  };
  return { pending, change };
}

/** Items for the account menu. */
export function LanguageMenuItems() {
  const { pending, change } = useSwitchLocale();
  const active = currentLocale();
  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
        <Languages className="h-3.5 w-3.5" /> {t("Język")}
      </DropdownMenuLabel>
      {LOCALES.map((locale) => (
        <DropdownMenuItem
          key={locale}
          lang={locale}
          onSelect={(e) => {
            e.preventDefault();
            void change(locale);
          }}
          className="gap-2 cursor-pointer"
        >
          {pending === locale ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : locale === active ? (
            <Check className="h-4 w-4" />
          ) : (
            <span className="h-4 w-4" />
          )}
          {NAMES[locale]}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/** Compact switch for the sign-in and password pages. */
export function LanguageSwitch() {
  const { pending, change } = useSwitchLocale();
  const active = currentLocale();
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-background p-0.5 text-xs">
      <Languages className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === active}
          disabled={pending !== null}
          onClick={() => void change(locale)}
          className={`rounded-md px-2 py-1 transition-colors ${
            locale === active
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {NAMES[locale]}
        </button>
      ))}
    </div>
  );
}
