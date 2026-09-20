import process from "node:process";
import { randomBytes } from "node:crypto";
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
import { hashPassword } from "../src/lib/auth/password.server";

/**
 * Konto podglądu (rola „reporter") — założenie i skasowanie.
 *
 *   bun scripts/konto-podgladu.ts --utworz audytor@firma.pl              # do jutra 23:59
 *   bun scripts/konto-podgladu.ts --utworz audytor@firma.pl --do 2026-09-01
 *   bun scripts/konto-podgladu.ts --usun    audytor@firma.pl
 *   bun scripts/konto-podgladu.ts --lista
 *
 * **Po co skrypt, skoro konta zakłada się w panelu.** Panel potrafi je założyć,
 * ale **nie potrafi skasować** — takiej funkcji w systemie nie ma. Konto
 * zakładane na czas testu bezpieczeństwa musi dać się usunąć w tej samej
 * minucie, w której test się kończy; inaczej zostaje na zawsze, bo „potem"
 * nikt do tego nie wraca.
 *
 * **Kasowanie usuwa też sesje, zaufane urządzenia i drugi składnik.** Sam wiersz
 * użytkownika nie wystarcza: aktywna sesja żyje własnym życiem i konto
 * skasowane w bazie nadal miałoby otwarte okno w przeglądarce audytora.
 */

const args = process.argv.slice(2);
const tryb = args.find((a) => a.startsWith("--"))?.replace("--", "") ?? "";
const email = (args.find((a) => !a.startsWith("--")) ?? "").trim().toLowerCase();

/**
 * Termin ważności: `--do RRRR-MM-DD` (koniec tego dnia) albo domyślnie **jutro
 * o 23:59** czasu warszawskiego.
 *
 * Domyślna wartość jest celowa. Konto zakładane „na chwilę" bez terminu zostaje
 * na zawsze — nikt do tego nie wraca. Tu trzeba świadomie poprosić o dłuższy
 * termin, a nie pamiętać o skasowaniu.
 */
function terminWaznosci(): number {
  const podany = args[args.indexOf("--do") + 1];
  const dzien =
    args.includes("--do") && podany && !podany.startsWith("--")
      ? podany
      : new Date(Date.now() + 86_400_000).toLocaleDateString("sv-SE", {
          timeZone: "Europe/Warsaw",
        });
  const ms = Date.parse(`${dzien}T23:59:00+02:00`);
  if (Number.isNaN(ms)) throw new Error(`Nie rozumiem daty „${dzien}". Format: RRRR-MM-DD.`);
  return ms;
}
const db = getDb();

/** Hasło losowe i pokazane raz — nikt go nie wymyśla i nikt nie zna go wcześniej. */
function losoweHaslo(): string {
  return randomBytes(12).toString("base64url");
}

async function lista() {
  const rows = await db.select().from(users).where(eq(users.role, "reporter"));
  if (rows.length === 0) {
    console.log("Nie ma żadnego konta podglądu.");
    return;
  }
  console.log(`Konta podglądu (${rows.length}):`);
  for (const u of rows) {
    const sesje = await db.select().from(sessions).where(eq(sessions.userId, u.id));
    const kiedy = u.expiresAt
      ? new Date(u.expiresAt).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })
      : "bezterminowe";
    console.log(
      `  ${u.email}  (${u.firstName} ${u.lastName})  sesji: ${sesje.length}  wygasa: ${kiedy}`,
    );
  }
}

async function utworz() {
  if (!email) throw new Error("Podaj adres e-mail: --utworz audytor@firma.pl");

  const istnieje = await db.select().from(users).where(eq(users.email, email)).get();
  const wygasa = terminWaznosci();
  const haslo = losoweHaslo();
  const passwordHash = await hashPassword(haslo);

  if (istnieje) {
    // Konto już jest — zmieniamy mu rolę i hasło zamiast zakładać drugie.
    await db
      .update(users)
      .set({ role: "reporter", passwordHash, expiresAt: wygasa })
      .where(eq(users.id, istnieje.id));
    // Stare sesje przepadają: rola się zmieniła, więc uprawnienia otwartego
    // okna nie odpowiadają już temu, co konto ma wolno.
    await db.delete(sessions).where(eq(sessions.userId, istnieje.id));
    console.log(`Konto ${email} przestawione na rolę podglądu.`);
  } else {
    const id = `user-${Date.now()}-${randomBytes(3).toString("hex")}`;
    await db.insert(users).values({
      id,
      email,
      passwordHash,
      firstName: "Konto",
      lastName: "podglądu",
      phone: "",
      company: process.env.PRM_ORG_NAME ?? "",
      role: "reporter",
      createdAt: new Date().toISOString(),
      expiresAt: wygasa,
    });
    console.log(`Utworzono konto podglądu ${email}.`);
  }

  const kiedy = new Date(wygasa).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });
  console.log(`\n  hasło: ${haslo}`);
  console.log(`  konto wygasa: ${kiedy} — potem znika samo, razem z sesjami`);
  console.log(`\nPokazane raz — nie ma go gdzie odczytać ponownie.`);
  console.log(`Logowanie bez kodu weryfikacyjnego. Konto nie może nic zmienić,`);
  console.log(`wysłać ani wyeksportować.\n`);
  console.log(`Po teście: bun scripts/konto-podgladu.ts --usun ${email}`);
}

async function usun() {
  if (!email) throw new Error("Podaj adres e-mail: --usun audytor@firma.pl");

  const konto = await db.select().from(users).where(eq(users.email, email)).get();
  if (!konto) {
    console.log(`Nie ma konta ${email} — nic do usunięcia.`);
    return;
  }
  if (konto.role !== "reporter") {
    // Zabezpieczenie przed pomyłką w adresie: ten skrypt kasuje wyłącznie konta
    // podglądu. Skasowanie konta administratora literówką byłoby nieodwracalne.
    throw new Error(
      `Konto ${email} ma rolę „${konto.role}", a nie „reporter". Ten skrypt kasuje wyłącznie konta podglądu.`,
    );
  }

  await db.delete(sessions).where(eq(sessions.userId, konto.id));
  await db.delete(trustedDevices).where(eq(trustedDevices.userId, konto.id));
  await db.delete(loginChallenges).where(eq(loginChallenges.userId, konto.id));
  await db.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, konto.id));
  await db.delete(userTotp).where(eq(userTotp.userId, konto.id));
  await db.delete(users).where(eq(users.id, konto.id));

  console.log(`Usunięto konto ${email} wraz z sesjami i urządzeniami.`);
  console.log(`Otwarte okno przeglądarki przestaje działać natychmiast.`);
}

if (tryb === "lista") await lista();
else if (tryb === "utworz") await utworz();
else if (tryb === "usun") await usun();
else {
  console.log("Użycie:");
  console.log("  bun scripts/konto-podgladu.ts --utworz audytor@firma.pl");
  console.log("  bun scripts/konto-podgladu.ts --usun    audytor@firma.pl");
  console.log("  bun scripts/konto-podgladu.ts --lista");
  process.exit(1);
}
