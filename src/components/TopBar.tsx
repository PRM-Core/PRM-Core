import { useEffect, useState } from "react";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { isReadOnlyRole } from "@/lib/auth/roles";
import { Search, Bell, HelpCircle, Plus } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AccountMenu } from "@/components/AccountMenu";
import { getInsights } from "@/lib/api/engine.functions";
import { onInsightsChanged } from "@/lib/insights-signal";
import { count } from "@/lib/plural";
import { t } from "@/lib/i18n";

/** How often the bell asks whether the supervisor found something critical. */
const POLL_MS = 60_000;

export function TopBar() {
  const navigate = useNavigate();
  const { user } = useRouteContext({ from: "__root__" });
  const podglad = isReadOnlyRole(user?.role);
  // Real count of unhandled critical findings from the M4 supervisor. The dot
  // used to be permanently lit and meant nothing.
  const [critical, setCritical] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      getInsights()
        .then((data) => {
          if (!cancelled) setCritical(data.openCritical);
        })
        .catch(() => {
          /* the bell is not worth an error toast */
        });
    };
    check();
    const id = setInterval(check, POLL_MS);
    // Odznaczenie alertu w panelu nadzorcy ma zgasić licznik **od razu**,
    // a nie po najbliższym odpytaniu. Minuta zwłoki wyglądała jak awaria.
    const off = onInsightsChanged(check);
    return () => {
      cancelled = true;
      clearInterval(id);
      off();
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
      <SidebarTrigger className="text-muted-foreground" />
      {/* Search really searches now: it hands the phrase to the contact list,
          which is the only module with a working filter. Promising "kampanie,
          automatyzacje" in the placeholder while doing nothing was the worse
          half of the old version. */}
      <form
        className="relative flex-1 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          const q = query.trim();
          if (!q) return;
          navigate({ to: "/contacts", search: { q } });
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Szukaj kontaktów — imię, e-mail, telefon, PRM ID…")}
          className="h-10 pl-9 bg-muted/50 border-transparent focus-visible:bg-background"
        />
      </form>
      <div className="ml-auto flex items-center gap-2">
        {/* Konto podglądu nie zakłada kontaktów. Ukrycie przycisku to wygoda,
            nie zabezpieczenie — odmowa jest po stronie serwera. */}
        {!podglad && (
          <Button
            size="sm"
            className="hidden md:inline-flex gap-1.5"
            // Opens the same dialog the contact list uses — one implementation of
            // "new contact", not a second one that would drift from it.
            onClick={() => navigate({ to: "/contacts", search: { new: true } })}
          >
            <Plus className="h-4 w-4" /> {t(" Nowy kontakt")}
          </Button>
        )}
        {podglad && (
          <span className="hidden md:inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {t("Tryb podglądu")}
          </span>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              title={t("Pomoc")}
            >
              <HelpCircle className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <p className="text-sm font-medium mb-1">{t("Gdzie czego szukać")}</p>
            <p className="text-xs text-muted-foreground mb-3">
              {t("Nie ma osobnej dokumentacji — każdy ekran opisuje, co robi, w nagłówku sekcji.")}
            </p>
            <div className="space-y-1.5 text-sm">
              <Link to="/integrations" className="block hover:text-primary">
                {t("Integracje — klucze, webhooki, kanały przychodzące")}
              </Link>
              <Link to="/settings" className="block hover:text-primary">
                {t("Ustawienia — użytkownicy, pola kontaktu, PRM_Agent")}
              </Link>
              <Link to="/consent" className="block hover:text-primary">
                {t("Zgody — treści zgód i statystyki")}
              </Link>
              <Link to="/copilot" className="block hover:text-primary">
                {t("AI Copilot — pytania o dane w bazie")}
              </Link>
            </div>
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground"
          title={
            critical > 0
              ? t("{v0} nadzorcy — kliknij, aby otworzyć", {
                  v0: count(
                    critical,
                    "krytyczne spostrzeżenie",
                    "krytyczne spostrzeżenia",
                    "krytycznych spostrzeżeń",
                  ),
                })
              : t("Brak spostrzeżeń wymagających uwagi")
          }
          // Straight to the supervisor panel, which lives under the "PRM Engine"
          // tab — landing on the automation list instead made the bell look dead.
          onClick={() =>
            navigate({ to: "/automation", search: { tab: "engine", focus: "insights" } })
          }
        >
          <Bell className="h-5 w-5" />
          {critical > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {critical > 9 ? "9+" : critical}
            </span>
          )}
        </Button>
        <AccountMenu />
      </div>
    </header>
  );
}
