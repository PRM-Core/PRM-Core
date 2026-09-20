import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { finishPasswordReset, verifyResetToken } from "@/lib/api/auth.functions";
import { AuthLayout } from "@/components/AuthLayout";
import { t } from "@/lib/i18n";

/**
 * Ustawienie nowego hasła z odnośnika z poczty.
 *
 * **Ważność odnośnika sprawdzamy od razu po wejściu**, a nie dopiero przy
 * zapisie. Człowiek, który klika w link sprzed dwóch dni, ma zobaczyć „ten
 * odnośnik wygasł" zanim wymyśli hasło i wpisze je dwa razy.
 */
export const Route = createFileRoute("/reset-hasla/$token")({
  head: () => ({ meta: [{ title: t("Nowe hasło — PRM Core") }] }),
  component: ResetPage,
});

function ResetPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [stan, setStan] = useState<{ ok: boolean; email?: string; powod?: string } | null>(null);
  const [haslo, setHaslo] = useState("");
  const [powtorka, setPowtorka] = useState("");
  const [zapisuje, setZapisuje] = useState(false);

  useEffect(() => {
    verifyResetToken({ data: { token } })
      .then(setStan)
      .catch(() => setStan({ ok: false, powod: t("Nie udało się sprawdzić odnośnika.") }));
  }, [token]);

  const zapisz = async () => {
    if (haslo !== powtorka) {
      toast.error(t("Hasła się różnią."));
      return;
    }
    setZapisuje(true);
    try {
      const r = await finishPasswordReset({ data: { token, password: haslo } });
      if (!r.ok) {
        toast.error(r.error ?? t("Nie udało się ustawić hasła."));
        return;
      }
      toast.success(t("Hasło ustawione."), {
        description: t("Zaloguj się nowym hasłem. Pozostałe sesje zostały zamknięte."),
      });
      void navigate({ to: "/login" });
    } finally {
      setZapisuje(false);
    }
  };

  // Minimum osiem znaków — tyle samo, co przy zakładaniu konta. Reguła ma być
  // jedna, inaczej odzyskiwanie stawałoby się furtką do słabszego hasła.
  const mozna = haslo.length >= 8 && powtorka.length >= 8 && !zapisuje;

  return (
    <AuthLayout
      title={t("Ustaw nowe hasło")}
      subtitle={t("Odnośnik z wiadomości działa przez godzinę i tylko raz.")}
    >
      <div className="space-y-4">
        {stan === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t(" Sprawdzam odnośnik…")}
          </div>
        ) : !stan.ok ? (
          <>
            <p className="text-sm">{stan.powod}</p>
            <p className="text-xs text-muted-foreground">
              {t("Odnośnik działa przez godzinę i tylko raz. Poproś o nowy na ekranie logowania.")}
            </p>
            <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/login" })}>
              {t("Wróć do logowania")}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("Konto ")} <strong>{stan.email}</strong>
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Nowe hasło")}</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={haslo}
                onChange={(e) => setHaslo(e.target.value)}
                placeholder={t("co najmniej 8 znaków")}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Powtórz hasło")}</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={powtorka}
                onChange={(e) => setPowtorka(e.target.value)}
              />
            </div>
            <Button className="w-full gap-1.5" disabled={!mozna} onClick={() => void zapisz()}>
              {zapisuje && <Loader2 className="h-4 w-4 animate-spin" />} {t(" Ustaw hasło")}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {t(
                "Po zmianie wszystkie zalogowane sesje tego konta zostaną zamknięte — także na innych urządzeniach.",
              )}
            </p>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
