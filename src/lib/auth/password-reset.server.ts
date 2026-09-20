import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  emailSettings,
  loginChallenges,
  passwordResets,
  sessions,
  trustedDevices,
  users,
} from "../db/schema";
import { hashPassword } from "./password.server";
import { sendEmail } from "../email/sendgrid.server";
import { getBaseUrl } from "../engine/settings.server";
import { logStep } from "../engine/log.server";
import { t } from "@/lib/i18n";

/**
 * Samodzielne odzyskiwanie hasła.
 *
 * Do tej pory ekran logowania obiecywał „dostępne wkrótce", a jedyną drogą był
 * administrator albo skrypt na serwerze. Przy koncie, które loguje się raz na
 * kilka tygodni, znaczyło to telefon do kogoś z dostępem do konsoli.
 *
 * **Cztery decyzje, które trzymają to w ryzach:**
 *
 * 1. **Odpowiedź jest zawsze taka sama** — niezależnie od tego, czy konto
 *    istnieje. Inaczej formularz staje się sprawdzarką adresów: „ten e-mail jest
 *    w systemie placówki medycznej" to już informacja o człowieku.
 * 2. **W bazie leży skrót tokenu**, nie token. Kopia bazy nie może być kluczem
 *    do cudzych kont.
 * 3. **Token jest jednorazowy i żyje godzinę.** Link z poczty bywa przekazywany
 *    dalej albo zostaje w historii przeglądarki.
 * 4. **Po zmianie hasła kasujemy wszystkie sesje** i zaufane urządzenia. Reset
 *    zwykle znaczy „konto mogło wpaść w cudze ręce"; zostawienie zalogowanej
 *    sesji jest dokładnie tym, czego się wtedy nie chce.
 */

/** Godzina — tyle żyje odnośnik. */
const TTL_MS = 60 * 60 * 1000;
/** Ile żądań na konto w ciągu godziny. Chroni skrzynkę przed zasypaniem. */
const MAX_NA_GODZINE = 3;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Przyjęcie prośby o reset. **Zawsze kończy się tak samo** — wołający nie
 * dowiaduje się, czy konto istnieje.
 */
export async function requestPasswordReset(emailRaw: string): Promise<void> {
  const db = getDb();
  const email = emailRaw.trim().toLowerCase();
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    await logStep({
      kind: "skipped",
      message: t("Prośba o reset hasła dla nieznanego adresu — nic nie wysłano."),
      detail: { source: "reset-hasla" },
    });
    return;
  }

  // Limit na konto, nie na adres IP: chodzi o to, żeby nie zasypać skrzynki
  // człowieka, a nie o obronę przed ruchem — tę pełni ogranicznik logowania.
  const godzinaTemu = Date.now() - 60 * 60 * 1000;
  const ostatnie = await db
    .select({ createdAt: passwordResets.createdAt })
    .from(passwordResets)
    .where(and(eq(passwordResets.userId, user.id), gt(passwordResets.createdAt, godzinaTemu)));
  if (ostatnie.length >= MAX_NA_GODZINE) {
    await logStep({
      kind: "skipped",
      message: t("Prośba o reset hasła dla {email} pominięta — {MAX_NA_GODZINE} w ciągu godziny.", {
        email: email,
        MAX_NA_GODZINE: MAX_NA_GODZINE,
      }),
      detail: { source: "reset-hasla" },
    });
    return;
  }

  const token = randomBytes(32).toString("base64url");
  await db.insert(passwordResets).values({
    tokenHash: hashToken(token),
    userId: user.id,
    expiresAt: Date.now() + TTL_MS,
    createdAt: Date.now(),
  });

  const settings = await db.select().from(emailSettings).get();
  const from = settings?.fromEmail ?? "";
  if (!from) {
    await logStep({
      kind: "error",
      message: t(
        "Reset hasła: brak adresu nadawcy w Integracje → Email API — wiadomość nie wyszła.",
      ),
      detail: { source: "reset-hasla" },
    });
    return;
  }

  const link = `${(await getBaseUrl()).replace(/\/$/, "")}/reset-hasla/${token}`;
  await sendEmail({
    to: user.email,
    fromEmail: from,
    fromName: settings?.fromName || "PRM Core",
    subject: t("PRM Core — ustawienie nowego hasła"),
    // Tabele, nie flex: Outlook renderuje pocztę silnikiem Worda.
    html:
      `<table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif">` +
      `<tr><td>` +
      t(
        "<p>Ktoś poprosił o ustawienie nowego hasła do konta <strong>{email}</strong> w PRM Core.</p>",
        { email: user.email },
      ) +
      `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#101828;color:#fff;` +
      t('text-decoration:none;border-radius:8px">Ustaw nowe hasło</a></p>') +
      t(
        '<p style="color:#475467;font-size:13px">Odnośnik działa <strong>przez godzinę</strong> i tylko raz.</p>',
      ) +
      t(
        '<p style="color:#475467;font-size:13px">Jeśli to nie Ty prosiłeś o zmianę — nie rób nic. ',
      ) +
      t("Hasło zostaje takie, jakie jest, a odnośnik wygaśnie sam.</p>") +
      `</td></tr></table>`,
    // Odpowiedź na wiadomość o resecie hasła nie ma trafiać do skrzynki
    // marketingowej razem z rozmowami pacjentów.
    replyTo: "",
  });

  await logStep({
    kind: "action",
    message: t("Reset hasła: wysłano odnośnik do {email}.", { email: email }),
    detail: { source: "reset-hasla" },
  });
}

/** Czy odnośnik jest ważny. Zwraca adres konta do pokazania na formularzu. */
export async function checkResetToken(
  token: string,
): Promise<{ ok: boolean; email?: string; powod?: string }> {
  const row = await getDb()
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, hashToken(token)))
    .get();

  if (!row) return { ok: false, powod: t("Ten odnośnik jest nieprawidłowy.") };
  if (row.usedAt) return { ok: false, powod: t("Ten odnośnik został już użyty.") };
  if (row.expiresAt <= Date.now()) return { ok: false, powod: t("Ten odnośnik wygasł.") };

  const user = await getDb().select().from(users).where(eq(users.id, row.userId)).get();
  if (!user) return { ok: false, powod: t("Konto już nie istnieje.") };
  return { ok: true, email: user.email };
}

/** Ustawienie nowego hasła. Kasuje sesje, urządzenia i niedokończone logowania. */
export async function completePasswordReset(
  token: string,
  noweHaslo: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const hash = hashToken(token);
  const row = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.tokenHash, hash), isNull(passwordResets.usedAt)))
    .get();

  if (!row)
    return { ok: false, error: t("Ten odnośnik jest nieprawidłowy albo został już użyty.") };
  if (row.expiresAt <= Date.now()) return { ok: false, error: t("Ten odnośnik wygasł.") };
  if (noweHaslo.length < 8) return { ok: false, error: t("Hasło musi mieć co najmniej 8 znaków.") };

  const user = await db.select().from(users).where(eq(users.id, row.userId)).get();
  if (!user) return { ok: false, error: t("Konto już nie istnieje.") };

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(noweHaslo) })
    .where(eq(users.id, user.id));

  // Znacznik zużycia **przed** sprzątaniem sesji: gdyby coś padło w połowie,
  // wolimy zostawić token zużytym niż otwartym na drugie użycie.
  await db
    .update(passwordResets)
    .set({ usedAt: Date.now() })
    .where(eq(passwordResets.tokenHash, hash));

  await db.delete(sessions).where(eq(sessions.userId, user.id));
  await db.delete(trustedDevices).where(eq(trustedDevices.userId, user.id));
  await db.delete(loginChallenges).where(eq(loginChallenges.userId, user.id));

  await logStep({
    kind: "action",
    message: t("Hasło konta {email} zmienione przez odzyskiwanie. Wszystkie sesje zamknięte.", {
      email: user.email,
    }),
    detail: { source: "reset-hasla" },
  });
  return { ok: true };
}
