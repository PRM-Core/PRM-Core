import { useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter, redirect } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AuthLayout } from "@/components/AuthLayout";
import { registerUser } from "@/lib/api/auth.functions";
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
import { SELF_REGISTRATION_ENABLED } from "@/lib/auth/policy";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: t("Rejestracja — PRM Core") },
      {
        name: "description",
        content: t("Załóż konto w PRM Core — automatyzacja komunikacji z pacjentem."),
      },
    ],
  }),
  // Formularz poniżej jest nienaruszony i zadziała, gdy stała w
  // `lib/auth/policy.ts` wróci na `true`. Do tego czasu nikt tu nie wejdzie.
  beforeLoad: () => {
    if (!SELF_REGISTRATION_ENABLED) {
      throw redirect({ to: "/login" });
    }
  },
  component: RegisterPage,
});

const registerSchema = () =>
  z
    .object({
      firstName: z.string().min(1, t("Podaj imię")),
      lastName: z.string().min(1, "Podaj nazwisko"),
      email: z.string().min(1, "Podaj adres e-mail").email(t("Nieprawidłowy adres e-mail")),
      company: z.string().min(1, t("Podaj nazwę placówki")),
      password: z.string().min(8, t("Hasło musi mieć min. 8 znaków")),
      confirmPassword: z.string().min(1, t("Powtórz hasło")),
      terms: z.boolean().refine((v) => v, { message: t("Musisz zaakceptować regulamin") }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("Hasła nie są identyczne"),
      path: ["confirmPassword"],
    });

type RegisterValues = z.infer<ReturnType<typeof registerSchema>>;

function RegisterPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema()),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      company: "",
      password: "",
      confirmPassword: "",
      terms: false,
    },
  });

  const onSubmit = async (values: RegisterValues) => {
    try {
      await registerUser({
        data: {
          email: values.email,
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
          company: values.company,
        },
      });
      toast.success(t("Konto utworzone"), {
        description: t("Witaj, {firstName}! Jesteś teraz zalogowany.", {
          firstName: values.firstName,
        }),
      });
      await router.invalidate();
      navigate({ to: "/" });
    } catch (err) {
      toast.error(t("Nie udało się utworzyć konta"), {
        description: err instanceof Error ? err.message : t("Spróbuj ponownie."),
      });
    }
  };

  return (
    <AuthLayout
      title={t("Załóż konto")}
      subtitle={t("Utwórz darmowe konto i zacznij automatyzować komunikację z pacjentami.")}
    >
      <Form {...form}>
        {/* method="post": gdyby skrypt strony się nie załadował, przeglądarka
            wysłałaby formularz sama — domyślnie GET, czyli z hasłem w adresie,
            historii i logach serwera. */}
        <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Imię")}</FormLabel>
                  <FormControl>
                    <Input autoComplete="given-name" autoFocus placeholder={t("Jan")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Nazwisko")}</FormLabel>
                  <FormControl>
                    <Input autoComplete="family-name" placeholder={t("Kowalski")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

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
            name="company"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Nazwa placówki")}</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="organization"
                    placeholder={t("Przychodnia Kardio Sp. z o.o.")}
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
                <FormLabel>{t("Hasło")}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
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
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Powtórz hasło")}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className="pr-10"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showConfirmPassword ? t("Ukryj hasło") : t("Pokaż hasło")}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="terms"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-2 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="mt-0.5"
                  />
                </FormControl>
                <div>
                  <FormLabel className="cursor-pointer font-normal text-sm leading-snug">
                    {t("Akceptuję regulamin oraz politykę prywatności")}
                  </FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}

            {t("Utwórz konto")}
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("Masz już konto?")}{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t("Zaloguj się")}
        </Link>
      </p>
    </AuthLayout>
  );
}
