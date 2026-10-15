import type { TriageOwner, TriageTopic, TriageUrgency } from "../db/schema";
import { currentLocale, localized, t } from "@/lib/i18n";

/**
 * Triage of a patient's message — pure parts.
 *
 * Reception sees a list of conversations; triage says which one needs a
 * human first, what it is about and who should take it. Rules give an
 * answer for every message with no model at all; a model inside the
 * perimeter may give a better one, and its answer counts only when it fits
 * the three vocabularies below — anything else falls back to the rules.
 */

export const URGENCIES: TriageUrgency[] = ["high", "normal", "low"];
export const TOPICS: TriageTopic[] = [
  "appointment",
  "cancellation",
  "results",
  "prescription",
  "complaint",
  "billing",
  "other",
];
export const OWNERS: TriageOwner[] = ["reception", "doctor", "billing", "manager"];

export interface Triage {
  urgency: TriageUrgency;
  topic: TriageTopic;
  owner: TriageOwner;
  /** One sentence a receptionist can read. */
  reason: string;
}

export const URGENCY_LABELS: Record<TriageUrgency, string> = localized(() => ({
  high: t("pilne"),
  normal: t("zwykłe"),
  low: t("bez pośpiechu"),
}));
export const TOPIC_LABELS: Record<TriageTopic, string> = localized(() => ({
  appointment: t("umówienie wizyty"),
  cancellation: t("odwołanie / przełożenie"),
  results: t("wyniki badań"),
  prescription: t("recepta / leki"),
  complaint: t("skarga"),
  billing: t("płatności"),
  other: t("inne"),
}));
export const OWNER_LABELS: Record<TriageOwner, string> = localized(() => ({
  reception: t("rejestracja"),
  doctor: t("lekarz"),
  billing: t("rozliczenia"),
  manager: t("kierownik"),
}));

/** Lower-case, Polish diacritics folded, so "Pilne!" and "pilne" and "PILNE" are one word. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/ą/g, "a")
    .replace(/ć/g, "c")
    .replace(/ę/g, "e")
    .replace(/ł/g, "l")
    .replace(/ń/g, "n")
    .replace(/ó/g, "o")
    .replace(/ś/g, "s")
    .replace(/[żź]/g, "z");
}

// Stems, not words: Polish inflects, and "odwołać / odwołuję / odwołana" all
// start the same way. English stems ride along for the EN installations.
const STRONG_URGENT = [
  "krwaw",
  "nagl",
  "omdl",
  "silny bol",
  "silne bol",
  "natychmiast",
  "emergency",
  "bleed",
  "severe pain",
  "duszno",
  "zawal",
  "udar",
];
const WEAK_URGENT = [
  "pilne",
  "pilna",
  "pilnie",
  "bol",
  "boli",
  "goraczk",
  "dzis",
  "dzisiaj",
  "jak najszybciej",
  "asap",
  "urgent",
  "pain",
  "today",
  "fever",
];
const THANKS = ["dzieki", "dziekuj", "thank", "pozdrawiam", "super", "swietnie", "ok "];

const TOPIC_STEMS: [TriageTopic, string[]][] = [
  ["complaint", ["skarg", "reklamac", "niezadowol", "oburz", "complain", "unacceptable"]],
  [
    "cancellation",
    ["odwol", "anuluj", "anulow", "przeloz", "przesun", "nie dam rady", "cancel", "reschedul"],
  ],
  ["results", ["wynik", "badani", "badan", "result", "lab "]],
  ["prescription", ["recept", "leki", "lek ", "lekow", "dawk", "prescription", "refill", "tablet"]],
  [
    "billing",
    [
      "faktur",
      "platno",
      "zaplac",
      "cena",
      "koszt",
      "rachun",
      "invoice",
      "payment",
      "price",
      "refund",
    ],
  ],
  ["appointment", ["umow", "termin", "wizyt", "zapis", "appointment", "book", "godzin"]],
];

const OWNER_OF: Record<TriageTopic, TriageOwner> = {
  complaint: "manager",
  results: "doctor",
  prescription: "doctor",
  billing: "billing",
  appointment: "reception",
  cancellation: "reception",
  other: "reception",
};

/** Triage from keywords alone. Always answers; the reason names what it saw. */
export function triageByRules(text: string): Triage {
  const f = fold(text);
  const hits = (stems: string[]) => stems.filter((s) => f.includes(s));

  const strong = hits(STRONG_URGENT);
  const weak = hits(WEAK_URGENT);
  const thanks = f.trim().length < 80 && !f.includes("?") ? hits(THANKS) : [];
  let urgency: TriageUrgency = "normal";
  if (strong.length > 0 || weak.length >= 2) urgency = "high";
  else if (thanks.length > 0) urgency = "low";

  let topic: TriageTopic = "other";
  let topicHits: string[] = [];
  for (const [name, stems] of TOPIC_STEMS) {
    const h = hits(stems);
    if (h.length > 0) {
      topic = name;
      topicHits = h;
      break;
    }
  }
  const seen = [...strong, ...weak, ...thanks, ...topicHits].map((s) => s.trim());
  const reason =
    seen.length > 0
      ? t("Reguły — słowa: {words}.", { words: [...new Set(seen)].join(", ") })
      : t("Reguły — bez słów-kluczy, zwykła wiadomość.");
  return { urgency, topic, owner: OWNER_OF[topic], reason };
}

/** The model's answer is accepted only when it uses the three vocabularies exactly. */
export function parseModelTriage(raw: string): Triage | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o: Record<string, unknown> | null = null;
  // A small model's JSON is often almost JSON: escaped quotes, a comma for a
  // colon. Strict first, then forgiving — but only the three fields, each
  // checked against its vocabulary below, ever count.
  for (const candidate of [m[0], m[0].replace(/\\"/g, '"')]) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        o = parsed as Record<string, unknown>;
        break;
      }
    } catch {
      // try the next form
    }
  }
  if (!o) {
    const field = (name: string) =>
      new RegExp(`"${name}"\\s*[:,]\\s*"([^"]*)"`, "i").exec(m[0].replace(/\\"/g, '"'))?.[1];
    o = {
      urgency: field("urgency"),
      topic: field("topic"),
      owner: field("owner"),
      reason: field("reason"),
    };
  }
  const urgency = String(o.urgency ?? "").toLowerCase() as TriageUrgency;
  const topic = String(o.topic ?? "").toLowerCase() as TriageTopic;
  const owner = String(o.owner ?? "").toLowerCase() as TriageOwner;
  if (!URGENCIES.includes(urgency) || !TOPICS.includes(topic)) return null;
  // Who takes it follows from what it is about — a rule, so the code applies
  // it; a model's owner counts only where the rule leaves a choice ("other").
  const ruled = topic === "other" && OWNERS.includes(owner) ? owner : OWNER_OF[topic];
  const reason = typeof o.reason === "string" ? o.reason.trim().slice(0, 200) : "";
  // "Low" means nothing to do; a message about a visit, a result, a bill or a
  // complaint always has something to do, whatever the model said.
  const floor = urgency === "low" && topic !== "other" ? "normal" : urgency;
  return { urgency: floor, topic, owner: ruled, reason };
}

/** The message as the model sees it, with the team's own verdicts as examples when there are any. */
export function triageUserPrompt(
  channel: string,
  text: string,
  examples: { text: string; label: string }[] = [],
): string {
  const lines = [t("Kanał: {channel}\n\n{text}", { channel, text })];
  if (examples.length > 0) {
    lines.push("");
    lines.push(t("Przykłady ocen zespołu (wiadomość → pilność/temat/właściciel):"));
    examples.forEach((e, i) =>
      lines.push(`${i + 1}. ${e.text.replace(/\s+/g, " ").slice(0, 200)} → ${e.label}`),
    );
  }
  return lines.join("\n");
}

export function triageSystemPrompt(): string {
  return [
    t(
      "Pomagasz rejestracji placówki medycznej uporządkować wiadomości od pacjentów. Dostaniesz treść ostatnich wiadomości pacjenta (dane osobowe zastąpione symbolami). Oceń: jak pilna jest sprawa, czego dotyczy i kto powinien ją przejąć.",
    ),
    t(
      "Pilność: high — zdrowie lub dzisiejszy termin wymaga reakcji teraz; normal — sprawa do załatwienia (każda prośba o termin, zmianę albo odwołanie wizyty, pytanie, skarga); low — tylko podziękowanie albo wiadomość, przy której nie ma nic do zrobienia.",
    ),
    t(
      "Temat: appointment — umówienie nowej wizyty; cancellation — odwołanie, przełożenie albo zmiana terminu już umówionej wizyty; results — wyniki badań; prescription — recepta, leki, dawki; complaint — skarga, niezadowolenie; billing — płatności, faktury, ceny; other — pozostałe.",
    ),
    t(
      "Właściciel wynika z tematu: results i prescription → doctor; complaint → manager; billing → billing; pozostałe → reception.",
    ),
    t(
      'Nie udzielasz porad medycznych i nie odpowiadasz pacjentowi; w uzasadnieniu nie powtarzaj nazw leków ani dawek. Odpowiedz wyłącznie JSON w jednej linii: {"urgency":"…","topic":"…","owner":"…","reason":"jedno zdanie dla rejestracji"}. Język zdania: {lang}.',
      { lang: currentLocale() === "en" ? "English" : "polski" },
    ),
  ].join("\n");
}
