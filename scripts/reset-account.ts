import process from "node:process";
import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db/client.server";
import {
  users,
  sessions,
  userTotp,
  totpRecoveryCodes,
  trustedDevices,
  loginChallenges,
} from "../src/lib/db/schema";
import { hashPassword, verifyPassword } from "../src/lib/auth/password.server";
import { availableChannels } from "../src/lib/auth/two-factor.server";

/**
 * Zerowanie dostępu do konta: nowe hasło i skasowany drugi składnik.
 *
 * **Po co osobno od `reset-password.ts`.** Samo hasło nie wystarcza, gdy konto
 * ma włączoną aplikację uwierzytelniającą albo gdy kod idzie na adres, do
 * którego nikt nie ma dostępu (konta demonstracyjne w bazie lokalnej). Wtedy
 * poprawne hasło przechodzi, a logowanie i tak zatrzymuje się na kodzie,
 * którego nie da się odebrać — i wygląda to jak „hasło nie działa".
 *
 * **Skrypt sam sprawdza wynik i mówi, czego logowanie będzie jeszcze
 * wymagać.** To jest jego główna wartość: po uruchomieniu nie trzeba zgadywać,
 * czy zadziałało, bo weryfikuje nowe hasło o zapisany skrót i wypisuje realną
 * listę kanałów drugiego składnika policzoną tą samą funkcją, której używa
 * logowanie (`availableChannels`) — nie kopią tej logiki, która mogłaby się
 * rozjechać.
 *
 * Użycie:
 *   PRM_NEW_PASSWORD='…' bun scripts/reset-account.ts <e-mail>
 *   bun scripts/reset-account.ts <e-mail> <nowe-hasło>
 */
async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const password = process.env.PRM_NEW_PASSWORD ?? process.argv[3] ?? "";

  if (!email || !password) {
    console.error("Użycie: PRM_NEW_PASSWORD='…' bun scripts/reset-account.ts <e-mail>");
    console.error("   lub: bun scripts/reset-account.ts <e-mail> <nowe-hasło>");
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("Hasło musi mieć co najmniej 10 znaków.");
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL || "file:./local.db";
  console.log(`\nBaza: ${dbUrl}`);

  const db = getDb();
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    const all = await db.select({ email: users.email }).from(users).all();
    console.error(`\nNie ma konta ${email}. Na tej bazie są:`);
    for (const u of all) console.error(`  · ${u.email}`);
    process.exit(1);
  }

  const hash = await hashPassword(password);
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, user.id));

  // Kolejność bez znaczenia — to niezależne tabele. Kasujemy wszystkie ślady
  // drugiego składnika, bo połowiczne zerowanie (np. sam sekret bez kodów
  // zapasowych) zostawia konto w stanie, którego logowanie nie przewiduje.
  const totp = await db.delete(userTotp).where(eq(userTotp.userId, user.id));
  const codes = await db.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, user.id));
  const devices = await db.delete(trustedDevices).where(eq(trustedDevices.userId, user.id));
  const pending = await db.delete(loginChallenges).where(eq(loginChallenges.userId, user.id));
  const killed = await db.delete(sessions).where(eq(sessions.userId, user.id));

  // Sprawdzenie, a nie założenie: czytamy z bazy to, co się właśnie zapisało,
  // i puszczamy przez tę samą funkcję, której używa logowanie.
  const after = await db.select().from(users).where(eq(users.id, user.id)).get();
  const ok = after ? await verifyPassword(password, after.passwordHash) : false;

  console.log(`\nKonto: ${user.email} (${user.role})`);
  console.log(`  hasło ustawione i zweryfikowane: ${ok ? "TAK" : "NIE — coś poszło nie tak"}`);
  console.log(`  aplikacja uwierzytelniająca: skasowana (${totp.rowsAffected ?? 0})`);
  console.log(`  kody zapasowe: ${codes.rowsAffected ?? 0}`);
  console.log(`  zaufane urządzenia: ${devices.rowsAffected ?? 0}`);
  console.log(`  rozpoczęte logowania: ${pending.rowsAffected ?? 0}`);
  console.log(`  zamknięte sesje: ${killed.rowsAffected ?? 0}`);

  if (!ok) process.exit(1);

  // Najważniejsza część wydruku. Bez niej „hasło ustawione" bywa myląco
  // optymistyczne: konto z kanałem e-mail nadal poprosi o kod.
  const channels = after ? await availableChannels(after) : [];
  console.log("\nCzego logowanie będzie teraz wymagać:");
  if (channels.length === 0) {
    console.log("  · samego hasła — konto nie ma czynnego drugiego składnika.");
  } else {
    for (const ch of channels) {
      const where = ch === "sms" ? user.phone : user.email;
      console.log(`  · hasła ORAZ kodu wysyłanego przez ${ch} na ${where}`);
    }
    console.log(
      "\n  Jeśli pod ten adres/numer nikt nie zajrzy (konto demonstracyjne),\n" +
        "  kod nie dotrze i logowanie się nie skończy. Na instancji LOKALNEJ\n" +
        "  wyłącz drugi składnik: dopisz PRM_2FA_DISABLED=1 do .env i zrestartuj\n" +
        "  serwer deweloperski. NIGDY na produkcji.",
    );
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
