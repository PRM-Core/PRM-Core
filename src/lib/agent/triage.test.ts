import { describe, expect, test } from "bun:test";
import { parseModelTriage, triageByRules } from "./triage";

describe("triageByRules", () => {
  test("a bleeding patient is urgent, for the doctor's eyes it is still the front desk that picks up", () => {
    const r = triageByRules("Dzień dobry, po zabiegu wciąż KRWAWI i boli, co robić?");
    expect(r.urgency).toBe("high");
    expect(r.owner).toBe("reception");
    expect(r.reason).toContain("krwaw");
  });
  test("two weak signals make it urgent; one does not", () => {
    expect(triageByRules("Czy mogę dziś przyjść? To pilne.").urgency).toBe("high");
    expect(triageByRules("Czy mogę przyjść dziś?").urgency).toBe("normal");
  });
  test("topics by stem, inflection and case aside; the owner follows the topic", () => {
    expect(triageByRules("Chciałabym ODWOŁAĆ wizytę z piątku").topic).toBe("cancellation");
    expect(triageByRules("Czy wyniki badań już są?").topic).toBe("results");
    expect(triageByRules("Czy wyniki badań już są?").owner).toBe("doctor");
    expect(triageByRules("Proszę o receptę na leki").topic).toBe("prescription");
    expect(triageByRules("Nie dostałem faktury za wizytę").owner).toBe("billing");
    expect(triageByRules("Składam skargę na obsługę").owner).toBe("manager");
    expect(triageByRules("Chcę umówić wizytę u kardiologa").topic).toBe("appointment");
    expect(triageByRules("I would like to cancel my appointment").topic).toBe("cancellation");
  });
  test("a complaint outranks the appointment it mentions", () => {
    expect(triageByRules("Skarga: wizyta odwołana bez uprzedzenia, termin przepadł").topic).toBe(
      "complaint",
    );
  });
  test("a short thank-you is low; a thank-you with a question is not", () => {
    expect(triageByRules("Dziękuję, pozdrawiam!").urgency).toBe("low");
    expect(triageByRules("Dziękuję! A kiedy wyniki?").urgency).toBe("normal");
  });
  test("nothing recognised: normal, other, reception, and the reason says so", () => {
    const r = triageByRules("Lorem ipsum");
    expect(r).toMatchObject({ urgency: "normal", topic: "other", owner: "reception" });
    expect(r.reason).toMatch(/bez słów/);
  });
});

describe("parseModelTriage", () => {
  test("JSON inside chatter is fine; vocabularies are enforced; reason is trimmed", () => {
    expect(
      parseModelTriage(
        'Oto ocena: {"urgency":"HIGH","topic":"results","owner":"doctor","reason":"  Pyta o wynik, boi się.  "}',
      ),
    ).toEqual({
      urgency: "high",
      topic: "results",
      owner: "doctor",
      reason: "Pyta o wynik, boi się.",
    });
    expect(
      parseModelTriage('{"urgency":"critical","topic":"results","owner":"doctor"}'),
    ).toBeNull();
    expect(parseModelTriage('{"urgency":"high","topic":"money","owner":"doctor"}')).toBeNull();
    // The owner follows the topic — a rule the code applies, whatever the model said.
    expect(parseModelTriage('{"urgency":"high","topic":"billing","owner":"ceo"}')?.owner).toBe(
      "billing",
    );
    expect(
      parseModelTriage('{"urgency":"normal","topic":"results","owner":"reception"}')?.owner,
    ).toBe("doctor");
    // Low urgency is for messages with nothing to do — never a topic with work in it.
    expect(
      parseModelTriage('{"urgency":"low","topic":"cancellation","owner":"reception"}')?.urgency,
    ).toBe("normal");
    expect(parseModelTriage('{"urgency":"low","topic":"other","owner":"reception"}')?.urgency).toBe(
      "low",
    );
    // Only where the rule leaves a choice does the model's owner count.
    expect(parseModelTriage('{"urgency":"normal","topic":"other","owner":"manager"}')?.owner).toBe(
      "manager",
    );
    expect(parseModelTriage("no json here")).toBeNull();
    expect(parseModelTriage("{broken")).toBeNull();
  });
});
