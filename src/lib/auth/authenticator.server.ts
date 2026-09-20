import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { totpRecoveryCodes, userTotp, type User } from "../db/schema";
import {
  generateTotpSecret,
  totpUri,
  verifyTotp,
  formatSecretForHuman,
  totpCode,
} from "./totp.server";
import { t } from "@/lib/i18n";

/**
 * Aplikacja uwierzytelniająca jako drugi składnik logowania.
 *
 * Współistnieje z kodami SMS/e-mail, a nie zastępuje ich w bazie: użytkownik
 * bez skonfigurowanej aplikacji loguje się dokładnie jak dotąd. **Aplikacja ma
 * pierwszeństwo**, gdy jest potwierdzona — jest szybsza, darmowa i działa bez
 * zasięgu, więc nie ma powodu wysyłać SMS-a komuś, kto ma kod w telefonie.
 */

const RECOVERY_COUNT = 10;
/** Krok czasu TOTP — potrzebny do zapamiętania, który kod już zużyto. */
const STEP_SECONDS = 30;

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/**
 * Kod zapasowy: 10 znaków z alfabetu bez liter mylących się przy przepisywaniu.
 *
 * Brak `0/O`, `1/I/L` — te kody ludzie przepisują z kartki w stresie, po
 * zgubieniu telefonu, i pomyłka kosztuje wtedy najwięcej.
 */
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function recoveryCode(): string {
  let out = "";
  for (let i = 0; i < 10; i++) out += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export interface TotpStatus {
  /** Czy użytkownik dokończył konfigurację i może logować się kodem z aplikacji. */
  enabled: boolean;
  /** Czy jest rozpoczęta, ale niepotwierdzona konfiguracja. */
  pending: boolean;
  confirmedAt: number | null;
  /** Ile kodów zapasowych zostało do użycia. */
  recoveryLeft: number;
}

export async function totpStatus(userId: string): Promise<TotpStatus> {
  const db = getDb();
  const row = await db.select().from(userTotp).where(eq(userTotp.userId, userId)).get();
  const left = row?.confirmedAt
    ? await db
        .select()
        .from(totpRecoveryCodes)
        .where(and(eq(totpRecoveryCodes.userId, userId), isNull(totpRecoveryCodes.usedAt)))
    : [];
  return {
    enabled: !!row?.confirmedAt,
    pending: !!row && !row.confirmedAt,
    confirmedAt: row?.confirmedAt ?? null,
    recoveryLeft: left.length,
  };
}

export interface TotpSetup {
  /** Adres `otpauth://` — z niego powstaje kod QR. */
  uri: string;
  /** Klucz w grupach po cztery znaki, gdy skanowanie nie wchodzi w grę. */
  manualKey: string;
}

/**
 * Rozpoczęcie konfiguracji: nowy sekret i adres do zeskanowania.
 *
 * **Za każdym wywołaniem powstaje NOWY sekret**, także gdy poprzednia próba
 * wisi niepotwierdzona. Inaczej sekret pokazany na cudzym ekranie (ktoś
 * zajrzał, zrzut trafił do czatu) zostawałby ważny bez końca.
 *
 * Konfiguracji nie da się zacząć, gdy aplikacja jest już włączona — najpierw
 * trzeba ją wyłączyć, co wymaga potwierdzenia hasłem po stronie wywołującego.
 */
export async function beginTotpSetup(user: User): Promise<TotpSetup> {
  const db = getDb();
  const existing = await db.select().from(userTotp).where(eq(userTotp.userId, user.id)).get();
  if (existing?.confirmedAt) {
    throw new Error(t("Aplikacja uwierzytelniająca jest już włączona. Najpierw ją wyłącz."));
  }

  const secret = generateTotpSecret();
  await db.delete(userTotp).where(eq(userTotp.userId, user.id));
  await db.insert(userTotp).values({
    userId: user.id,
    secret,
    confirmedAt: null,
    lastUsedStep: null,
    createdAt: Date.now(),
  });

  return { uri: totpUri(secret, user.email), manualKey: formatSecretForHuman(secret) };
}

/**
 * Potwierdzenie: użytkownik przepisuje kod z aplikacji.
 *
 * Dopiero to włącza drugi składnik i dopiero tu powstają kody zapasowe.
 * Zwracamy je **jeden jedyny raz** — potem w bazie są już tylko skróty.
 */
export async function confirmTotpSetup(
  userId: string,
  code: string,
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  const db = getDb();
  const row = await db.select().from(userTotp).where(eq(userTotp.userId, userId)).get();
  if (!row) return { ok: false, error: t("Nie rozpoczęto konfiguracji. Zacznij od nowa.") };
  if (row.confirmedAt) return { ok: false, error: t("Aplikacja jest już włączona.") };
  if (!verifyTotp(row.secret, code)) {
    return {
      ok: false,
      error: t("Kod nie pasuje. Sprawdź, czy w telefonie jest ustawiony automatyczny czas."),
    };
  }

  const now = Date.now();
  await db
    .update(userTotp)
    .set({ confirmedAt: now, lastUsedStep: Math.floor(now / 1000 / STEP_SECONDS) })
    .where(eq(userTotp.userId, userId));

  // Świeży komplet kodów zapasowych. Stare (gdyby zostały po wcześniejszym
  // włączeniu i wyłączeniu) znikają — inaczej kartka sprzed roku wciąż
  // otwierałaby konto.
  await db.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, userId));
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_COUNT; i++) {
    const code = recoveryCode();
    codes.push(code);
    await db.insert(totpRecoveryCodes).values({
      id: randomBytes(16).toString("hex"),
      userId,
      codeHash: sha256(code),
      usedAt: null,
      createdAt: now,
    });
  }
  return { ok: true, recoveryCodes: codes };
}

/** Czy ten użytkownik loguje się kodem z aplikacji. */
export async function totpEnabled(userId: string): Promise<boolean> {
  const row = await getDb().select().from(userTotp).where(eq(userTotp.userId, userId)).get();
  return !!row?.confirmedAt;
}

export type TotpLoginResult =
  | { ok: true; usedRecovery: boolean; recoveryLeft: number }
  | { ok: false; error: string };

/**
 * Sprawdzenie kodu przy logowaniu — z aplikacji albo zapasowego.
 *
 * **Kod z aplikacji działa raz.** Zapamiętujemy ostatni użyty krok czasu
 * i odrzucamy wszystko, co nie jest późniejsze. Bez tego kod podejrzany przez
 * ramię albo przechwycony z ekranu dawałby wejście przez pełne 90 sekund okna
 * tolerancji — a to jest dokładnie ten scenariusz, przed którym drugi składnik
 * ma chronić.
 */
export async function verifyTotpLogin(userId: string, input: string): Promise<TotpLoginResult> {
  const db = getDb();
  const row = await db.select().from(userTotp).where(eq(userTotp.userId, userId)).get();
  if (!row?.confirmedAt)
    return { ok: false, error: t("Aplikacja uwierzytelniająca nie jest włączona.") };

  const clean = input.trim().toUpperCase();

  // Kod zapasowy — rozpoznawany po myślniku i długości, więc nie mieszamy go
  // z sześciocyfrowym kodem z aplikacji.
  if (/^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(clean)) {
    const hash = sha256(clean);
    const match = await db
      .select()
      .from(totpRecoveryCodes)
      .where(and(eq(totpRecoveryCodes.userId, userId), eq(totpRecoveryCodes.codeHash, hash)))
      .get();
    if (!match) return { ok: false, error: t("Nieprawidłowy kod zapasowy.") };
    if (match.usedAt) return { ok: false, error: t("Ten kod zapasowy został już użyty.") };
    await db
      .update(totpRecoveryCodes)
      .set({ usedAt: Date.now() })
      .where(eq(totpRecoveryCodes.id, match.id));
    const left = await db
      .select()
      .from(totpRecoveryCodes)
      .where(and(eq(totpRecoveryCodes.userId, userId), isNull(totpRecoveryCodes.usedAt)));
    return { ok: true, usedRecovery: true, recoveryLeft: left.length };
  }

  if (!verifyTotp(row.secret, clean)) {
    return { ok: false, error: t("Nieprawidłowy kod. Sprawdź aplikację i spróbuj ponownie.") };
  }

  // Który krok trafił — szukamy w tym samym oknie, którego użyła weryfikacja.
  const now = Date.now();
  let step: number | null = null;
  for (let drift = -1; drift <= 1; drift++) {
    const at = now + drift * STEP_SECONDS * 1000;
    if (totpCode(row.secret, at) === clean.replace(/\D/g, "")) {
      step = Math.floor(at / 1000 / STEP_SECONDS);
      break;
    }
  }
  if (step !== null && row.lastUsedStep !== null && step <= row.lastUsedStep) {
    return { ok: false, error: t("Ten kod został już użyty. Poczekaj na następny w aplikacji.") };
  }
  if (step !== null) {
    await db.update(userTotp).set({ lastUsedStep: step }).where(eq(userTotp.userId, userId));
  }
  return { ok: true, usedRecovery: false, recoveryLeft: 0 };
}

/** Wyłączenie aplikacji — kasuje sekret i wszystkie kody zapasowe. */
export async function disableTotp(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(userTotp).where(eq(userTotp.userId, userId));
  await db.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, userId));
}
