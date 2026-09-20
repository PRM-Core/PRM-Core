import { t, localized } from "@/lib/i18n"; /**
 * What a dynamic segment is, in data.
 *
 * Client-safe on purpose (no DB, no `node:*`): the builder edits this shape and
 * the server evaluates exactly the same shape, so there is one definition of
 * "what this segment means" rather than one per side.
 *
 * The model is deliberately two levels deep — conditions inside groups, groups
 * inside a segment — and no deeper. Arbitrary nesting reads well in a data model
 * and terribly in a UI, and nobody has asked for "(A or B) and (C or (D and E))".
 */

/** Every field a condition can test, grouped by where the answer comes from. */
export type SegmentFieldKind =
  /** A column on `contacts`. */
  | "attribute"
  /** An entry in the contact's tag list. */
  | "tag"
  /** A label in the contact's segment list — the manual kind of segment. */
  | "label"
  /** One of the consents. */
  | "consent"
  /** A field the clinic added in Ustawienia → Tabele / Dane. */
  | "custom"
  /** Something the patient did, counted from the engine's own tables. */
  | "event";

export interface SegmentFieldDef {
  /** Stable id stored in the definition, e.g. `attr:status`, `event:page_visit`. */
  key: string;
  label: string;
  kind: SegmentFieldKind;
  /** Which operators make sense for this field. */
  operators: SegmentOperator[];
  /** Preset values offered as a dropdown; free text when absent. */
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Event fields can be limited to a time window. */
  supportsWindow?: boolean;
  /**
   * Where the value comes from when it is not free text.
   *
   * `email-template` means "one of the messages from Newsletter / Email" — the
   * builder renders a picker and stores the content item's **id**, because a
   * name is what somebody renames and an id is what `email_sends` recorded.
   */
  valueSource?: "email-template";
  hint?: string;
}

export type SegmentOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts"
  | "is_set"
  | "is_empty"
  /** Event fields: happened / never happened. */
  | "occurred"
  | "not_occurred";

export const OPERATOR_LABELS: Record<SegmentOperator, string> = localized(() => ({
  equals: t("jest dokładnie"),
  not_equals: "nie jest",
  contains: "zawiera",
  not_contains: "nie zawiera",
  starts: t("zaczyna się od"),
  is_set: t("jest uzupełnione"),
  is_empty: "jest puste",
  occurred: t("wystąpiło"),
  not_occurred: t("nie wystąpiło"),
}));

/** Operators that need no value field — the operator is the whole condition. */
export const VALUELESS_OPERATORS: SegmentOperator[] = ["is_set", "is_empty"];

export interface SegmentCondition {
  id: string;
  /** Key from `SegmentFieldDef`. */
  field: string;
  operator: SegmentOperator;
  value: string;
  /** Event conditions only: look back this many days. 0 = since forever. */
  days?: number;
}

export interface SegmentGroup {
  id: string;
  /** How the conditions inside this group combine. */
  match: "all" | "any";
  conditions: SegmentCondition[];
}

export interface SegmentDefinition {
  /** How the groups combine with each other. */
  match: "all" | "any";
  groups: SegmentGroup[];
}

export function emptyDefinition(): SegmentDefinition {
  return { match: "all", groups: [{ id: "g1", match: "all", conditions: [] }] };
}

export function countConditions(def: SegmentDefinition): number {
  return def.groups.reduce((acc, g) => acc + g.conditions.length, 0);
}

const TEXT_OPERATORS: SegmentOperator[] = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts",
  "is_set",
  "is_empty",
];

const EVENT_OPERATORS: SegmentOperator[] = ["occurred", "not_occurred"];

/**
 * The fields a segment can be built from — every one of them backed by data the
 * system really holds.
 *
 * Nothing speculative is listed here. A field nobody fills in would produce a
 * segment that is silently always empty, which is the failure this whole module
 * is meant to avoid.
 */
/**
 * Statusy w liście wyboru pochodzą z bazy, nie z tej stałej.
 *
 * Cztery wpisy przy `attr:status` niżej są **awaryjne** — pokazują się tylko,
 * zanim lista z serwera dojedzie. Placówka dodaje własne statusy
 * (np. `Lekarz_Lead`) i segment musi dać się po nich zbudować; zamknięta lista
 * znaczyła, że statusu, który istnieje na karcie kontaktu, nie da się wybrać
 * w segmencie. Ocena warunku nigdy nie miała tego ograniczenia — porównuje
 * zwykły tekst — więc brakowało wyłącznie możliwości wskazania wartości.
 */
export function withStatusOptions(
  fields: SegmentFieldDef[],
  statuses: { key: string; label: string }[],
): SegmentFieldDef[] {
  if (statuses.length === 0) return fields;
  return fields.map((f) =>
    f.key === "attr:status"
      ? { ...f, options: statuses.map((s) => ({ value: s.key, label: s.label })) }
      : f,
  );
}

export const SEGMENT_FIELDS: SegmentFieldDef[] = localized(() => [
  {
    key: "attr:status",
    label: t("Status pacjenta"),
    kind: "attribute",
    operators: ["equals", "not_equals"],
    options: [
      { value: "lead", label: t("Lead") },
      { value: "active", label: t("Aktywny") },
      { value: "patient", label: t("Pacjent") },
      { value: "inactive", label: t("Nieaktywny") },
    ],
  },
  {
    key: "attr:source",
    label: t("Źródło pozyskania"),
    kind: "attribute",
    operators: TEXT_OPERATORS,
    placeholder: t("Google"),
  },
  {
    key: "attr:medium",
    label: t("Medium pozyskania"),
    kind: "attribute",
    operators: TEXT_OPERATORS,
    placeholder: "cpc",
  },
  {
    key: "attr:campaign",
    label: t("Kampania pozyskania"),
    kind: "attribute",
    operators: TEXT_OPERATORS,
    placeholder: "kardio-q1-2026",
  },
  {
    key: "attr:email",
    label: t("Adres e-mail"),
    kind: "attribute",
    operators: TEXT_OPERATORS,
    placeholder: "@gmail.com",
  },
  {
    key: "attr:phone",
    label: t("Numer telefonu"),
    kind: "attribute",
    operators: ["is_set", "is_empty", "starts", "contains"],
    placeholder: "+48",
  },
  {
    key: "attr:firstName",
    label: t("Imię"),
    kind: "attribute",
    operators: TEXT_OPERATORS,
    placeholder: t("Anna"),
  },
  {
    key: "attr:lastName",
    label: t("Nazwisko"),
    kind: "attribute",
    operators: TEXT_OPERATORS,
    placeholder: t("Kowalska"),
  },
  {
    key: "tag",
    label: t("Tag"),
    kind: "tag",
    operators: ["equals", "not_equals"],
    placeholder: "RDS",
    hint: t("Porównanie bez rozróżniania wielkości liter."),
  },
  {
    key: "label",
    label: t("Segment (etykieta)"),
    kind: "label",
    operators: ["equals", "not_equals"],
    placeholder: "VIP",
    hint: t(
      "Segment nadany wprost: ręcznie na karcie kontaktu, akcją „Zmień segment” albo przez PRM_Agent. Każdy taki segment ma własną pozycję na liście segmentów.",
    ),
  },
  {
    key: "consent:email",
    label: t("Zgoda — marketing e-mail"),
    kind: "consent",
    operators: ["equals"],
    options: [
      { value: "1", label: t("udzielona") },
      { value: "0", label: t("brak") },
    ],
  },
  {
    key: "consent:sms",
    label: t("Zgoda — marketing SMS"),
    kind: "consent",
    operators: ["equals"],
    options: [
      { value: "1", label: t("udzielona") },
      { value: "0", label: t("brak") },
    ],
  },
  {
    key: "consent:profiling",
    label: t("Zgoda — profilowanie"),
    kind: "consent",
    operators: ["equals"],
    options: [
      { value: "1", label: t("udzielona") },
      { value: "0", label: t("brak") },
    ],
  },
  {
    key: "event:page_visit",
    label: t("Wejście na stronę"),
    kind: "event",
    operators: EVENT_OPERATORS,
    placeholder: t("/cennik — puste = dowolna strona"),
    supportsWindow: true,
    hint: t(
      "Liczone z kodu śledzącego. Widoczne są tylko wizyty rozpoznanego pacjenta (wejście z linku w e-mailu) — ruch anonimowy nie ma do kogo się przypiąć.",
    ),
  },
  {
    key: "event:email_opened",
    label: t("Otwarcie wiadomości"),
    kind: "event",
    operators: EVENT_OPERATORS,
    supportsWindow: true,
    valueSource: "email-template",
    hint: t(
      "Wybierz konkretną wiadomość z Newslettera albo Emaila, albo zostaw „dowolna”. Uwaga: dopóki adres aplikacji to localhost, otwarcia nie są w ogóle rejestrowane — ten warunek będzie pusty niezależnie od wyboru.",
    ),
  },
  {
    key: "event:email_clicked",
    label: t("Kliknięcie w wiadomości"),
    kind: "event",
    operators: EVENT_OPERATORS,
    supportsWindow: true,
    valueSource: "email-template",
    hint: t("Wybierz konkretną wiadomość z Newslettera albo Emaila, albo zostaw „dowolna”."),
  },
  {
    key: "event:visit_booked",
    label: t("Rezerwacja wizyty — usługa"),
    kind: "event",
    operators: EVENT_OPERATORS,
    placeholder: t("konsultacja — puste = dowolna usługa"),
    supportsWindow: true,
    hint: t(
      "Dopasowanie po nazwie usługi, tak jak widział ją pacjent. Rezerwacje online — wizyty umówione telefonicznie tu nie trafiają.",
    ),
  },
  {
    key: "event:visit_specialization",
    label: t("Rezerwacja wizyty — specjalizacja"),
    kind: "event",
    operators: EVENT_OPERATORS,
    placeholder: t("otolaryngolog — puste = dowolna specjalizacja"),
    supportsWindow: true,
    hint: t(
      "Stabilniejsze niż nazwa usługi: nazwa usługi bywa dopisywana ręcznie i zmienia się między terminami, specjalizacja nie.",
    ),
  },
  {
    key: "event:visit_doctor",
    label: t("Rezerwacja wizyty — lekarz"),
    kind: "event",
    operators: EVENT_OPERATORS,
    placeholder: t("Kowalski — puste = dowolny lekarz"),
    supportsWindow: true,
    hint: t("Fragment nazwiska wystarczy — dopasowanie szuka go w całym opisie lekarza."),
  },
  {
    key: "event:visit_status",
    label: t("Wizyta — stan"),
    kind: "event",
    operators: EVENT_OPERATORS,
    options: [
      { value: "completed", label: t("Odbyła się (zakończona)") },
      { value: "no_show", label: t("Brak wizyty pacjenta") },
      { value: "upcoming", label: t("Umówiona, jeszcze przed terminem") },
    ],
    supportsWindow: true,
    hint: t(
      "„Brak wizyty pacjenta” to wizyta, która nadal figuruje jako umówiona, a jej termin minął ponad 2 godziny temu — pacjent się nie zjawił. Odwołana wizyta nie wpada do żadnego z tych stanów.",
    ),
  },
  {
    key: "event:message_received",
    label: t("Wiadomość od pacjenta"),
    kind: "event",
    operators: EVENT_OPERATORS,
    placeholder: t("email / sms / form / survey — puste = dowolny kanał"),
    supportsWindow: true,
  },
]);

export function fieldDef(key: string): SegmentFieldDef | undefined {
  if (key.startsWith("custom:")) {
    return {
      key,
      label: key.slice("custom:".length),
      kind: "custom",
      operators: TEXT_OPERATORS,
    };
  }
  return SEGMENT_FIELDS.find((f) => f.key === key);
}

/** Human sentence for one condition — used in the list and the summary line. */
export function describeCondition(c: SegmentCondition, customLabel?: string): string {
  const def = fieldDef(c.field);
  const name = def?.kind === "custom" ? (customLabel ?? def.label) : (def?.label ?? c.field);
  const op = OPERATOR_LABELS[c.operator];
  const window = c.days && c.days > 0 ? ` (ostatnie ${c.days} dni)` : "";
  if (VALUELESS_OPERATORS.includes(c.operator)) return `${name} ${op}`;
  if (!c.value.trim() && def?.kind === "event") return `${name} ${op}${window}`;
  return `${name} ${op} „${c.value}”${window}`;
}
