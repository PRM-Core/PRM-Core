import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { users, sessions, loginChallenges, trustedDevices } from "../db/schema";
import {
  issueChallenge,
  verifyChallenge,
  resendChallenge,
  isTrustedDevice,
  trustThisDevice,
  twoFactorPossible,
  pruneExpired,
  reportGatewayFailure,
  TwilioError,
} from "../auth/two-factor.server";
import { totpEnabled, verifyTotpLogin } from "../auth/authenticator.server";
import { SELF_REGISTRATION_ENABLED, REGISTRATION_DISABLED_MESSAGE } from "../auth/policy";
import {
  checkLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
  currentClientIp,
} from "../auth/throttle.server";
import { logStep } from "../engine/log.server";
import { adminDeleteUserAccount } from "../auth/delete-account.server";
import { hashPassword, verifyPassword } from "../auth/password.server";
import { ALL_ROLES, isReadOnlyRole } from "../auth/roles";
import {
  checkResetToken,
  completePasswordReset,
  requestPasswordReset,
} from "../auth/password-reset.server";
import {
  createSession,
  destroySession,
  getSessionUser,
  type SafeUser,
} from "../auth/session.server";
import { t } from "@/lib/i18n";

export const registerUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      company: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<SafeUser> => {
    // Zamknięte także tutaj, nie tylko w interfejsie. Ukrycie formularza nie
    // jest zabezpieczeniem — funkcja serwerowa jest wywoływalna wprost.
    if (!SELF_REGISTRATION_ENABLED) {
      throw new Error(REGISTRATION_DISABLED_MESSAGE());
    }

    const db = getDb();
    const email = data.email.trim().toLowerCase();

    const existing = await db.select().from(users).where(eq(users.email, email)).get();
    if (existing) {
      throw new Error(t("Konto z tym adresem e-mail już istnieje."));
    }

    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const passwordHash = await hashPassword(data.password);
    const createdAt = new Date().toISOString();

    await db.insert(users).values({
      id,
      email,
      passwordHash,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      company: data.company.trim(),
      role: "admin",
      createdAt,
    });

    await createSession(id);

    return {
      id,
      email,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      phone: "",
      expiresAt: null,
      locale: "",
      company: data.company.trim(),
      role: "admin",
      createdAt,
    };
  });

/**
 * Wynik pierwszego kroku logowania.
 *
 * `pending` znaczy: hasło się zgadza, ale sesji JESZCZE NIE MA. To rozróżnienie
 * jest całym sensem drugiego składnika — gdyby sesja powstawała po haśle,
 * ekran z kodem dałoby się po prostu pominąć.
 */
export type LoginResult =
  /** `gatewayDown` — wpuszczono BEZ kodu, bo bramka SMS nie odpowiedziała. */
  | { status: "ok"; user: SafeUser; gatewayDown?: boolean }
  | {
      status: "pending";
      challengeId: string;
      maskedPhone: string;
      /**
       * Kanał tego logowania. `app` = kod z aplikacji uwierzytelniającej; ekran
       * musi to powiedzieć, bo użytkownik nie czeka wtedy na żadną wiadomość.
       */
      channel: "sms" | "email" | "app";
    };

export const loginUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<LoginResult> => {
    const db = getDb();
    const email = data.email.trim().toLowerCase();

    // Ogranicznik prób hasła. Kody drugiego składnika miały limit
    // od początku, samo hasło — nie, więc nic nie powstrzymywało zgadywania
    // w pętli. Sprawdzenie jest **przed** zapytaniem do bazy: zablokowany
    // rozmówca nie ma nawet powodować odczytów.
    const ip = currentClientIp();
    const verdict = checkLoginAllowed(email, ip);
    if (!verdict.allowed) {
      const minutes = Math.max(1, Math.ceil(verdict.retryInSeconds / 60));
      throw new Error(
        t("Za dużo nieudanych prób logowania. Spróbuj ponownie za {minutes} min.", {
          minutes: minutes,
        }),
      );
    }

    const user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      // Nieznany adres też liczy się do limitu — inaczej zgadywanie samych
      // adresów byłoby darmowe, a różnica w zachowaniu zdradzałaby, które
      // konta istnieją.
      recordLoginFailure(email, ip);
      throw new Error(t("Nieprawidłowy e-mail lub hasło."));
    }

    const valid = await verifyPassword(data.password, user.passwordHash);
    if (!valid) {
      const po = recordLoginFailure(email, ip);
      // Zapisujemy **samą blokadę**, nie każdą pomyłkę. Pojedyncze pudło to
      // zwykle literówka i zasypywałoby dziennik; ósme z rzędu z jednego adresu
      // to już próba zgadywania i tak trafia do dobowego raportu bezpieczeństwa.
      if (!po.allowed) {
        await logStep({
          kind: "error",
          message: t("BLOKADA LOGOWANIA: {email} — osiem nieudanych prób z jednego adresu.", {
            email: email,
          }),
          detail: { source: "login-throttle", email, ip },
        });
      }
      throw new Error(t("Nieprawidłowy e-mail lub hasło."));
    }

    // Hasło poprawne — wcześniejsze pomyłki nie mają się kumulować do
    // następnego logowania.
    clearLoginFailures(email, ip);

    await pruneExpired();

    // Weryfikacja odpada, gdy urządzenie przeszło ją niedawno — o to chodzi w
    // „co jakiś czas”. Odpada też, gdy nie da się jej przeprowadzić: konto bez
    // numeru albo brak konfiguracji Twilio. Patrz `twoFactorPossible`.
    // **Zaufane urządzenie już nie omija kodu.** Ustalone:
    // że sesja trwa 30 minut i po każdej trzeba potwierdzić się kodem —
    // pomijanie go na znanym komputerze przekreślałoby cały sens tej zasady.
    // `isTrustedDevice` zostaje w kodzie, bo znacznik nadal odnotowuje, że
    // urządzenie było już weryfikowane; nie steruje już jednak wejściem.
    // **Aplikacja uwierzytelniająca ma pierwszeństwo.** Jest szybsza, nic nie
    // kosztuje i działa bez zasięgu — nie ma powodu wysyłać SMS-a komuś, kto ma
    // kod w telefonie. Wyzwanie jest tu wyłącznie znacznikiem etapu: kod liczy
    // aplikacja, więc nie ma czego wysyłać ani czego zapisywać.
    // Konto po terminie ważności nie wchodzi — nawet jeśli silnik nie zdążył go
    // jeszcze skasować. Odmowa jest natychmiastowa, sprzątanie może poczekać.
    if (user.expiresAt && user.expiresAt <= Date.now()) {
      throw new Error(t("To konto wygasło."));
    }

    // **Konto podglądu loguje się samym hasłem.** Reporter widzi te same dane
    // co reszta, więc to realne
    // obniżenie ochrony — świadome i wąskie: konto nie może niczego zmienić,
    // wysłać ani wyeksportować, a kod przy każdym wejściu zniechęcał do
    // korzystania z podglądu na tyle, że i tak sięgano by po cudze konto
    // z pełnymi uprawnieniami. Ogranicznik prób hasła obowiązuje tak samo.
    if (isReadOnlyRole(user.role)) {
      await createSession(user.id);
      const { passwordHash: _pwd, ...safeUser } = user;
      return { status: "ok", user: safeUser };
    }

    if (await totpEnabled(user.id)) {
      return {
        status: "pending",
        challengeId: `app:${user.id}`,
        maskedPhone: t("aplikacja uwierzytelniająca"),
        channel: "app",
      };
    }

    if (!(await twoFactorPossible(user))) {
      await createSession(user.id);
      const { passwordHash: _passwordHash, ...safeUser } = user;
      return { status: "ok", user: safeUser };
    }

    try {
      const { challengeId, maskedPhone, channel } = await issueChallenge(user);
      return { status: "pending", challengeId, maskedPhone, channel };
    } catch (err) {
      // SMS nie wyszedł — wpuszczamy mimo to. Świadoma decyzja:
      // zamknięcie wszystkich przed systemem na czas awarii bramki kosztuje
      // więcej niż ryzyko, że przez ten czas konta chroni samo hasło.
      //
      // Cena jest realna i dlatego nie jest cicha: `reportGatewayFailure`
      // zapisuje to w logu silnika i powiadamia administratorów e-mailem.
      // Ta funkcja nigdy nie rzuca — awaria powiadamiania o awarii nie może
      // być powodem, dla którego ktoś się nie zaloguje.
      const detail = err instanceof TwilioError ? err.message : t("nieznany błąd bramki SMS");
      await reportGatewayFailure(user, detail);

      await createSession(user.id);
      const { passwordHash: _passwordHash, ...safeUser } = user;
      // Bez `trustThisDevice`: to urządzenie kodu NIE przeszło, więc nie ma za
      // co go zapamiętywać na 30 dni. Po naprawie bramki poprosi o kod.
      return { status: "ok", user: safeUser, gatewayDown: true };
    }
  });

export const verifyLoginCode = createServerFn({ method: "POST" })
  .inputValidator(z.object({ challengeId: z.string().min(1), code: z.string().min(1) }))
  .handler(
    async ({
      data,
    }): Promise<{
      ok: boolean;
      user?: SafeUser;
      error?: string;
      exhausted?: boolean;
      /** Ostrzeżenie po użyciu kodu zapasowego — ile ich zostało. */
      notice?: string;
    }> => {
      // Ścieżka aplikacji uwierzytelniającej. Rozpoznawana po przedrostku
      // `app:` w identyfikatorze wyzwania — kod liczy telefon, więc w bazie nie
      // ma czego szukać. Identyfikator nie jest tu sekretem: samo jego posiadanie
      // niczego nie otwiera, bo bez poprawnego kodu z aplikacji (albo kodu
      // zapasowego) nie powstanie sesja.
      let userId: string;
      let recoveryNote: string | undefined;
      if (data.challengeId.startsWith("app:")) {
        const id = data.challengeId.slice(4);
        const totp = await verifyTotpLogin(id, data.code);
        if (!totp.ok) return { ok: false, error: totp.error };
        userId = id;
        if (totp.usedRecovery) {
          recoveryNote =
            totp.recoveryLeft === 0
              ? t(
                  "To był Twój ostatni kod zapasowy. Wygeneruj nowe w Ustawieniach → Bezpieczeństwo.",
                )
              : t("Użyto kodu zapasowego. Zostało ich {recoveryLeft}.", {
                  recoveryLeft: totp.recoveryLeft,
                });
        }
      } else {
        const result = await verifyChallenge(data.challengeId, data.code);
        if (!result.ok) {
          return { ok: false, error: result.error, exhausted: result.exhausted };
        }
        userId = result.userId;
      }

      const user = await getDb().select().from(users).where(eq(users.id, userId)).get();
      if (!user) return { ok: false, error: t("Konto nie istnieje."), exhausted: true };

      // Dopiero tutaj powstaje sesja — po haśle I po kodzie.
      await createSession(user.id);
      await trustThisDevice(user.id);

      const { passwordHash: _passwordHash, ...safeUser } = user;
      return { ok: true, user: safeUser, notice: recoveryNote };
    },
  );

export const resendLoginCode = createServerFn({ method: "POST" })
  .inputValidator(z.object({ challengeId: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const db = getDb();
    // Właściciela wyzwania czytamy z bazy, a nie z tego, co przysłała
    // przeglądarka — inaczej znając cudzy identyfikator wyzwania dałoby się
    // wysyłać SMS-y na dowolny numer.
    const challenge = await db
      .select()
      .from(loginChallenges)
      .where(eq(loginChallenges.id, data.challengeId))
      .get();
    if (!challenge)
      return { ok: false, error: t("Sesja weryfikacji wygasła. Zaloguj się jeszcze raz.") };

    const user = await db.select().from(users).where(eq(users.id, challenge.userId)).get();
    if (!user) return { ok: false, error: t("Konto nie istnieje.") };

    try {
      return await resendChallenge(data.challengeId, user);
    } catch (err) {
      const detail = err instanceof TwilioError ? err.message : t("nieznany błąd bramki SMS");
      return { ok: false, error: t("Nie udało się wysłać kodu ({detail}).", { detail: detail }) };
    }
  });

export const logoutUser = createServerFn({ method: "POST" }).handler(async () => {
  await destroySession();
  return { ok: true };
});

export const getCurrentUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SafeUser | null> => {
    return getSessionUser();
  },
);

export const changePassword = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    }),
  )
  .handler(async ({ data }) => {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      throw new Error(t("Musisz być zalogowany, żeby zmienić hasło."));
    }

    const db = getDb();
    const user = await db.select().from(users).where(eq(users.id, sessionUser.id)).get();
    if (!user) {
      throw new Error(t("Nie znaleziono konta."));
    }

    const valid = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!valid) {
      throw new Error(t("Aktualne hasło jest nieprawidłowe."));
    }

    const passwordHash = await hashPassword(data.newPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.id, sessionUser.id));

    return { ok: true };
  });

export const changeName = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<SafeUser> => {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      throw new Error(t("Musisz być zalogowany, żeby zmienić nazwę."));
    }

    const db = getDb();
    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();
    await db.update(users).set({ firstName, lastName }).where(eq(users.id, sessionUser.id));

    return { ...sessionUser, firstName, lastName };
  });

/**
 * Zmiana własnego numeru telefonu — czyli numeru, na który przychodzą kody.
 *
 * Wymaga hasła, w odróżnieniu od zmiany imienia. Numer JEST drugim składnikiem
 * logowania: gdyby dało się go podmienić samą sesją, ktoś, kto przejmie
 * niezablokowany komputer, przestawiłby kody na własny telefon i od tej chwili
 * miałby konto na stałe — a właściciel nie zauważyłby niczego poza tym, że
 * SMS-y przestały przychodzić.
 *
 * Zaufane urządzenia są kasowane przy każdej zmianie: skoro drugi składnik się
 * zmienił, wszystkie „ten komputer już przeszedł weryfikację” tracą podstawę.
 */
export const changePhone = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      phone: z.string().trim().max(32),
      currentPassword: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<SafeUser> => {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      throw new Error(t("Musisz być zalogowany, żeby zmienić numer telefonu."));
    }

    const db = getDb();
    const user = await db.select().from(users).where(eq(users.id, sessionUser.id)).get();
    if (!user) throw new Error(t("Nie znaleziono konta."));

    const valid = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!valid) throw new Error(t("Hasło jest nieprawidłowe."));

    const phone = data.phone.trim();
    if (phone && !/^\+?[\d\s-]{9,}$/.test(phone)) {
      throw new Error(
        t("Numer wygląda nieprawidłowo. Podaj go z numerem kierunkowym, np. +48 600 100 200."),
      );
    }

    await db.update(users).set({ phone }).where(eq(users.id, sessionUser.id));
    await db.delete(trustedDevices).where(eq(trustedDevices.userId, sessionUser.id));

    return { ...sessionUser, phone };
  });

/**
 * Administrator zmienia numer telefonu innego użytkownika.
 *
 * Praktyczny powód: ludzie zmieniają numery, gubią telefony i wtedy nie mają
 * jak dostać kodu — a więc nie mają jak wejść i poprawić tego samodzielnie.
 * Bez tej ścieżki jedynym ratunkiem byłby dostęp do serwera.
 *
 * Skoro zmienia się drugi składnik logowania, zaufane urządzenia tej osoby
 * tracą podstawę i są kasowane. Sesje zostają — administrator poprawiający
 * literówkę w numerze nie powinien wyrzucać nikogo z pracy w połowie zadania.
 */
export const adminSetUserPhone = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string().min(1), phone: z.string().trim().max(32) }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireAdmin();
    const db = getDb();

    const target = await db.select().from(users).where(eq(users.id, data.userId)).get();
    if (!target) throw new Error(t("Nie znaleziono użytkownika."));

    const phone = data.phone.trim();
    if (phone && !/^\+?[\d\s-]{9,}$/.test(phone)) {
      throw new Error(
        t("Numer wygląda nieprawidłowo. Podaj go z kierunkowym, np. +48 600 100 200."),
      );
    }

    await db.update(users).set({ phone }).where(eq(users.id, data.userId));
    await db.delete(trustedDevices).where(eq(trustedDevices.userId, data.userId));
    return { ok: true };
  });

/**
 * Administrator nadaje nowe hasło tymczasowe.
 *
 * Nowe hasło jest LOSOWE i pokazywane raz — administrator nie wpisuje go z
 * palca, więc nie ma jak ustawić komuś hasła, które sam zna i którego potem
 * użyje. Sesje tej osoby są kasowane: reset hasła zwykle znaczy „konto mogło
 * wpaść w cudze ręce”, a wtedy zostawienie zalogowanych sesji przy życiu jest
 * dokładnie tym, czego się nie chce.
 */
export const adminResetPassword = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ tempPassword: string }> => {
    await requireAdmin();
    const db = getDb();

    const target = await db.select().from(users).where(eq(users.id, data.userId)).get();
    if (!target) throw new Error(t("Nie znaleziono użytkownika."));

    const tempPassword = generateTempPassword();
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(tempPassword) })
      .where(eq(users.id, data.userId));
    await db.delete(sessions).where(eq(sessions.userId, data.userId));
    await db.delete(loginChallenges).where(eq(loginChallenges.userId, data.userId));

    return { tempPassword };
  });

/**
 * Administrator usuwa konto — blokady (nie własne, nie ostatni administrator)
 * i sprzątanie sesji są w `delete-account.server.ts`.
 */
export const adminDeleteUser = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const admin = await requireAdmin();
    await adminDeleteUserAccount(admin.id, data.userId);
    return { ok: true };
  });

async function requireAdmin() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    throw new Error(t("Musisz być zalogowany."));
  }
  if (sessionUser.role !== "admin") {
    throw new Error(t("Tylko administrator może wykonać tę operację."));
  }
  return sessionUser;
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export const listUsers = createServerFn({ method: "GET" }).handler(
  async (): Promise<SafeUser[]> => {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      throw new Error(t("Musisz być zalogowany."));
    }
    const db = getDb();
    const rows = await db.select().from(users);
    return rows.map(({ passwordHash: _passwordHash, ...safeUser }) => safeUser);
  },
);

export const addUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      /**
       * Pusty numer jest dopuszczalny **wyłącznie dla konta podglądu** —
       * sprawdzenie roli jest niżej, w handlerze, bo walidator nie widzi
       * pozostałych pól. Wymóg `min(1)` blokował tu zakładanie konta podglądu
       * mimo poprawionego formularza: interfejs przepuszczał, serwer odrzucał.
       */
      phone: z.string().trim().max(32),
      role: z.enum(ALL_ROLES as [string, ...string[]]),
      /**
       * Termin ważności konta (epoch ms). Dla kont podglądu zakładanych na czas
       * audytu — po tym czasie logowanie odmawia, a silnik kasuje wiersz.
       */
      expiresAt: z.number().int().positive().nullable().optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ user: SafeUser; tempPassword: string }> => {
    const admin = await requireAdmin();

    const db = getDb();
    const email = data.email.trim().toLowerCase();

    const existing = await db.select().from(users).where(eq(users.email, email)).get();
    if (existing) {
      throw new Error(t("Konto z tym adresem e-mail już istnieje."));
    }

    // Numer telefonu jest potrzebny wszystkim poza kontem podglądu: to nim idzie
    // kod weryfikacyjny, a konto podglądu kodu nie dostaje.
    if (data.role !== "reporter" && !data.phone.trim()) {
      throw new Error(t("Numer telefonu jest wymagany — na niego idzie kod weryfikacyjny."));
    }

    // Termin ważności ma sens wyłącznie dla konta podglądu. Przy roli, która
    // może zmieniać dane, znikające konto to gorsza niespodzianka niż pomoc.
    const expiresAt = data.role === "reporter" ? (data.expiresAt ?? null) : null;

    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const createdAt = new Date().toISOString();
    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();
    const phone = data.phone.trim();
    const company = admin.company;
    const role = data.role as SafeUser["role"];

    await db.insert(users).values({
      id,
      email,
      passwordHash,
      firstName,
      lastName,
      phone,
      company,
      role,
      createdAt,
      expiresAt,
    });

    return {
      user: {
        id,
        email,
        firstName,
        lastName,
        phone,
        company,
        role,
        createdAt,
        expiresAt,
        locale: "",
      },
      tempPassword,
    };
  });

/**
 * Odzyskiwanie hasła — trzy funkcje **bez wymogu sesji**, bo z definicji woła je
 * ktoś, kto nie może się zalogować. To jedyne miejsce w systemie, gdzie brak
 * bramki jest zamierzony; wszystko inne poza `auth.functions.ts` jest zamknięte
 * (patrz `require-user.ts`).
 */
export const askPasswordReset = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    await requestPasswordReset(data.email);
    // **Zawsze to samo, niezależnie od wyniku.** Inaczej formularz stałby się
    // sprawdzarką adresów: „ten e-mail jest w systemie placówki medycznej" to
    // już informacja o człowieku.
    return { ok: true as const };
  });

export const verifyResetToken = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(10) }))
  .handler(async ({ data }) => checkResetToken(data.token));

export const finishPasswordReset = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(10), password: z.string().min(8).max(200) }))
  .handler(async ({ data }) => completePasswordReset(data.token, data.password));
