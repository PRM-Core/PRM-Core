import { sql } from "drizzle-orm";
import { getDb } from "./db/client.server";
import { contacts } from "./db/schema";
import type { ContactRow } from "./db/schema";
import { normalisePolishPhone } from "./leads/hearing-test.server";
import { t, localized } from "@/lib/i18n";

/**
 * The one answer to "is this the same patient?".
 *
 * Every way a contact enters the system — ad leads, popup forms, the hearing
 * test, bookings, CSV import, adding one by hand — asks this function. Written
 * once and shared, because a deduplication rule that lives in five collectors
 * is a rule that will disagree with itself, and the damage from disagreement is
 * a patient whose history is split across two cards that can never be rejoined.
 *
 * The rules, as specified by the clinic:
 *
 * 1. Same PESEL → the same person, whatever else differs. It is a national
 *    identifier; nothing else outranks it.
 * 2. Same name AND same e-mail → merge (phone may differ).
 * 3. Same name AND same phone → merge (e-mail may differ).
 * 4. Wejście BEZ nazwiska + ten sam numer → scala (kontakty telefoniczne).
 * 5. Anything else → a new contact.
 *
 * Note what rules 2 and 3 deliberately do NOT do: an e-mail alone is not
 * enough. A married couple sharing one mailbox, or two relatives on one
 * landline, stay two patients — which is why the name has to agree as well.
 */

export interface ContactIdentity {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  pesel?: string;
}

const DIACRITICS: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};

/**
 * Names are compared without case, spare whitespace or Polish diacritics.
 *
 * "Wiśniewska" and "Wisniewska" are one surname typed by two people — web forms
 * get filled in without diacritics constantly, and treating them as different
 * patients would defeat the whole rule.
 */
function normaliseName(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => DIACRITICS[ch] ?? ch)
    .replace(/\s+/g, " ");
}

function normaliseEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalisePhone(value: string | undefined): string {
  const cleaned = normalisePolishPhone((value ?? "").trim());
  return cleaned.replace(/[^\d+]/g, "");
}

function normalisePesel(value: string | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export interface ContactMatch {
  contact: ContactRow;
  /** Which rule fired — recorded on the timeline so a merge is never a silent event. */
  reason: "pesel" | "email+name" | "phone+name" | "phone" | "email" | "phone-only";
}

/**
 * Finds the existing patient this identity belongs to, or null.
 *
 * Candidates are narrowed in SQL first, then judged in JS, because the phone
 * column holds whatever each source wrote ("+48 600 123 456", "600123456") and
 * comparing those properly needs the same normaliser the collectors use.
 */
export async function findMatchingContact(input: ContactIdentity): Promise<ContactMatch | null> {
  const email = normaliseEmail(input.email);
  const phone = normalisePhone(input.phone);
  const pesel = normalisePesel(input.pesel);
  const first = normaliseName(input.firstName);
  const last = normaliseName(input.lastName);

  // Nothing to match on at all.
  if (!email && !phone && !pesel) return null;

  // Phones are compared on their last nine digits — the Polish national number.
  // That makes "+48 600 123 456", "0048600123456" and "600-123-456" one number
  // without needing every source to have written it the same way.
  const phoneTail = phone.replace(/\D/g, "").slice(-9);

  const db = getDb();
  // Only rows that could possibly match, rather than the whole table. An empty
  // value never matches an empty column — two contacts with no PESEL are not
  // "the same PESEL".
  const candidates = await db
    .select()
    .from(contacts)
    .where(
      sql`(${pesel} <> '' AND replace(replace(${contacts.pesel}, ' ', ''), '-', '') = ${pesel})
       OR (${email} <> '' AND lower(trim(${contacts.email})) = ${email})
       OR (${phoneTail} <> '' AND replace(replace(replace(${contacts.phone}, ' ', ''), '-', ''), '+', '') LIKE ${"%" + phoneTail})`,
    );

  for (const candidate of candidates) {
    // Rule 1 — PESEL wins outright.
    if (pesel && normalisePesel(candidate.pesel) === pesel) {
      return { contact: candidate, reason: "pesel" };
    }
  }

  const sameName = (candidate: ContactRow) =>
    !!first &&
    !!last &&
    normaliseName(candidate.firstName) === first &&
    normaliseName(candidate.lastName) === last;

  for (const candidate of candidates) {
    if (!sameName(candidate)) continue;
    // Rule 2 — name plus e-mail.
    if (email && normaliseEmail(candidate.email) === email) {
      return { contact: candidate, reason: "email+name" };
    }
    // Rule 3 — name plus phone.
    if (phone && normalisePhone(candidate.phone) === phone) {
      return { contact: candidate, reason: "phone+name" };
    }
  }

  /**
   * Rule 4 — sam numer, gdy przychodzące dane NIE MAJĄ nazwiska.
   *
   * Dotyczy kontaktów telefonicznych: z rejestracji telefonicznej albo z
   * importu listy numerów przychodzi goły numer i nic więcej. Reguły 2 i 3
   * wymagają imienia i nazwiska po obu stronach, więc taki wpis nie dopasowałby
   * się NIGDY — a to znaczy, że dwukrotny import tej samej listy założyłby
   * komplet duplikatów.
   *
   * To nie osłabia zasady „sam telefon nie wystarczy". Tamta broni przed
   * sklejeniem dwóch RÓŻNYCH, znanych z nazwiska osób dzielących telefon
   * domowy. Tutaj o żadnym rozróżnianiu nie ma mowy: przychodzi numer bez
   * nazwiska, a numer jest jedyną tożsamością, jaką mamy. Dwa takie wpisy to
   * dwie karty tego samego nieznanego pacjenta.
   *
   * Warunek jest po stronie WEJŚCIA, nie kandydata: jeśli baza wie, czyj to
   * numer, tym lepiej — kontakt telefoniczny dopnie się do istniejącej
   * kartoteki, zamiast zakładać obok niej pustą.
   */
  const incomingHasName = !!first && !!last;
  if (!incomingHasName && phoneTail) {
    for (const candidate of candidates) {
      if (normalisePhone(candidate.phone).replace(/\D/g, "").slice(-9) === phoneTail) {
        return { contact: candidate, reason: "phone" };
      }
    }
  }

  /**
   * Reguła 5 — **ten sam e-mail albo telefon wystarczy**, o ile nazwiska sobie
   * nie przeczą.
   *
   * **Po co, skoro są reguły 2 i 3.** Tamte wymagają imienia i nazwiska po
   * OBU stronach. Kontakt zapisany kiedyś jako sama „Elżbieta", bez nazwiska,
   * nie dopasowywał się więc do leada „Elżbieta Nowak" — mimo identycznego
   * adresu e-mail i identycznego numeru telefonu. Powstawała druga kartoteka
   * tej samej pacjentki.
   *
   * **Zabezpieczenie, które zostaje**: gdy obie strony mają komplet imienia
   * i nazwiska, a te się różnią, dopasowania NIE ma. To nie jest ta sama
   * osoba — to dwie osoby dzielące telefon domowy albo rodzinną skrzynkę.
   * W CRM medycznym sklejenie ich znaczyłoby, że jedna widzi plan leczenia
   * i historię wizyt drugiej, więc ten jeden przypadek wolimy zostawić jako
   * dwie kartoteki.
   *
   * Brak nazwiska po jednej ze stron to **brak danych, nie sprzeczność** —
   * i właśnie dlatego przechodzi.
   */
  const namesConflict = (candidate: ContactRow): boolean => {
    const cFirst = normaliseName(candidate.firstName);
    const cLast = normaliseName(candidate.lastName);
    const bothComplete = !!first && !!last && !!cFirst && !!cLast;
    return bothComplete && (cFirst !== first || cLast !== last);
  };

  for (const candidate of candidates) {
    if (namesConflict(candidate)) continue;
    if (email && normaliseEmail(candidate.email) === email) {
      return { contact: candidate, reason: "email" };
    }
  }

  for (const candidate of candidates) {
    if (namesConflict(candidate)) continue;
    if (phoneTail && normalisePhone(candidate.phone).replace(/\D/g, "").slice(-9) === phoneTail) {
      return { contact: candidate, reason: "phone-only" };
    }
  }

  return null;
}

export const MATCH_REASON_LABELS: Record<ContactMatch["reason"], string> = localized(() => ({
  pesel: t("ten sam PESEL"),
  "email+name": t("ten sam e-mail oraz imię i nazwisko"),
  "phone+name": t("ten sam numer telefonu oraz imię i nazwisko"),
  phone: "ten sam numer telefonu (kontakt bez nazwiska)",
  email: t("ten sam e-mail (nazwiska nie przeczą sobie)"),
  "phone-only": t("ten sam numer telefonu (nazwiska nie przeczą sobie)"),
}));
