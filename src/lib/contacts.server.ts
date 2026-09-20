import { warsawToday } from "./visits/warsaw-time";
import { eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "./db/client.server";
import {
  automationRuns,
  contactConsents,
  contactDocuments,
  contactFunnelProgress,
  contactNotes,
  contactVisits,
  engineEvents,
  engineLog,
  inboxMessages,
  inboxThreads,
  popupQueue,
  smsSends,
  contacts,
  type ContactStatus,
} from "./db/schema";
import { deleteDocument } from "./documents/documents.server";
import { seedContacts, type Contact } from "./contacts";
import { emitEvent } from "./engine/events.server";
import { addNote } from "./notes/notes.server";
import { applySegmentChange, applyTagChange, emitFieldChanged } from "./engine/actions.server";
import { setConsents, setContactConsents } from "./consent/consent.server";
import { shouldSeedDemoData } from "./db/demo-seed.server";
import { listCustomFields } from "./fields/contact-fields.server";
import { findMatchingContact } from "./contacts-match.server";
import { t as tr } from "@/lib/i18n";

/**
 * Plain (non-RPC) contact operations, called straight from server-only code:
 * the public collector routes and the MCP tools.
 *
 * These deliberately do NOT live in contacts.functions.ts. That file is a
 * normal shared module — TanStack Start strips `createServerFn` handler bodies
 * from the client bundle, but a plain exported function survives, and with it
 * every module it imports. Because these touch `events.server.ts` (which pulls
 * `node:crypto`), keeping them there dragged node:crypto into the browser and
 * broke every page that imports contact helpers. Same rule as
 * notes.server.ts and lead-webhook.server.ts: server-only code goes in a
 * `.server.ts`, and `*.functions.ts` only ever wraps it.
 */

/**
 * Seeds the demo contacts on first touch. Safe to call repeatedly.
 *
 * Skipped on a production instance — fictional patients in a real base are not
 * a convenience, they are eight people the clinic never treated sitting in
 * every count and every campaign audience. See demo-seed.server.ts.
 */
export async function ensureSeeded() {
  if (!shouldSeedDemoData()) return;
  const db = getDb();
  const existing = await db.select().from(contacts).limit(1);
  if (existing.length > 0) return;
  for (const c of seedContacts) {
    await db.insert(contacts).values(c);
  }
}

/** "By id or PRM ID" lookup for the MCP tools, without pulling the whole table. */
export async function findContactByIdOrPrmId(idOrPrmId: string): Promise<Contact | null> {
  await ensureSeeded();
  const db = getDb();
  const row = await db
    .select()
    .from(contacts)
    .where(or(eq(contacts.id, idOrPrmId), eq(contacts.prmId, idOrPrmId)))
    .get();
  return row ?? null;
}

/**
 * Announces a new contact to the engine. Tags arriving with the contact are
 * emitted too — otherwise a tag_added trigger would never see them.
 *
 * The payload is filled in from the row that was just written, because the six
 * callers pass wildly different things: the booking collector sends source,
 * medium and campaign, while a manual add sends `{ source: "manual" }` and an
 * import sends `{ source: "import" }`. A trigger filtering on campaign cannot
 * depend on which door the contact came through, so the row — the one thing
 * that is always complete — decides.
 */
export async function announceNewContact(
  contactId: string,
  payload: Record<string, string>,
  tags: string[] = [],
): Promise<void> {
  const row = await getDb()
    .select({
      source: contacts.source,
      medium: contacts.medium,
      campaign: contacts.campaign,
      status: contacts.status,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .get();
  // Kolumny biją to, co przekazał wywołujący: ręczne dodanie melduje
  // `source: "manual"`, a w bazie stoi to, co człowiek naprawdę wpisał.
  // Cokolwiek wywołujący dołożył ponad te cztery pola, zostaje nietknięte.
  await emitEvent({ type: "contact.created", contactId, payload: { ...payload, ...row } });
  for (const tag of tags) {
    await emitEvent({ type: "contact.tag_added", contactId, payload: { tag } });
  }
}

export interface LeadInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
  medium: string;
  campaign: string;
  /** Defaults to ["meta-lead"] for the Zapier/Meta path; popup forms pass their own tag. */
  tags?: string[];

  // ── pola opcjonalne, dosyłane przez webhook ──────────────────────────────
  //
  // Wszystkie są `undefined`-owalne i **tylko wtedy** biorą górę nad
  // domyślnymi. Dzięki temu integracje sprzed ich dodania (Zapy z Meta,
  // formularze pop-up) działają dokładnie jak dotąd — nie musiały wiedzieć
  // o polach, których jeszcze nie było.

  /**
   * Zgody **zadeklarowane przez nadawcę**.
   *
   * `undefined` = nadawca nic nie powiedział → zostaje domyślne założenie
   * opisane niżej. Podana wartość (także `false`) jest oświadczeniem
   * i wygrywa — formularz z odznaczonym checkboxem musi dać brak zgody,
   * a nie zgodę „bo lead".
   */
  consentEmail?: boolean;
  consentSms?: boolean;
  consentProfiling?: boolean;
  /** Podstawa zgody — co konkretnie pacjent zaznaczył i gdzie. Trafia na oś czasu. */
  consentSource?: string;
  /** Status kontaktu; bez niego lead zostaje leadem. */
  status?: ContactStatus;
  segments?: string[];
  /** Pola własne placówki, kluczowane `contact_field_defs.key`. */
  customFields?: Record<string, string>;
}

/**
 * Upsert-by-email for inbound ad leads (Zapier → /api/webhooks/leads) and
 * popup forms. Skips creating a duplicate if a contact with this email already
 * exists (a Zap can retry the same lead more than once).
 */
export async function createContactFromLead(
  lead: LeadInput,
): Promise<{ created: boolean; contactId: string }> {
  await ensureSeeded();
  const db = getDb();
  const email = lead.email.trim().toLowerCase();
  // One shared rule for "is this the same patient?", used by every collector —
  // see contacts-match.server.ts. It replaced an exact string comparison that
  // let "Jan@example.com" and "jan@example.com" become two people.
  const match = await findMatchingContact({
    firstName: lead.firstName,
    lastName: lead.lastName,
    email,
    phone: lead.phone,
  });
  if (match) {
    const existing = match.contact;

    // **Zgoda z ponownego zgłoszenia jest nową deklaracją, nie duplikatem.**
    // Dotąd trafienie w istniejący kontakt kończyło pracę i wszystko z payloadu
    // przepadało — pacjent zaznaczał checkbox drugi raz, a na karcie nic się nie
    // zmieniało. Zapisujemy przez `setConsents`, więc zmiana dostaje znacznik
    // czasu, podstawę i wpis na osi, a automatyzacja swoje zdarzenie.
    if (
      lead.consentEmail !== undefined ||
      lead.consentSms !== undefined ||
      lead.consentProfiling !== undefined
    ) {
      await setConsents({
        contactId: existing.id,
        // Brak pola w payloadzie = brak deklaracji o TYM kanale → zostaje stan
        // z bazy. Formularz pytający tylko o e-mail nie może kasować zgody SMS.
        email: lead.consentEmail ?? existing.consentEmail === 1,
        sms: lead.consentSms ?? existing.consentSms === 1,
        profiling: lead.consentProfiling ?? existing.consentProfiling === 1,
        source: lead.consentSource || lead.source || "formularz",
        note: tr("Ponowne zgłoszenie z formularza."),
      });
    }

    // Pola własne i segmenty: **tylko uzupełniamy puste**. Formularz z jednym
    // pytaniem o miasto nie ma prawa nadpisać danych, które recepcja poprawiła
    // ręcznie — ta sama zasada, co przy rezerwacji wizyty.
    const patch: Record<string, unknown> = {};
    if (lead.customFields && Object.keys(lead.customFields).length > 0) {
      const current = (existing.customFields ?? {}) as Record<string, string>;
      const merged = { ...current };
      let changed = false;
      for (const [key, value] of Object.entries(lead.customFields)) {
        if (value && !current[key]) {
          merged[key] = value;
          changed = true;
        }
      }
      if (changed) patch.customFields = merged;
    }
    if (lead.segments && lead.segments.length > 0) {
      const merged = [...new Set([...existing.segments, ...lead.segments])];
      if (merged.length !== existing.segments.length) patch.segments = merged;
    }
    if (lead.tags && lead.tags.length > 0) {
      const merged = [...new Set([...existing.tags, ...lead.tags])];
      if (merged.length !== existing.tags.length) patch.tags = merged;
    }
    if (Object.keys(patch).length > 0) {
      await db.update(contacts).set(patch).where(eq(contacts.id, existing.id));
    }

    return { created: false, contactId: existing.id };
  }

  /**
   * **Bez domyślnego taga.** Wcześniej lead bez tagów dostawał „meta-lead",
   * bo ten adres obsługiwał wyłącznie Zapiera od Mety. Dziś wchodzi tędy także
   * system rezerwacji, a przyklejanie jego leadom taga o reklamie opisywało je
   * nieprawdą — i to nieprawdą, na której buduje się segmenty.
   *
   * Kto chce tag, przysyła go w polu `tags`. Integracja z Meta (`meta/leads`)
   * ustawia go u siebie jawnie, więc segmenty zbudowane na „meta-lead"
   * działają dalej.
   */
  const tags = lead.tags ?? [];
  const id = `lead-${Date.now()}`;
  await db.insert(contacts).values({
    id,
    prmId: `PRM-${String(90000 + Math.floor(Math.random() * 9999)).slice(-5)}`,
    firstName: lead.firstName,
    lastName: lead.lastName,
    // Stored normalised, so the next lead matches on the first comparison
    // rather than relying on the case-insensitive lookup above.
    email,
    phone: lead.phone,
    pesel: "",
    tags,
    source: lead.source,
    medium: lead.medium,
    campaign: lead.campaign,
    createdAt: warsawToday(),
    /**
     * **Pusty, gdy nadawca go nie podał.**
     * Wcześniej każdy lead wychodził jako „Lead", także wtedy, gdy nadawca
     * wiedział lepiej i miał przysłać własny status.
     *
     * Kosztem jest to, że kontakt bez statusu **nie trafi do żadnego segmentu
     * filtrującego po statusie** — na liście widać wtedy kreskę. To świadomy
     * wybór: puste pole widać, cichy „Lead" zamiast „Pacjent" był realnym
     * błędem przy imporcie.
     */
    status: lead.status ?? "",
    // Domyślnie: lead z formularza reklamowego albo pop-upu wypełnił go sam —
    // ten akt JEST zgodą, więc marketing e-mail i SMS startują udzielone.
    // Profilowanie nie: nikt o nie nie pytał.
    //
    // **Ale deklaracja nadawcy bije to założenie.** Formularz z realnymi
    // checkboxami przysyła `consentEmail: false`, gdy pacjent go nie zaznaczył —
    // i wtedy zgody nie ma. Założenie jest wyjściem awaryjnym dla integracji,
    // które o zgodach nie mówią nic, nie regułą nadrzędną.
    consentEmail: (lead.consentEmail ?? true) ? 1 : 0,
    consentSms: (lead.consentSms ?? true) ? 1 : 0,
    consentProfiling: lead.consentProfiling ? 1 : 0,
    consentSource: lead.consentSource || lead.source || "formularz",
    consentUpdatedAt: Date.now(),
    segments: lead.segments ?? [],
    customFields: lead.customFields ?? {},
  });

  await announceNewContact(
    id,
    { source: lead.source, medium: lead.medium, campaign: lead.campaign },
    tags,
  );

  /**
   * Ślad na osi czasu — **zawsze**, nie tylko gdy nadawca nazwał aktywność.
   *
   * Pusta zakładka „Aktywności" u świeżo utworzonego kontaktu wygląda jak
   * awaria: człowiek widzi, że kontakt powstał, i nie widzi po czym. Jedna linia
   * odpowiada na pytanie „skąd on się tu wziął".
   */
  await addNote({
    contactId: id,
    text: [
      tr("Kontakt utworzony z leada"),
      lead.source ? tr("Źródło: {source}", { source: lead.source }) : "",
      lead.medium ? `Medium: ${lead.medium}` : "",
      lead.campaign ? `Kampania: ${lead.campaign}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    source: "form",
  });

  return { created: true, contactId: id };
}

// ── editing an existing contact ─────────────────────────────────────────────

export interface ContactUpdateInput {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  pesel: string;
  status: ContactStatus;
  source: string;
  medium: string;
  campaign: string;
  tags: string[];
  segments: string[];
  consentEmail: boolean;
  consentSms: boolean;
  consentProfiling: boolean;
  /** Answers to consents the clinic added — see consent.server.ts. */
  extraConsents: Record<string, boolean>;
  /** Values of user-defined fields, keyed by `contact_field_defs.key`. */
  customFields: Record<string, string>;
}

/** Scalar columns the contact form may write. `prmId` and `createdAt` are identity, not data. */
const EDITABLE_SCALARS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "pesel",
  "status",
  "source",
  "medium",
  "campaign",
] as const;

/**
 * Which user-defined fields really changed.
 *
 * Only keys that still have a definition are considered: a form posting a value
 * for a field somebody deleted meanwhile must not resurrect it in the JSON blob.
 */
async function diffCustomFields(
  current: Record<string, string>,
  incoming: Record<string, string>,
): Promise<{ field: string; value: string; previous: string }[]> {
  const known = await listCustomFields();
  const edits: { field: string; value: string; previous: string }[] = [];
  for (const def of known) {
    if (!(def.key in incoming)) continue;
    const previous = String(current[def.key] ?? "");
    const value = String(incoming[def.key] ?? "").trim();
    if (value !== previous) edits.push({ field: def.key, value, previous });
  }
  return edits;
}

/**
 * Saves an edited contact and announces what actually changed.
 *
 * The events matter as much as the write: a receptionist fixing a phone number
 * or adding a tag by hand has to reach the automation engine exactly like the
 * same change made by a node would, otherwise "Dodanie tagu" would only ever
 * fire for tags the system set itself. Tags and segments therefore go through
 * the very same `applyTagChange` / `applySegmentChange` helpers the engine uses.
 *
 * Returns the fields that genuinely changed — re-saving an untouched form
 * writes nothing and emits nothing.
 */
export async function updateContact(
  input: ContactUpdateInput,
): Promise<{ ok: boolean; changed: string[]; error?: string; promoted?: boolean }> {
  const db = getDb();
  const current = await db.select().from(contacts).where(eq(contacts.id, input.id)).get();
  if (!current) return { ok: false, changed: [], error: tr("Kontakt nie istnieje.") };

  const email = input.email.trim();
  const phone = input.phone.trim();
  // Adres jest opcjonalny — pacjent z rejestracji telefonicznej go nie ma.
  // Wymagana jest JEDNA droga kontaktu, tak samo jak przy dodawaniu i imporcie.
  if (!email && !phone) {
    return {
      ok: false,
      changed: [],
      error: tr(
        "Podaj e-mail albo numer telefonu — bez żadnego z nich nie ma jak się skontaktować.",
      ),
    };
  }
  if (email && !email.includes("@")) {
    return { ok: false, changed: [], error: tr("Podaj poprawny adres e-mail.") };
  }

  // The address is how sends, opens and inbound replies are tied back to a
  // person, so a duplicate would quietly split one patient's history in two.
  // Pusty adres nie jest duplikatem pustego adresu — inaczej drugi kontakt bez
  // e-maila nie dałby się zapisać.
  if (email) {
    const clash = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(sql`lower(trim(${contacts.email})) = ${email.toLowerCase()}`)
      .get();
    if (clash && clash.id !== input.id) {
      return {
        ok: false,
        changed: [],
        error: tr("Adres {email} należy już do innego kontaktu.", { email: email }),
      };
    }
  }

  const next: Record<string, string> = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email,
    phone: input.phone.trim(),
    pesel: input.pesel.trim(),
    status: input.status,
    source: input.source.trim(),
    medium: input.medium.trim(),
    campaign: input.campaign.trim(),
  };

  // The previous value is captured while diffing, not looked up afterwards —
  // by the time the events are emitted the row has already been overwritten.
  const edits: { field: string; value: string; previous: string }[] = [];
  const patch: Record<string, string> = {};
  for (const key of EDITABLE_SCALARS) {
    const before = String(current[key] ?? "");
    if (next[key] !== before) {
      patch[key] = next[key];
      edits.push({ field: key, value: next[key], previous: before });
    }
  }
  const changed: string[] = edits.map((e) => e.field);

  if (edits.length > 0) {
    await db.update(contacts).set(patch).where(eq(contacts.id, input.id));
    for (const edit of edits) {
      await emitFieldChanged(input.id, edit.field, edit.value, edit.previous);
    }
  }

  // User-defined fields live in one JSON column, so they are diffed key by key
  // rather than compared as a blob — otherwise a single edited field would
  // announce every custom field as changed. Each one emits the same
  // `contact.field_changed` a real column does, so automations can watch them.
  const customEdits = await diffCustomFields(current.customFields ?? {}, input.customFields);
  if (customEdits.length > 0) {
    const nextCustom = { ...(current.customFields ?? {}) };
    for (const edit of customEdits) {
      if (edit.value === "") delete nextCustom[edit.field];
      else nextCustom[edit.field] = edit.value;
    }
    await db.update(contacts).set({ customFields: nextCustom }).where(eq(contacts.id, input.id));
    for (const edit of customEdits) {
      await emitFieldChanged(input.id, edit.field, edit.value, edit.previous);
      changed.push(edit.field);
    }
  }

  // Consents go through their own helper: it records the source, stamps the
  // time and emits the change, which a bare column write would not.
  const consentResult = await setConsents({
    contactId: input.id,
    email: input.consentEmail,
    sms: input.consentSms,
    profiling: input.consentProfiling,
    source: "ręcznie",
  });
  changed.push(...consentResult.changed);

  const extraConsentResult = await setContactConsents({
    contactId: input.id,
    values: input.extraConsents,
    source: "ręcznie",
  });
  changed.push(...extraConsentResult.changed);

  // Re-read once: the tag/segment helpers take a row and mutate it in place, so
  // they must start from the state left by the scalar update above.
  const afterScalars = await db.select().from(contacts).where(eq(contacts.id, input.id)).get();
  if (!afterScalars) return { ok: true, changed };

  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const cleanTags = input.tags.map((t) => t.trim()).filter(Boolean);
  const cleanSegments = input.segments.map((s) => s.trim()).filter(Boolean);

  for (const tag of cleanTags) {
    if (!(afterScalars.tags ?? []).some((t) => same(t, tag))) {
      await applyTagChange(afterScalars, tag, "add");
      changed.push("tags");
    }
  }
  for (const tag of [...(afterScalars.tags ?? [])]) {
    if (!cleanTags.some((t) => same(t, tag))) {
      await applyTagChange(afterScalars, tag, "remove");
      changed.push("tags");
    }
  }
  for (const segment of cleanSegments) {
    if (!(afterScalars.segments ?? []).some((s) => same(s, segment))) {
      await applySegmentChange(afterScalars, segment, "add");
      changed.push("segments");
    }
  }
  for (const segment of [...(afterScalars.segments ?? [])]) {
    if (!cleanSegments.some((s) => same(s, segment))) {
      await applySegmentChange(afterScalars, segment, "remove");
      changed.push("segments");
    }
  }

  // Kontakt telefoniczny, który dostał imię I nazwisko, przestaje nim być —
  // czyli znika z „Kontaktów telefonicznych” i pojawia się w „Kontaktach”.
  //
  // Warunkiem są OBA pola. Samo imię („pani Anna z rejestracji”) to nadal
  // notatka przy numerze, a nie kartoteka pacjenta; przenoszenie na tej
  // podstawie zaśmiecałoby Kontakty wpisami, których nie da się rozróżnić.
  //
  // Ruch jest jednokierunkowy: skasowanie nazwiska nie odsyła kontaktu z
  // powrotem. Historia zdążyła już do niego przyrosnąć, a cofanie takiego
  // przeniesienia wyglądałoby jak zniknięcie pacjenta z bazy.
  const promoted = current.phoneOnly === 1 && next.firstName.length > 0 && next.lastName.length > 0;
  if (promoted) {
    await db.update(contacts).set({ phoneOnly: 0 }).where(eq(contacts.id, input.id));
    changed.push("phoneOnly");
  }

  return { ok: true, changed: [...new Set(changed)], promoted };
}

/**
 * Usuwa kontakt razem ze wszystkim, co się do niego odnosi.
 *
 * **Kasuje naprawdę, nie oznacza jako usunięty.** Przycisk „Usuń pacjenta" na
 * karcie pacjenta ma znaczyć to, co mówi — a wiersze, które zostałyby po samym
 * skasowaniu `contacts`, to nadal dane osobowe: treści wiadomości, notatki
 * z rozmów, wgrane dokumenty, terminy wizyt. Silnikowa akcja `delete_contact`
 * kasuje wyłącznie wiersz w `contacts`; tutaj tak nie wolno, bo tam usuwa
 * automatyzacja, a tu człowiek realizujący czyjeś żądanie usunięcia danych.
 *
 * **Pliki idą przed wierszami** — ta sama kolejność co w `deleteDocument`:
 * gdyby kasowanie padło w połowie, zostaje ślad w bazie, po którym widać co
 * dokasować. Odwrotna kolejność zostawiłaby na dysku dokumenty pacjenta,
 * o których nikt już nie wie.
 *
 * **Świadomy koszt**: znikają też przebiegi i dziennik silnika tej osoby, więc
 * historyczne KPI potrafią się o tyle zmniejszyć. Alternatywa — zostawić log
 * z `contact_id` wskazującym na nikogo — dawałaby audyt, którego i tak nie da
 * się z nikim powiązać, a przy żądaniu usunięcia danych byłaby zwykłym
 * niedokasowaniem.
 */
export async function deleteContactCompletely(
  id: string,
): Promise<{ ok: boolean; error?: string; name?: string }> {
  const db = getDb();
  const contact = await db.select().from(contacts).where(eq(contacts.id, id)).get();
  if (!contact) return { ok: false, error: tr("Kontakt nie istnieje.") };
  const name = `${contact.firstName} ${contact.lastName}`.trim() || contact.email || contact.prmId;

  // Najpierw dokumenty: to jedyne dane leżące poza bazą.
  const docs = await db
    .select({ id: contactDocuments.id })
    .from(contactDocuments)
    .where(eq(contactDocuments.contactId, id));
  for (const doc of docs) {
    const result = await deleteDocument(doc.id);
    if (!result.ok) {
      return {
        ok: false,
        error: tr("Nie udało się usunąć dokumentu pacjenta — kontakt zostawiony bez zmian. {v0}", {
          v0: result.error ?? "",
        }).trim(),
      };
    }
  }

  // Wiadomości wiszą na wątkach, więc wątki trzeba znać przed ich skasowaniem.
  const threads = await db
    .select({ id: inboxThreads.id })
    .from(inboxThreads)
    .where(eq(inboxThreads.contactId, id));
  if (threads.length > 0) {
    await db.delete(inboxMessages).where(
      inArray(
        inboxMessages.threadId,
        threads.map((t) => t.id),
      ),
    );
  }
  await db.delete(inboxMessages).where(eq(inboxMessages.contactId, id));
  await db.delete(inboxThreads).where(eq(inboxThreads.contactId, id));

  await db.delete(contactNotes).where(eq(contactNotes.contactId, id));
  await db.delete(contactVisits).where(eq(contactVisits.contactId, id));
  await db.delete(contactConsents).where(eq(contactConsents.contactId, id));
  await db.delete(contactFunnelProgress).where(eq(contactFunnelProgress.contactId, id));
  await db.delete(popupQueue).where(eq(popupQueue.contactId, id));
  await db.delete(smsSends).where(eq(smsSends.contactId, id));
  await db.delete(automationRuns).where(eq(automationRuns.contactId, id));
  await db.delete(engineLog).where(eq(engineLog.contactId, id));
  await db.delete(engineEvents).where(eq(engineEvents.contactId, id));

  await db.delete(contacts).where(eq(contacts.id, id));
  return { ok: true, name };
}

// ── lista z paginacją ───────────────────────────────────────────────────────

/**
 * Wyszukiwanie, filtrowanie, sortowanie i stronicowanie — **w SQL-u**.
 *
 * Do tej pory strona pobierała całą tabelę i robiła to wszystko w przeglądarce.
 * Przy dwunastu kontaktach to była najprostsza możliwa implementacja; przy
 * jedenastu tysiącach oznacza kilka megabajtów na każde wejście na listę
 * i zauważalne zacinanie. Sama paginacja by tego nie naprawiła: żeby pokazać
 * stronę pierwszą po filtrze, i tak trzeba wiedzieć, kto filtr przechodzi —
 * więc filtr musi zejść tu razem z nią.
 */
export type ContactSortKey = "name" | "contact" | "source" | "created" | "status";

export interface ContactQuery {
  q: string;
  status: string;
  segments: string[];
  tag: string;
  sortKey: ContactSortKey;
  sortDesc: boolean;
  offset: number;
  limit: number;
  /**
   * Który moduł pyta: `false` — Kontakty, `true` — Kontakty telefoniczne.
   *
   * Obie listy to **ta sama tabela**, rozdzielona kolumną `phone_only`; numer
   * awansuje do zwykłego kontaktu, gdy dojdzie imię i nazwisko. Dzięki temu
   * paginacja, wyszukiwanie i sortowanie są jedną implementacją, a nie dwiema,
   * które z czasem zaczynają się różnić w szczegółach.
   */
  phoneOnly: boolean;
  /**
   * Filtry po polach dodatkowych — klucz definicji (`custom_*`) na wartość.
   *
   * Puste wartości są pomijane, więc „wszystkie" nie wymaga osobnego kodu po
   * stronie widoku.
   */
  custom: Record<string, string>;
}

/**
 * Polskie znaki złożone na łacińskie **w wyrażeniu SQL**.
 *
 * SQLite nie zna `localeCompare("pl")`, a domyślne porównanie jest bajtowe —
 * „Łuczak" lądowałby za „Zając" zamiast między L a M. Lista `replace()` jest
 * brzydka, ale nie wymaga migracji ani dodatkowej kolumny, a przy tej wielkości
 * tabeli koszt pełnego skanu i tak jest nieodczuwalny.
 */
function foldSql(column: string): string {
  // **Obie wielkości liter**, bo `lower()` w SQLite jest ASCII-only: „ŁUCZAK"
  // zostaje po nim „Łuczak", więc zamiana samego małego „ł" nigdy nie trafia
  // i nazwisko ląduje za „Z". Kosztowało to jeden fałszywy alarm — sortowanie
  // wyglądało na działające, dopóki nie sprawdziłem właśnie polskich liter.
  const pairs: [string, string][] = [
    ["ą", "a"],
    ["Ą", "a"],
    ["ć", "c"],
    ["Ć", "c"],
    ["ę", "e"],
    ["Ę", "e"],
    ["ł", "l"],
    ["Ł", "l"],
    ["ń", "n"],
    ["Ń", "n"],
    ["ó", "o"],
    ["Ó", "o"],
    ["ś", "s"],
    ["Ś", "s"],
    ["ź", "z"],
    ["Ź", "z"],
    ["ż", "z"],
    ["Ż", "z"],
  ];
  // Zamiany PRZED `lower()`, żeby złapać wielkie litery, a `lower()` na końcu
  // sprowadza resztę (już czysto ASCII) do jednej wielkości.
  return `lower(${pairs.reduce((acc, [from, to]) => `replace(${acc}, '${from}', '${to}')`, column)})`;
}

/**
 * Ten sam fold, co w SQL-u, tylko po stronie JS — do przygotowania wzorca
 * wyszukiwania. Obie strony porównania muszą być złożone tak samo, inaczej
 * „Łuczak" nie znajduje „Łuczak".
 */
function foldText(value: string): string {
  const map: Record<string, string> = {
    ą: "a",
    Ą: "a",
    ć: "c",
    Ć: "c",
    ę: "e",
    Ę: "e",
    ł: "l",
    Ł: "l",
    ń: "n",
    Ń: "n",
    ó: "o",
    Ó: "o",
    ś: "s",
    Ś: "s",
    ź: "z",
    Ź: "z",
    ż: "z",
    Ż: "z",
  };
  return value.replace(/[ąĄćĆęĘłŁńŃóÓśŚźŹżŻ]/g, (ch) => map[ch] ?? ch).toLowerCase();
}

/** Kolejność statusów taka sama jak na liście — od leada do nieaktywnego. */
const STATUS_ORDER_SQL = `case status when 'lead' then 0 when 'active' then 1 when 'patient' then 2 else 3 end`;

/**
 * Człony sortowania jako **tablica**, nie sklejony string.
 *
 * Kierunek („asc"/„desc") trzeba dokleić do każdego członu osobno, a próba
 * rozbicia sklejonego wyrażenia po przecinku rozwalała `replace(a, b, c)` na
 * trzy kawałki — sortowanie po prostu przestawało działać i lista wychodziła
 * w kolejności wstawiania. Tablica nie ma jak się na tym wyłożyć.
 */
const SORT_SQL: Record<ContactSortKey, string[]> = {
  name: [foldSql("last_name"), foldSql("first_name")],
  contact: [foldSql("email")],
  source: [foldSql("source"), foldSql("campaign")],
  // Data bywa pusta — puste na koniec, tak jak w poprzednim `createdRank`.
  created: [`case when created_at = '' then 1 else 0 end`, "created_at"],
  status: [STATUS_ORDER_SQL],
};

/** Warunki WHERE wspólne dla listy, eksportu i licznika — jedna definicja „co pasuje". */
function whereSql(
  query: Pick<ContactQuery, "q" | "status" | "segments" | "tag" | "phoneOnly" | "custom">,
): SQL {
  // Kontakty telefoniczne mają własny moduł; do zwykłej listy wchodzą dopiero po
  // uzupełnieniu imienia i nazwiska (`phone_only` zeruje się przy awansie).
  const clauses: SQL[] = [sql`phone_only = ${query.phoneOnly ? 1 : 0}`];

  // Wzorzec i kolumny foldowane tak samo — dzięki temu „Łuczak", „łuczak"
  // i „luczak" znajdują tę samą osobę. Bez foldu kolumny nie znajdowały nic,
  // bo `lower()` w SQLite nie rusza polskich liter (patrz `foldSql`).
  const q = foldText(query.q.trim());
  if (q) {
    const like = `%${q}%`;
    // Telefon porównywany bez spacji i myślników, żeby „600 123" znalazło
    // „+48600123456" — ludzie wpisują numer tak, jak go pamiętają.
    clauses.push(
      sql`(${sql.raw(foldSql("first_name"))} like ${like}
        or ${sql.raw(foldSql("last_name"))} like ${like}
        or ${sql.raw(foldSql("email"))} like ${like}
        or ${sql.raw(foldSql("first_name || ' ' || last_name"))} like ${like}
        or replace(replace(replace(phone, ' ', ''), '-', ''), '+', '') like ${like}
        or lower(prm_id) like ${like})`,
    );
  }
  if (query.status && query.status !== "all") {
    clauses.push(sql`status = ${query.status}`);
  }
  // Segment pasuje, gdy kontakt ma KTÓRYKOLWIEK z zaznaczonych — tak działał
  // filtr po stronie klienta i tak czytają go ludzie („pokaż VIP albo Kardio").
  if (query.segments.length > 0) {
    const list = sql.join(
      query.segments.map((s) => sql`${s}`),
      sql`, `,
    );
    clauses.push(
      sql`exists (select 1 from json_each(contacts.segments) where json_each.value in (${list}))`,
    );
  }
  if (query.tag) {
    clauses.push(
      sql`exists (select 1 from json_each(contacts.tags) where json_each.value = ${query.tag})`,
    );
  }
  // Pola dodatkowe leżą w kolumnie JSON, więc filtr idzie przez `json_extract`.
  // Porównanie jest **po foldzie i bez wielkości liter**, tak samo jak
  // wyszukiwarka — inaczej filtr „Łódź" nie znajdowałby „łódź", a użytkownik nie
  // ma jak zobaczyć, w jakiej pisowni wartość została wpisana przy imporcie.
  for (const [key, value] of Object.entries(query.custom)) {
    if (!value) continue;
    clauses.push(
      sql`${sql.raw(foldSql(`json_extract(custom_fields, '$.${key.replace(/[^A-Za-z0-9_]/g, "")}')`))} = ${foldText(value)}`,
    );
  }
  return sql.join(clauses, sql` and `);
}

export interface ContactPage {
  rows: Contact[];
  /** Ile kontaktów pasuje do filtra — do paginacji i do „X z Y". */
  total: number;
  /** Ile jest w ogóle, bez filtra — żeby dało się powiedzieć „234 z 11 512". */
  totalAll: number;
}

export async function listContactsPage(query: ContactQuery): Promise<ContactPage> {
  await ensureSeeded();
  const db = getDb();
  const where = whereSql(query);
  const direction = query.sortDesc ? "desc" : "asc";
  // Kierunek dokleja się do każdego członu sortowania, inaczej „malejąco" po
  // nazwisku zostawiałoby imię rosnąco i kolejność wyglądałaby na przypadkową.
  // `rowid` na końcu daje rozstrzygnięcie remisów, bez którego ten sam wiersz
  // potrafiłby pojawić się na dwóch stronach albo zniknąć między nimi.
  const order = sql.raw(
    [...SORT_SQL[query.sortKey], "rowid"].map((part) => `${part} ${direction}`).join(", "),
  );

  // Builder drizzle, nie surowe `db.all` — inaczej kolumny JSON (`segments`,
  // `tags`, `custom_fields`) wracają jako tekst i karta kontaktu dostaje string
  // tam, gdzie spodziewa się tablicy.
  const rows = await db
    .select()
    .from(contacts)
    .where(where)
    .orderBy(order)
    .limit(query.limit)
    .offset(query.offset);

  const totalRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(contacts)
    .where(where)
    .get();
  const allRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(contacts)
    // Ten sam moduł co filtrowana lista — „234 z 11 512" ma porównywać
    // z rozmiarem tej listy, nie całej tabeli obejmującej też drugi moduł.
    .where(sql`phone_only = ${query.phoneOnly ? 1 : 0}`)
    .get();

  return { rows, total: totalRow?.n ?? 0, totalAll: allRow?.n ?? 0 };
}

/** Wszystkie pasujące wiersze — dla eksportu CSV, który ma obejmować cały filtr, nie stronę. */
export async function listContactsForExport(
  query: Pick<
    ContactQuery,
    "q" | "status" | "segments" | "tag" | "sortKey" | "sortDesc" | "phoneOnly" | "custom"
  >,
): Promise<Contact[]> {
  const page = await listContactsPage({ ...query, offset: 0, limit: 100_000 });
  return page.rows;
}

/**
 * Liczniki tagów i segmentów do popoverów filtrów.
 *
 * Liczone agregatem, nie z pobranej listy — po stronicowaniu strona nie widzi
 * już całej bazy, a licznik „VIP (128)" ma dotyczyć bazy, nie bieżącej strony.
 */
export async function contactFacets(phoneOnly = false): Promise<{
  segments: [string, number][];
  tags: [string, number][];
  statuses: [string, number][];
  /** Wartości występujące w polach dodatkowych — klucz definicji → wartości. */
  custom: Record<string, [string, number][]>;
}> {
  const db = getDb();
  const scope = phoneOnly ? 1 : 0;
  const seg = await db.all<{ value: string; n: number }>(
    sql`select json_each.value as value, count(*) as n from contacts, json_each(contacts.segments)
        where contacts.phone_only = ${scope} group by json_each.value order by n desc`,
  );
  const tag = await db.all<{ value: string; n: number }>(
    sql`select json_each.value as value, count(*) as n from contacts, json_each(contacts.tags)
        where contacts.phone_only = ${scope} group by json_each.value order by n desc`,
  );
  const st = await db.all<{ value: string; n: number }>(
    sql`select status as value, count(*) as n from contacts
        where phone_only = ${scope} and status != '' group by status order by n desc`,
  );

  // Wartości pól dodatkowych. Jedno przejście po `json_each` zamiast zapytania
  // na pole: liczba pól jest zmienna (klinika je dodaje), a zapytanie na każde
  // z nich rosłoby razem z ustawieniami.
  //
  // **Tylko pola wyliczeniowe i tekstowe krótkie mają sens jako filtr** — po
  // dacie czy liczbie filtruje się zakresem, nie listą wartości, a lista
  // z tysiącem pozycji jest nie do użycia. Odsiew jest po stronie widoku, tu
  // zbieramy komplet i ucinamy najdłuższe ogony.
  const cf = await db.all<{ key: string; value: string; n: number }>(
    sql`select json_each.key as key, json_each.value as value, count(*) as n
        from contacts, json_each(contacts.custom_fields)
        where contacts.phone_only = ${scope} and json_each.value != ''
        group by json_each.key, json_each.value
        order by json_each.key, n desc`,
  );
  // **Pisownie scalone.** Filtr porównuje po foldzie i bez wielkości liter, więc
  // „Wrocław" i „wrocław" dają ten sam wynik — pokazane jako dwie pozycje
  // wyglądałyby jak dwa różne filtry robiące to samo. Zostaje **zapis
  // najczęstszy** (przy remisie pierwszy, czyli i tak najliczniejszy w kolejności
  // z SQL-a), a licznik jest sumą. To, co ludzie wpisali przy imporcie, bywa
  // niekonsekwentne i nie jest to powód, żeby lista filtrów była niekonsekwentna.
  const custom: Record<string, [string, number][]> = {};
  const merged = new Map<string, Map<string, { label: string; n: number }>>();
  for (const r of cf ?? []) {
    const byValue = merged.get(r.key) ?? new Map();
    const folded = foldText(String(r.value));
    const hit = byValue.get(folded);
    const value = String(r.value);
    if (hit) {
      hit.n += Number(r.n);
      // Przy tej samej liczbie wystąpień wygrywa pisownia wielką literą:
      // „Wrocław" zamiast „wrocław". Nazwy własne tak się pisze, a lista
      // filtrów jest tym, co widzi człowiek.
      if (/^\p{Lu}/u.test(value) && !/^\p{Lu}/u.test(hit.label)) hit.label = value;
    } else {
      byValue.set(folded, { label: value, n: Number(r.n) });
    }
    merged.set(r.key, byValue);
  }
  for (const [key, byValue] of merged) {
    custom[key] = [...byValue.values()]
      .sort((a, b) => b.n - a.n)
      .map((v) => [v.label, v.n] as [string, number]);
  }

  return {
    segments: (seg ?? []).map((r) => [r.value, Number(r.n)] as [string, number]),
    tags: (tag ?? []).map((r) => [r.value, Number(r.n)] as [string, number]),
    statuses: (st ?? []).map((r) => [r.value, Number(r.n)] as [string, number]),
    custom,
  };
}
