/**
 * Pseudonymisation in front of every prompt — the model never learns who the
 * patient is.
 *
 * Two layers, both applied to every text that leaves for a model:
 *
 * 1. **Patterns** — e-mail addresses, phone numbers and the national ID
 *    (PESEL) are recognisable by shape, so they are replaced wherever they
 *    appear: in a prompt, in a patient's reply, in a tool result.
 * 2. **Known identifiers** — a name cannot be recognised by shape, so the
 *    prompt builder passes the names it knows (the contact's, the people in a
 *    list) and they are replaced as whole words.
 *
 * Replacements are the placeholders the engine already personalises at send
 * time (`{{firstName}}`, `{{email}}`, …), so a draft written with them is a
 * finished template. A contact is referred to by a short pseudonym derived
 * from its id — stable within an installation, meaningless outside it.
 */

export interface KnownIdentifiers {
  firstNames?: string[];
  lastNames?: string[];
  emails?: string[];
  phones?: string[];
  nationalIds?: string[];
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** 11 digits with no digit on either side — the PESEL shape. */
const PESEL = /(?<!\d)\d{11}(?!\d)/g;
/**
 * A phone number: optional `+`, then 9 or more digits with spaces, dashes or
 * dots between groups. Dates (`2026-09-12`) have too few digits to match.
 */
const PHONE = /(?<![\w+])\+?(?:\d[\s.-]?){8,14}\d(?!\w)/g;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The stem a name is matched by — `null` for a name too short to match. */
export function nameStem(word: string): string | null {
  const w = word.trim();
  if (w.length < 3) return null;
  return /[aeiouyąęó]$/i.test(w) && w.length >= 4 ? w.slice(0, -1) : w;
}

/** Letters a declined name may add to its stem. */
export const NAME_ENDING_MAX = 4;

/**
 * A name as it appears in Polish text — declined. "Kowalska" is also
 * "Kowalskiej" and "Kowalską"; "Anna" is "Anny", "Annie", "Annę". The match
 * takes the stem (the name without its final vowel, when it has one) plus up
 * to four letters of ending, between non-letters. "Annalena" has five letters
 * after the stem and stays; a declined form of the name never does.
 */
function wholeWord(words: string[] | undefined): RegExp | null {
  const parts = (words ?? [])
    .map(nameStem)
    .filter((w): w is string => w !== null)
    .map((w) => `${escapeRe(w)}\\p{L}{0,${NAME_ENDING_MAX}}`);
  if (parts.length === 0) return null;
  // Unicode-aware word boundaries: a letter must not sit on either side.
  return new RegExp(`(?<!\\p{L})(?:${parts.join("|")})(?!\\p{L})`, "giu");
}

/** Replace identifiers in free text. Idempotent: placeholders survive a second pass. */
export function redactText(text: string, known: KnownIdentifiers = {}): string {
  let out = text;
  // Known values first — an e-mail passed as known and one found by shape
  // must both end as the same placeholder.
  for (const e of known.emails ?? []) if (e) out = out.split(e).join("{{email}}");
  for (const p of known.phones ?? []) if (p) out = out.split(p).join("{{phone}}");
  for (const n of known.nationalIds ?? []) if (n) out = out.split(n).join("{{nationalId}}");
  out = out.replace(EMAIL, "{{email}}");
  out = out.replace(PESEL, "{{nationalId}}");
  out = out.replace(PHONE, "{{phone}}");
  const first = wholeWord(known.firstNames);
  const last = wholeWord(known.lastNames);
  // Last names first: "Anna Kowalska" → "Anna {{lastName}}" → "{{firstName}} {{lastName}}".
  if (last) out = out.replace(last, "{{lastName}}");
  if (first) out = out.replace(first, "{{firstName}}");
  return out;
}

/**
 * A short, stable pseudonym for a contact: `#a1f3`. Derived from the id with
 * a non-cryptographic hash — it only needs to be consistent inside one
 * installation and to say nothing about the person.
 */
export function pseudonym(contactId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < contactId.length; i++) {
    h ^= contactId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `#${h.toString(16).padStart(8, "0").slice(0, 6)}`;
}

/** Merge identifier lists, for prompts that mention several contacts. */
export function mergeIdentifiers(...lists: (KnownIdentifiers | undefined)[]): KnownIdentifiers {
  const out: Required<KnownIdentifiers> = {
    firstNames: [],
    lastNames: [],
    emails: [],
    phones: [],
    nationalIds: [],
  };
  for (const l of lists) {
    if (!l) continue;
    out.firstNames.push(...(l.firstNames ?? []));
    out.lastNames.push(...(l.lastNames ?? []));
    out.emails.push(...(l.emails ?? []));
    out.phones.push(...(l.phones ?? []));
    out.nationalIds.push(...(l.nationalIds ?? []));
  }
  return out;
}

/** The identifiers of one contact row, in the shape `redactText` expects. */
export function identifiersOf(c: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  pesel?: string | null;
}): KnownIdentifiers {
  return {
    firstNames: c.firstName ? [c.firstName] : [],
    lastNames: c.lastName ? [c.lastName] : [],
    emails: c.email ? [c.email] : [],
    phones: c.phone ? [c.phone] : [],
    nationalIds: c.pesel ? [c.pesel] : [],
  };
}
