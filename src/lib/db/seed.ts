import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./client.server";
import { users, emailSettings } from "./schema";
import { hashPassword } from "../auth/password.server";

/**
 * Creates the first administrator, once, on an empty installation.
 *
 * **The password is generated, never hardcoded.** A fixed default in a public
 * repository is a published credential: every instance somebody puts up in a
 * hurry would carry an admin account whose password is one search away. It is
 * printed exactly once, here, and stored only as a hash — losing it means
 * seeding another admin, which is cheap; leaking it is not.
 *
 * `PRM_ADMIN_EMAIL` / `PRM_ADMIN_PASSWORD` override both, for a scripted
 * install that has to know the credentials up front.
 */
const ADMIN_EMAIL = process.env.PRM_ADMIN_EMAIL || "admin@prmcore.local";

/** Typed by hand exactly once, then changed — readable, but not guessable. */
function generatePassword(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

async function seed() {
  const db = getDb();

  const existing = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).get();
  if (!existing) {
    const password = process.env.PRM_ADMIN_PASSWORD || generatePassword();
    await db.insert(users).values({
      id: `user-${Date.now()}`,
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword(password),
      firstName: process.env.PRM_ADMIN_FIRST_NAME || "Administrator",
      lastName: process.env.PRM_ADMIN_LAST_NAME || "PRM Core",
      company: process.env.PRM_ADMIN_COMPANY || "",
      role: "admin",
      createdAt: new Date().toISOString(),
    });
    console.log("");
    console.log("  Utworzono konto administratora:");
    console.log(`    e-mail:  ${ADMIN_EMAIL}`);
    console.log(`    hasło:   ${password}`);
    console.log("");
    console.log("  To hasło nie pojawi się drugi raz. Zapisz je i zmień po");
    console.log("  pierwszym zalogowaniu (menu konta → Zmień hasło).");
    console.log("");
  } else {
    console.log(`Konto ${ADMIN_EMAIL} już istnieje — pomijam.`);
  }

  const existingSettings = await db.select().from(emailSettings).get();
  if (!existingSettings) {
    await db.insert(emailSettings).values({
      fromEmail: "",
      fromName: "PRM Core",
      updatedAt: new Date().toISOString(),
    });
    console.log("Utworzono pusty wiersz email_settings.");
  }
}

seed()
  .then(() => {
    console.log("Seed zakończony.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed nie powiódł się:", err);
    process.exit(1);
  });
