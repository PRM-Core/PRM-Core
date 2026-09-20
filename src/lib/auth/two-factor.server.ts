import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import process from "node:process";
import { and, eq, gt, like, lt, or } from "drizzle-orm";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { getDb } from "../db/client.server";
import {
  loginChallenges,
  trustedDevices,
  smsSenders,
  users,
  emailSettings,
  engineLog,
  type User,
} from "../db/schema";
import { sendEmail } from "../email/sendgrid.server";
import { logStep } from "../engine/log.server";
import { sendSms, TwilioError } from "../sms/twilio.server";
import { getCredentials } from "@/lib/credentials/store.server";
import { intlLocale, t } from "@/lib/i18n";

/**
 * Druga warstwa logowania: kod z SMS-a.
 *
 * Parametry poniżej są całą polityką bezpieczeństwa tego mechanizmu i dlatego
 * stoją razem, a nie porozrzucane po kodzie.
 */

/** Sześć cyfr. Krócej jest zgadywalne, dłużej ludzie przepisują z błędami i proszą o kolejny SMS. */
const CODE_DIGITS = 6;

/**
 * Pięć minut. Tyle trwa przełożenie wzroku z telefonu na klawiaturę z zapasem,
 * a jednocześnie kod przechwycony z ekranu blokady starzeje się szybciej, niż
 * ktoś zdąży go użyć.
 */
const CODE_TTL_MS = 5 * 60 * 1000;

/** Po pięciu pudłach wyzwanie jest spalone — 6 cyfr to milion kombinacji, ale zgadywanie ma się nie opłacać. */
const MAX_ATTEMPTS = 5;

/** Najwyżej trzy SMS-y na jedno wyzwanie: chroni budżet i cudzy telefon przed zasypaniem. */
const MAX_SENDS = 3;

/**
 * Jak długo urządzenie jest zaufane.
 *
 * 30 dni to kompromis wybrany świadomie. Krócej — ludzie zaczynają traktować
 * kod jak przeszkodę i szukają obejść (wspólne konta, hasła na kartkach), co
 * psuje bezpieczeństwo bardziej, niż pomaga częstsza weryfikacja. Dłużej —
 * skradziony laptop zostaje otwartą furtką na kwartał.
 *
 * Zaufanie jest przypisane do urządzenia I użytkownika: ten sam komputer nie
 * przepuszcza bez kodu drugiej osoby.
 */
const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const TRUSTED_COOKIE = "prm_trusted_device";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Porównanie odporne na pomiar czasu — inaczej da się odgadywać kod znak po znaku. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** `randomInt`, nie `Math.random()` — ten drugi jest przewidywalny i nie nadaje się do niczego, co chroni dostęp. */
function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, "0");
}

/**
 * Czy dla tego użytkownika da się w ogóle przeprowadzić weryfikację.
 *
 * Świadomie NIE blokuje logowania, gdy się nie da — konto bez numeru telefonu
 * albo brak konfiguracji Twilio zamieniłyby wdrożenie w zamknięcie się na
 * zewnątrz własnego systemu, bez drogi powrotnej przez interfejs. Zamiast tego
 * taki przypadek jest raportowany, a administrator uzupełnia numer.
 */
export async function twoFactorPossible(user: User): Promise<boolean> {
  // Wyjście awaryjne. Gdy Twilio przestanie wysyłać (wyczerpane środki, awaria
  // operatora), NIKT się nie zaloguje — a administrator nie odblokuje tego
  // z wnętrza aplikacji, bo do niej właśnie nie wchodzi. Jedyna droga wtedy to
  // dostęp do serwera: `PRM_2FA_DISABLED=1` w .env i restart kontenera.
  // Świadomie zmienna środowiskowa, nie ustawienie w bazie: kto ma serwer, ten
  // ma i tak bazę, więc to nie osłabia ochrony, a ratuje przed zamknięciem się
  // na zewnątrz własnego systemu.
  if (process.env.PRM_2FA_DISABLED === "1") return false;
  // Wystarczy **jeden** działający kanał. Konto bez telefonu, ale z adresem
  // e-mail i skonfigurowanym SendGridem, jest chronione tak samo — wcześniej
  // wpadało w ścieżkę awaryjną i logowało się samym hasłem.
  return (await availableChannels(user)).length > 0;
}

export type ChallengeChannel = "sms" | "email";

/**
 * Kanały, którymi da się wysłać kod **temu** użytkownikowi.
 *
 * SMS wymaga numeru i skonfigurowanego Twilio; e-mail — adresu, klucza
 * SendGrid i ustawionego nadawcy. Konto bez żadnego z nich nie ma drugiego
 * składnika i wpada w ścieżkę awaryjną (`twoFactorPossible`).
 */
export async function availableChannels(user: User): Promise<ChallengeChannel[]> {
  const out: ChallengeChannel[] = [];
  const keys = await getCredentials("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "SENDGRID_API_KEY");
  if (user.phone.trim() && keys.TWILIO_ACCOUNT_SID && keys.TWILIO_AUTH_TOKEN) {
    out.push("sms");
  }
  if (user.email.trim() && keys.SENDGRID_API_KEY) {
    const settings = await getDb().select().from(emailSettings).get();
    if (settings?.fromEmail) out.push("email");
  }
  return out;
}

/**
 * Losowy wybór kanału spośród dostępnych.
 *
 * **Po co losowo, skoro jeden kanał wystarczy.** Napastnik, który przejął
 * *jeden* kanał — podmienił kartę SIM albo dostał się do skrzynki — nie wie
 * z góry, dokąd trafi kod, i nie ma jak wymusić tego słabszego. Przy dwóch
 * kanałach każda próba logowania ma 50% szans wylądować poza jego zasięgiem,
 * a nieoczekiwany kod na drugim kanale jest dla właściciela konta sygnałem,
 * że ktoś próbuje wejść.
 *
 * `randomInt` z `node:crypto`, nie `Math.random()`: przewidywalny generator
 * znosiłby cały sens losowania.
 */
function pickChannel(channels: ChallengeChannel[]): ChallengeChannel {
  return channels[randomInt(channels.length)];
}

/** Adres e-mail w postaci, która nie wydaje całości komuś patrzącemu na ekran. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(2, local.length - 2))}@${domain}`;
}

/** Numer albo nazwa nadawcy, którą wyśle się kod. Bez niego Twilio i tak odmówi. */
async function resolveSender(): Promise<string> {
  const sender = await getDb().select().from(smsSenders).get();
  return sender?.value ?? "";
}

/** Maskuje numer w komunikacie: „+48 ••• ••• 669". Potwierdza, że to ten telefon, nie zdradzając go komuś obcemu. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "•••";
  return `••• ••• ${digits.slice(-3)}`;
}

export interface ChallengeIssued {
  challengeId: string;
  /** Zamaskowany odbiorca — numer albo adres, zależnie od wylosowanego kanału. */
  maskedPhone: string;
  channel: ChallengeChannel;
}

/**
 * Zakłada wyzwanie i wysyła kod.
 *
 * Wcześniejsze wyzwania tego użytkownika są kasowane: dwa żywe kody naraz to
 * dwie szanse dla kogoś, kto zgaduje, i realne zamieszanie dla właściciela
 * telefonu, który widzi dwa SMS-y i nie wie, który jest aktualny.
 */
export async function issueChallenge(user: User): Promise<ChallengeIssued> {
  const db = getDb();
  await db.delete(loginChallenges).where(eq(loginChallenges.userId, user.id));

  const code = generateCode();
  const challengeId = randomBytes(32).toString("hex");
  const now = Date.now();

  const channels = await availableChannels(user);
  const channel = pickChannel(channels);

  await db.insert(loginChallenges).values({
    id: challengeId,
    userId: user.id,
    codeHash: sha256(code),
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
    sends: 1,
    channel,
    createdAt: now,
  });

  try {
    if (channel === "email") await sendCodeByEmail(user, code);
    else await sendCode(user.phone, code);
  } catch (err) {
    // Kod nie wyszedł, więc nikt go nie zna i nikt nie wypełni tego wyzwania.
    // Zostawianie go do wygaśnięcia niczego nie psuje, ale zaśmieca tabelę i
    // mąci obraz przy szukaniu przyczyny awarii.
    await db.delete(loginChallenges).where(eq(loginChallenges.id, challengeId));
    throw err;
  }
  return {
    challengeId,
    maskedPhone: channel === "email" ? maskEmail(user.email) : maskPhone(user.phone),
    channel,
  };
}

async function sendCodeByEmail(user: User, code: string): Promise<void> {
  const settings = await getDb().select().from(emailSettings).get();
  await sendEmail({
    to: user.email,
    fromEmail: settings?.fromEmail ?? "",
    fromName: settings?.fromName || "PRM Core",
    subject: t("Kod weryfikacyjny: {code}", { code: code }),
    // Kod także w temacie: wtedy widać go z listy wiadomości, bez otwierania —
    // tak samo szybko jak SMS-a. Treść bez odnośników, bo wiadomość z kodem
    // i klikalnym linkiem to wzorzec, którego uczymy nie ufać.
    html:
      t("<p>Twój kod weryfikacyjny do PRM Core:</p>") +
      `<p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p>` +
      t("<p>Ważny {v0} minut. Nikomu go nie podawaj — ", { v0: CODE_TTL_MS / 60000 }) +
      t("pracownicy PRM Core nigdy o niego nie proszą.</p>") +
      t('<p style="color:#666;font-size:12px">Jeśli to nie Ty próbujesz się zalogować, ') +
      t("zmień hasło i powiadom administratora.</p>"),
  });
}

async function sendCode(phone: string, code: string): Promise<void> {
  await sendSms({
    to: phone,
    fromNumber: await resolveSender(),
    // Treść celowo bez nazwy systemu i bez linku: SMS widać na ekranie blokady,
    // a im mniej mówi obcej osobie, tym lepiej. Ostrzeżenie na końcu jest
    // jedyną obroną przed kimś, kto zadzwoni i poprosi o „kod z SMS-a”.
    body: t("Twój kod weryfikacyjny: {code}\nWażny {v1} minut. Nikomu go nie podawaj.", {
      code: code,
      v1: CODE_TTL_MS / 60000,
    }),
  });
}

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; exhausted?: boolean };

/**
 * Sprawdza kod. Każde niepowodzenie kosztuje próbę, także wyzwanie przeterminowane
 * — inaczej dałoby się odpytywać w nieskończoność, byle szybko.
 */
export async function verifyChallenge(challengeId: string, code: string): Promise<VerifyResult> {
  const db = getDb();
  const row = await db
    .select()
    .from(loginChallenges)
    .where(eq(loginChallenges.id, challengeId))
    .get();

  if (!row) {
    return {
      ok: false,
      error: t("Sesja weryfikacji wygasła. Zaloguj się jeszcze raz."),
      exhausted: true,
    };
  }

  if (row.expiresAt < Date.now()) {
    await db.delete(loginChallenges).where(eq(loginChallenges.id, challengeId));
    return {
      ok: false,
      error: t("Kod stracił ważność. Zaloguj się jeszcze raz."),
      exhausted: true,
    };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    await db.delete(loginChallenges).where(eq(loginChallenges.id, challengeId));
    return {
      ok: false,
      error: t("Za dużo nieudanych prób. Zaloguj się jeszcze raz."),
      exhausted: true,
    };
  }

  if (!safeEqual(sha256(code.trim()), row.codeHash)) {
    const attempts = row.attempts + 1;
    await db.update(loginChallenges).set({ attempts }).where(eq(loginChallenges.id, challengeId));
    const left = MAX_ATTEMPTS - attempts;
    if (left <= 0) {
      await db.delete(loginChallenges).where(eq(loginChallenges.id, challengeId));
      return {
        ok: false,
        error: t("Za dużo nieudanych prób. Zaloguj się jeszcze raz."),
        exhausted: true,
      };
    }
    return { ok: false, error: t("Nieprawidłowy kod. Pozostało prób: {left}.", { left: left }) };
  }

  // Trafiony — wyzwanie znika natychmiast, żeby ten sam kod nie zadziałał dwa razy.
  await db.delete(loginChallenges).where(eq(loginChallenges.id, challengeId));
  return { ok: true, userId: row.userId };
}

/** Ponowna wysyłka tego samego wyzwania, z nowym kodem i twardym limitem. */
export async function resendChallenge(
  challengeId: string,
  user: User,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const row = await db
    .select()
    .from(loginChallenges)
    .where(and(eq(loginChallenges.id, challengeId), eq(loginChallenges.userId, user.id)))
    .get();

  if (!row || row.expiresAt < Date.now()) {
    return { ok: false, error: t("Sesja weryfikacji wygasła. Zaloguj się jeszcze raz.") };
  }
  if (row.sends >= MAX_SENDS) {
    return { ok: false, error: t("Wysłano już maksymalną liczbę kodów. Zaloguj się jeszcze raz.") };
  }

  const code = generateCode();
  await db
    .update(loginChallenges)
    .set({
      codeHash: sha256(code),
      // Nowy kod dostaje pełny czas i zeruje licznik pudeł — inaczej ponowna
      // wysyłka bywałaby bezużyteczna zaraz po jej otrzymaniu.
      expiresAt: Date.now() + CODE_TTL_MS,
      attempts: 0,
      sends: row.sends + 1,
    })
    .where(eq(loginChallenges.id, challengeId));

  // **Tym samym kanałem co za pierwszym razem.** Kto czeka na SMS, ma dostać
  // SMS — przerzucenie na e-mail w połowie logowania wygląda jak awaria.
  if (row.channel === "email") await sendCodeByEmail(user, code);
  else await sendCode(user.phone, code);
  return { ok: true };
}

// ── zaufane urządzenia ──────────────────────────────────────────────────────

/** Czy TA przeglądarka przeszła już kod dla TEGO użytkownika i zaufanie nie wygasło. */
export async function isTrustedDevice(userId: string): Promise<boolean> {
  const token = getCookie(TRUSTED_COOKIE);
  if (!token) return false;

  const db = getDb();
  const row = await db
    .select()
    .from(trustedDevices)
    .where(and(eq(trustedDevices.id, sha256(token)), eq(trustedDevices.userId, userId)))
    .get();

  if (!row) return false;
  if (row.expiresAt < Date.now()) {
    await db.delete(trustedDevices).where(eq(trustedDevices.id, row.id));
    deleteCookie(TRUSTED_COOKIE);
    return false;
  }
  return true;
}

export async function trustThisDevice(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  await getDb()
    .insert(trustedDevices)
    .values({
      id: sha256(token),
      userId,
      expiresAt: now + TRUSTED_DEVICE_TTL_MS,
      createdAt: now,
    });
  setCookie(TRUSTED_COOKIE, token, {
    httpOnly: true,
    path: "/",
    // `strict`, nie `lax`: to ciasteczko przepuszcza kolejne logowanie bez
    // kodu, więc nie ma powodu wysyłać go przy wejściu z cudzej strony.
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: TRUSTED_DEVICE_TTL_MS / 1000,
  });
}

// ── awaria bramki SMS ───────────────────────────────────────────────────────

/**
 * Jak rzadko wolno powiadamiać o tej samej awarii.
 *
 * Zepsuta bramka psuje się dla każdego logowania po kolei. Bez tego hamulca
 * poranek w przychodni oznaczałby kilkadziesiąt identycznych e-maili, a wtedy
 * następne powiadomienie — to naprawdę ważne — trafiłoby do wiadomości
 * ignorowanych.
 */
const OUTAGE_NOTICE_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Melduje, że kod nie wyszedł, a użytkownik został mimo to wpuszczony.
 *
 * **To jest kompromis, nie zwycięstwo.** Wpuszczanie przy niedziałającej bramce
 * znaczy, że przez czas awarii konto chroni samo hasło — ktoś, kto je zna,
 * wejdzie. Świadoma decyzja: niedostępność systemu jest tu
 * kosztowniejsza niż to ryzyko. Rolą tego kodu jest sprawić, żeby taka sytuacja
 * była WIDOCZNA: wpis w logu silnika powstaje zawsze, e-mail do administratorów
 * dodatkowo.
 *
 * Nigdy nie rzuca wyjątkiem — awaria powiadamiania o awarii nie może być
 * powodem, dla którego ktoś się nie zaloguje.
 */
export async function reportGatewayFailure(
  user: { id: string; email: string; firstName: string; lastName: string },
  reason: string,
): Promise<void> {
  const db = getDb();

  await logStep({
    kind: "error",
    contactId: null,
    message:
      t("Bramka SMS nie wysłała kodu weryfikacyjnego — {email} został zalogowany ", {
        email: user.email,
      }) + t("BEZ drugiego składnika. Powód: {reason}", { reason: reason }),
    detail: { source: "2fa-gateway", user: user.email, reason },
  });

  try {
    const recent = await db
      .select({ createdAt: engineLog.createdAt })
      .from(engineLog)
      .where(
        and(
          eq(engineLog.kind, "error"),
          // Recognised by detail, not the (translated) message; the message
          // match covers rows written before the interface was translated.
          or(
            like(engineLog.detail, '%"notice":"sent"%'),
            like(engineLog.message, "%POWIADOMIENIE: awaria bramki SMS%"),
          ),
          gt(engineLog.createdAt, Date.now() - OUTAGE_NOTICE_INTERVAL_MS),
        ),
      )
      .get();
    if (recent) return;

    const admins = await db.select().from(users).where(eq(users.role, "admin"));
    const settings = await db.select().from(emailSettings).get();
    const from = settings?.fromEmail ?? "";
    if (!from || admins.length === 0) return;

    const when = new Date().toLocaleString(intlLocale(), { timeZone: "Europe/Warsaw" });
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        fromEmail: from,
        fromName: settings?.fromName || "PRM Core",
        subject: t("PRM Core — awaria bramki SMS, logowanie bez weryfikacji"),
        html:
          t("<p>Kod weryfikacyjny nie został wysłany, więc logowanie odbyło się ") +
          t("<strong>bez drugiego składnika</strong>.</p>") +
          `<p><strong>Konto:</strong> ${user.firstName} ${user.lastName} (${user.email})<br>` +
          `<strong>Czas:</strong> ${when}<br>` +
          t("<strong>Powód:</strong> {reason}</p>", { reason: reason }) +
          t("<p>Dopóki bramka nie działa, konta chroni samo hasło. Sprawdź Twilio ") +
          t(
            "(środki na koncie, dane w Integracje → Klucze i dane dostępowe, nadawcę w Integracje → SMS API).</p>",
          ) +
          t('<p style="color:#666;font-size:12px">Kolejne takie powiadomienie najwcześniej ') +
          t("za 30 minut, żeby awaria nie zasypała skrzynki.</p>"),
      });
    }

    // Dopiero po wysłaniu — inaczej nieudana wysyłka zablokowałaby ponowienie
    // na pół godziny, a to jedyny kanał, którym ktokolwiek się o tym dowie.
    await logStep({
      kind: "error",
      message: t("POWIADOMIENIE: awaria bramki SMS zgłoszona administratorom ({length}).", {
        length: admins.length,
      }),
      detail: { source: "2fa-gateway", notice: "sent" },
    });
  } catch {
    // E-mail też nie wyszedł. Wpis w logu silnika już jest i to musi wystarczyć
    // — panel PRM Engine pokaże go przy najbliższym zajrzeniu.
  }
}

/** Sprzątanie wygasłych wierszy. Wołane przy logowaniu — nie potrzebuje własnego harmonogramu. */
export async function pruneExpired(): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.delete(loginChallenges).where(lt(loginChallenges.expiresAt, now));
  await db.delete(trustedDevices).where(lt(trustedDevices.expiresAt, now));
}

export { TwilioError };
