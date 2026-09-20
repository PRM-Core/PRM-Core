import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { logStep } from "../engine/log.server";
import {
  automations,
  campaigns,
  contactVisits,
  contacts,
  contentSnapshots,
  emailEvents,
  emailSends,
  inboxMessages,
  segments,
  trackingPings,
} from "../db/schema";
import type { ContactRow } from "../db/schema";
// Deliberately does NOT import contacts.server: the engine's condition
// evaluator imports this module, and contacts.server imports the evaluator's
// own file (actions.server). Reaching for `ensureSeeded` here would close that
// loop for the sake of demo data that any real base already has.
import {
  emptyDefinition,
  fieldDef,
  VALUELESS_OPERATORS,
  type SegmentCondition,
  type SegmentDefinition,
  type SegmentOperator,
} from "./segment-definition";
import { t as tr } from "@/lib/i18n";
import { effectiveState } from "../booking-system/status";

/**
 * Evaluating a dynamic segment.
 *
 * Membership is computed, never stored. The cost of that decision is a query per
 * evaluation; the benefit is that a segment can never be stale, which for a
 * marketing audience is the difference between "1 248 pacjentów" meaning
 * something and meaning nothing.
 *
 * **How it scales.** Attribute conditions are answered from the contact row
 * itself. Event conditions are answered from one query per event kind, built
 * into a set of contact ids *before* any contact is examined — so a definition
 * with five event conditions costs five queries, not five per contact. At the
 * clinic's size this runs in milliseconds; at a hundred thousand contacts the
 * contact scan is what would need pushing into SQL.
 */

/**
 * Ile żyje segment doraźny — **48 godzin**.
 *
 * Segmenty powstają najczęściej pod jedną wysyłkę i po niej nikt do nich nie
 * wraca. Bez terminu ważności lista rośnie w nieskończoność, a im jest dłuższa,
 * tym trudniej znaleźć ten segment, który naprawdę jest w użyciu — i tym wolniej
 * się ładuje, bo liczność każdego trzeba policzyć.
 *
 * Segment oznaczony jako **stały (cykliczny)** nie wygasa nigdy.
 */
const SEGMENT_TTL_MS = 48 * 60 * 60 * 1000;

export interface SegmentSummary {
  id: string;
  name: string;
  description: string;
  status: "draft" | "live";
  definition: SegmentDefinition;
  updatedAt: number;
  updatedBy: string;
  /** Live count — computed on read, like everything else here. */
  members: number;
  /** Segment stały (cykliczny) — nie wygasa. */
  permanent: boolean;
  /** Kiedy zniknie sam. `null` przy stałym. */
  expiresAt: number | null;
}

export interface SegmentPreview {
  members: number;
  total: number;
  /** A handful of matching contacts, so the numbers can be sanity-checked by eye. */
  sample: SegmentMember[];
  /** Conditions the evaluator could not honour, e.g. an unknown field key. */
  warnings: string[];
}

export interface SegmentMember {
  id: string;
  name: string;
  email: string;
  phone: string;
}

/** Tyle, ile potrzebuje picker: bez liczenia przynależności, więc jest tanie. */
export interface SegmentOption {
  id: string;
  name: string;
  description: string;
  status: "draft" | "live";
  /** Prawda, gdy definicją jest samo „ma tę etykietę” — patrz `labelSegmentDefinition`. */
  fromLabel: boolean;
}

const eqCi = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Contact ids that did something, keyed per event field. Built once per evaluation. */
interface EventIndex {
  [fieldKey: string]: Set<string>;
}

/**
 * Which contacts satisfy each event condition in the definition.
 *
 * Built per condition rather than per event kind because the value (a URL
 * fragment, a service name) and the time window are part of the question —
 * "visited /cennik in the last 30 days" is not answerable from a set of
 * "everybody who ever visited anything".
 */
async function buildEventIndex(conditions: SegmentCondition[]): Promise<EventIndex> {
  const db = getDb();
  const index: EventIndex = {};
  const eventConditions = conditions.filter((c) => fieldDef(c.field)?.kind === "event");
  if (eventConditions.length === 0) return index;

  // The page-visit and e-mail sources are keyed by address, not contact id, so
  // the address→id map is built once and shared.
  const needsEmailJoin = eventConditions.some((c) =>
    ["event:page_visit", "event:email_opened", "event:email_clicked"].includes(c.field),
  );
  const emailToId = new Map<string, string>();
  if (needsEmailJoin) {
    const rows = await db.select({ id: contacts.id, email: contacts.email }).from(contacts);
    for (const r of rows) {
      if (r.email.trim()) emailToId.set(r.email.trim().toLowerCase(), r.id);
    }
  }

  for (const c of eventConditions) {
    const since = c.days && c.days > 0 ? Date.now() - c.days * 86_400_000 : 0;
    const value = c.value.trim().toLowerCase();
    const found = new Set<string>();

    if (c.field === "event:page_visit") {
      // Only pings carrying a contact token can be attributed to a person; the
      // anonymous majority has nobody to belong to. Same rule as the contact
      // timeline, so the two never disagree.
      const rows = await db
        .select({
          url: trackingPings.url,
          token: trackingPings.contactToken,
          at: trackingPings.receivedAt,
        })
        .from(trackingPings)
        .where(since ? gte(trackingPings.receivedAt, since) : undefined);
      const tokens = [...new Set(rows.map((r) => r.token).filter((t): t is string => !!t))];
      const sends = tokens.length
        ? await db
            .select({ token: emailSends.token, toEmail: emailSends.toEmail })
            .from(emailSends)
            .where(inArray(emailSends.token, tokens))
        : [];
      const tokenToEmail = new Map(sends.map((s) => [s.token, s.toEmail.trim().toLowerCase()]));
      for (const r of rows) {
        if (!r.token) continue;
        if (value && !r.url.toLowerCase().includes(value)) continue;
        const id = emailToId.get(tokenToEmail.get(r.token) ?? "");
        if (id) found.add(id);
      }
    } else if (c.field === "event:email_opened" || c.field === "event:email_clicked") {
      const kind = c.field === "event:email_opened" ? "open" : "click";
      const events = await db
        .select({ token: emailEvents.token, at: emailEvents.occurredAt })
        .from(emailEvents)
        .where(
          since
            ? and(eq(emailEvents.kind, kind), gte(emailEvents.occurredAt, since))
            : eq(emailEvents.kind, kind),
        );
      const tokens = [...new Set(events.map((e) => e.token))];
      const sends = tokens.length
        ? await db
            .select({
              token: emailSends.token,
              toEmail: emailSends.toEmail,
              contentItemId: emailSends.contentItemId,
            })
            .from(emailSends)
            .where(inArray(emailSends.token, tokens))
        : [];
      for (const s of sends) {
        // An empty value means "any message". With one selected, the event only
        // counts if that send really carried it — matched on the content item's
        // id, which is what `email_sends` recorded, rather than on the subject
        // line, which anybody can edit per send.
        if (value && (s.contentItemId ?? "").toLowerCase() !== value) continue;
        const id = emailToId.get(s.toEmail.trim().toLowerCase());
        if (id) found.add(id);
      }
    } else if (
      c.field === "event:visit_booked" ||
      c.field === "event:visit_specialization" ||
      c.field === "event:visit_doctor"
    ) {
      const rows = await db
        .select({
          contactId: contactVisits.contactId,
          title: contactVisits.title,
          specialization: contactVisits.specialization,
          doctor: contactVisits.doctor,
          at: contactVisits.createdAt,
        })
        .from(contactVisits)
        .where(since ? gte(contactVisits.createdAt, since) : undefined);
      // Which column the value is matched against is the whole difference
      // between these three conditions.
      const column =
        c.field === "event:visit_specialization"
          ? "specialization"
          : c.field === "event:visit_doctor"
            ? "doctor"
            : "title";
      for (const r of rows) {
        if (
          value &&
          !String(r[column] ?? "")
            .toLowerCase()
            .includes(value)
        )
          continue;
        found.add(r.contactId);
      }
    } else if (c.field === "event:visit_status") {
      // Stan liczony **przy odczycie**, nie brany z zapisanej etykiety: „brak
      // wizyty pacjenta" powstaje 2 h po terminie, więc gotowa etykieta byłaby
      // nieaktualna aż do kolejnej synchronizacji. Surowy kod plus zegar dają
      // odpowiedź zawsze świeżą — ta sama zasada, przez którą przynależność do
      // segmentu w ogóle nie jest materializowana.
      const rows = await db
        .select({
          contactId: contactVisits.contactId,
          systemStatus: contactVisits.systemStatus,
          startsAt: contactVisits.startsAt,
          createdAt: contactVisits.createdAt,
        })
        .from(contactVisits)
        .where(since ? gte(contactVisits.createdAt, since) : undefined);
      const teraz = Date.now();
      for (const r of rows) {
        const effective = effectiveState(r.systemStatus ?? "", r.startsAt, teraz);
        const stan =
          effective === "completed" || effective === "no_show"
            ? effective
            : effective === "booked"
              ? "upcoming"
              : "";
        if (!stan) continue;
        if (value && stan !== value) continue;
        found.add(r.contactId);
      }
    } else if (c.field === "event:message_received") {
      const rows = await db
        .select({
          contactId: inboxMessages.contactId,
          channel: inboxMessages.channel,
          at: inboxMessages.createdAt,
        })
        .from(inboxMessages)
        .where(
          since
            ? and(eq(inboxMessages.direction, "in"), gte(inboxMessages.createdAt, since))
            : eq(inboxMessages.direction, "in"),
        );
      for (const r of rows) {
        if (value && !r.channel.toLowerCase().includes(value)) continue;
        found.add(r.contactId);
      }
    }

    index[c.id] = found;
  }

  return index;
}

/** The value a non-event condition tests, read off the contact row. */
function contactValue(contact: ContactRow, field: string): string | string[] | null {
  if (field.startsWith("attr:")) {
    const column = field.slice("attr:".length) as keyof ContactRow;
    const raw = contact[column];
    return raw === null || raw === undefined ? "" : String(raw);
  }
  if (field === "tag") return contact.tags ?? [];
  if (field === "label") return contact.segments ?? [];
  if (field === "consent:email") return contact.consentEmail === 1 ? "1" : "0";
  if (field === "consent:sms") return contact.consentSms === 1 ? "1" : "0";
  if (field === "consent:profiling") return contact.consentProfiling === 1 ? "1" : "0";
  if (field.startsWith("custom:")) {
    return (contact.customFields ?? {})[field.slice("custom:".length)] ?? "";
  }
  return null;
}

function matchesText(actual: string, operator: SegmentOperator, expected: string): boolean {
  const a = actual.trim().toLowerCase();
  const b = expected.trim().toLowerCase();
  switch (operator) {
    case "equals":
      return a === b;
    case "not_equals":
      return a !== b;
    case "contains":
      return a.includes(b);
    case "not_contains":
      return !a.includes(b);
    case "starts":
      return a.startsWith(b);
    case "is_set":
      return a.length > 0;
    case "is_empty":
      return a.length === 0;
    default:
      return false;
  }
}

function matchesList(values: string[], operator: SegmentOperator, expected: string): boolean {
  const has = values.some((v) => eqCi(v, expected));
  switch (operator) {
    case "equals":
      return has;
    case "not_equals":
      return !has;
    case "contains":
      return values.some((v) => v.toLowerCase().includes(expected.trim().toLowerCase()));
    case "not_contains":
      return !values.some((v) => v.toLowerCase().includes(expected.trim().toLowerCase()));
    case "is_set":
      return values.length > 0;
    case "is_empty":
      return values.length === 0;
    default:
      return false;
  }
}

function evaluateCondition(
  contact: ContactRow,
  condition: SegmentCondition,
  events: EventIndex,
  warnings: Set<string>,
): boolean {
  const def = fieldDef(condition.field);
  if (!def) {
    warnings.add(tr("Nieznane pole „{field}” — warunek pominięty.", { field: condition.field }));
    return true;
  }

  if (def.kind === "event") {
    const hit = events[condition.id]?.has(contact.id) ?? false;
    return condition.operator === "not_occurred" ? !hit : hit;
  }

  // A condition with no value and an operator that needs one matches everybody.
  // Treating it as "false" would make a half-typed rule look like an empty
  // segment, which reads as a broken segment.
  if (!VALUELESS_OPERATORS.includes(condition.operator) && !condition.value.trim()) {
    warnings.add(
      tr("Warunek „{label}” nie ma wartości — pominięty w liczeniu.", { label: def.label }),
    );
    return true;
  }

  const value = contactValue(contact, condition.field);
  if (value === null) {
    warnings.add(
      tr("Pole „{label}” nie istnieje na kontakcie — warunek pominięty.", { label: def.label }),
    );
    return true;
  }
  return Array.isArray(value)
    ? matchesList(value, condition.operator, condition.value)
    : matchesText(value, condition.operator, condition.value);
}

function matchesDefinition(
  contact: ContactRow,
  definition: SegmentDefinition,
  events: EventIndex,
  warnings: Set<string>,
): boolean {
  const groups = definition.groups.filter((g) => g.conditions.length > 0);
  // A segment with no conditions is not "everybody" — it is unfinished, and
  // handing a campaign the whole base by accident is the expensive mistake here.
  if (groups.length === 0) return false;

  const groupResults = groups.map((group) => {
    const results = group.conditions.map((c) => evaluateCondition(contact, c, events, warnings));
    return group.match === "any" ? results.some(Boolean) : results.every(Boolean);
  });

  return definition.match === "any" ? groupResults.some(Boolean) : groupResults.every(Boolean);
}

/** Everyone matching a definition, with a sample for eyeballing the result. */
export async function previewSegment(definition: SegmentDefinition): Promise<SegmentPreview> {
  const db = getDb();
  const rows = await db.select().from(contacts);
  const allConditions = definition.groups.flatMap((g) => g.conditions);
  const events = await buildEventIndex(allConditions);
  const warnings = new Set<string>();

  const matched = rows.filter((c) => matchesDefinition(c, definition, events, warnings));
  return {
    members: matched.length,
    total: rows.length,
    sample: matched.slice(0, 8).map(toMember),
    warnings: [...warnings],
  };
}

function toMember(c: ContactRow): SegmentMember {
  return {
    id: c.id,
    name: `${c.firstName} ${c.lastName}`.trim() || c.email || c.prmId,
    email: c.email,
    phone: c.phone,
  };
}

/**
 * Strona osób, które łapie definicja — to, o co prosi „rozwiń i doładuj".
 *
 * Stronicowane, a nie oddawane w całości: przy tej wielkości bazy samo
 * dopasowanie jest tanie, ale wrzucenie 2500 wierszy kontaktów w panel podglądu
 * już nie, a listę i tak czyta się od góry.
 */
export async function previewSegmentMembers(
  definition: SegmentDefinition,
  offset = 0,
  limit = 50,
): Promise<{ members: SegmentMember[]; total: number }> {
  const db = getDb();
  const rows = await db.select().from(contacts);
  const events = await buildEventIndex(definition.groups.flatMap((g) => g.conditions));
  const warnings = new Set<string>();
  const matched = rows.filter((c) => matchesDefinition(c, definition, events, warnings));
  return {
    members: matched.slice(offset, offset + limit).map(toMember),
    total: matched.length,
  };
}

/** Ids only — what the engine's `in_segment` condition needs. */
export async function segmentMemberIds(definition: SegmentDefinition): Promise<Set<string>> {
  const db = getDb();
  const rows = await db.select().from(contacts);
  const events = await buildEventIndex(definition.groups.flatMap((g) => g.conditions));
  const warnings = new Set<string>();
  return new Set(
    rows.filter((c) => matchesDefinition(c, definition, events, warnings)).map((c) => c.id),
  );
}

/**
 * Whether one contact belongs to the dynamic segment of this name.
 *
 * Returns null when no such segment exists, which lets the caller fall back to
 * the plain label check — the two kinds of segment coexist, and a name that is
 * only ever used as a label must keep working.
 */
export async function contactInDynamicSegment(
  contact: ContactRow,
  name: string,
): Promise<boolean | null> {
  const row = await getDb().select().from(segments).where(eq(segments.name, name)).get();
  if (!row) return null;
  const events = await buildEventIndex(row.definition.groups.flatMap((g) => g.conditions));
  return matchesDefinition(contact, row.definition, events, new Set());
}

/**
 * Messages a segment can point at — the Newsletter and Email items the server
 * knows about.
 *
 * Two sources, merged by the builder: these server-side snapshots (published
 * when an automation goes active) and the browser's own content list, since
 * content items still live in localStorage. A message that has actually been
 * sent is always here, because sending goes through a snapshot — so the list
 * can never miss one that a contact could have opened.
 */
export async function listEmailMessageOptions(): Promise<
  { id: string; name: string; kind: string }[]
> {
  const rows = await getDb()
    .select({
      kind: contentSnapshots.kind,
      name: contentSnapshots.name,
      contentItemId: contentSnapshots.contentItemId,
    })
    .from(contentSnapshots);

  const fromSnapshots = rows
    .filter((r) => r.kind === "email" || r.kind === "newsletter")
    .map((r) => ({ id: r.contentItemId, name: r.name, kind: r.kind }));

  // Anything actually sent, in case a snapshot was renamed or removed after the
  // fact — a segment must still be able to name the message people received.
  const sent = await getDb()
    .select({ contentItemId: emailSends.contentItemId, subject: emailSends.subject })
    .from(emailSends);
  const known = new Set(fromSnapshots.map((o) => o.id));
  for (const s of sent) {
    if (!s.contentItemId || known.has(s.contentItemId)) continue;
    known.add(s.contentItemId);
    fromSnapshots.push({ id: s.contentItemId, name: s.subject || s.contentItemId, kind: "email" });
  }

  return fromSnapshots.sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

// ── Segmenty z etykiet: most do karty kontaktu ──────────────────────────────

/**
 * Definicja „wszyscy, którzy mają tę etykietę”.
 *
 * To ona sprawia, że segment wybrany na karcie kontaktu i segment w tym module
 * są jedną rzeczą, a nie dwiema. Etykieta nadana ręcznie, akcją silnika
 * `change_segment` albo przez PRM_Agent dostaje tu wiersz, którego audytorium
 * jest — z konstrukcji — dokładnie zbiorem kontaktów, które ją noszą. Nic nie
 * jest kopiowane, więc nic nie ma jak się rozjechać: lista etykiet na
 * `contacts` zostaje jedynym miejscem, gdzie żyje odpowiedź, a ten wiersz jest
 * definicją, która ją czyta.
 */
export function labelSegmentDefinition(name: string): SegmentDefinition {
  return {
    match: "all",
    groups: [
      {
        id: "g1",
        match: "all",
        conditions: [{ id: "c1", field: "label", operator: "equals", value: name }],
      },
    ],
  };
}

/** Czy definicja to dokładnie powyższa reguła etykiety — nic dodane, nic ujęte. */
export function isLabelSegment(definition: SegmentDefinition, name: string): boolean {
  const conditions = definition.groups.flatMap((g) => g.conditions);
  if (conditions.length !== 1) return false;
  const [c] = conditions;
  return c.field === "label" && c.operator === "equals" && eqCi(c.value, name);
}

/**
 * Pilnuje, żeby za etykietą stał segment w tym module.
 *
 * Wołane z każdej drogi, która może nadać etykietę kontaktowi, więc „segmenty,
 * których używa placówka" i „segmenty, które wypisuje moduł" nie mają jak się
 * rozejść. Istniejący segment o tej nazwie zostaje **nietknięty** — ktoś mógł
 * zbudować pod tą nazwą prawdziwą definicję, a nadpisanie jej regułą etykiety
 * wyrzuciłoby jego pracę do kosza.
 */
export async function ensureLabelSegment(input: {
  name: string;
  description?: string;
  updatedBy?: string;
}): Promise<{ created: boolean; id: string } | null> {
  const name = input.name.trim();
  if (!name) return null;

  const db = getDb();
  const existing = await db
    .select({ id: segments.id })
    .from(segments)
    .where(eq(segments.name, name))
    .get();
  if (existing) return { created: false, id: existing.id };

  const now = Date.now();
  const id = randomUUID();
  await db.insert(segments).values({
    id,
    name,
    description:
      input.description?.trim() || tr("Segment nadawany jako etykieta na karcie kontaktu."),
    status: "live",
    definition: labelSegmentDefinition(name),
    createdAt: now,
    updatedAt: now,
    updatedBy: input.updatedBy?.trim() || "System",
    // Segment z **etykiety na karcie kontaktu** jest z natury trwały: etykieta
    // istnieje niezależnie od nas i po skasowaniu segmentu i tak odtworzyłby go
    // `adoptExistingLabels()` przy najbliższym wejściu na listę.
    permanent: 1,
    expiresAt: null,
  });
  return { created: true, id };
}

/**
 * Rejestruje etykiety, które siedziały na kontaktach, zanim ten moduł powstał.
 *
 * Bez tego karta kontaktu — która oferuje już wyłącznie segmenty znane temu
 * modułowi — nie mogłaby nikomu nadać „VIP" ani „Kardiologia", bo to był
 * zawsze tylko wolny tekst wpisany w pole. Leniwie, jak pozostałe seedy tutaj:
 * płaci za to pierwszy odczyt listy segmentów, raz.
 */
export async function adoptExistingLabels(): Promise<number> {
  const db = getDb();
  const [labelRows, segmentRows] = await Promise.all([
    db.select({ segments: contacts.segments }).from(contacts),
    db.select({ name: segments.name }).from(segments),
  ]);

  const known = new Set(segmentRows.map((r) => r.name.trim().toLowerCase()));
  const missing = new Map<string, string>();
  for (const row of labelRows) {
    for (const label of row.segments ?? []) {
      const clean = label.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (known.has(key) || missing.has(key)) continue;
      missing.set(key, clean);
    }
  }

  for (const name of missing.values()) {
    await ensureLabelSegment({
      name,
      description: tr("Segment przejęty z etykiet nadanych na kartach kontaktów."),
    });
  }
  return missing.size;
}

/** Nazwy, które może zaproponować picker. Świadomie nie liczy osób — pickerowi to niepotrzebne. */
export async function listSegmentOptions(): Promise<SegmentOption[]> {
  await adoptExistingLabels();
  const rows = await getDb().select().from(segments).orderBy(desc(segments.updatedAt));
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      fromLabel: isLabelSegment(row.definition, row.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

// ── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Lista segmentów wraz z liczbą osób w każdym.
 *
 * **Kontakty czytamy RAZ, nie raz na segment.** Wcześniej ta funkcja wołała
 * `previewSegment` w pętli, a każde wywołanie wczytywało **całą** tabelę
 * kontaktów i budowało własny indeks zdarzeń. Przy piętnastu tysiącach
 * kontaktów i kilkunastu segmentach to kilkanaście pełnych przebiegów po bazie,
 * jeden po drugim — stąd ekran, który ładował się kilkanaście sekund.
 *
 * Teraz: jedno wczytanie kontaktów, **jeden** indeks zdarzeń zbudowany z sumy
 * warunków wszystkich segmentów (indeks jest kluczowany po identyfikatorze
 * warunku, więc łączenie ich niczego nie miesza), a potem samo dopasowanie
 * w pamięci.
 */
export async function listSegments(): Promise<SegmentSummary[]> {
  const db = getDb();
  await adoptExistingLabels();
  const rows = await db.select().from(segments).orderBy(desc(segments.updatedAt));
  if (rows.length === 0) return [];

  const wszyscy = await db.select().from(contacts);
  const wszystkieWarunki = rows.flatMap((r) => r.definition.groups.flatMap((g) => g.conditions));
  const events = await buildEventIndex(wszystkieWarunki);

  return rows.map((row) => {
    // Ostrzeżenia zbieramy per segment, żeby nie przypisać jednemu tego, co
    // wynika z definicji innego.
    const warnings = new Set<string>();
    const members = wszyscy.filter((c) =>
      matchesDefinition(c, row.definition, events, warnings),
    ).length;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      definition: row.definition,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
      members,
      permanent: row.permanent === 1,
      expiresAt: row.expiresAt,
    };
  });
}

export async function getSegment(id: string): Promise<SegmentSummary | null> {
  const row = await getDb().select().from(segments).where(eq(segments.id, id)).get();
  if (!row) return null;
  const preview = await previewSegment(row.definition);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    definition: row.definition,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
    members: preview.members,
    permanent: row.permanent === 1,
    expiresAt: row.expiresAt,
  };
}

export async function saveSegment(input: {
  id?: string;
  name: string;
  description: string;
  status: "draft" | "live";
  definition: SegmentDefinition;
  updatedBy: string;
  /** Stały (cykliczny) — bez terminu ważności. */
  permanent?: boolean;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: tr("Segment musi mieć nazwę.") };

  const db = getDb();
  // The name is how an automation refers to a segment, so two segments sharing
  // one would make `in_segment` ambiguous.
  const clash = await db
    .select({ id: segments.id })
    .from(segments)
    .where(eq(segments.name, name))
    .get();
  if (clash && clash.id !== input.id) {
    return { ok: false, error: tr("Segment o nazwie „{name}” już istnieje.", { name: name }) };
  }

  const now = Date.now();
  /**
   * **Zegar rusza od ostatniej zmiany, nie od utworzenia.** Segment, przy którym
   * ktoś dziś pracował, ma 48 godzin od dziś — inaczej praca nad definicją
   * dłuższa niż dwa dni kończyłaby się zniknięciem segmentu w trakcie.
   */
  const permanent = input.permanent === true;
  const expiresAt = permanent ? null : now + SEGMENT_TTL_MS;

  if (input.id) {
    const existing = await db.select().from(segments).where(eq(segments.id, input.id)).get();
    if (!existing) return { ok: false, error: tr("Segment nie istnieje.") };
    await db
      .update(segments)
      .set({
        name,
        description: input.description.trim(),
        status: input.status,
        definition: input.definition,
        updatedAt: now,
        updatedBy: input.updatedBy,
        permanent: permanent ? 1 : 0,
        expiresAt,
      })
      .where(eq(segments.id, input.id));
    return { ok: true, id: input.id };
  }

  const id = randomUUID();
  await db.insert(segments).values({
    id,
    name,
    description: input.description.trim(),
    status: input.status,
    definition: input.definition ?? emptyDefinition(),
    createdAt: now,
    updatedAt: now,
    updatedBy: input.updatedBy,
    permanent: permanent ? 1 : 0,
    expiresAt,
  });
  return { ok: true, id };
}

/**
 * Sprzątanie segmentów po terminie ważności.
 *
 * **Nie kasuje segmentu, z którego ktoś korzysta.** Sprawdzane są dwie rzeczy,
 * bo każda psuje się inaczej:
 *
 * 1. **Zaplanowana albo trwająca wysyłka** wskazuje segment identyfikatorem —
 *    skasowanie zostawiłoby kampanię bez odbiorców w chwili startu.
 * 2. **Aktywna automatyzacja** wskazuje segment **nazwą** (pole tekstowe
 *    w węźle). Po skasowaniu automatyzacja nie zgłosi błędu — po prostu
 *    przestanie wyzwalać, bo nikt nie dołączy do segmentu, którego nie ma.
 *    To najgorszy rodzaj awarii: cichy.
 *
 * Segment w użyciu dostaje **przedłużenie**, nie wyjątek: jeśli za dwa dni nikt
 * już go nie używa, zniknie wtedy. Trwałość nadaje się świadomie, przełącznikiem.
 */
export async function purgeExpiredSegments(now = Date.now()): Promise<{
  usuniete: number;
  przedluzone: number;
}> {
  const db = getDb();
  const out = { usuniete: 0, przedluzone: 0 };

  const wygasle = await db
    .select()
    .from(segments)
    .where(
      and(eq(segments.permanent, 0), isNotNull(segments.expiresAt), lte(segments.expiresAt, now)),
    );
  if (wygasle.length === 0) return out;

  // Wysyłki, które jeszcze nie wystartowały albo trwają.
  const zajeteWysylka = new Set(
    (await db.select({ segmentId: campaigns.segmentId, status: campaigns.status }).from(campaigns))
      .filter((c) => ["scheduled", "sending", "paused"].includes(c.status))
      .map((c) => c.segmentId),
  );

  // Aktywne automatyzacje: segment jest w nich **nazwą**, więc szukamy nazwy
  // w zapisanym grafie. Zgrubne z rozmysłu — wolimy zostawić segment o jeden
  // przebieg za długo niż wyłączyć komuś automatyzację po cichu.
  const grafy = (await db.select().from(automations))
    .filter((a) => a.status === "active")
    .map((a) => JSON.stringify(a.flow ?? {}));

  for (const seg of wygasle) {
    const wUzyciu = zajeteWysylka.has(seg.id) || grafy.some((g) => g.includes(seg.name));
    if (wUzyciu) {
      await db
        .update(segments)
        .set({ expiresAt: now + SEGMENT_TTL_MS })
        .where(eq(segments.id, seg.id));
      out.przedluzone++;
      continue;
    }
    await deleteSegment(seg.id);
    out.usuniete++;
  }

  if (out.usuniete > 0 || out.przedluzone > 0) {
    await logStep({
      kind: "action",
      message:
        tr("Sprzątanie segmentów: usunięto {usuniete} po terminie ważności", {
          usuniete: out.usuniete,
        }) +
        (out.przedluzone > 0
          ? tr(", przedłużono {przedluzone} będących w użyciu", { przedluzone: out.przedluzone })
          : "") +
        ".",
      detail: { source: "segmenty-ttl" },
    });
  }
  return out;
}

/**
 * Ilu kontaktów dotknie usunięcie tego segmentu.
 *
 * Dla segmentu z etykiety to liczba osób, którym trzeba będzie tę etykietę
 * zdjąć — bez tego `adoptExistingLabels()` odtworzy go przy najbliższym
 * wejściu na listę.
 */
export async function segmentDeletionImpact(
  id: string,
): Promise<{ fromLabel: boolean; name: string; labelled: number }> {
  const row = await getDb().select().from(segments).where(eq(segments.id, id)).get();
  if (!row) return { fromLabel: false, name: "", labelled: 0 };
  const fromLabel = isLabelSegment(row.definition, row.name);
  if (!fromLabel) return { fromLabel: false, name: row.name, labelled: 0 };
  const rows = await getDb().select({ segments: contacts.segments }).from(contacts);
  const key = row.name.trim().toLowerCase();
  const labelled = rows.filter((r) =>
    (r.segments ?? []).some((l) => l.trim().toLowerCase() === key),
  ).length;
  return { fromLabel: true, name: row.name, labelled };
}

/**
 * Usuwa segment — a przy segmencie z etykiety **także samą etykietę**
 * z kartotek.
 *
 * **Dlaczego etykieta musi zniknąć razem z nim.** `adoptExistingLabels()` chodzi
 * przy każdym wypisaniu listy i odtwarza segment dla każdej etykiety, która nie
 * ma jeszcze swojego wiersza. Bez zdjęcia etykiety usunięcie wyglądało więc
 * tak, jakby nic nie zrobiło: wiersz znikał i wracał sekundę później, przy
 * odświeżeniu — segmentów zrobionych przez system nie dało się usunąć.
 *
 * Zdjęcie etykiety jest **zmianą w kartotekach pacjentów**, więc interfejs musi
 * pokazać liczbę osób, zanim ktoś kliknie — stąd `segmentDeletionImpact()`.
 */
export async function deleteSegment(id: string): Promise<{ ok: boolean; unlabelled: number }> {
  const db = getDb();
  const row = await db.select().from(segments).where(eq(segments.id, id)).get();
  if (!row) return { ok: true, unlabelled: 0 };

  let unlabelled = 0;
  if (isLabelSegment(row.definition, row.name)) {
    const key = row.name.trim().toLowerCase();
    const rows = await db.select().from(contacts);
    for (const c of rows) {
      const labels = c.segments ?? [];
      const next = labels.filter((l) => l.trim().toLowerCase() !== key);
      if (next.length === labels.length) continue;
      await db.update(contacts).set({ segments: next }).where(eq(contacts.id, c.id));
      unlabelled += 1;
    }
  }

  await db.delete(segments).where(eq(segments.id, id));
  return { ok: true, unlabelled };
}

/** Members of a saved segment, for the "who is in this" list. */
export async function segmentMembers(id: string, limit = 200): Promise<SegmentMember[]> {
  const row = await getDb().select().from(segments).where(eq(segments.id, id)).get();
  if (!row) return [];
  const { members } = await previewSegmentMembers(row.definition, 0, limit);
  return members;
}
