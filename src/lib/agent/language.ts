import { currentLocale, t } from "@/lib/i18n";

/**
 * The language layer — pure parts.
 *
 * A model inside the perimeter may rewrite what the rules produced: the brief
 * in plain language, a draft message from the facts behind a signal. The
 * rules stay the source of truth, so this file holds the two checks that
 * decide whether a model's text is accepted at all. If a check fails the
 * template text stays; nobody sees a number the data did not contain.
 */

export const SMS_MAX = 320;
export const EMAIL_MAX = 1500;

/** Every number in a text, in order: "18%" → "18", "+20 pp" → "20", "2026-10-13" → "2026", "10", "13". */
export function factTokens(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    // A model may number the lines a template bulleted — that "1." is not a
    // fact; and a date written 13.10.2026 is three numbers, not a decimal.
    const line = rawLine
      .replace(/^\s*\d+[.)]\s+/, "")
      .replace(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/g, "$1 $2 $3");
    for (const m of line.matchAll(/\d+(?:[.,]\d+)?/g)) out.push(m[0].replace(",", "."));
  }
  return out;
}

export interface FactCheck {
  ok: boolean;
  /** Numbers of the original the rewrite lost. */
  missing: string[];
  /** Numbers the rewrite contains that the original did not. */
  invented: string[];
}

/** A rewrite keeps the facts when it carries every number of the original and none of its own. */
export function keepsFacts(original: string, polished: string): FactCheck {
  const count = (tokens: string[]) => {
    const m = new Map<string, number>();
    for (const x of tokens) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const a = count(factTokens(original));
  const b = count(factTokens(polished));
  const missing: string[] = [];
  const invented: string[] = [];
  for (const [k, n] of a) if ((b.get(k) ?? 0) < n) missing.push(k);
  for (const k of b.keys()) if (!a.has(k)) invented.push(k);
  return { ok: missing.length === 0 && invented.length === 0, missing, invented };
}

export interface DraftCheck {
  ok: boolean;
  reason: string;
}

/**
 * A draft message a model wrote is accepted when it addresses the patient by
 * the placeholder, uses no other field, invents no link, number or phone,
 * carries no markup and fits the channel.
 */
export function draftTextOk(text: string, channel: "sms" | "email"): DraftCheck {
  const s = text.trim();
  if (!s) return { ok: false, reason: t("pusta treść") };
  if (!s.includes("{{firstName}}")) return { ok: false, reason: t("brak pola {{firstName}}") };
  const fields = [...s.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]);
  if (fields.some((f) => f !== "firstName"))
    return { ok: false, reason: t("użyte pole inne niż {{firstName}}") };
  if (/https?:\/\/|www\./i.test(s)) return { ok: false, reason: t("wymyślony link") };
  if (/\d{3,}/.test(s)) return { ok: false, reason: t("wymyślona liczba, numer albo data") };
  if (/<[a-z/!][^>]*>/i.test(s)) return { ok: false, reason: t("znaczniki HTML") };
  const max = channel === "sms" ? SMS_MAX : EMAIL_MAX;
  if (s.length > max) return { ok: false, reason: t("za długa ({n} znaków)", { n: s.length }) };
  return { ok: true, reason: "" };
}

function languageName(): string {
  return currentLocale() === "en" ? "English" : "polski";
}

export function briefSystemPrompt(): string {
  return [
    t(
      "Jesteś redaktorem w placówce medycznej. Dostaniesz brief dla zarządu napisany z szablonu. Przepisz go tak, żeby czytało się go jak notatkę od człowieka: pełne zdania, krótkie akapity, bez żargonu.",
    ),
    t(
      "Zasady bezwzględne: zachowaj każdą liczbę dokładnie w tej postaci (procenty, liczby wizyt, daty, punkty procentowe); nie dodawaj żadnych faktów, liczb, nazwisk ani ocen, których nie ma w oryginale; zachowaj kolejność sekcji i ich nagłówki; zostaw ostatnie zdanie o zatwierdzaniu.",
    ),
    t("Język: {lang}. Odpowiedz wyłącznie tekstem briefu, bez komentarza.", {
      lang: languageName(),
    }),
  ].join("\n");
}

export function draftSystemPrompt(channel: "sms" | "email"): string {
  return [
    t(
      "Piszesz w imieniu placówki medycznej krótką wiadomość do pacjentów. Dostaniesz cel wiadomości, kanał i tło w liczbach. Napisz jedną wiadomość: uprzejmą, w formie grzecznościowej, bez żargonu i bez porad medycznych.",
    ),
    t(
      "Zasady bezwzględne: zacznij od „Dzień dobry {{firstName}}”; nie używaj innych pól niż {{firstName}}; nie wymyślaj terminów, cen, numerów telefonu, adresów ani linków — pacjent odpowie na wiadomość albo zadzwoni do rejestracji; bez formatowania i bez HTML.",
    ),
    channel === "sms"
      ? t("Kanał: SMS — maksymalnie {n} znaków.", { n: SMS_MAX })
      : t("Kanał: e-mail — do pięciu zdań, zwykły tekst."),
    t("Język: {lang}. Odpowiedz wyłącznie treścią wiadomości.", { lang: languageName() }),
  ].join("\n");
}

export interface DraftFacts {
  title: string;
  channel: "sms" | "email";
  audienceSignal: string;
  audienceCount: number;
  /** What the audience has in common, as the rule describes it. */
  detail: string;
  /** The rule's own text — a starting point, not a constraint. */
  templateMessage: string;
}

export function draftUserPrompt(f: DraftFacts, examples: string[] = []): string {
  const lines = [
    t("Cel: {title}", { title: f.title }),
    t("Kto dostanie: {n} pacjentów — {detail}", { n: f.audienceCount, detail: f.detail }),
    t("Wersja robocza z szablonu (możesz napisać lepiej): {text}", { text: f.templateMessage }),
  ];
  if (examples.length > 0) {
    // What the team approved before — the house style, not a constraint on content.
    lines.push(t("Przykłady zatwierdzone przez zespół (tak piszemy u nas):"));
    examples.forEach((e, i) => lines.push(`${i + 1}. ${e}`));
  }
  return lines.join("\n");
}
