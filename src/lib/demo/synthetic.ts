/**
 * Synthetic people and places for the demo — pure, client-safe, deterministic.
 *
 * **Every identifier is synthetic by construction, not by luck.** A public demo
 * fed by a generator that produced a plausible "Anna Kowalska, 601 234 567" would
 * sooner or later produce a real person's number, and a screenshot of the demo
 * would then be a screenshot of somebody's data. So:
 *
 * - surnames come only from an obviously fictional list (Przykładowska, Testowy…),
 * - e-mail addresses end in `@example.test` — a domain reserved by RFC 2606
 *   that can never receive mail,
 * - phone numbers are `+48 000 …` — the `000` prefix is not allocated to any
 *   operator in Poland,
 * - a PESEL, when present, has a **deliberately wrong check digit**, so it can
 *   never be a real one (and `isValidPesel` rejects it, as the boundary check does).
 *
 * `isSyntheticIdentity` states the same rules as a predicate — the tests and
 * the reset's safety check both use it.
 */
import { isValidPesel } from "../pesel";

/** A small, fast PRNG (mulberry32) — `Math.imul`, so it never degenerates past 2^53. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number in [0, 1) fixed for a string — the same visit always gets the same fate. */
export function hashUnit(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return rng(h)();
}

export const pickOne = <T>(r: () => number, list: readonly T[]): T =>
  list[Math.floor(r() * list.length) % list.length];

const FIRST_F = [
  "Anna",
  "Maria",
  "Katarzyna",
  "Magdalena",
  "Agnieszka",
  "Joanna",
  "Ewa",
  "Zofia",
  "Monika",
  "Natalia",
  "Julia",
  "Barbara",
] as const;
const FIRST_M = [
  "Piotr",
  "Jan",
  "Tomasz",
  "Paweł",
  "Michał",
  "Krzysztof",
  "Andrzej",
  "Marek",
  "Jakub",
  "Adam",
  "Łukasz",
  "Stanisław",
] as const;

/** Masculine and feminine form of each — all of them obviously invented. */
export const SYNTHETIC_SURNAMES: readonly (readonly [string, string])[] = [
  ["Przykładowski", "Przykładowska"],
  ["Testowy", "Testowa"],
  ["Demowski", "Demowska"],
  ["Fikcyjny", "Fikcyjna"],
  ["Wzorcowy", "Wzorcowa"],
  ["Symulacki", "Symulacka"],
  ["Próbny", "Próbna"],
  ["Makietowy", "Makietowa"],
  ["Zmyślony", "Zmyślona"],
  ["Umowny", "Umowna"],
];

const SURNAMES = new Set(SYNTHETIC_SURNAMES.flat());

export const SYNTHETIC_EMAIL_DOMAIN = "example.test";
export const SYNTHETIC_PHONE_PREFIX = "+48000";

function ascii(text: string): string {
  return text.toLowerCase().replace(/[ąćęłńóśźż]/g, (ch) => "acelnoszz"["ąćęłńóśźż".indexOf(ch)]);
}

export interface SyntheticPerson {
  firstName: string;
  lastName: string;
  sex: "K" | "M";
  email: string;
  /** `+48000xxxxxx` */
  phone: string;
  /** 11 digits with a wrong check digit, or empty. */
  pesel: string;
}

/**
 * A PESEL-shaped number that is never valid: date part from the birth year,
 * a serial, then the check digit shifted by one from the correct one.
 */
export function syntheticPesel(r: () => number, sex: "K" | "M"): string {
  const year = 1950 + Math.floor(r() * 55);
  const month = 1 + Math.floor(r() * 12) + (year >= 2000 ? 20 : 0);
  const day = 1 + Math.floor(r() * 28);
  const serial = Math.floor(r() * 1000);
  const sexDigit = Math.floor(r() * 5) * 2 + (sex === "M" ? 1 : 0);
  const ten =
    String(year % 100).padStart(2, "0") +
    String(month).padStart(2, "0") +
    String(day).padStart(2, "0") +
    String(serial).padStart(3, "0") +
    String(sexDigit);
  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(ten[i]), 0);
  const correct = (10 - (sum % 10)) % 10;
  return ten + String((correct + 1) % 10);
}

/**
 * One synthetic person. `n` makes the e-mail and phone unique — the generator
 * is called with a running number, so two people never share a contact route
 * and the contact matcher never merges them.
 */
export function syntheticPerson(
  r: () => number,
  n: number,
  withPesel = r() < 0.4,
): SyntheticPerson {
  const sex: "K" | "M" = r() < 0.55 ? "K" : "M";
  const firstName = sex === "K" ? pickOne(r, FIRST_F) : pickOne(r, FIRST_M);
  const pair = pickOne(r, SYNTHETIC_SURNAMES);
  const lastName = sex === "K" ? pair[1] : pair[0];
  const num = String(n % 1_000_000).padStart(6, "0");
  return {
    firstName,
    lastName,
    sex,
    email: `${ascii(firstName)}.${ascii(lastName)}.${num}@${SYNTHETIC_EMAIL_DOMAIN}`,
    phone: `${SYNTHETIC_PHONE_PREFIX}${num}`,
    pesel: withPesel ? syntheticPesel(r, sex) : "",
  };
}

/** True when nothing in this identity could belong to a real person. */
export function isSyntheticIdentity(p: {
  lastName?: string;
  email?: string;
  phone?: string;
  pesel?: string;
}): boolean {
  if (p.lastName && !SURNAMES.has(p.lastName.trim())) return false;
  if (p.email && !p.email.toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`)) return false;
  if (p.phone && !p.phone.replace(/\s/g, "").startsWith(SYNTHETIC_PHONE_PREFIX)) return false;
  if (p.pesel && isValidPesel(p.pesel)) return false;
  return true;
}

// ── the clinic ──────────────────────────────────────────────────────────────

export interface DemoService {
  title: string;
  specialization: string;
  price: number;
  /** Doctors who provide it — indexes into DEMO_DOCTORS. */
  doctors: number[];
}

/** Fictional doctors — the same surname rule as the patients. */
export const DEMO_DOCTORS = [
  "lek. Anna Przykładowska",
  "dr Jan Demowski",
  "lek. Ewa Wzorcowa",
  "dr Marek Testowy",
  "lek. Zofia Symulacka",
  "dr Paweł Makietowy",
] as const;

export const DEMO_SITES = ["Filia Centrum", "Filia Północ"] as const;

export const DEMO_SERVICES: readonly DemoService[] = [
  {
    title: "Konsultacja kardiologiczna",
    specialization: "Kardiologia",
    price: 250,
    doctors: [1, 3],
  },
  { title: "Echo serca", specialization: "Kardiologia", price: 320, doctors: [1] },
  {
    title: "Konsultacja dermatologiczna",
    specialization: "Dermatologia",
    price: 220,
    doctors: [2],
  },
  {
    title: "Konsultacja laryngologiczna",
    specialization: "Laryngologia",
    price: 200,
    doctors: [0, 5],
  },
  { title: "Badanie słuchu", specialization: "Laryngologia", price: 120, doctors: [5] },
  {
    title: "Konsultacja ortopedyczna",
    specialization: "Ortopedia",
    price: 240,
    doctors: [4],
  },
  { title: "USG stawu kolanowego", specialization: "Ortopedia", price: 180, doctors: [4] },
];

export const LEAD_SOURCES = [
  { source: "Meta", medium: "paid_social", campaign: "Profilaktyka serca — jesień" },
  { source: "Meta", medium: "paid_social", campaign: "Badanie słuchu 60+" },
  { source: "Google", medium: "cpc", campaign: "Dermatolog — wyszukiwarka" },
  { source: "Strona www", medium: "formularz", campaign: "" },
] as const;

/** What a patient writes back — canned, so no model is needed to fill the inbox. */
export const PATIENT_REPLIES: readonly {
  channel: "sms" | "email";
  subject: string;
  body: string;
}[] = [
  { channel: "sms", subject: "", body: "Potwierdzam, będę na wizycie." },
  { channel: "sms", subject: "", body: "Czy mogę przełożyć wizytę na przyszły tydzień?" },
  { channel: "sms", subject: "", body: "Proszę o telefon, mam pytanie o skierowanie." },
  { channel: "sms", subject: "", body: "Czy trzeba być na czczo przed badaniem?" },
  {
    channel: "email",
    subject: "Pytanie o cenę",
    body: "Dzień dobry, ile kosztuje konsultacja i czy można zapłacić kartą na miejscu?",
  },
  {
    channel: "email",
    subject: "Odwołanie wizyty",
    body: "Dzień dobry, niestety muszę odwołać wizytę. Proszę o informację o kolejnym wolnym terminie.",
  },
  {
    channel: "email",
    subject: "Parking",
    body: "Czy przy filii jest parking dla pacjentów?",
  },
  {
    channel: "email",
    subject: "Wyniki badań",
    body: "Dzień dobry, czy wyniki badania mogę dostać mailem?",
  },
];
