import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { randomUUID } from "node:crypto";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contactNotes, contacts } from "../db/schema";
import type { Contact } from "../contacts";
import {
  ensureSeeded,
  announceNewContact,
  contactFacets,
  deleteContactCompletely,
  listContactsForExport,
  listContactsPage,
  updateContact as updateContactRecord,
  type ContactPage,
} from "../contacts.server";
import { findMatchingContact, MATCH_REASON_LABELS } from "../contacts-match.server";
import { t } from "@/lib/i18n";

// RPC layer only. Every plain (non-handler) contact helper lives in
// contacts.server.ts — see the note there for why: a plain export here would
// survive into the client bundle and drag node:crypto along with it.

const contactInput = z.object({
  id: z.string(),
  prmId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string(),
  pesel: z.string(),
  segments: z.array(z.string()),
  tags: z.array(z.string()),
  source: z.string(),
  medium: z.string(),
  campaign: z.string(),
  createdAt: z.string(),
  // Dowolny klucz statusu — placówka definiuje własne (patrz `contact_statuses`).
  // Nieznany klucz nie jest tu odrzucany: lista statusów żyje w bazie, a walidacja
  // wobec niej wymagałaby zapytania przy każdym zapisie. Interfejs i tak podaje
  // tylko istniejące, a nieznana wartość jest widoczna na karcie jako własna nazwa.
  status: z.string().min(1).max(40),
  // Zgody i pola własne przechodzą przez walidator, bo import w Kontaktach
  // realnie je czyta. Zod odrzuca nieznane klucze po cichu, więc dopóki ich tu
  // nie było, klient wysyłał komplet, a do bazy szły same domyślne zera —
  // arkusz ze zgodą papierową wczytywał się jako „brak zgody" i nikt tego nie
  // widział aż do pierwszej pominiętej wysyłki. Wartości domyślne zostawiają
  // wszystkie pozostałe drogi zapisu (import telefoniczny, kolektory) bez zmian.
  /**
   * Notatka z arkusza — trafia do `contact_notes`, nie do wiersza kontaktu.
   *
   * Import bywa jedynym momentem, w którym wiadomo, skąd ktoś się wziął i co
   * o nim ustalono; bez tego pola te informacje ginęły, bo arkusze mają
   * kolumny, dla których nie warto zakładać pól karty.
   */
  note: z.string().max(4000).optional(),
  consentEmail: z.number().int().min(0).max(1).default(0),
  consentSms: z.number().int().min(0).max(1).default(0),
  consentProfiling: z.number().int().min(0).max(1).default(0),
  consentSource: z.string().max(200).default(""),
  consentUpdatedAt: z.number().nullable().default(null),
  customFields: z.record(z.string(), z.string()).default({}),
});

/**
 * All contacts — seeded once, then fully user-managed.
 *
 * **Nie używać do listy kontaktów.** Przy jedenastu tysiącach wierszy to kilka
 * megabajtów na każde wejście; lista chodzi przez `getContactsPage`. Zostaje
 * dla miejsc, które realnie potrzebują kompletu (np. liczenia globalne).
 */
export const getAllContacts = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<Contact[]> => {
    await ensureSeeded();
    const db = getDb();
    return db.select().from(contacts);
  });

const contactQuery = z.object({
  q: z.string().default(""),
  status: z.string().default("all"),
  segments: z.array(z.string()).default([]),
  tag: z.string().default(""),
  sortKey: z.enum(["name", "contact", "source", "created", "status"]).default("name"),
  sortDesc: z.boolean().default(false),
  // Który moduł pyta. Obie listy to ta sama tabela rozdzielona `phone_only`,
  // więc paginacja i wyszukiwanie są jedną implementacją dla obu.
  phoneOnly: z.boolean().default(false),
  // Filtry po polach dodatkowych: klucz definicji → wartość. `catchall`, bo
  // zestaw pól ustala klinika w ustawieniach i nie da się go tu wyliczyć.
  custom: z.record(z.string(), z.string()).default({}),
});

/** Jedna strona listy kontaktów — filtr, sortowanie i stronicowanie liczone w SQL-u. */
export const getContactsPage = createServerFn({ method: "POST" })
  .middleware([allowReporter])
  .inputValidator(
    contactQuery.extend({
      offset: z.number().int().min(0).default(0),
      // 10 000 jest w wyborze, bo user go zamówił — ale to jest górna granica
      // z rozsądku, nie zaproszenie. Powyżej wracamy do problemu, który ta
      // zmiana rozwiązuje.
      limit: z.number().int().min(1).max(10_000).default(100),
    }),
  )
  .handler(async ({ data }): Promise<ContactPage> => listContactsPage(data));

/** Wszystkie pasujące do filtra — dla eksportu, który obejmuje cały wynik, nie stronę. */
export const getContactsForExport = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(contactQuery)
  .handler(async ({ data }): Promise<Contact[]> => listContactsForExport(data));

/** Wartości do filtrów — agregat z całej bazy, nie z bieżącej strony. */
export const getContactFacets = createServerFn({ method: "POST" })
  .middleware([allowReporter])
  .inputValidator(z.object({ phoneOnly: z.boolean().default(false) }))
  .handler(
    async ({
      data,
    }): Promise<{
      segments: [string, number][];
      tags: [string, number][];
      statuses: [string, number][];
      custom: Record<string, [string, number][]>;
    }> => contactFacets(data.phoneOnly),
  );

export const getContactById = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<Contact | null> => {
    await ensureSeeded();
    const db = getDb();
    const row = await db.select().from(contacts).where(eq(contacts.id, data.id)).get();
    return row ?? null;
  });

/** Distinct tags already in use across contacts — powers the tag autocomplete in the popup builder. */
export const getAllTags = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<string[]> => {
    await ensureSeeded();
    const db = getDb();
    const rows = await db.select({ tags: contacts.tags }).from(contacts);
    const seen = new Set<string>();
    for (const row of rows) {
      for (const tag of row.tags ?? []) {
        const clean = tag.trim();
        if (clean) seen.add(clean);
      }
    }
    return [...seen].sort((a, b) => a.localeCompare(b, "pl"));
  });

/**
 * Adds a contact typed in by hand — refusing when it would duplicate somebody.
 *
 * The card's edit form has always rejected a duplicate address; creating one
 * did not, which meant the same patient could be entered twice by the same
 * person on the same screen.
 */
export const createContact = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(contactInput)
  .handler(async ({ data }) => {
    const match = await findMatchingContact({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      pesel: data.pesel,
    });
    if (match) {
      return {
        ok: false as const,
        duplicateOf: match.contact.id,
        error: t("Ten pacjent już jest w bazie ({v0}) — {firstName} {lastName}.", {
          v0: MATCH_REASON_LABELS[match.reason],
          firstName: match.contact.firstName,
          lastName: match.contact.lastName,
        }),
      };
    }
    const db = getDb();
    await db.insert(contacts).values(data);
    await announceNewContact(data.id, { source: "manual" }, data.tags);
    return { ok: true as const };
  });

/**
 * Bulk insert used by CSV import.
 *
 * Every row is checked against the same rule as every other entry point, and —
 * just as importantly — **against the rows earlier in the same file**. A list
 * exported from two sources routinely contains the same person twice, and
 * importing it used to double the base silently. Duplicates are skipped, not
 * merged: a spreadsheet is a weaker source than the card somebody maintains.
 */
export const createContacts = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      contacts: z.array(contactInput),
      /**
       * Czy zgłosić nowe kontakty silnikowi.
       *
       * Domyślnie tak — ręcznie dodany kontakt ma wyzwalać automatyzacje. Ale
       * import bazy to nie jest osiem tysięcy osób, które właśnie się zapisały:
       * jedno `contact.created` na wiersz uruchomiłoby każdą aktywną
       * automatyzację z wyzwalaczem „Nowy kontakt" i wysłało im wszystkim
       * powitanie. Przy zaciąganiu historycznej bazy to jest katastrofa, a nie
       * funkcja — stąd przełącznik po stronie użytkownika.
       */
      announce: z.boolean().default(true),
    }),
  )
  .handler(async ({ data }) => {
    if (data.contacts.length === 0) return { ok: true, inserted: 0, skipped: 0, reasons: [] };
    const db = getDb();
    const inserted: typeof data.contacts = [];
    const reasons: string[] = [];

    for (const c of data.contacts) {
      const match = await findMatchingContact({
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        pesel: c.pesel,
      });
      if (match) {
        reasons.push(`${c.firstName} ${c.lastName} — ${MATCH_REASON_LABELS[match.reason]}`);
        continue;
      }
      // Written one at a time rather than in one statement, because each row has
      // to be visible to the matcher when the next one is checked — otherwise a
      // file containing the same person twice would still insert them twice.
      // Notatka nie jest kolumną kontaktu — musi wyjść z obiektu, zanim ten
      // trafi do `insert`, inaczej sterownik odrzuci nieznane pole.
      const { note, ...row } = c;
      await db.insert(contacts).values(row);
      if (note && note.trim()) {
        await db.insert(contactNotes).values({
          id: randomUUID(),
          contactId: row.id,
          text: note.trim(),
          source: "import",
          createdAt: Date.now(),
        });
      }
      inserted.push(c);
    }

    if (data.announce) {
      for (const c of inserted) {
        await announceNewContact(c.id, { source: "import" }, c.tags);
      }
    }
    return {
      ok: true,
      inserted: inserted.length,
      skipped: data.contacts.length - inserted.length,
      reasons: reasons.slice(0, 20),
    };
  });

/**
 * Usuwa kontakt wraz z całą jego historią i dokumentami.
 *
 * Nieodwracalne i takie ma być — patrz `deleteContactCompletely`. Zwraca listę
 * imion, żeby potwierdzenie mówiło o ludziach, a nie o liczbie wierszy.
 */
export const deleteContacts = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ ids: z.array(z.string()).min(1).max(500) }))
  .handler(async ({ data }) => {
    const deleted: string[] = [];
    const errors: string[] = [];
    for (const id of data.ids) {
      const result = await deleteContactCompletely(id);
      if (result.ok) deleted.push(result.name ?? id);
      else errors.push(result.error ?? id);
    }
    return { ok: errors.length === 0, deleted, errors: errors.slice(0, 10) };
  });

/**
 * Saves edits made on a contact card. Explicit — the card holds a draft until
 * somebody presses "Zapisz", so nothing is written while a field is half typed.
 */
export const updateContact = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      email: z.string(),
      phone: z.string(),
      pesel: z.string(),
      // Dowolny klucz statusu — placówka definiuje własne (patrz `contact_statuses`).
      // Nieznany klucz nie jest tu odrzucany: lista statusów żyje w bazie, a walidacja
      // wobec niej wymagałaby zapytania przy każdym zapisie. Interfejs i tak podaje
      // tylko istniejące, a nieznana wartość jest widoczna na karcie jako własna nazwa.
      status: z.string().min(1).max(40),
      source: z.string(),
      medium: z.string(),
      campaign: z.string(),
      tags: z.array(z.string()),
      segments: z.array(z.string()),
      consentEmail: z.boolean(),
      consentSms: z.boolean(),
      consentProfiling: z.boolean(),
      extraConsents: z.record(z.string(), z.boolean()).default({}),
      customFields: z.record(z.string(), z.string()).default({}),
    }),
  )
  .handler(async ({ data }) => updateContactRecord(data));
