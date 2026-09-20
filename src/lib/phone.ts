import { t, localized } from "@/lib/i18n"; /**
 * Numery telefonu przy imporcie.
 *
 * Klient i serwer (bez importów z `node:`), bo podgląd importu pokazuje wynik
 * jeszcze przed wysłaniem — człowiek ma zobaczyć, co dostanie, zanim kliknie.
 *
 * Odpowiednik `normalisePolishPhone` z kolektorów, ale z kierunkowym jako
 * parametrem: baza pacjentów bywa mieszana, a numer zagraniczny wpisany bez
 * kierunkowego to numer, którego SMS nigdy nie dojdzie.
 */

export interface DiallingCode {
  code: string;
  label: string;
}

/** Polska pierwsza — reszta to kraje, z których realnie trafiają się pacjenci. */
export const DIALLING_CODES: DiallingCode[] = localized(() => [
  { code: "+48", label: t("Polska") },
  { code: "+49", label: t("Niemcy") },
  { code: "+44", label: t("Wielka Brytania") },
  { code: "+380", label: t("Ukraina") },
  { code: "+420", label: t("Czechy") },
  { code: "+421", label: t("Słowacja") },
  { code: "+370", label: t("Litwa") },
  { code: "+31", label: t("Holandia") },
  { code: "+353", label: t("Irlandia") },
  { code: "+1", label: t("USA / Kanada") },
]);

/**
 * Dokleja kierunkowy do numeru, który go nie ma.
 *
 * Zasady, w kolejności:
 *  • pusto → pusto,
 *  • zaczyna się od `+` → **nie ruszamy**, numer jest już międzynarodowy
 *    (import mieszanej bazy nie może przerabiać numerów niemieckich na polskie),
 *  • `00…` → zamiana na `+…`, to ten sam zapis innym prefiksem,
 *  • zero wiodące (`0600…`) → odcinane, to relikt wybierania międzymiastowego,
 *  • numer już zaczynający się od cyfr kierunkowego i o właściwej długości →
 *    dostaje samo `+`,
 *  • sensowna długość krajowa (8–11 cyfr) → dostaje kierunkowy,
 *  • cokolwiek innego → **zwracane bez zmian**. Numer, który wygląda źle, jest
 *    łatwiejszy do wyłapania niż numer, który wygląda dobrze, a jest zły.
 */
export function withDiallingCode(raw: string, code: string): string {
  const input = (raw ?? "").trim();
  if (!input) return "";

  const cc = (code ?? "").replace(/\D/g, "");
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return input;
  if (digits.startsWith("+")) return digits;
  if (!cc) return input;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;

  const national = digits.startsWith("0") ? digits.slice(1) : digits;
  if (national.startsWith(cc) && national.length === cc.length + 9) return `+${national}`;
  if (national.length >= 8 && national.length <= 11) return `+${cc}${national}`;
  return input;
}

/** Czy numer po przetworzeniu nadaje się do wysyłki — do policzenia w podglądzie importu. */
export function looksDialable(value: string): boolean {
  return /^\+\d{9,15}$/.test(value.replace(/[^\d+]/g, ""));
}
