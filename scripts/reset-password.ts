import process from "node:process";
import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db/client.server";
import { users, sessions } from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/auth/password.server";

/**
 * Ustawia nowe hasło istniejącemu kontu.
 *
 * **Po co to istnieje.** Hasło administratora jest generowane losowo przy
 * zakładaniu instalacji, wypisywane raz i trzymane wyłącznie jako skrót
 * (`scrypt` z solą). Nie da się go odczytać ani odzyskać — z założenia, bo
 * odwracalny zapis hasła w bazie CRM-a medycznego byłby wpisem, którego nikt
 * nie obroni przy audycie. Jedyne wyjście po zgubieniu to ustawić nowe.
 *
 * **Hasło podaje człowiek, skrypt go nie wymyśla** i nie zapisuje nigdzie poza
 * skrótem w bazie. Podane w argumencie zostaje w historii powłoki, więc dla
 * konta produkcyjnego lepiej przekazać je zmienną `PRM_NEW_PASSWORD`.
 *
 * Użycie:
 *   bun scripts/reset-password.ts <e-mail> <nowe-hasło>
 *   PRM_NEW_PASSWORD='…' bun scripts/reset-password.ts <e-mail>
 *
 * Baza bierze się z `DATABASE_URL` (domyślnie `file:./local.db`). Skrypt
 * wypisuje, którą bazę rusza, **zanim** cokolwiek zmieni — pomyłka „lokalna
 * czy produkcyjna" jest tu najdroższym błędem, jaki można popełnić.
 */
async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const password = process.env.PRM_NEW_PASSWORD ?? process.argv[3] ?? "";

  if (!email || !password) {
    console.error("Użycie: bun scripts/reset-password.ts <e-mail> <nowe-hasło>");
    console.error("   lub: PRM_NEW_PASSWORD='…' bun scripts/reset-password.ts <e-mail>");
    process.exit(1);
  }

  // Dolny próg, nie polityka haseł: skrypt ma chronić przed pomyłką („123"),
  // a nie zastępować decyzji placówki o tym, jak wyglądają hasła.
  if (password.length < 10) {
    console.error("Hasło musi mieć co najmniej 10 znaków.");
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL || "file:./local.db";
  console.log(`Baza: ${dbUrl}`);

  const db = getDb();
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    const all = await db.select({ email: users.email }).from(users).all();
    console.error(`Nie ma konta ${email}. Na tej bazie są: ${all.map((u) => u.email).join(", ")}`);
    process.exit(1);
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, user.id));

  // Zmiana hasła unieważnia otwarte sesje. Gdyby zostały, ktoś zalogowany
  // starym hasłem pracowałby dalej — a zmiana hasła robi się najczęściej
  // właśnie po to, żeby kogoś wyprosić.
  const killed = await db.delete(sessions).where(eq(sessions.userId, user.id));
  console.log(
    `Hasło konta ${email} zmienione. Otwarte sesje zamknięte (${killed.rowsAffected ?? 0}).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
