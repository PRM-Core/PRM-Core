import { t } from "@/lib/i18n";
/**
 * Zasady dostępu do systemu, w jednym miejscu.
 *
 * Klient i serwer, więc bez importów z `node:` — ekran logowania czyta to samo,
 * co funkcja serwerowa, i nie ma jak się z nią rozjechać.
 */

/**
 * Czy ktokolwiek może założyć sobie konto sam.
 *
 * **Wyłączone.** Konto zakłada wyłącznie
 * administrator (Ustawienia → Użytkownicy → Dodaj), a nowy pracownik dostaje
 * hasło tymczasowe. Powód jest prosty: system trzyma dane pacjentów, a otwarty
 * formularz rejestracji pozwalał każdemu, kto zna adres, założyć sobie konto
 * **z rolą administratora** — tak działał `registerUser`.
 *
 * Kod rejestracji został na miejscu celowo, zamiast zostać skasowany: gdyby
 * PRM Core trafił kiedyś na wiele placówek albo w wersję samoobsługową,
 * przywrócenie to zmiana tej jednej stałej na `true`. Nic więcej nie trzeba —
 * trasa `/register`, formularz i funkcja serwerowa czytają właśnie ją.
 */
export const SELF_REGISTRATION_ENABLED = false;

/** Komunikat pokazywany, gdy ktoś mimo wszystko trafi na rejestrację. */
export const REGISTRATION_DISABLED_MESSAGE = () =>
  t("Zakładanie kont zostało wyłączone. Konto tworzy administrator placówki.");
