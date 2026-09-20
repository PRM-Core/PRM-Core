import { useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AuthLayout } from "@/components/AuthLayout";
import {
  loginUser,
  verifyLoginCode,
  resendLoginCode,
  askPasswordReset,
} from "@/lib/api/auth.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SELF_REGISTRATION_ENABLED } from "@/lib/auth/policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: t("Logowanie — PRM Core") },
      {
        name: "description",
        content: t("Zaloguj się do PRM Core — automatyzacja komunikacji z pacjentem."),
      },
    ],
  }),
  component: LoginPage,
});

const loginSchema = () =>
  z.object({
    email: z.string().min(1, "Podaj adres e-mail").email(t("Nieprawidłowy adres e-mail")),
    password: z.string().min(1, t("Podaj hasło")),
    rememberMe: z.boolean().optional(),
  });

type LoginValues = z.infer<ReturnType<typeof loginSchema>>;

function LoginPage() {
  // Odzyskiwanie hasła: osobne okno, nie osobna strona. Człowiek, który zaraz
  // wróci się zalogować, nie ma po co opuszczać tego ekranu.
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const wyslijReset = async () => {
    setResetBusy(true);
    try {
      await askPasswordReset({ data: { email: resetEmail.trim() } });
      setResetOpen(false);
      setResetEmail("");
      // **Ten sam komunikat niezależnie od tego, czy konto istnieje.** Inaczej
      // formularz stałby się sprawdzarką adresów.
      toast.success(t("Jeśli konto istnieje, odnośnik jest już w drodze."), {
        description: t("Sprawdź skrzynkę. Odnośnik działa przez godzinę i tylko raz."),
      });
    } catch {
      toast.error(t("Nie udało się wysłać odnośnika. Spróbuj ponownie za chwilę."));
    } finally {
      setResetBusy(false);
    }
  };

  const navigate = useNavigate();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema()),
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  // Drugi krok logowania. Dopóki `challenge` jest puste, jesteśmy na haśle.
  const [challenge, setChallenge] = useState<{
    id: string;
    maskedPhone: string;
    channel: "sms" | "email" | "app";
  } | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const onSubmit = async (values: LoginValues) => {
    try {
      const result = await loginUser({ data: { email: values.email, password: values.password } });
      if (result.status === "pending") {
        setChallenge({
          id: result.challengeId,
          maskedPhone: result.maskedPhone,
          channel: result.channel,
        });
        setCode("");
        return;
      }
      if (result.gatewayDown) {
        // Ostrzeżenie, nie sukces. Ktoś, kto to widzi, a nie prosił o kod, ma
        // prawo wiedzieć, że tym razem wpuściło go samo hasło.
        toast.warning(t("Zalogowano bez weryfikacji SMS"), {
          description: t(
            "Bramka SMS nie odpowiedziała, więc kod nie został wysłany. Administratorzy zostali powiadomieni.",
          ),
          duration: 10000,
        });
      } else {
        toast.success(t("Zalogowano pomyślnie"), {
          description: t("Witaj ponownie, {firstName}", { firstName: result.user.firstName }),
        });
      }
      await router.invalidate();
      navigate({ to: "/" });
    } catch (err) {
      toast.error(t("Nie udało się zalogować"), {
        description: err instanceof Error ? err.message : t("Spróbuj ponownie."),
      });
    }
  };

  const submitCode = async () => {
    if (!challenge || code.trim().length === 0) return;
    setVerifying(true);
    const result = await verifyLoginCode({ data: { challengeId: challenge.id, code } });
    setVerifying(false);
    if (!result.ok || !result.user) {
      toast.error(t("Weryfikacja nieudana"), { description: result.error });
      // Spalone wyzwanie odsyła na hasło — inaczej użytkownik wpisywałby kolejne
      // kody w formularz, który i tak żadnego już nie przyjmie.
      if (result.exhausted) {
        setChallenge(null);
        form.resetField("password");
      }
      setCode("");
      return;
    }
    toast.success(t("Zalogowano pomyślnie"), {
      description: t("Witaj ponownie, {firstName}", { firstName: result.user.firstName }),
    });
    await router.invalidate();
    navigate({ to: "/" });
  };

  const requestNewCode = async () => {
    if (!challenge) return;
    setResending(true);
    const result = await resendLoginCode({ data: { challengeId: challenge.id } });
    setResending(false);
    if (!result.ok) {
      toast.error(t("Nie wysłano kodu"), { description: result.error });
      setChallenge(null);
      return;
    }
    toast.success(t("Wysłano nowy kod."));
    setCode("");
  };

  if (challenge) {
    return (
      <AuthLayout
        title={t("Potwierdź logowanie")}
        // Kanał jest losowany przy każdym logowaniu, więc ekran **musi** go
        // nazwać — inaczej człowiek czekałby na SMS, gdy kod poszedł mailem.
        subtitle={
          challenge.channel === "app"
            ? t(
                "Przepisz sześciocyfrowy kod z aplikacji uwierzytelniającej. Możesz też użyć kodu zapasowego.",
              )
            : challenge.channel === "email"
              ? t("Wysłaliśmy sześciocyfrowy kod e-mailem na adres {maskedPhone}.", {
                  maskedPhone: challenge.maskedPhone,
                })
              : t("Wysłaliśmy sześciocyfrowy kod SMS-em na numer {maskedPhone}.", {
                  maskedPhone: challenge.maskedPhone,
                })
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="prm-2fa-code" className="text-sm font-medium">
              {t("Kod weryfikacyjny")}
            </label>
            <Input
              id="prm-2fa-code"
              // `one-time-code` sprawia, że iOS i Android podpowiadają kod
              // wprost z powiadomienia — bez tego ludzie przepisują go ręcznie
              // i mylą się, a każda pomyłka kosztuje próbę.
              autoComplete="one-time-code"
              // Przy aplikacji pole musi przyjąć TAKŻE kod zapasowy (litery
              // i myślnik, 11 znaków). Limit 6 cyfr i filtr `\D` obcinały go
              // w locie, więc osoba po zgubieniu telefonu nie miała jak wejść.
              inputMode={challenge.channel === "app" ? "text" : "numeric"}
              maxLength={challenge.channel === "app" ? 11 : 6}
              autoFocus
              placeholder={challenge.channel === "app" ? t("123456 lub ABCDE-FGHIJ") : "123456"}
              className={
                challenge.channel === "app"
                  ? "text-center text-xl tracking-[0.2em] font-mono uppercase"
                  : "text-center text-2xl tracking-[0.4em] font-mono"
              }
              value={code}
              onChange={(e) =>
                setCode(
                  challenge.channel === "app"
                    ? e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "")
                    : e.target.value.replace(/\D/g, ""),
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitCode();
              }}
            />
            {/* Ważność zależy od kanału: SMS i e-mail żyją 5 minut, kod
                z aplikacji zmienia się co 30 sekund. Jeden tekst dla obu mówiłby
                nieprawdę połowie użytkowników. */}
            <p className="text-xs text-muted-foreground">
              {challenge.channel === "app"
                ? t(
                    "Kod zmienia się co 30 sekund. Nikomu go nie podawaj — pracownicy przychodni nigdy o niego nie proszą.",
                  )
                : t(
                    "Kod jest ważny 5 minut. Nikomu go nie podawaj — pracownicy przychodni nigdy o niego nie proszą.",
                  )}
            </p>
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={verifying || code.length < 6}
            onClick={() => void submitCode()}
          >
            {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}

            {t("Potwierdź")}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                setChallenge(null);
                form.resetField("password");
              }}
            >
              {t("Wróć")}
            </button>
            {/* Przy aplikacji nie ma czego wysyłać — kod liczy telefon. Zamiast
                martwego przycisku podpowiadamy, co robić po zgubieniu telefonu. */}
            {challenge.channel === "app" ? (
              <span className="text-muted-foreground">
                {t("Nie masz telefonu? Użyj kodu zapasowego.")}
              </span>
            ) : (
              <button
                type="button"
                className="font-medium text-primary hover:underline disabled:opacity-50"
                disabled={resending}
                onClick={() => void requestNewCode()}
              >
                {resending ? t("Wysyłanie…") : t("Wyślij kod ponownie")}
              </button>
            )}
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("Zaloguj się")}
      subtitle={t("Wprowadź dane, aby zarządzać komunikacją z pacjentami.")}
    >
      <Form {...form}>
        {/* method="post": gdyby skrypt strony się nie załadował, przeglądarka
            wysłałaby formularz sama — domyślnie GET, czyli z hasłem w adresie,
            historii i logach serwera. */}
        <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Adres e-mail")}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="jan.kowalski@firma.pl"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>{t("Hasło")}</FormLabel>
                  <button
                    type="button"
                    onClick={() => setResetOpen(true)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {t("Nie pamiętasz hasła?")}
                  </button>
                </div>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="pr-10"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showPassword ? t("Ukryj hasło") : t("Pokaż hasło")}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="rememberMe"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="cursor-pointer font-normal text-sm">
                  {t("Zapamiętaj mnie")}
                </FormLabel>
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}

            {t("Zaloguj się")}
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {SELF_REGISTRATION_ENABLED ? (
          <>
            {t("Nie masz jeszcze konta?")}{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              {t("Zarejestruj się")}
            </Link>
          </>
        ) : (
          // Kto ma dostać konto, wie od kogo — a kto nie ma go dostać, nie
          // dowiaduje się z ekranu logowania, do kogo napisać.
          t("Konto zakłada administrator placówki.")
        )}
      </p>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Nie pamiętasz hasła?")}</DialogTitle>
            <DialogDescription>
              {t(
                "Podaj adres konta. Wyślemy odnośnik do ustawienia nowego hasła — działa przez godzinę i tylko raz.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Adres e-mail")}</Label>
            <Input
              type="email"
              autoComplete="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="jan.kowalski@firma.pl"
              onKeyDown={(e) => {
                if (e.key === "Enter" && /.+@.+\..+/.test(resetEmail)) void wyslijReset();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setResetOpen(false)}>
              {t("Anuluj")}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={resetBusy || !/.+@.+\..+/.test(resetEmail)}
              onClick={() => void wyslijReset()}
            >
              {resetBusy && <Loader2 className="h-4 w-4 animate-spin" />} {t(" Wyślij odnośnik")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AuthLayout>
  );
}
