import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { appSettings, consentDefs, contactConsents, contacts } from "../db/schema";
import type { ConsentChannel, ConsentDefRow, ContactRow } from "../db/schema";
import { emitEvent } from "../engine/events.server";
import { logStep } from "../engine/log.server";
import { t as tr, localized } from "@/lib/i18n";

// The single place that decides whether a message may go out.
//
// Every send path in the app funnels through `assertCanSend`, so there is one
// answer to "is this allowed?" instead of one per channel. That matters more
// here than anywhere else in the codebase: a consent check that exists in three
// places is a consent check that will disagree with itself.

/** The tag standing in for a hard "do not contact". Kept in sync with actions.server.ts. */
const DNC_TAG = "nie-kontaktowac";

/**
 * Why a message is being sent.
 *
 * `marketing` — campaigns, newsletters, anything promotional. Requires the
 * channel's consent.
 *
 * `administrative` — appointment reminders, schedule changes, results,
 * replies to something the patient wrote. **Skips marketing consent**, because
 * under RODO these are not marketing: the basis is the care relationship, not
 * an opt-in. It still respects the hard do-not-contact tag, so a patient who
 * asked for silence gets silence.
 */
export type SendMode = "marketing" | "administrative";

export interface ConsentDecision {
  allowed: boolean;
  /** Plain-Polish reason, ready for an engine log line or a toast. */
  reason?: string;
}

export function hasDnc(contact: ContactRow): boolean {
  return (contact.tags ?? []).some((t) => t.trim().toLowerCase() === DNC_TAG);
}

export function hasConsent(contact: ContactRow, channel: ConsentChannel): boolean {
  if (channel === "email") return contact.consentEmail === 1;
  if (channel === "sms") return contact.consentSms === 1;
  return contact.consentProfiling === 1;
}

const CHANNEL_LABEL: Record<ConsentChannel, string> = {
  email: "e-mail",
  sms: "SMS",
  profiling: "profilowanie",
};

/**
 * The gate. `channel` is "email" or "sms" — profiling never blocks a send.
 *
 * Returns a decision rather than throwing, so each caller can turn it into the
 * shape its own layer needs (a skipped engine step, a toast, an agent reply).
 */
export function checkConsent(
  contact: ContactRow,
  channel: "email" | "sms",
  mode: SendMode = "marketing",
): ConsentDecision {
  // Checked first and in both modes: this is the one signal a patient sets
  // deliberately to stop all contact, and no send mode overrides it.
  if (hasDnc(contact)) {
    return {
      allowed: false,
      reason: tr("Pacjent ma status „nie kontaktować” — wysyłka zablokowana w każdym trybie."),
    };
  }

  if (mode === "administrative") return { allowed: true };

  if (!hasConsent(contact, channel)) {
    return {
      allowed: false,
      reason: tr(
        "Brak zgody marketingowej na kanał {v0} — wysyłkę pominięto. Użyj trybu administracyjnego, jeśli to wiadomość niemarketingowa (np. przypomnienie o wizycie).",
        { v0: CHANNEL_LABEL[channel] },
      ),
    };
  }

  return { allowed: true };
}

/**
 * Records a consent change and announces it.
 *
 * Emits `contact.field_changed` so automations can react to somebody opting in
 * or out — exactly like any other field edit. Also writes an engine log line,
 * which puts the change on the patient's timeline; that is the audit trail,
 * replacing the fake "audit log" screen the Consent tab used to show.
 */
export async function setConsents(input: {
  contactId: string;
  email?: boolean;
  sms?: boolean;
  profiling?: boolean;
  /** "formularz" | "zapier" | "ręcznie" | "wypis" | "import" — how this happened. */
  source: string;
  /** Extra sentence for the timeline, e.g. which link was used. */
  note?: string;
}): Promise<{ ok: boolean; changed: string[] }> {
  const db = getDb();
  const current = await db.select().from(contacts).where(eq(contacts.id, input.contactId)).get();
  if (!current) return { ok: false, changed: [] };

  const next = {
    consentEmail: input.email === undefined ? current.consentEmail : input.email ? 1 : 0,
    consentSms: input.sms === undefined ? current.consentSms : input.sms ? 1 : 0,
    consentProfiling:
      input.profiling === undefined ? current.consentProfiling : input.profiling ? 1 : 0,
  };

  const changed: string[] = [];
  if (next.consentEmail !== current.consentEmail) changed.push("consentEmail");
  if (next.consentSms !== current.consentSms) changed.push("consentSms");
  if (next.consentProfiling !== current.consentProfiling) changed.push("consentProfiling");
  // Re-saving the same answers is not a consent change and must not land on the
  // timeline as one.
  if (changed.length === 0) return { ok: true, changed: [] };

  await db
    .update(contacts)
    .set({ ...next, consentSource: input.source, consentUpdatedAt: Date.now() })
    .where(eq(contacts.id, input.contactId));

  const describe = (field: string) => {
    const label =
      field === "consentEmail" ? "e-mail" : field === "consentSms" ? "SMS" : "profilowanie";
    const granted =
      field === "consentEmail"
        ? next.consentEmail === 1
        : field === "consentSms"
          ? next.consentSms === 1
          : next.consentProfiling === 1;
    return `${label}: ${granted ? "udzielona" : "wycofana"}`;
  };

  await logStep({
    contactId: input.contactId,
    kind: "action",
    message: tr("Zmiana zgód ({source}) — {v1}.{v2}", {
      source: input.source,
      v1: changed.map(describe).join(", "),
      v2: input.note ? ` ${input.note}` : "",
    }),
    detail: { action: "consent_change", source: input.source },
  });

  for (const field of changed) {
    const value =
      field === "consentEmail"
        ? next.consentEmail
        : field === "consentSms"
          ? next.consentSms
          : next.consentProfiling;
    const before =
      field === "consentEmail"
        ? current.consentEmail
        : field === "consentSms"
          ? current.consentSms
          : current.consentProfiling;
    await emitEvent({
      type: "contact.field_changed",
      contactId: input.contactId,
      payload: { field, value: String(value), previous: String(before) },
    });
  }

  return { ok: true, changed };
}

/**
 * Withdraws the marketing consents at once — what the unsubscribe link does.
 *
 * Deliberately limited to the three built-ins. A patient clicking "wypisz się"
 * in a newsletter is asking to stop being marketed to; revoking, say, a photo
 * release or a research consent off the back of that click would be the system
 * inventing a decision nobody made.
 */
export async function withdrawAllConsents(
  contactId: string,
  note?: string,
): Promise<{ ok: boolean; changed: string[] }> {
  return setConsents({
    contactId,
    email: false,
    sms: false,
    profiling: false,
    source: "wypis",
    note,
  });
}

// ── consent definitions ─────────────────────────────────────────────────────
//
// The clinic decides which consents exist. Three are built in because they are
// wired into the send path (e-mail, SMS) or into how data may be used
// (profiling); everything beyond them is a record the clinic keeps — a photo
// release, a research consent, permission to phone. Those do not gate anything,
// and the editor says so, because a switch that silently blocks nothing while
// looking like the two that do is worse than no switch at all.

/** The three keys whose answers live in `contacts` columns, not `contact_consents`. */
const BUILTIN_KEYS: ConsentChannel[] = ["email", "sms", "profiling"];

export function isBuiltinConsent(key: string): key is ConsentChannel {
  return (BUILTIN_KEYS as string[]).includes(key);
}

export interface ConsentDef {
  key: string;
  label: string;
  note: string;
  title: string;
  body: string;
  /** "email" | "sms" | "" — only the built-ins gate a send. */
  gates: string;
  builtin: boolean;
  active: boolean;
  sortOrder: number;
}

function toDef(row: ConsentDefRow): ConsentDef {
  return {
    key: row.key,
    label: row.label,
    note: row.note,
    title: row.title,
    body: row.body,
    gates: row.gates,
    builtin: row.builtin === 1,
    active: row.active === 1,
    sortOrder: row.sortOrder,
  };
}

/**
 * Zgody zbierane przez **system rezerwacji**.
 *
 * **Nie są wbudowane** — placówka ma móc poprawić ich treść albo je wyłączyć,
 * bo to jej oświadczenia prawne, nie mechanizm systemu. Wbudowane zostają tylko
 * te trzy, które **bramkują wysyłkę**.
 *
 * **Zasiewane raz.** Skasowanie którejś ma zostać skasowaniem, a nie zniknięciem
 * do najbliższego wejścia na ekran zgód — stąd znacznik w ustawieniach zamiast
 * dosiewania przy każdym odczycie (tak jak przy wbudowanych).
 */
const BOOKING_CONSENT_DEFS = localized(() => [
  {
    key: "erej_regulamin",
    label: tr("Regulamin i polityka prywatności"),
    note: tr("Zaakceptowane przy rezerwacji w systemie rezerwacji."),
    title: tr("Akceptacja regulaminu i polityki prywatności"),
    body: tr("Znam i akceptuję Politykę Prywatności oraz Regulamin."),
    gates: "",
    sortOrder: 10,
  },
  {
    key: "erej_marketing",
    label: tr("Komunikacja marketingowa (system rezerwacji)"),
    note: tr(
      "Treść zgody podpisanej przez pacjenta w systemie rezerwacji. Wysyłkę bramkują zgody na wiadomości e-mail i SMS.",
    ),
    title: tr("Zgoda na komunikację marketingową"),
    body: tr(
      "Wyrażam zgodę na komunikację marketingową drogą elektroniczną (m.in. informacja o nowych specjalistach, newslettery z poradami kosmetologicznymi).",
    ),
    gates: "",
    sortOrder: 11,
  },
]);

/** Nazwy, które zmieniliśmy — podmieniane tylko wtedy, gdy nikt ich nie ruszał. */
const ZMIANY_NAZW: { key: string; stara: string; nowa: string }[] = [
  { key: "email", stara: "Marketing e-mail", nowa: "Wiadomość e-mail" },
  { key: "sms", stara: "Marketing SMS", nowa: "Wiadomość SMS" },
];

const KLUCZ_ZASIEWU = "consent_booking_seeded";
/** Dawna nazwa znacznika — instalacja, która ją ma, zasiew już przeszła. */
const KLUCZ_ZASIEWU_DAWNY = "consent_erejestracja_seeded";

/**
 * Jednorazowe porządki w definicjach zgód: zmiana nazw dwóch wbudowanych
 * i dodanie zgód z systemu rezerwacji.
 *
 * **Nazwę podmieniamy wyłącznie, gdy jest dokładnie taka, jak nasza poprzednia
 * domyślna.** Placówka mogła ją już poprawić po swojemu i nadpisanie cudzej
 * zmiany byłoby gorsze niż zostawienie starej nazwy.
 */
async function ensureConsentUpdates(): Promise<void> {
  const db = getDb();
  const now = Date.now();

  for (const z of ZMIANY_NAZW) {
    await db
      .update(consentDefs)
      .set({ label: z.nowa, updatedAt: now })
      .where(and(eq(consentDefs.key, z.key), eq(consentDefs.label, z.stara)));
  }

  const znacznik = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, [KLUCZ_ZASIEWU, KLUCZ_ZASIEWU_DAWNY]))
    .get();
  if (znacznik) return;

  const istniejace = new Set(
    (await db.select({ key: consentDefs.key }).from(consentDefs)).map((r) => r.key),
  );
  for (const d of BOOKING_CONSENT_DEFS) {
    if (istniejace.has(d.key)) continue;
    await db
      .insert(consentDefs)
      .values({ ...d, builtin: 0, active: 1, createdAt: now, updatedAt: now });
  }
  await db.insert(appSettings).values({ key: KLUCZ_ZASIEWU, value: String(now) });
}

/**
 * Re-inserts a built-in definition if it is missing. The three built-ins gate
 * real sends, so a base without their rows would hide switches that still
 * decide whether mail goes out.
 */
const BUILTINS = localized(() => [
  {
    key: "email",
    label: tr("Wiadomość e-mail"),
    note: tr("Bez niej kampanie e-mail pomijają ten kontakt."),
    title: tr("Zgoda na marketing e-mail"),
    body: tr(
      "Wyrażam zgodę na otrzymywanie informacji handlowych i marketingowych na podany adres e-mail. Zgodę mogę wycofać w każdej chwili, klikając link wypisania w dowolnej wiadomości.",
    ),
    gates: "email",
    sortOrder: 0,
  },
  {
    key: "sms",
    label: tr("Wiadomość SMS"),
    note: tr("Bez niej kampanie SMS pomijają ten kontakt."),
    title: tr("Zgoda na marketing SMS"),
    body: tr(
      "Wyrażam zgodę na otrzymywanie informacji handlowych i marketingowych w formie wiadomości SMS na podany numer telefonu. Zgodę mogę wycofać w każdej chwili.",
    ),
    gates: "sms",
    sortOrder: 1,
  },
  {
    key: "profiling",
    label: tr("Profilowanie"),
    note: tr("Nie blokuje wysyłki — zgoda na dobieranie treści pod pacjenta."),
    title: tr("Zgoda na profilowanie i personalizację"),
    body: tr(
      "Wyrażam zgodę na przetwarzanie moich danych w celu dopasowania treści i ofert do moich potrzeb (profilowanie). Nie wpływa to na możliwość korzystania z usług placówki.",
    ),
    gates: "",
    sortOrder: 2,
  },
]);

/**
 * Re-inserts a built-in definition if it is missing. The three built-ins gate
 * real sends, so a base without their rows would hide switches that still
 * decide whether mail goes out.
 */
async function ensureBuiltinDefs(): Promise<void> {
  const db = getDb();
  const rows = await db.select({ key: consentDefs.key }).from(consentDefs);
  const known = new Set(rows.map((r) => r.key));
  const missing = BUILTINS.filter((b) => !known.has(b.key));
  if (missing.length === 0) return;
  const now = Date.now();
  for (const b of missing) {
    await db
      .insert(consentDefs)
      .values({ ...b, builtin: 1, active: 1, createdAt: now, updatedAt: now });
  }
}

export async function listConsentDefs(includeInactive = false): Promise<ConsentDef[]> {
  await ensureBuiltinDefs();
  await ensureConsentUpdates();
  const rows = await getDb()
    .select()
    .from(consentDefs)
    .orderBy(asc(consentDefs.sortOrder), asc(consentDefs.key));
  const defs = rows.map(toDef);
  return includeInactive ? defs : defs.filter((d) => d.active);
}

function consentKeyFrom(label: string): string {
  const map: Record<string, string> = {
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
  const slug = label
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => map[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `consent_${slug || "wlasna"}`;
}

/**
 * Adds a consent of the clinic's own.
 *
 * `gates` is deliberately not an input: nothing in the app can enforce a
 * consent it has no send path for, and offering the choice would promise
 * enforcement that never happens.
 */
export async function createConsentDef(input: {
  label: string;
  note: string;
  title: string;
  body: string;
}): Promise<{ ok: boolean; key?: string; error?: string }> {
  const label = input.label.trim();
  if (!label) return { ok: false, error: tr("Podaj nazwę zgody.") };
  if (!input.body.trim()) return { ok: false, error: tr("Treść zgody nie może być pusta.") };

  const db = getDb();
  const existing = await db.select({ key: consentDefs.key }).from(consentDefs);
  const taken = new Set(existing.map((r) => r.key));
  let key = consentKeyFrom(label);
  let n = 2;
  while (taken.has(key)) key = `${consentKeyFrom(label)}_${n++}`;

  const now = Date.now();
  await db.insert(consentDefs).values({
    key,
    label,
    note: input.note.trim(),
    title: input.title.trim() || label,
    body: input.body.trim(),
    gates: "",
    builtin: 0,
    active: 1,
    sortOrder: existing.length,
    createdAt: now,
    updatedAt: now,
  });
  return { ok: true, key };
}

export async function saveConsentDef(input: {
  key: string;
  label: string;
  note: string;
  title: string;
  body: string;
  active?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const row = await db.select().from(consentDefs).where(eq(consentDefs.key, input.key)).get();
  if (!row) return { ok: false, error: tr("Zgoda nie istnieje.") };
  if (!input.label.trim() || !input.body.trim()) {
    return { ok: false, error: tr("Nazwa i treść zgody nie mogą być puste.") };
  }

  await db
    .update(consentDefs)
    .set({
      label: input.label.trim(),
      note: input.note.trim(),
      title: input.title.trim() || input.label.trim(),
      body: input.body.trim(),
      // A built-in cannot be switched off: it gates sends, and hiding it would
      // not stop it deciding anything.
      active: row.builtin === 1 ? 1 : input.active === false ? 0 : 1,
      updatedAt: Date.now(),
    })
    .where(eq(consentDefs.key, input.key));
  return { ok: true };
}

/**
 * Deletes a consent the clinic added, along with every answer given to it.
 *
 * Keeping the answers would leave a record of what patients agreed to with no
 * statement saying what that was — worse than not keeping it. Retiring the
 * consent (`active = false`) is the other option, offered in the UI.
 */
export async function deleteConsentDef(key: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const row = await db.select().from(consentDefs).where(eq(consentDefs.key, key)).get();
  if (!row) return { ok: false, error: tr("Zgoda nie istnieje.") };
  if (row.builtin === 1) {
    return { ok: false, error: tr("Zgody wbudowanej nie da się usunąć — steruje wysyłką.") };
  }
  await db.delete(contactConsents).where(eq(contactConsents.consentKey, key));
  await db.delete(consentDefs).where(eq(consentDefs.key, key));
  return { ok: true };
}

// ── per-contact answers to the added consents ───────────────────────────────

/** Answers to non-built-in consents for one contact, keyed by consent key. */
export async function getContactConsents(contactId: string): Promise<Record<string, boolean>> {
  const rows = await getDb()
    .select()
    .from(contactConsents)
    .where(eq(contactConsents.contactId, contactId));
  return Object.fromEntries(rows.map((r) => [r.consentKey, r.granted === 1]));
}

/**
 * Records answers to the added consents. Same contract as `setConsents` for the
 * built-ins: only real changes are written, each one lands on the patient's
 * timeline and emits `contact.field_changed`, so an automation can react to a
 * consent being given or taken back.
 */
export async function setContactConsents(input: {
  contactId: string;
  values: Record<string, boolean>;
  source: string;
}): Promise<{ ok: boolean; changed: string[] }> {
  const keys = Object.keys(input.values);
  if (keys.length === 0) return { ok: true, changed: [] };

  const db = getDb();
  const defs = await listConsentDefs(true);
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const current = await db
    .select()
    .from(contactConsents)
    .where(
      and(
        eq(contactConsents.contactId, input.contactId),
        inArray(contactConsents.consentKey, keys),
      ),
    );
  const before = new Map(current.map((r) => [r.consentKey, r.granted === 1]));

  const changed: string[] = [];
  const now = Date.now();
  for (const key of keys) {
    const def = byKey.get(key);
    // Built-ins live in the contacts columns; writing them here would create a
    // second copy of the answer, and a copy nothing syncs becomes a lie.
    if (!def || def.builtin) continue;
    const next = input.values[key];
    if (before.has(key) && before.get(key) === next) continue;

    if (before.has(key)) {
      await db
        .update(contactConsents)
        .set({ granted: next ? 1 : 0, source: input.source, updatedAt: now })
        .where(
          and(eq(contactConsents.contactId, input.contactId), eq(contactConsents.consentKey, key)),
        );
    } else {
      // First answer for this contact. It is recorded either way — "declined"
      // and "never asked" are different facts — but only a "yes" counts as a
      // change worth announcing: nobody had this consent a moment ago.
      await db.insert(contactConsents).values({
        contactId: input.contactId,
        consentKey: key,
        granted: next ? 1 : 0,
        source: input.source,
        updatedAt: now,
      });
      if (!next) continue;
    }
    changed.push(key);
  }

  if (changed.length === 0) return { ok: true, changed: [] };

  await logStep({
    contactId: input.contactId,
    kind: "action",
    message: tr("Zmiana zgód ({source}) — {v1}.", {
      source: input.source,
      v1: changed
        .map((k) => `${byKey.get(k)?.label ?? k}: ${input.values[k] ? "udzielona" : "wycofana"}`)
        .join(", "),
    }),
    detail: { action: "consent_change", source: input.source },
  });

  for (const key of changed) {
    await emitEvent({
      type: "contact.field_changed",
      contactId: input.contactId,
      payload: {
        field: key,
        value: input.values[key] ? "1" : "0",
        previous: before.get(key) ? "1" : "0",
      },
    });
  }

  return { ok: true, changed };
}

// ── statistics ──────────────────────────────────────────────────────────────

export interface ConsentStat {
  key: string;
  label: string;
  granted: number;
  total: number;
  /** Contacts reachable on this channel at all — no address/number means no send. */
  reachable: number;
  /** Whether `reachable` means anything for this consent — only sending channels have reach. */
  gates: boolean;
  builtin: boolean;
}

/**
 * How many contacts consent, per consent — built-ins read from the contact
 * columns, added ones from `contact_consents`.
 *
 * `reachable` is separate on purpose: a consent on a contact with no phone
 * number is not a patient you can text, and a percentage that ignores that
 * overstates your audience. For a consent that gates nothing there is nothing
 * to reach, so it repeats `granted` and the UI omits the line.
 */
export async function consentStats(): Promise<{ stats: ConsentStat[]; withdrawn: number }> {
  const db = getDb();
  const rows = await db.select().from(contacts);
  const defs = await listConsentDefs();
  const total = rows.length;

  const custom = defs.filter((d) => !d.builtin);
  const answers = custom.length
    ? await db
        .select()
        .from(contactConsents)
        .where(
          inArray(
            contactConsents.consentKey,
            custom.map((d) => d.key),
          ),
        )
    : [];

  const stats: ConsentStat[] = defs.map((def) => {
    if (def.builtin) {
      const granted = rows.filter((c) => hasConsent(c, def.key as ConsentChannel)).length;
      const reachable =
        def.gates === "email"
          ? rows.filter((c) => c.consentEmail === 1 && c.email.trim()).length
          : def.gates === "sms"
            ? rows.filter((c) => c.consentSms === 1 && c.phone.trim()).length
            : granted;
      return {
        key: def.key,
        label: def.label,
        granted,
        total,
        reachable,
        gates: !!def.gates,
        builtin: true,
      };
    }
    const granted = answers.filter((a) => a.consentKey === def.key && a.granted === 1).length;
    return {
      key: def.key,
      label: def.label,
      granted,
      total,
      reachable: granted,
      gates: false,
      builtin: false,
    };
  });

  return {
    stats,
    withdrawn: rows.filter((c) => c.consentSource === "wypis" || hasDnc(c)).length,
  };
}
