import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  copilotMessages,
  loginChallenges,
  passwordResets,
  sessions,
  totpRecoveryCodes,
  trustedDevices,
  userTotp,
  users,
} from "../db/schema";
import { logStep } from "../engine/log.server";
import { t } from "@/lib/i18n";

/**
 * Usunięcie konta razem ze wszystkim, co pozwala się na nie zalogować.
 *
 * **Sam wiersz użytkownika nie wystarcza.** Otwarta przeglądarka tej osoby
 * żyłaby dalej na sesji do końca ważności ciasteczka, a niezużyty link resetu
 * hasła czekałby w skrzynce. Kasujemy sesje, zaufane urządzenia, wyzwania
 * logowania, aplikację uwierzytelniającą, kody zapasowe, linki resetu
 * i prywatne rozmowy z asystentem.
 *
 * Ślady pracy tej osoby w danych placówki (przypisania, nadawca wiadomości,
 * autor wpisu) zostają — to historia pacjentów, nie konto.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
  await db.delete(loginChallenges).where(eq(loginChallenges.userId, userId));
  await db.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, userId));
  await db.delete(userTotp).where(eq(userTotp.userId, userId));
  await db.delete(passwordResets).where(eq(passwordResets.userId, userId));
  await db.delete(copilotMessages).where(eq(copilotMessages.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

/**
 * Administrator usuwa czyjeś konto.
 *
 * Dwie blokady, obie po stronie serwera, bo interfejs da się obejść:
 * - **nie własne konto** — administrator, który przez pomyłkę skasuje sam
 *   siebie, zostaje przed ekranem logowania bez drogi powrotu;
 * - **nie ostatni administrator** — placówka bez administratora nie ma kim
 *   dodać użytkownika ani zresetować hasła; ratunkiem byłby dostęp do serwera.
 */
export async function adminDeleteUserAccount(
  adminId: string,
  targetId: string,
): Promise<{ email: string }> {
  if (adminId === targetId) {
    throw new Error(t("Nie możesz usunąć własnego konta."));
  }

  const db = getDb();
  const target = await db.select().from(users).where(eq(users.id, targetId)).get();
  if (!target) throw new Error(t("Nie znaleziono użytkownika."));

  if (target.role === "admin") {
    const inniAdministratorzy = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), ne(users.id, targetId)));
    if (inniAdministratorzy.length === 0) {
      throw new Error(t("To ostatni administrator — najpierw dodaj innego administratora."));
    }
  }

  await deleteUserAccount(targetId);

  // Wpis w dzienniku, bo zniknięcie konta bez śladu wygląda jak awaria.
  await logStep({
    kind: "action",
    message: t("Konto {email} ({role}) usunięte przez administratora.", {
      email: target.email,
      role: target.role,
    }),
    detail: { source: "konto-usuniete", email: target.email, rola: target.role, przez: adminId },
  });

  return { email: target.email };
}
