import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contacts } from "../db/schema";
import { listContactFields } from "../fields/contact-fields.server";
import { emitFieldChanged } from "../engine/actions.server";
import { activeBookingSystem } from "./provider";
import { peselInfo } from "../pesel";
import { t } from "@/lib/i18n";

/**
 * Uzupełnienie karty pacjenta danymi z systemu rezerwacji.
 *
 * **Puste pola są wypełniane, wpisane ręcznie nigdy nadpisywane** — ta sama
 * zasada co przy webhooku testu słuchu. Recepcja poprawia dane u siebie i ta
 * poprawka ma przetrwać kolejną synchronizację; automat, który po cichu cofa
 * czyjąś korektę, jest gorszy niż brak automatu.
 *
 * Wiek i płeć nie przychodzą z systemu rezerwacji — **wyliczamy je z numeru
 * PESEL**, jeśli system go przysyła. Dzięki temu pola „Wiek" i „Płeć" wypełniają się bez pytania
 * pacjenta o cokolwiek, a data urodzenia nie jest osobno przechowywana.
 */

export interface EnrichResult {
  ok: boolean;
  error?: string;
  /** Nazwy pól, które realnie się zmieniły — puste znaczy „nie było czego uzupełnić". */
  filled: string[];
  /** Pola, które system przysłał, ale kontakt miał już własną wartość. */
  kept: string[];
}

/** Etykiety pól własnych, do których trafiają dane wyliczone z PESEL-u i adresu. */
const CUSTOM_TARGETS: Record<string, "age" | "sex" | "city"> = {
  wiek: "age",
  plec: "sex",
  miasto: "city",
};

const foldPl = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => "acelnoszz"["ąćęłńóśźż".indexOf(ch)]);

export async function enrichContactFromSystem(contactId: string): Promise<EnrichResult> {
  const db = getDb();
  const contact = await db.select().from(contacts).where(eq(contacts.id, contactId)).get();
  if (!contact) return { ok: false, error: t("Kontakt nie istnieje."), filled: [], kept: [] };
  if (!contact.externalPatientId) {
    return {
      ok: false,
      error: t("Kontakt nie ma powiązania z systemem rezerwacji."),
      filled: [],
      kept: [],
    };
  }
  const system = await activeBookingSystem();
  if (!system) {
    return { ok: false, error: t("Nie podłączono systemu rezerwacji."), filled: [], kept: [] };
  }

  const patient = await system.getPatient(contact.externalPatientId);
  if (!patient) {
    return {
      ok: false,
      error: t("System rezerwacji nie zna tego pacjenta."),
      filled: [],
      kept: [],
    };
  }

  const filled: string[] = [];
  const kept: string[] = [];
  const updates: Record<string, unknown> = {};

  /** Wypełnia tylko puste — patrz komentarz nad funkcją. */
  const fill = (column: "pesel" | "phone" | "email", value: string, label: string) => {
    const clean = value.trim();
    if (!clean) return;
    if ((contact[column] ?? "").trim()) {
      if (foldPl(contact[column] ?? "") !== foldPl(clean)) kept.push(label);
      return;
    }
    updates[column] = clean;
    filled.push(label);
  };

  fill("pesel", patient.nationalId ?? "", t("PESEL"));
  fill("phone", patient.phone ?? "", t("Telefon"));
  fill("email", (patient.email ?? "").trim().toLowerCase(), t("Email"));

  // Pola własne placówki — po etykiecie, bo klucz techniczny zna tylko system.
  const defs = (await listContactFields()).filter((f) => !f.builtin);
  const pesel = (updates.pesel as string | undefined) ?? contact.pesel ?? "";
  const info = pesel ? peselInfo(pesel) : null;
  const custom = { ...(contact.customFields ?? {}) };
  let customChanged = false;

  for (const def of defs) {
    const target = CUSTOM_TARGETS[foldPl(def.label)];
    if (!target) continue;
    const value =
      target === "age"
        ? info
          ? String(info.age)
          : ""
        : target === "sex"
          ? (info?.sex ?? "")
          : (patient.city ?? "").trim();
    if (!value) continue;
    if ((custom[def.key] ?? "").trim()) {
      if (custom[def.key] !== value) kept.push(def.label);
      continue;
    }
    custom[def.key] = value;
    customChanged = true;
    filled.push(def.label);
  }
  if (customChanged) updates.customFields = custom;

  if (Object.keys(updates).length === 0) return { ok: true, filled: [], kept };

  await db.update(contacts).set(updates).where(eq(contacts.id, contactId));
  // Zmiany lecą przez tę samą szynę co edycja ręczna, więc automatyzacja
  // „Zmiana pola kontaktu" widzi je tak samo jak wszystko inne.
  for (const [key, value] of Object.entries(updates)) {
    if (key === "customFields") continue;
    await emitFieldChanged(contactId, key, String(value), String(contact[key as "pesel"] ?? ""));
  }
  return { ok: true, filled, kept };
}

/**
 * Ustawia powiązanie z systemem rezerwacji i od razu uzupełnia kartę.
 *
 * Osobno od `enrichContactFromSystem`, bo powiązanie jest decyzją („to jest ta sama
 * osoba"), a uzupełnienie tylko jej konsekwencją.
 */
export async function linkContactToSystem(
  contactId: string,
  patientId: number,
): Promise<EnrichResult> {
  const db = getDb();
  const system = await activeBookingSystem();
  if (!system) {
    return { ok: false, error: t("Nie podłączono systemu rezerwacji."), filled: [], kept: [] };
  }
  const patient = await system.getPatient(patientId);
  if (!patient) {
    return {
      ok: false,
      error: t("System rezerwacji nie zna pacjenta {patientId}.", { patientId }),
      filled: [],
      kept: [],
    };
  }
  await db.update(contacts).set({ externalPatientId: patientId }).where(eq(contacts.id, contactId));
  return enrichContactFromSystem(contactId);
}
