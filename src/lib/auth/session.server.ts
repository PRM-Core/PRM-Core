import { randomBytes } from "node:crypto";
import process from "node:process";
import { eq } from "drizzle-orm";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { getDb } from "../db/client.server";
import { sessions, users, type User } from "../db/schema";
import { LOCALE_COOKIE, normalizeLocale } from "../i18n";
import { setLocaleCookie } from "../i18n/locale-cookie.server";

const SESSION_COOKIE = "prm_session";
/**
 * Jak długo trwa sesja — **30 minut**.
 *
 * Po tym czasie trzeba zalogować się od nowa i potwierdzić kodem. Zaufane
 * urządzenie kodu **nie omija** — inaczej reguła nie znaczyłaby nic na
 * komputerze, który raz przeszedł weryfikację, czyli na wszystkich używanych
 * na co dzień.
 *
 * **Świadomy koszt**: przy ośmiu godzinach pracy to około 16 kodów dziennie na
 * osobę. Wariant tańszy i równie bezpieczny w praktyce — liczyć te 30 minut od
 * **ostatniej aktywności**, nie od zalogowania: wtedy kod pojawia się tylko po
 * realnej przerwie, a porzucony komputer i tak zamyka się po pół godziny.
 * Przełącznik niżej — `SESSION_SLIDING`.
 */
const SESSION_TTL_MS = resolveSessionTtlMs();

/**
 * Trzydzieści minut, chyba że instalacja mówi inaczej przez
 * `PRM_SESSION_TTL_MINUTES`.
 *
 * **Furtka jest dla instalacji deweloperskiej, nie dla placówki.** Na maszynie
 * roboczej z danymi demonstracyjnymi wylogowanie co pół godziny przerywa pracę
 * w połowie zadania i nie chroni przed niczym — dane są zmyślone. Na produkcji
 * zmienna po prostu nie istnieje i obowiązuje 30 minut.
 *
 * Świadomie **zmienna środowiskowa, nie ustawienie w bazie**: kto ma serwer,
 * ten ma i tak bazę, więc to nie osłabia ochrony — a jednocześnie nie da się
 * tego przestawić przez interfejs, czyli nikt nie wydłuży sobie sesji
 * klikając. Ta sama zasada co przy `PRM_2FA_DISABLED`.
 *
 * Wartość spoza zakresu 1–10 080 minut (tydzień) jest ignorowana: literówka
 * w `.env` ma cofnąć się do bezpiecznej wartości, a nie otworzyć sesję na rok.
 */
function resolveSessionTtlMs(): number {
  const DEFAULT_MINUTES = 30;
  const raw = Number(process.env.PRM_SESSION_TTL_MINUTES);
  const minutes = Number.isFinite(raw) && raw >= 1 && raw <= 10_080 ? raw : DEFAULT_MINUTES;
  return minutes * 60 * 1000;
}

/**
 * Czy sesja przedłuża się przy każdym użyciu.
 *
 * `false` = twarde 30 minut od zalogowania.
 * `true`  = 30 minut bezczynności. Zmiana tej jednej wartości przełącza całość.
 */
const SESSION_SLIDING = false;

export type SafeUser = Omit<User, "passwordHash">;

export async function createSession(userId: string): Promise<void> {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await db.insert(sessions).values({ id: token, userId, expiresAt });
  await syncLocaleAtSignIn(userId);
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/**
 * The language follows the account: at sign-in the saved choice goes into the
 * cookie, so a new device opens in the user's language. A user who has not
 * chosen yet but picked a language on the sign-in page keeps it — and it is
 * saved on the account.
 */
async function syncLocaleAtSignIn(userId: string): Promise<void> {
  const db = getDb();
  const user = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (user?.locale) {
    setLocaleCookie(normalizeLocale(user.locale));
    return;
  }
  const chosen = getCookie(LOCALE_COOKIE);
  if (chosen) {
    await db
      .update(users)
      .set({ locale: normalizeLocale(chosen) })
      .where(eq(users.id, userId));
  }
}

export async function getSessionUser(): Promise<SafeUser | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;

  const db = getDb();
  const row = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, token))
    .get();

  if (!row) return null;

  if (row.session.expiresAt < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, token));
    deleteCookie(SESSION_COOKIE);
    return null;
  }

  if (SESSION_SLIDING) {
    // Odnowienie tylko wtedy, gdy zostało mniej niż połowa okna — inaczej
    // każde kliknięcie w interfejsie byłoby zapisem do bazy.
    const left = row.session.expiresAt - Date.now();
    if (left < SESSION_TTL_MS / 2) {
      const expiresAt = Date.now() + SESSION_TTL_MS;
      await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, token));
      setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: SESSION_TTL_MS / 1000,
      });
    }
  }

  const { passwordHash: _passwordHash, ...safeUser } = row.user;
  return safeUser;
}

export async function destroySession(): Promise<void> {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    const db = getDb();
    await db.delete(sessions).where(eq(sessions.id, token));
  }
  deleteCookie(SESSION_COOKIE);
}
