import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { t } from "@/lib/i18n";

/**
 * Kody jednorazowe z aplikacji uwierzytelniającej (Google Authenticator, Authy,
 * 1Password, Microsoft Authenticator).
 *
 * **Nie ma tu żadnej integracji z Google.** Aplikacje uwierzytelniające liczą
 * kod lokalnie, z sekretu i zegara, według otwartego standardu TOTP (RFC 6238).
 * Nasza rola sprowadza się do: wygenerować sekret, pokazać go raz w kodzie QR
 * i policzyć ten sam wynik przy logowaniu. Telefon nie łączy się z niczym —
 * dlatego kody działają w samolocie i bez zasięgu.
 *
 * **Parametry są takie, jakich oczekuje Google Authenticator**: SHA-1, krok
 * 30 sekund, 6 cyfr. To nie jest wybór między bezpieczniejszym a słabszym
 * wariantem — starsze wersje aplikacji ignorują parametry z kodu QR i liczą po
 * swojemu, więc każda inna kombinacja daje kody, które „nie pasują" bez żadnego
 * komunikatu o błędzie.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;

/**
 * O ile kroków wstecz i wprzód akceptujemy kod.
 *
 * Jeden krok w każdą stronę to okno ±30 s. Pokrywa rozjazd zegara telefonu
 * i sytuację, w której ktoś zaczyna przepisywać kod tuż przed jego zmianą.
 * Szersze okno wydłuża czas życia przechwyconego kodu, węższe zamienia
 * logowanie w wyścig z zegarem.
 */
const WINDOW = 1;

// ── base32 ──────────────────────────────────────────────────────────────────
//
// Aplikacje uwierzytelniające przyjmują sekret wyłącznie w base32 (bez „=" na
// końcu) — tak jest zapisany w adresie `otpauth://` i tak wygląda klucz
// przepisywany ręcznie.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  // Spacje i małe litery wybaczamy: klucz bywa przepisywany ręcznie, a aplikacje
  // pokazują go w grupach po cztery znaki.
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(t("Klucz zawiera znak spoza alfabetu base32."));
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/**
 * Nowy sekret — 20 bajtów losowych, czyli tyle, ile ma klucz SHA-1.
 *
 * Krócej osłabiałoby algorytm, dłużej nie dodaje nic poza dłuższym kluczem do
 * przepisania, gdy ktoś nie może zeskanować kodu QR.
 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Kod dla podanego sekretu i chwili. Wyodrębnione, żeby dało się je przetestować na wektorach z RFC. */
export function totpCode(secret: string, atMs: number = Date.now(), digits = DIGITS): string {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const buf = Buffer.alloc(8);
  // Licznik jako 64-bitowa liczba big-endian. `writeBigUInt64BE`, bo licznik
  // przekracza zakres bezpiecznych liczb JavaScriptu dopiero za tysiące lat,
  // ale zapis 32-bitowy urwałby starsze i przyszłe znaczniki czasu.
  buf.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  // „Dynamic truncation" z RFC 4226: cztery ostatnie bity wyniku wskazują,
  // od którego bajtu wziąć 31-bitową liczbę.
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/**
 * Sprawdzenie kodu z tolerancją na rozjazd zegara.
 *
 * Porównanie **stałoczasowe** (`timingSafeEqual`): zwykłe `===` kończy
 * porównywanie na pierwszej różnej cyfrze, a różnica czasu odpowiedzi zdradza,
 * ile początkowych cyfr było trafnych. Przy sześciu cyfrach to realna pomoc
 * dla zgadującego.
 */
export function verifyTotp(secret: string, code: string, atMs: number = Date.now()): boolean {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== DIGITS) return false;
  const given = Buffer.from(clean);
  let ok = false;
  for (let drift = -WINDOW; drift <= WINDOW; drift++) {
    const expected = Buffer.from(totpCode(secret, atMs + drift * STEP_SECONDS * 1000));
    // Bez przerywania pętli po trafieniu — czas sprawdzenia ma nie zależeć od
    // tego, który krok okazał się poprawny.
    if (expected.length === given.length && timingSafeEqual(expected, given)) ok = true;
  }
  return ok;
}

/**
 * Adres `otpauth://`, z którego powstaje kod QR.
 *
 * Etykieta w formacie `Wydawca:konto` i powtórzony `issuer` w parametrach —
 * tak wymaga Google Authenticator, żeby pokazać nazwę systemu nad kodem.
 * Bez tego użytkownik z kilkoma kontami widzi listę identycznych pozycji.
 */
export function totpUri(secret: string, account: string, issuer = "PRM Core"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  // `URLSearchParams` koduje spację jako „+", a część aplikacji czyta ją wtedy
  // dosłownie i pokazuje „PRM+Core". W adresach `otpauth://` obowiązuje „%20".
  return `otpauth://totp/${label}?${params.toString().replace(/\+/g, "%20")}`;
}

/** Klucz w grupach po cztery znaki — do przepisania ręcznie, gdy skanowanie nie wchodzi w grę. */
export function formatSecretForHuman(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}
