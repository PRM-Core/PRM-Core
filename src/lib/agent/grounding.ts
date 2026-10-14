/**
 * Grounding — the facts a model may state to a patient, checked in code.
 *
 * The knowledge base is the clinic's single source of facts. A prompt asks
 * the model to use only it; this file makes sure: every checkable fact in a
 * model's text — a price, an hour, a date, a phone number, a duration, a
 * percentage, a link or an address — must appear in the sources it was
 * given (the knowledge base, the conversation, the patient's own data).
 * What does not is reported, never silently trusted.
 *
 * And when the base has no answer, the model says so on a line of its own,
 * which never reaches the patient and becomes a question for whoever keeps
 * the base.
 */

export type ClaimKind = "price" | "time" | "date" | "phone" | "duration" | "percent" | "link";

export interface Claim {
  kind: ClaimKind;
  /** As it stands in the text. */
  text: string;
}

const MONTHS: Record<string, number> = {
  stycznia: 1,
  lutego: 2,
  marca: 3,
  kwietnia: 4,
  maja: 5,
  czerwca: 6,
  lipca: 7,
  sierpnia: 8,
  września: 9,
  wrzesnia: 9,
  października: 10,
  pazdziernika: 10,
  listopada: 11,
  grudnia: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const RE = {
  link: /\bhttps?:\/\/[^\s)]+|\bwww\.[^\s)]+|[\w.+-]+@[\w-]+\.[\w.-]+/gi,
  phone: /(?<![\d])\+?\d[\d\s-]{7,14}\d(?![\d])/g,
  // `\b` in JS knows no Polish letters, so "zł" ends with a lookahead instead.
  price: /(\d[\d\s]{0,7}(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln|złotych|zlotych)(?![\p{L}])/giu,
  time: /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b(?!\.\d)/g,
  dateIso: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
  // "9–13", "od 9 do 16": bare hours a reader takes for opening times.
  hourRange:
    /(?<![\d-])\b([01]?\d|2[0-3])(?:[:.]00)?\s*(?:–|-|do)\s*([01]?\d|2[0-3])(?:[:.]00)?\b/g,
  dateNum: /\b([0-3]?\d)\.([01]?\d)(?:\.(\d{2,4}))?\b/g,
  dateWord: new RegExp(`\\b([0-3]?\\d)\\s+(${Object.keys(MONTHS).join("|")})`, "gi"),
  duration:
    /\b(\d+)\s*(?:min\b|minut\w*|godz\w*|h\b|dni\b|dzień|dnia|tygod\w*|miesi\w*|hours?|days?|weeks?|minutes?)/gi,
  percent: /\b(\d+(?:[.,]\d+)?)\s*%/g,
  number: /\d+(?:[.,]\d+)?/g,
};

const num = (s: string) => s.replace(/\s/g, "").replace(",", ".").replace(/\.0+$/, "");

/** Every checkable fact in a text, in order of appearance. */
export function claimsIn(text: string): Claim[] {
  const out: { at: number; claim: Claim }[] = [];
  const taken: [number, number][] = [];
  const free = (a: number, b: number) => taken.every(([x, y]) => b <= x || a >= y);
  const take = (re: RegExp, kind: ClaimKind) => {
    for (const m of text.matchAll(re)) {
      const a = m.index ?? 0;
      const b = a + m[0].length;
      if (!free(a, b)) continue;
      taken.push([a, b]);
      out.push({ at: a, claim: { kind, text: m[0].trim() } });
    }
  };
  // Most specific first: a link holds digits, a date looks like a time.
  take(RE.link, "link");
  take(RE.price, "price");
  take(RE.dateIso, "date");
  take(RE.dateWord, "date");
  take(RE.dateNum, "date");
  take(RE.time, "time");
  take(RE.phone, "phone");
  take(RE.percent, "percent");
  take(RE.duration, "duration");
  return out.sort((x, y) => x.at - y.at).map((x) => x.claim);
}

interface SourceIndex {
  numbers: Set<string>;
  hours: Set<string>;
  times: Set<string>;
  dates: Set<string>;
  phones: Set<string>;
  text: string;
}

function index(sources: string[]): SourceIndex {
  const text = sources.join("\n").toLowerCase();
  const numbers = new Set<string>();
  for (const m of text.matchAll(RE.number)) numbers.add(num(m[0]));
  // "1 200 zł" is one number to a reader.
  for (const m of text.matchAll(RE.price)) numbers.add(num(m[1]));
  const hours = new Set<string>();
  for (const m of text.matchAll(RE.hourRange)) {
    hours.add(String(Number(m[1])));
    hours.add(String(Number(m[2])));
  }
  const times = new Set<string>();
  for (const m of text.matchAll(RE.time)) times.add(`${Number(m[1])}:${m[2]}`);
  const dates = new Set<string>();
  for (const m of text.matchAll(RE.dateNum)) dates.add(`${Number(m[1])}.${Number(m[2])}`);
  for (const m of text.matchAll(RE.dateWord))
    dates.add(`${Number(m[1])}.${MONTHS[m[2].toLowerCase()]}`);
  // An ISO date in a record (2026-10-20) is the same day as 20.10.
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g))
    dates.add(`${Number(m[3])}.${Number(m[2])}`);
  const phones = new Set<string>();
  for (const m of text.matchAll(RE.phone)) phones.add(m[0].replace(/\D/g, "").slice(-9));
  return { numbers, hours, times, dates, phones, text };
}

function grounded(c: Claim, s: SourceIndex): boolean {
  const t = c.text.toLowerCase();
  switch (c.kind) {
    case "link":
      return s.text.includes(t.replace(/[.,;:]+$/, ""));
    case "phone":
      return s.phones.has(t.replace(/\D/g, "").slice(-9));
    case "price": {
      const m = RE.price.exec(t);
      RE.price.lastIndex = 0;
      return !!m && s.numbers.has(num(m[1]));
    }
    case "time": {
      const m = /([01]?\d|2[0-3])[:.]([0-5]\d)/.exec(t);
      if (!m) return false;
      const h = Number(m[1]);
      // "8:00" is grounded by "8:00", "08.00" or the bare "8" of a range like "8–16".
      return s.times.has(`${h}:${m[2]}`) || (m[2] === "00" && s.hours.has(String(h)));
    }
    case "date": {
      const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
      if (iso) return s.dates.has(`${Number(iso[3])}.${Number(iso[2])}`);
      const word = new RegExp(RE.dateWord.source, "i").exec(t);
      const key = word
        ? `${Number(word[1])}.${MONTHS[word[2].toLowerCase()]}`
        : (() => {
            const m = /([0-3]?\d)\.([01]?\d)/.exec(t);
            return m ? `${Number(m[1])}.${Number(m[2])}` : "";
          })();
      return s.dates.has(key);
    }
    case "duration":
    case "percent": {
      const m = /\d+(?:[.,]\d+)?/.exec(t);
      return !!m && s.numbers.has(num(m[0]));
    }
  }
}

/** The facts in `text` that none of `sources` contains. */
export function ungrounded(text: string, sources: string[]): Claim[] {
  const s = index(sources);
  return claimsIn(text).filter((c) => !grounded(c, s));
}

/** The line a model writes when the base has no answer; never sent to a patient. */
export const MISSING_MARKERS = ["BRAK W BAZIE:", "NOT IN KNOWLEDGE BASE:"];

/** Split a model's text into what goes to the patient and the questions the base could not answer. */
export function splitMissing(text: string): { text: string; missing: string[] } {
  const missing: string[] = [];
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const marker = MISSING_MARKERS.find((m) => trimmed.toUpperCase().startsWith(m));
    if (marker) {
      const q = trimmed.slice(marker.length).trim();
      if (q) missing.push(q);
    } else kept.push(line);
  }
  return { text: kept.join("\n").trim(), missing };
}

/** A question reduced to a key, so "Czy macie USG?" and "czy macie usg" are one gap. */
export function gapKey(question: string): string {
  return question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .slice(0, 120);
}
