import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Users, Workflow, ShieldCheck, Mail } from "lucide-react";
import { PrmLogo } from "@/components/PrmLogo";
import { t, localized } from "@/lib/i18n";
import { LanguageSwitch } from "@/components/LanguageSwitcher";

const highlights = localized(() => [
  { icon: Users, text: t("Kartoteka i widok 360° każdego pacjenta w jednym miejscu") },
  { icon: Workflow, text: t("Automatyczne przypomnienia o wizytach, badaniach i lekach") },
  { icon: Mail, text: t("Komunikacja z pacjentem przez e-mail, SMS i WhatsApp z jednego miejsca") },
  { icon: ShieldCheck, text: t("Zgody pacjenta i RODO Center wbudowane w platformę") },
]);

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-background">
      <div
        className="relative hidden lg:flex flex-col justify-between p-10 text-primary-foreground overflow-hidden"
        style={{ background: "var(--gradient-primary)" }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,oklch(1_0_0/0.15),transparent_45%)]" />
        {/* Na granatowym tle logotyp idzie w wersji odwróconej — biały znak
            i biały wordmark. To jeden z wariantów z księgi znaku („Contrast
            dark mode"), a nie improwizacja. */}
        <Link to="/" className="relative flex flex-col gap-1.5">
          <PrmLogo className="h-9 w-auto [&_rect]:fill-white [&_path]:stroke-[#1B2A4A] [&_text]:fill-white" />
          <span className="text-[11px] opacity-80">{t("Healthcare CRM")}</span>
        </Link>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("Dotrzyj do każdego pacjenta z właściwą wiadomością, we właściwym momencie")}
          </h1>
          <p className="mt-3 text-sm opacity-85">
            {t(
              "Automatyzuj komunikację z pacjentami — przypomnienia, follow-upy i kampanie edukacyjne — w jednym, w pełni otwartym systemie.",
            )}
          </p>
          {/* Ikona wyśrodkowana względem CAŁEGO opisu, nie jego pierwszej linii.
              Przy `items-start` pozycje jednolinijkowe wyglądały równo,
              a dwulinijkowe miały ikonę przy górnej krawędzi — lista sprawiała
              wrażenie krzywej, choć każdy wiersz z osobna był poprawny. */}
          <ul className="mt-8 space-y-4">
            {highlights.map((h) => (
              <li key={h.text} className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <h.icon className="h-4 w-4" />
                </div>
                <span className="text-sm opacity-90">{h.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs opacity-70">
          © {new Date().getFullYear()} {t(" PRM Core")}
        </p>
      </div>

      <div className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <LanguageSwitch />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <PrmLogo className="h-8 w-auto" />
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>

          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
