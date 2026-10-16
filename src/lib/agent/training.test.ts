/**
 * The training set for a LoRA adapter — pure parts. Synthetic examples
 * only: nothing here is a patient.
 */
import { describe, expect, test } from "bun:test";
import {
  buildNameIndex,
  buildTrainingSet,
  identifierIn,
  toChatLine,
  toJsonl,
  TRAINING_MIN_EXAMPLES,
  type ChatLine,
  type TrainingExample,
} from "./training";
import { parseModelTriage } from "./triage";

const facts = {
  title: "Zaproszenie na wizytę kontrolną",
  audienceSignal: "visits.lapsed",
  audienceCount: 42,
  detail: "ostatnia wizyta ponad rok temu",
  templateMessage: "Dzień dobry {{firstName}}, minął rok od ostatniej wizyty.",
};

const draft = (id: string, text: string, withDraft = true): TrainingExample => ({
  id,
  kind: "draft",
  channel: "sms",
  text,
  label: "",
  draft: withDraft ? facts : null,
});

const triage = (
  id: string,
  text: string,
  label = "normal/appointment/reception",
): TrainingExample => ({
  id,
  kind: "triage",
  channel: "",
  text,
  label,
});

const GOOD_SMS =
  "Dzień dobry {{firstName}}, zapraszamy na wizytę kontrolną. Prosimy o kontakt z rejestracją.";

describe("an identifier left in a text", () => {
  test("is found by shape: e-mail, phone, PESEL", () => {
    expect(identifierIn("Proszę pisać na jan.test@example.invalid")).toBe("shape");
    expect(identifierIn("Mój numer to +48 600 100 200")).toBe("shape");
    expect(identifierIn("PESEL 90010112345 w karcie")).toBe("shape");
  });

  test("is found as a pseudonym or a patient number", () => {
    expect(identifierIn("Pacjent #a1b2c3 prosi o termin")).toBe("pseudonym");
    expect(identifierIn("Dotyczy PRM-1042")).toBe("pseudonym");
  });

  test("is found as a contact's surname, in a declined form too", () => {
    const names = buildNameIndex(["Testowska", "Przykładny-Zmyślony"]);
    expect(identifierIn("Rozmawiałam z panią Testowską wczoraj", names)).toBe("surname");
    expect(identifierIn("Tu Zmyślony, proszę o fakturę", names)).toBe("surname");
  });

  test("a surname that is also a word counts only when capitalised, and never as a word of the prompt", () => {
    const names = buildNameIndex(["Zima", "Dobry"]);
    expect(identifierIn("Zapraszamy zimą na badania", names)).toBeNull();
    expect(identifierIn("Pan Zima prosi o termin", names)).toBe("surname");
    // "Dobry" is a surname and a word of every greeting the product writes.
    expect(identifierIn("Dzień Dobry, proszę o termin", names, new Set(["dobry"]))).toBeNull();
  });

  test("placeholders are not identifiers", () => {
    expect(identifierIn("Dzień dobry {{firstName}} {{lastName}}, {{phone}}")).toBeNull();
  });
});

describe("a chat line", () => {
  test("for an approved draft is the production prompt with the team's text as the answer", () => {
    const line = toChatLine(draft("d1", GOOD_SMS)) as ChatLine;
    expect(line.messages.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
    expect(line.messages[0].content).toContain("{{firstName}}");
    expect(line.messages[1].content).toContain(facts.title);
    expect(line.messages[1].content).toContain(facts.templateMessage);
    expect(line.messages[2].content).toBe(GOOD_SMS);
  });

  test("without the rule template it leaves the template line out, not empty", () => {
    const line = toChatLine({
      ...draft("d1", GOOD_SMS),
      draft: { ...facts, templateMessage: "" },
    }) as ChatLine;
    expect(line.messages[1].content.split("\n")).toHaveLength(2);
  });

  test("for a corrected triage answers in the JSON the product parses, with the team's verdict", () => {
    const line = toChatLine(
      triage("t1", "Proszę o przesunięcie wizyty na inny dzień.", "normal/cancellation/reception"),
    ) as ChatLine;
    const parsed = parseModelTriage(line.messages[2].content);
    expect(parsed).toMatchObject({ urgency: "normal", topic: "cancellation", owner: "reception" });
    expect(parsed?.reason).not.toBe("");
  });

  test("is refused when a text breaks today's draft rules, a label is unknown or the draft is missing", () => {
    expect(
      toChatLine(draft("d1", "Dzień dobry {{firstName}}, proszę brać 400 mg dwa razy dziennie.")),
    ).toBe("rules");
    expect(toChatLine(triage("t1", "Proszę o termin.", "urgent/whatever/nobody"))).toBe("label");
    expect(toChatLine(draft("d1", GOOD_SMS, false))).toBe("context");
    expect(toChatLine({ ...draft("d1", GOOD_SMS), kind: "dismissal" })).toBe("context");
  });

  test("is refused when anything a person wrote still has an identifier", () => {
    const names = buildNameIndex(["Testowska"]);
    expect(toChatLine(triage("t1", "Tu Testowska, proszę o termin."), names)).toBe("identifier");
    expect(toChatLine(triage("t2", "Proszę oddzwonić: 600 100 200"))).toBe("identifier");
    expect(
      toChatLine({ ...draft("d1", GOOD_SMS), draft: { ...facts, detail: "m.in. #a1b2c3" } }),
    ).toBe("identifier");
  });
});

describe("the training set", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      i % 2 === 0
        ? draft(`d${i}`, GOOD_SMS)
        : triage(`t${i}`, "Chciałabym umówić wizytę kontrolną w przyszłym tygodniu."),
    );

  test("is written only from the minimum up, with refused lines counted and left out", () => {
    const names = buildNameIndex(["Testowska"]);
    const examples = [
      ...many(TRAINING_MIN_EXAMPLES),
      triage("x1", "Tu Testowska, proszę o termin."),
      triage("x2", "Mój e-mail: ktos@example.invalid"),
      triage("x3", "Pacjent PRM-77 prosi o wynik."),
    ];
    const set = buildTrainingSet(examples, names);
    expect(set.ok).toBe(true);
    expect(set.counts.total).toBe(TRAINING_MIN_EXAMPLES);
    expect(set.refused.identifier).toBe(3);
    expect(set.train.length + set.valid.length).toBe(TRAINING_MIN_EXAMPLES);
    expect(set.valid.length).toBeGreaterThan(0);
    expect(set.valid.length).toBeLessThan(set.train.length / 3);
    const jsonl = toJsonl([...set.train, ...set.valid]);
    for (const secret of ["Testowska", "ktos@example.invalid", "PRM-77"])
      expect(jsonl).not.toContain(secret);
    // One JSON object per line, as MLX and the other trainers read it.
    for (const l of jsonl.trim().split("\n")) expect(JSON.parse(l).messages).toHaveLength(3);
  });

  test("below the minimum is refused whole — nothing to write, and the reason says how many", () => {
    const set = buildTrainingSet(many(TRAINING_MIN_EXAMPLES - 1));
    expect(set.ok).toBe(false);
    expect(set.train).toEqual([]);
    expect(set.valid).toEqual([]);
    expect(set.reason).toContain(String(TRAINING_MIN_EXAMPLES - 1));
    expect(set.reason).toContain(String(TRAINING_MIN_EXAMPLES));
  });

  test("puts the same example on the same side every time", () => {
    const a = buildTrainingSet(many(300));
    const b = buildTrainingSet(many(300).reverse());
    expect(a.valid.length).toBe(b.valid.length);
  });
});
