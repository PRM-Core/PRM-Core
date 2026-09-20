import { warsawToday } from "../visits/warsaw-time";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contacts, contactNotes } from "../db/schema";
import { ensureSeeded, announceNewContact } from "../contacts.server";
import { addNote } from "../notes/notes.server";
import { setConsents } from "../consent/consent.server";
import { applyTagChange } from "../engine/actions.server";
import { findMatchingContact } from "../contacts-match.server";
import { formatActivityDate } from "../activity-date";
import { t as tr } from "@/lib/i18n";

/**
 * Leads from the "Razem dla Słuchu" hearing-test qualification form
 * (razemdlasluchu.pl/kwalifikacja), posted by a WordPress hook.
 *
 * The form is a multi-step questionnaire, and its field names are whatever the
 * form builder generated, so the mapping here works by **alias, not by exact
 * name**: it recognises the four fields that become columns (first name, last
 * name, phone, e-mail) and treats everything else as an answer — which lands in
 * a note on the contact card, the same place popup surveys put theirs.
 *
 * That asymmetry is on purpose. A questionnaire answer is not a column: the
 * form can gain a question next week, and a mapping keyed on exact field names
 * would silently drop it.
 */

/** Tag every contact from this program carries, so reports and automations can find them. */
const RDS_TAG = "RDS";

const FIRST_NAME_KEYS = [
  "imie",
  "imię",
  "first-name",
  "firstname",
  "first_name",
  "your-name",
  "your-first-name",
  "text-imie",
];
const LAST_NAME_KEYS = [
  "nazwisko",
  "last-name",
  "lastname",
  "last_name",
  "surname",
  "your-last-name",
  "your-surname",
  "text-nazwisko",
];
const PHONE_KEYS = [
  "telefon",
  "tel",
  "phone",
  "phone-number",
  "your-phone",
  "numer",
  "numer-telefonu",
  "tel-telefon",
];
const EMAIL_KEYS = ["email", "e-mail", "mail", "your-email", "adres-email"];

/** CF7 adds hidden bookkeeping fields to every submission; they are not answers. */
const IGNORED_KEYS = [
  "_wpcf7",
  "_wpcf7_version",
  "_wpcf7_locale",
  "_wpcf7_unit_tag",
  "_wpcf7_container_post",
  "_wpcf7_posted_data_hash",
  "_wpcf7cf_hidden_group_fields",
  "_wpcf7cf_hidden_groups",
  "_wpcf7cf_visible_groups",
  "_wpcf7cf_repeaters",
  "_wpcf7cf_steps",
  "_wpcf7cf_options",
  "g-recaptcha-response",
  "submissionid",
  "submission_id",
];

function normaliseKey(key: string): string {
  return key.trim().toLowerCase();
}

/** Flattens what a form builder sends: a value may arrive as a string or a one-element array. */
function asText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((v) => asText(v))
      .filter(Boolean)
      .join(", ");
  }
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "";
  return String(value).trim();
}

function pick(data: Record<string, unknown>, keys: string[]): { value: string; usedKey?: string } {
  for (const [rawKey, rawValue] of Object.entries(data)) {
    if (keys.includes(normaliseKey(rawKey))) {
      const value = asText(rawValue);
      if (value) return { value, usedKey: rawKey };
    }
  }
  return { value: "" };
}

/**
 * Puts a Polish number into E.164, which is the only shape Twilio accepts.
 *
 * Anything already carrying a country code is left alone; a bare nine-digit
 * number gets +48. A number that fits no pattern is returned unchanged rather
 * than mangled — a wrong number that looks wrong is easier to spot than a wrong
 * number that looks right.
 */
export function normalisePolishPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0048")) return `+${digits.slice(2)}`;
  if (digits.startsWith("48") && digits.length === 11) return `+${digits}`;
  if (digits.length === 9) return `+48${digits}`;
  return raw.trim();
}

/** Turns `twoj-wiek` into `Twoj wiek` — a readable line when the form sends no labels. */
function prettifyKey(key: string): string {
  const spaced = key.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface HearingTestResult {
  ok: boolean;
  created: boolean;
  contactId: string;
  /** True when this exact submission had already been recorded. */
  duplicate?: boolean;
  error?: string;
}

/**
 * Records one qualification-form submission.
 *
 * A returning person is matched by e-mail, then by phone — the form is filled in
 * by people who may well have been in the base already, and a second row would
 * split one patient's history in two.
 */
export async function recordHearingTestLead(input: {
  data: Record<string, unknown>;
  /** Optional human labels keyed by field name, if the form can send them. */
  labels?: Record<string, string>;
  /** Optional id of the submission, used to ignore a retried webhook delivery. */
  submissionId?: string;
}): Promise<HearingTestResult> {
  await ensureSeeded();
  const db = getDb();
  const { data } = input;

  const first = pick(data, FIRST_NAME_KEYS);
  const last = pick(data, LAST_NAME_KEYS);
  const phoneField = pick(data, PHONE_KEYS);
  const emailField = pick(data, EMAIL_KEYS);

  const firstName = first.value;
  const lastName = last.value;
  const phone = normalisePolishPhone(phoneField.value);
  const email = emailField.value.toLowerCase();

  if (!firstName && !lastName && !phone && !email) {
    return {
      ok: false,
      created: false,
      contactId: "",
      error: tr(
        "Nie rozpoznano żadnego pola identyfikującego (imię, nazwisko, telefon, e-mail). Sprawdź nazwy pól formularza.",
      ),
    };
  }

  // The clinic's shared rule for "same patient" — see contacts-match.server.ts.
  const match = await findMatchingContact({ firstName, lastName, email, phone });
  const existing = match?.contact ?? null;

  const answers = Object.entries(data)
    .filter(([key]) => {
      const k = normaliseKey(key);
      if (IGNORED_KEYS.includes(k)) return false;
      if (k === normaliseKey(first.usedKey ?? "")) return false;
      if (k === normaliseKey(last.usedKey ?? "")) return false;
      if (k === normaliseKey(phoneField.usedKey ?? "")) return false;
      if (k === normaliseKey(emailField.usedKey ?? "")) return false;
      return true;
    })
    .map(([key, value]) => ({
      key,
      label: input.labels?.[key] ?? prettifyKey(key),
      value: asText(value),
    }))
    .filter((a) => a.value !== "");

  const stamp = formatActivityDate(Date.now());
  const noteLines = [
    `Test kwalifikacyjny „Razem dla Słuchu" — ${stamp}`,
    "",
    ...answers.map((a) => `${a.label}: ${a.value}`),
  ];
  if (input.submissionId) noteLines.push("", `Zgłoszenie: ${input.submissionId}`);
  const noteText = noteLines.join("\n");

  let contactId: string;
  let created: boolean;

  if (existing) {
    contactId = existing.id;
    created = false;

    // A retried delivery must not add the questionnaire twice.
    if (input.submissionId) {
      const seen = await db
        .select({ id: contactNotes.id })
        .from(contactNotes)
        .where(
          sql`${contactNotes.contactId} = ${contactId} and ${contactNotes.text} like ${`%Zgłoszenie: ${input.submissionId}%`}`,
        )
        .get();
      if (seen) return { ok: true, created: false, contactId, duplicate: true };
    }

    // Fill in what the record was missing, never overwrite what somebody has
    // already entered by hand.
    const patch: Record<string, string> = {};
    if (!existing.firstName && firstName) patch.firstName = firstName;
    if (!existing.lastName && lastName) patch.lastName = lastName;
    if (!existing.phone && phone) patch.phone = phone;
    if (!existing.email && email) patch.email = email;
    if (Object.keys(patch).length > 0) {
      await db.update(contacts).set(patch).where(eq(contacts.id, contactId));
    }

    const hasTag = (existing.tags ?? []).some(
      (t) => t.trim().toLowerCase() === RDS_TAG.toLowerCase(),
    );
    if (!hasTag) {
      // Through the engine's own helper, so "Dodanie tagu: RDS" fires for a
      // returning person exactly as it does for a new one.
      await applyTagChange(existing, RDS_TAG, "add");
    }
  } else {
    contactId = `rds-${Date.now()}`;
    created = true;
    await db.insert(contacts).values({
      id: contactId,
      prmId: `PRM-${String(90000 + Math.floor(Math.random() * 9999)).slice(-5)}`,
      firstName,
      lastName,
      email,
      phone,
      pesel: "",
      segments: [],
      tags: [RDS_TAG],
      source: "Razem dla Słuchu",
      medium: "kwalifikacja",
      campaign: "test-sluchu",
      createdAt: warsawToday(),
      status: "lead",
      // Filling in the qualification form IS the consent — the same reasoning
      // the popup-form collector already applies. Profiling is granted here too
      // (it is not for the popup forms), because this form's own clause covers
      // matching the offer to the answers given.
      consentEmail: 1,
      consentSms: 1,
      consentProfiling: 1,
      consentSource: "Razem dla Słuchu",
      consentUpdatedAt: Date.now(),
      customFields: {},
    });
  }

  // For a returning contact the consents go through the helper, so the change
  // lands on the timeline and emits an event; for a new one they were written
  // with the row above and there is nothing to announce.
  if (!created) {
    await setConsents({
      contactId,
      email: true,
      sms: true,
      profiling: true,
      source: "Razem dla Słuchu",
      note: "Wypełnienie testu kwalifikacyjnego.",
    });
  }

  await addNote({ contactId, text: noteText, source: "form" });

  if (created) {
    await announceNewContact(
      contactId,
      { source: "Razem dla Słuchu", medium: "kwalifikacja", campaign: "test-sluchu" },
      [RDS_TAG],
    );
  }

  return { ok: true, created, contactId };
}
