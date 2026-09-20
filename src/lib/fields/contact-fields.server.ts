import { asc, eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contactFieldDefs, contacts } from "../db/schema";
import type { ContactFieldDefRow, ContactFieldType } from "../db/schema";
import { t, localized } from "@/lib/i18n";
import { EN } from "@/lib/i18n/en";

/**
 * What the contact card shows, and under what name — the model behind
 * Ustawienia → Tabele / Dane.
 *
 * Two things live here that look similar and are not:
 *
 * - **Renaming** changes the label a human reads. The column keeps its name,
 *   because `firstName` is what every query, CSV export, MCP tool and merge tag
 *   is written against; renaming the column to please one clinic would break
 *   all of them silently.
 * - **Adding** creates a field with no column at all. Its value lands in
 *   `contacts.custom_fields`, keyed by the definition's key.
 *
 * Server-only (touches the DB client and `randomUUID`-free id generation);
 * `*.functions.ts` merely wraps it — see the note in contacts.server.ts.
 */

export interface ContactFieldDef {
  key: string;
  label: string;
  type: ContactFieldType;
  options: string[];
  hint: string;
  builtin: boolean;
  /** Cannot be hidden or deleted — the app breaks without it. */
  locked: boolean;
  visible: boolean;
  /** Built-ins the card renders but never lets anybody type into. */
  readOnly: boolean;
  /**
   * Statusy, przy których pole pokazuje się na karcie. **Pusta lista = wszystkie.**
   *
   * Puste znaczy „wszystkie", a nie „żaden", bo takie było zachowanie przed
   * wprowadzeniem przypisań — inaczej w dniu wdrożenia każde istniejące pole
   * zniknęłoby z każdej karty.
   */
  statuses: string[];
  sortOrder: number;
}

/**
 * The columns of `contacts` a human is meant to see, in the order the card
 * shows them. This list is the seed; once seeded, the table is the truth, so
 * a renamed field survives a restart and a new built-in added here appears on
 * the next read without wiping anybody's edits.
 */
// `statuses` pominięte w tej liście: pola wbudowane dotyczą KAŻDEGO statusu,
// a pusta lista właśnie to znaczy. Wypisywanie jej przy dwunastu polach byłoby
// dwunastoma okazjami do pomyłki bez żadnej korzyści.
const BUILTIN_FIELDS: Array<
  Omit<ContactFieldDef, "builtin" | "sortOrder" | "statuses"> & { sortOrder?: number }
> = localized(() => [
  {
    key: "prmId",
    label: t("PRM ID"),
    type: "text",
    options: [],
    hint: t("Identyfikator kontaktu w eksportach i korespondencji — nadawany automatycznie."),
    locked: true,
    visible: true,
    readOnly: true,
  },
  {
    key: "firstName",
    label: t("Imię"),
    type: "text",
    options: [],
    hint: "",
    locked: true,
    visible: true,
    readOnly: false,
  },
  {
    key: "lastName",
    label: t("Nazwisko"),
    type: "text",
    options: [],
    hint: "",
    locked: true,
    visible: true,
    readOnly: false,
  },
  {
    key: "email",
    label: t("Email"),
    type: "text",
    options: [],
    hint: t("Klucz łączący wysyłki, otwarcia i odpowiedzi z pacjentem — musi być unikalny."),
    locked: true,
    visible: true,
    readOnly: false,
  },
  {
    key: "phone",
    label: t("Telefon"),
    type: "text",
    options: [],
    hint: "",
    locked: false,
    visible: true,
    readOnly: false,
  },
  {
    key: "pesel",
    label: t("PESEL"),
    type: "text",
    options: [],
    hint: t("Celowo pominięty w personalizacji wiadomości."),
    locked: false,
    visible: true,
    readOnly: false,
  },
  {
    key: "status",
    label: t("Status"),
    type: "select",
    options: ["lead", "active", "patient", "inactive"],
    hint: t(
      "Wartości są zaszyte w kodzie (lead / active / patient / inactive) — można zmienić nazwę pola, nie listę.",
    ),
    locked: false,
    visible: true,
    readOnly: false,
  },
  {
    key: "segments",
    label: t("Segmenty"),
    type: "list",
    options: [],
    hint: "",
    locked: false,
    visible: true,
    readOnly: false,
  },
  {
    key: "tags",
    label: t("Tagi"),
    type: "list",
    options: [],
    hint: t("Tag „nie-kontaktowac” blokuje każdą wysyłkę do tego kontaktu."),
    locked: false,
    visible: true,
    readOnly: false,
  },
  {
    key: "source",
    label: t("Źródło pozyskania"),
    type: "text",
    options: [],
    hint: "",
    locked: false,
    visible: true,
    readOnly: false,
  },
  {
    key: "medium",
    label: t("Medium pozyskania"),
    type: "text",
    options: [],
    hint: "",
    locked: false,
    visible: true,
    readOnly: false,
  },
  {
    key: "campaign",
    label: t("Kampania pozyskania"),
    type: "text",
    options: [],
    hint: "",
    locked: false,
    visible: true,
    readOnly: false,
  },
  {
    key: "createdAt",
    label: t("Data dodania"),
    type: "date",
    options: [],
    hint: "",
    locked: false,
    visible: true,
    readOnly: true,
  },
]);

/** Built-in columns the card renders but never edits — identity, not data. */
const READ_ONLY_BUILTINS = new Set(BUILTIN_FIELDS.filter((f) => f.readOnly).map((f) => f.key));

/**
 * Default labels of built-in fields, in Polish — the translation keys.
 *
 * Labels are stored in the database when the table is first seeded, in the
 * language active at that moment. A label that is still a default (in either
 * language) is shown in the reader's language; one the clinic renamed is shown
 * as written.
 */
const BUILTIN_LABELS_PL: Record<string, string> = {
  prmId: "PRM ID",
  firstName: "Imię",
  lastName: "Nazwisko",
  email: "Email",
  phone: "Telefon",
  pesel: "PESEL",
  status: "Status",
  segments: "Segmenty",
  tags: "Tagi",
  source: "Źródło pozyskania",
  medium: "Medium pozyskania",
  campaign: "Kampania pozyskania",
  createdAt: "Data dodania",
};

function displayLabel(key: string, stored: string, builtin: boolean): string {
  const pl = builtin ? BUILTIN_LABELS_PL[key] : undefined;
  if (!pl) return stored;
  return stored === pl || stored === (EN[pl] ?? pl) ? t(pl) : stored;
}

function toDef(row: ContactFieldDefRow): ContactFieldDef {
  return {
    key: row.key,
    label: displayLabel(row.key, row.label, row.builtin === 1),
    type: row.type,
    options: row.options ?? [],
    hint: row.hint,
    builtin: row.builtin === 1,
    locked: row.locked === 1,
    visible: row.visible === 1,
    // Read-only-ness is a property of the column, not something the clinic
    // configures, so it is derived here rather than stored and kept in sync.
    readOnly: row.builtin === 1 && READ_ONLY_BUILTINS.has(row.key),
    statuses: row.statuses ?? [],
    sortOrder: row.sortOrder,
  };
}

/**
 * Inserts any built-in definition the table is missing. Runs on every read and
 * never overwrites: a clinic that renamed "PESEL" keeps its name.
 */
export async function ensureFieldDefsSeeded(): Promise<void> {
  const db = getDb();
  const existing = await db.select({ key: contactFieldDefs.key }).from(contactFieldDefs);
  const known = new Set(existing.map((r) => r.key));
  const missing = BUILTIN_FIELDS.filter((f) => !known.has(f.key));
  if (missing.length === 0) return;

  const now = Date.now();
  for (const [i, field] of BUILTIN_FIELDS.entries()) {
    if (known.has(field.key)) continue;
    await db.insert(contactFieldDefs).values({
      key: field.key,
      label: field.label,
      type: field.type,
      options: field.options,
      hint: field.hint,
      builtin: 1,
      locked: field.locked ? 1 : 0,
      visible: field.visible ? 1 : 0,
      sortOrder: i,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function listContactFields(): Promise<ContactFieldDef[]> {
  await ensureFieldDefsSeeded();
  const rows = await getDb()
    .select()
    .from(contactFieldDefs)
    .orderBy(asc(contactFieldDefs.sortOrder), asc(contactFieldDefs.key));
  return rows.map(toDef);
}

/** Only the user-added ones, in card order — what `contacts.custom_fields` is keyed by. */
export async function listCustomFields(): Promise<ContactFieldDef[]> {
  return (await listContactFields()).filter((f) => !f.builtin);
}

const SLUG_MAP: Record<string, string> = {
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

function slugify(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => SLUG_MAP[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "pole";
}

export interface FieldSaveResult {
  ok: boolean;
  error?: string;
  key?: string;
}

/**
 * Adds a field of the clinic's own. The key is derived from the label once, at
 * creation, and never changes afterwards — it is what the stored values are
 * keyed by, so renaming the field must not orphan them.
 */
export async function createContactField(input: {
  label: string;
  type: ContactFieldType;
  options: string[];
  hint: string;
}): Promise<FieldSaveResult> {
  const label = input.label.trim();
  if (!label) return { ok: false, error: t("Podaj nazwę pola.") };

  const db = getDb();
  await ensureFieldDefsSeeded();
  const existing = await db.select({ key: contactFieldDefs.key }).from(contactFieldDefs);
  const taken = new Set(existing.map((r) => r.key));

  let key = `custom_${slugify(label)}`;
  let n = 2;
  while (taken.has(key)) key = `custom_${slugify(label)}_${n++}`;

  const options = input.type === "select" ? input.options.map((o) => o.trim()).filter(Boolean) : [];
  if (input.type === "select" && options.length === 0) {
    return {
      ok: false,
      error: t("Pole typu „lista wyboru” potrzebuje przynajmniej jednej opcji."),
    };
  }

  const now = Date.now();
  await db.insert(contactFieldDefs).values({
    key,
    label,
    type: input.type,
    options,
    hint: input.hint.trim(),
    builtin: 0,
    locked: 0,
    visible: 1,
    // New fields land at the bottom of the card; the arrows move them.
    sortOrder: existing.length,
    createdAt: now,
    updatedAt: now,
  });
  return { ok: true, key };
}

/**
 * Saves an edited definition. What may change depends on the kind of field:
 * a built-in exposes only its label, hint and visibility, because its type is
 * whatever the column actually holds and claiming otherwise would be a lie the
 * form could not honour.
 */
export async function saveContactField(input: {
  key: string;
  label: string;
  hint: string;
  visible: boolean;
  type?: ContactFieldType;
  options?: string[];
  /** Statusy, przy których pole ma się pokazywać. Pusta lista = wszystkie. */
  statuses?: string[];
}): Promise<FieldSaveResult> {
  const label = input.label.trim();
  if (!label) return { ok: false, error: t("Nazwa pola nie może być pusta.") };

  const db = getDb();
  const row = await db
    .select()
    .from(contactFieldDefs)
    .where(eq(contactFieldDefs.key, input.key))
    .get();
  if (!row) return { ok: false, error: t("Pole nie istnieje.") };

  const locked = row.locked === 1;
  const patch: Partial<typeof contactFieldDefs.$inferInsert> = {
    label,
    hint: input.hint.trim(),
    // A locked field stays visible whatever the form sends — the card cannot
    // render a contact without a name or an address.
    visible: locked ? 1 : input.visible ? 1 : 0,
    updatedAt: Date.now(),
  };

  // Przypisanie do statusów. **Pola zablokowane zostają przy wszystkich** —
  // imię, nazwisko i adres muszą być na każdej karcie niezależnie od statusu,
  // a przypisanie ich do jednego zrobiłoby kartoteki bez nazwiska.
  if (input.statuses !== undefined && !locked) {
    patch.statuses = [...new Set(input.statuses.map((x) => x.trim()).filter(Boolean))];
  }

  if (row.builtin === 0) {
    if (input.type) patch.type = input.type;
    const type = input.type ?? row.type;
    if (type === "select") {
      const options = (input.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (options.length === 0) {
        return {
          ok: false,
          error: t("Pole typu „lista wyboru” potrzebuje przynajmniej jednej opcji."),
        };
      }
      patch.options = options;
    } else {
      patch.options = [];
    }
  }

  await db.update(contactFieldDefs).set(patch).where(eq(contactFieldDefs.key, input.key));
  return { ok: true, key: input.key };
}

/**
 * Deletes a user-added field **and the answers stored under it**.
 *
 * Purging the values is the point: a field nobody can see any more is still
 * personal data sitting in a JSON blob, and RODO minimisation says it should go
 * with the field. The UI says so before asking for confirmation.
 */
export async function deleteContactField(key: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const row = await db.select().from(contactFieldDefs).where(eq(contactFieldDefs.key, key)).get();
  if (!row) return { ok: false, error: t("Pole nie istnieje.") };
  if (row.builtin === 1) {
    return { ok: false, error: t("Pola systemowego nie da się usunąć — można je ukryć.") };
  }

  const rows = await db
    .select({ id: contacts.id, customFields: contacts.customFields })
    .from(contacts);
  for (const contact of rows) {
    const values = contact.customFields ?? {};
    if (!(key in values)) continue;
    const { [key]: _removed, ...rest } = values;
    await db.update(contacts).set({ customFields: rest }).where(eq(contacts.id, contact.id));
  }

  await db.delete(contactFieldDefs).where(eq(contactFieldDefs.key, key));
  return { ok: true };
}

/** Moves a field one place up or down in the card order. */
export async function moveContactField(
  key: string,
  direction: "up" | "down",
): Promise<{ ok: boolean }> {
  const fields = await listContactFields();
  const index = fields.findIndex((f) => f.key === key);
  if (index < 0) return { ok: false };
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= fields.length) return { ok: false };

  const reordered = [...fields];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  const db = getDb();
  const now = Date.now();
  for (const [i, field] of reordered.entries()) {
    if (field.sortOrder === i) continue;
    await db
      .update(contactFieldDefs)
      .set({ sortOrder: i, updatedAt: now })
      .where(eq(contactFieldDefs.key, field.key));
  }
  return { ok: true };
}

/**
 * How many contacts have a value for each custom field. Shown in the settings
 * tab so "delete this field" is a decision made with the count in view.
 */
export async function customFieldUsage(): Promise<Record<string, number>> {
  const custom = await listCustomFields();
  if (custom.length === 0) return {};
  const rows = await getDb().select({ customFields: contacts.customFields }).from(contacts);
  const usage: Record<string, number> = Object.fromEntries(custom.map((f) => [f.key, 0]));
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.customFields ?? {})) {
      if (key in usage && String(value).trim() !== "") usage[key] += 1;
    }
  }
  return usage;
}
