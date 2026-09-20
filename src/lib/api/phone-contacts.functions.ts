import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { warsawToday } from "../visits/warsaw-time";

import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contacts, smsSends } from "../db/schema";
import type { Contact } from "../contacts";
import { ensureSeeded, announceNewContact } from "../contacts.server";
import { findMatchingContact, MATCH_REASON_LABELS } from "../contacts-match.server";
import { formatActivityDate } from "../activity-date";
import { withDiallingCode } from "../phone";
import { addNote } from "../notes/notes.server";
import { setConsents } from "../consent/consent.server";
import { t as tr } from "@/lib/i18n";

// Warstwa RPC modułu „Kontakty telefoniczne”. Ten sam `contacts` co wszędzie —
// kontakt telefoniczny to stan (`phoneOnly = 1`), nie osobny byt, więc oś czasu,
// notatki, zgody i automatyzacje działają dla niego bez niczego dodatkowego.

const phoneContactInput = z.object({
  phone: z.string().trim().min(1),
  firstName: z.string().trim().default(""),
  lastName: z.string().trim().default(""),
  note: z.string().trim().default(""),
  source: z.string().trim().default(""),
  campaign: z.string().trim().default(""),
  /**
   * Zgody przeniesione z miejsca, w którym pacjent ich naprawdę udzielił —
   * rejestracji, papierowego formularza, innego systemu.
   *
   * Domyślnie ŻADNA. Sam plik nie jest dowodem, że ktokolwiek się zgodził;
   * jedynką w kolumnie klinika oświadcza, że tę zgodę ma i wie skąd. Dlatego
   * `consentSource` jest wymagane, gdy którakolwiek zgoda jest na „tak” —
   * zgoda bez zapisanego pochodzenia jest bezużyteczna przy kontroli.
   */
  consentEmail: z.boolean().default(false),
  consentSms: z.boolean().default(false),
  consentProfiling: z.boolean().default(false),
  consentSource: z.string().trim().default(""),
  /**
   * Tagi z pliku, dokładane obok znacznika pochodzenia „telefon".
   *
   * Nie zamiast: `telefon` mówi, SKĄD kontakt jest, a tagi z pliku mówią, CZEGO
   * dotyczy. Nadpisanie jednego drugim odebrałoby możliwość zbudowania segmentu
   * „wszyscy z rejestracji telefonicznej".
   */
  tags: z.array(z.string()).default([]),
});

export type PhoneContactInput = z.infer<typeof phoneContactInput>;

/**
 * Liczniki nagłówka modułu.
 *
 * Liczone agregatem, bo po wprowadzeniu stronicowania widok nie ma już całej
 * listy w pamięci — a „ile numerów czeka na nazwisko" ma dotyczyć bazy, nie
 * bieżącej strony.
 */
export const getPhoneContactStats = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<{ total: number; unnamed: number }> => {
    await ensureSeeded();
    const row = await getDb()
      .select({
        total: sql<number>`count(*)`,
        // Brak imienia **lub** nazwiska — kontakt z samym imieniem nadal nie
        // nadaje się do korespondencji i nadal czeka na uzupełnienie.
        unnamed: sql<number>`sum(case when trim(first_name) = '' or trim(last_name) = '' then 1 else 0 end)`,
      })
      .from(contacts)
      .where(eq(contacts.phoneOnly, 1))
      .get();
    return { total: Number(row?.total ?? 0), unnamed: Number(row?.unnamed ?? 0) };
  });

/** Kontakty znane tylko z telefonu, najnowsze pierwsze. */
export const getPhoneContacts = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<Contact[]> => {
    await ensureSeeded();
    return getDb().select().from(contacts).where(eq(contacts.phoneOnly, 1));
  });

function newPhoneContact(
  input: PhoneContactInput,
  seq: number,
): typeof contacts.$inferInsert & { id: string; source: string; tags: string[] } {
  return {
    id: `tel-${Date.now()}-${seq}`,
    prmId: `PRM-${String(90000 + Math.floor(Math.random() * 9999)).slice(-5)}`,
    firstName: input.firstName,
    lastName: input.lastName,
    email: "",
    // Siatka bezpieczeństwa: import dokleja kierunkowy sam (z wybranym przez
    // człowieka), ale ręczne dodanie i przyszła integracja idą tędy. Numer już
    // międzynarodowy zostaje nietknięty, więc podwójne przetworzenie nic nie psuje.
    phone: withDiallingCode(input.phone, "+48"),
    pesel: "",
    segments: [],
    tags: ["telefon", ...input.tags.map((t) => t.trim()).filter(Boolean)],
    source: input.source || "Rejestracja telefoniczna",
    medium: "telefon",
    campaign: input.campaign,
    createdAt: warsawToday(),
    status: "lead",
    // Rozmowa telefoniczna nie jest zgodą marketingową. Kto ją odebrał, musi
    // ją zaznaczyć na karcie świadomie.
    consentEmail: 0,
    consentSms: 0,
    consentProfiling: 0,
    consentSource: "rejestracja telefoniczna",
    consentUpdatedAt: null,
    customFields: {},
    // Znika stąd, gdy ktoś uzupełni imię i nazwisko — patrz updateContact.
    phoneOnly: input.firstName && input.lastName ? 0 : 1,
  };
}

/**
 * Zapisuje zgody przyniesione przez import.
 *
 * Przez `setConsents`, a nie zapisem kolumn: ta funkcja stempluje źródło,
 * wysyła `contact.field_changed` i kładzie zmianę na osi czasu pacjenta. To
 * właśnie ta linijka na osi jest dowodem „skąd i kiedy”, którego wymaga RODO —
 * ustawienie jedynki w kolumnie zostawiłoby zgodę bez historii.
 */
async function applyImportedConsents(contactId: string, input: PhoneContactInput): Promise<void> {
  if (!input.consentEmail && !input.consentSms && !input.consentProfiling) return;
  await setConsents({
    contactId,
    email: input.consentEmail,
    sms: input.consentSms,
    profiling: input.consentProfiling,
    source: input.consentSource || "import listy telefonicznej",
    note: input.consentSource
      ? tr("Zgoda przeniesiona przy imporcie. Źródło podane w pliku: {consentSource}.", {
          consentSource: input.consentSource,
        })
      : tr("Zgoda przeniesiona przy imporcie listy telefonicznej — plik nie podał źródła."),
  });
}

export const createPhoneContact = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(phoneContactInput)
  .handler(
    async ({
      data,
    }): Promise<{ ok: boolean; id?: string; error?: string; duplicateOf?: string }> => {
      await ensureSeeded();
      // Ta sama reguła scalania, co wszędzie indziej — numer, który już jest
      // w bazie, nie zakłada drugiej kartoteki tego samego pacjenta.
      const match = await findMatchingContact({
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      });
      if (match) {
        return {
          ok: false,
          duplicateOf: match.contact.id,
          error: tr("Ten numer jest już w bazie ({v0}) — {v1} {lastName}", {
            v0: MATCH_REASON_LABELS[match.reason],
            v1: match.contact.firstName || "kontakt",
            lastName: match.contact.lastName,
          }).trim(),
        };
      }

      const row = newPhoneContact(data, 0);
      await getDb().insert(contacts).values(row);
      if (data.note) await addNote({ contactId: row.id, text: data.note, source: "manual" });
      await applyImportedConsents(row.id, data);
      await announceNewContact(row.id, { source: row.source }, row.tags as string[]);
      return { ok: true, id: row.id };
    },
  );

/**
 * Import listy numerów.
 *
 * Wiersz po wierszu, nie jedną instrukcją: każdy zapisany numer musi być
 * widoczny dla dopasowania przy sprawdzaniu następnego, inaczej plik z tym
 * samym numerem dwa razy założyłby dwa kontakty.
 */
export const createPhoneContacts = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ rows: z.array(phoneContactInput) }))
  .handler(
    async ({
      data,
    }): Promise<{ ok: boolean; inserted: number; skipped: number; reasons: string[] }> => {
      await ensureSeeded();
      const db = getDb();
      const reasons: string[] = [];
      let inserted = 0;

      for (const [i, input] of data.rows.entries()) {
        const match = await findMatchingContact({
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
        });
        if (match) {
          reasons.push(`${input.phone} — ${MATCH_REASON_LABELS[match.reason]}`);
          continue;
        }
        const row = newPhoneContact(input, i);
        await db.insert(contacts).values(row);
        // Kolumna „notatka” z pliku ląduje na osi czasu kontaktu — po to ktoś
        // ją w tym pliku wpisał.
        if (input.note) await addNote({ contactId: row.id, text: input.note, source: "manual" });
        await applyImportedConsents(row.id, input);
        await announceNewContact(row.id, { source: row.source }, row.tags as string[]);
        inserted += 1;
      }

      return { ok: true, inserted, skipped: reasons.length, reasons };
    },
  );

export interface SmsActivityItem {
  id: string;
  type: "sms";
  title: string;
  description: string;
  date: string;
}

/**
 * Wysłane SMS-y na oś czasu kontaktu.
 *
 * Czytane z `sms_sends`, nie ze skrzynki: wysyłka kampanijna nie jest rozmową
 * i nie ma czego szukać w wątkach czekających na odpowiedź człowieka.
 */
export const getSmsActivityForContact = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ contactId: z.string() }))
  .handler(async ({ data }): Promise<SmsActivityItem[]> => {
    const rows = await getDb()
      .select()
      .from(smsSends)
      .where(eq(smsSends.contactId, data.contactId))
      .orderBy(desc(smsSends.sentAt))
      .limit(200);

    return rows.map((s) => ({
      id: `sms-${s.id}`,
      type: "sms" as const,
      title: s.body.length > 160 ? `${s.body.slice(0, 159)}…` : s.body,
      description: tr("Wysłano SMS na {toPhone}{v1}", {
        toPhone: s.toPhone,
        v1: s.sender ? ` · nadawca ${s.sender}` : "",
      }),
      date: formatActivityDate(s.sentAt),
    }));
  });
