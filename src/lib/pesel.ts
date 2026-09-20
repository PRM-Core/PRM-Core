/**
 * Co da się odczytać z numeru PESEL.
 *
 * Client-safe i czysty — te same reguły potrzebne są przy imporcie z systemu rezerwacji
 * i przy podglądzie na karcie kontaktu.
 *
 * **Data urodzenia i płeć są zakodowane w samym numerze**, więc pola „Wiek"
 * i „Płeć" wypełniają się bez pytania pacjenta o cokolwiek. Miesiąc niesie
 * stulecie: +0 to 1900–1999, +20 to 2000–2099, +80 to 1800–1899.
 */

export interface PeselInfo {
  birthDate: string;
  /** Pełne lata na dziś. */
  age: number;
  sex: "K" | "M";
}

const CENTURY: Record<number, number> = { 0: 1900, 1: 2000, 2: 2100, 3: 2200, 4: 1800 };

/** Suma kontrolna PESEL — chroni przed wpisaną z palca liczbą o właściwej długości. */
export function isValidPesel(pesel: string): boolean {
  const digits = pesel.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[10]);
}

/**
 * Data urodzenia, wiek i płeć z numeru. `null`, gdy numer jest niepoprawny —
 * zgadywanie wieku z błędnego PESEL-u byłoby gorsze niż puste pole.
 */
export function peselInfo(pesel: string, today = new Date()): PeselInfo | null {
  const d = pesel.replace(/\D/g, "");
  if (!isValidPesel(d)) return null;

  const monthRaw = Number(d.slice(2, 4));
  const century = CENTURY[Math.floor(monthRaw / 20)];
  if (!century) return null;
  const year = century + Number(d.slice(0, 2));
  const month = monthRaw % 20;
  const day = Number(d.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const birth = new Date(Date.UTC(year, month - 1, day));
  // Odrzuca 31 lutego i podobne — `Date` cicho przesuwa je na marzec.
  if (birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) return null;

  let age = today.getUTCFullYear() - year;
  const hadBirthday =
    today.getUTCMonth() > month - 1 ||
    (today.getUTCMonth() === month - 1 && today.getUTCDate() >= day);
  if (!hadBirthday) age -= 1;
  if (age < 0 || age > 120) return null;

  return {
    birthDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    age,
    // Cyfra 10. (indeks 9): parzysta = kobieta, nieparzysta = mężczyzna.
    sex: Number(d[9]) % 2 === 0 ? "K" : "M",
  };
}
