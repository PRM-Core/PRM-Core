import { NAME_ENDING_MAX, nameStem, redactText } from "../ai/redact";
import { leakedIdentifiers } from "./grounding";
import { draftSystemPrompt, draftTextOk, draftUserPrompt, type DraftFacts } from "./language";
import {
  OWNERS,
  OWNER_LABELS,
  TOPICS,
  TOPIC_LABELS,
  URGENCIES,
  triageSystemPrompt,
  triageUserPrompt,
} from "./triage";
import type { TriageOwner, TriageTopic, TriageUrgency } from "../db/schema";
import { t } from "@/lib/i18n";

/**
 * The training set for a LoRA adapter — pure parts.
 *
 * What the team decided (`agent_examples`) becomes chat lines in the shape
 * the product really sends: the production system prompt, the production
 * user prompt, and the team's answer as the assistant's turn. The set is
 * for an adapter trained and kept inside this installation; it is never
 * shared between clinics.
 *
 * Every line is checked again before it is written, whatever was done when
 * the example was stored: a line with an e-mail address, a phone number, a
 * national ID, a contact pseudonym or a contact's surname is refused, not
 * cleaned — an example that got past pseudonymisation once is not trusted
 * to be fixed by a second pass.
 */

/** Below this many lines an adapter learns noise rather than a house style. */
export const TRAINING_MIN_EXAMPLES = 200;
/** The share of lines held out for validation (MLX `valid.jsonl`). */
export const VALID_SHARE = 0.1;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface ChatLine {
  messages: ChatMessage[];
}

/** One stored example, with the draft it came from when one is found. */
export interface TrainingExample {
  id: string;
  kind: string;
  channel: string;
  text: string;
  label: string;
  /** The draft an approved text belongs to — its title, audience and rule template. */
  draft?: Omit<DraftFacts, "channel"> | null;
}

export type RefusalReason = "identifier" | "rules" | "label" | "context";

/**
 * Surnames of the installation's contacts, as stems — the same stems the
 * pseudonymisation layer matches (`nameStem`), so a declined form counts.
 */
export interface NameIndex {
  stems: Set<string>;
}

export function buildNameIndex(lastNames: Iterable<string | null | undefined>): NameIndex {
  const stems = new Set<string>();
  for (const n of lastNames) {
    // A double-barrelled surname is two names.
    for (const part of (n ?? "").split(/[\s-]+/)) {
      const s = nameStem(part);
      if (s) stems.add(s.toLocaleLowerCase("pl"));
    }
  }
  return { stems };
}

const WORD = /\p{L}+/gu;

/**
 * The surname a text still contains, or null. A name is written with a
 * capital letter, so only capitalised words count — otherwise a surname
 * that is also a word ("Zima", "Lis") would refuse every line saying
 * "zimą". Words the product's own prompt uses ("Dzień dobry") are not
 * read as surnames either: they are in the prompt, not from a patient.
 */
export function surnameIn(
  text: string,
  names: NameIndex,
  productWords: Set<string>,
): string | null {
  if (names.stems.size === 0) return null;
  for (const m of text.matchAll(WORD)) {
    const word = m[0];
    if (word[0] === word[0].toLocaleLowerCase("pl")) continue;
    const lower = word.toLocaleLowerCase("pl");
    if (productWords.has(lower)) continue;
    for (let k = 0; k <= NAME_ENDING_MAX && lower.length - k >= 3; k++)
      if (names.stems.has(lower.slice(0, lower.length - k))) return word;
  }
  return null;
}

function wordsOf(text: string): Set<string> {
  return new Set([...text.matchAll(WORD)].map((m) => m[0].toLocaleLowerCase("pl")));
}

/** What still identifies someone in a text, in a short phrase — or null when nothing does. */
export function identifierIn(
  text: string,
  names: NameIndex = { stems: new Set() },
  productWords: Set<string> = new Set(),
): string | null {
  // Shapes — e-mail, phone, PESEL: the redaction layer would change the text.
  if (redactText(text) !== text) return "shape";
  if (leakedIdentifiers(text).length > 0) return "pseudonym";
  return surnameIn(text, names, productWords) ? "surname" : null;
}

function draftLine(e: TrainingExample): ChatLine | RefusalReason {
  const channel = e.channel === "email" ? "email" : e.channel === "sms" ? "sms" : null;
  if (!channel || !e.draft) return "context";
  // The product's own rules: a text the checker would refuse today is not a
  // text to teach, even if someone approved it before the rule existed.
  if (!draftTextOk(e.text, channel).ok) return "rules";
  return {
    messages: [
      { role: "system", content: draftSystemPrompt(channel) },
      { role: "user", content: draftUserPrompt({ ...e.draft, channel }) },
      { role: "assistant", content: e.text.trim() },
    ],
  };
}

function triageLine(e: TrainingExample): ChatLine | RefusalReason {
  const [urgency, topic, owner] = e.label.split("/") as [TriageUrgency, TriageTopic, TriageOwner];
  if (!URGENCIES.includes(urgency) || !TOPICS.includes(topic) || !OWNERS.includes(owner))
    return "label";
  // The team gave a verdict, not a reason; the sentence is built from it, so
  // the adapter learns the format and the verdict, not invented reasons.
  const reason = t("Ocena zespołu: {topic}, przejmuje: {owner}.", {
    topic: TOPIC_LABELS[topic],
    owner: OWNER_LABELS[owner],
  });
  return {
    messages: [
      { role: "system", content: triageSystemPrompt() },
      { role: "user", content: triageUserPrompt(e.channel || "sms", e.text.trim()) },
      { role: "assistant", content: JSON.stringify({ urgency, topic, owner, reason }) },
    ],
  };
}

/** One example as a chat line, or why it was refused. */
export function toChatLine(
  e: TrainingExample,
  names: NameIndex = { stems: new Set() },
): ChatLine | RefusalReason {
  if (!e.text.trim()) return "context";
  const line =
    e.kind === "draft" ? draftLine(e) : e.kind === "triage" ? triageLine(e) : ("context" as const);
  if (typeof line === "string") return line;
  const system = line.messages.find((m) => m.role === "system")?.content ?? "";
  const productWords = wordsOf(system);
  // The system prompt is product code; what came from a person is checked.
  for (const m of line.messages)
    if (m.role !== "system" && identifierIn(m.content, names, productWords)) return "identifier";
  return line;
}

/** Stable split: the same example always lands on the same side. */
function heldOut(id: string): boolean {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 1000 < VALID_SHARE * 1000;
}

export interface TrainingSet {
  ok: boolean;
  /** Why nothing should be written — below the minimum. Empty when ok. */
  reason: string;
  train: ChatLine[];
  valid: ChatLine[];
  counts: { draft: number; triage: number; total: number };
  refused: Record<RefusalReason, number>;
  minimum: number;
}

export function buildTrainingSet(
  examples: TrainingExample[],
  names: NameIndex = { stems: new Set() },
  minimum = TRAINING_MIN_EXAMPLES,
): TrainingSet {
  const refused: Record<RefusalReason, number> = { identifier: 0, rules: 0, label: 0, context: 0 };
  const counts = { draft: 0, triage: 0, total: 0 };
  const train: ChatLine[] = [];
  const valid: ChatLine[] = [];
  for (const e of examples) {
    const line = toChatLine(e, names);
    if (typeof line === "string") {
      refused[line] += 1;
      continue;
    }
    counts[e.kind === "draft" ? "draft" : "triage"] += 1;
    counts.total += 1;
    (heldOut(e.id) ? valid : train).push(line);
  }
  // MLX needs a validation file that is not empty.
  if (valid.length === 0 && train.length > 1) valid.push(train.pop()!);
  const ok = counts.total >= minimum;
  return {
    ok,
    reason: ok
      ? ""
      : t(
          "Za mało przykładów do dostrojenia: {n} z wymaganych {min}. Adapter z tak małego zbioru uczy się przypadku, nie stylu placówki — zbierzcie więcej zatwierdzonych draftów i poprawionych ocen.",
          { n: counts.total, min: minimum },
        ),
    train: ok ? train : [],
    valid: ok ? valid : [],
    counts,
    refused,
    minimum,
  };
}

export function toJsonl(lines: ChatLine[]): string {
  return lines.map((l) => JSON.stringify(l)).join("\n") + (lines.length ? "\n" : "");
}
