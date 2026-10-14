import { describe, expect, test } from "bun:test";
import { claimsIn, gapKey, splitMissing, ungrounded } from "./grounding";

const KB = [
  "### Cennik\nKonsultacja ortopedyczna — 250 zł. USG stawu — 1 200 zł.",
  "### Godziny\nRejestracja czynna pon.–pt. 8:00–18:00, sobota 9–13. Telefon: 22 600 10 20.",
  "### Przygotowanie do USG jamy brzusznej\nNa czczo, 6 godzin bez jedzenia. Wynik w 3 dni.",
];

describe("claimsIn", () => {
  test("prices, hours, dates, phones, durations, percents and links are found, each once", () => {
    const c = claimsIn(
      "Wizyta 12.11 o 8:30 kosztuje 250 zł, rabat 10%, wynik w 3 dni. Tel. 22 600 10 20, www.example.invalid",
    );
    expect(c.map((x) => x.kind)).toEqual([
      "date",
      "time",
      "price",
      "percent",
      "duration",
      "phone",
      "link",
    ]);
  });
  test("a sentence with no facts has no claims", () => {
    expect(claimsIn("Dzień dobry, recepcja potwierdzi szczegóły.")).toEqual([]);
  });
});

describe("ungrounded", () => {
  test("what the base says passes, in any spelling", () => {
    expect(
      ungrounded(
        "Konsultacja kosztuje 250 zł, USG 1200 zł. Rejestracja od 8:00 do 18:00, w sobotę od 9:00. Prosimy przyjść na czczo — 6 godzin bez jedzenia; wynik w ciągu 3 dni. Telefon 22-600-10-20.",
        KB,
      ),
    ).toEqual([]);
  });
  test("an invented price, hour, date, percent or link is caught", () => {
    const bad = ungrounded(
      "Konsultacja kosztuje 300 zł, przyjmujemy do 20:00, wolny termin 14 listopada, rabat 15%, zapisy: https://example.invalid/kalendarz",
      KB,
    ).map((c) => c.text);
    expect(bad).toEqual([
      "300 zł",
      "20:00",
      "14 listopada",
      "15%",
      "https://example.invalid/kalendarz",
    ]);
  });
  test("the conversation is a source too: a date the patient wrote may be repeated", () => {
    expect(
      ungrounded("Potwierdzamy wizytę 20.10 o 10:30.", [
        ...KB,
        "Pacjent: czy mogę 20 października o 10:30?",
      ]),
    ).toEqual([]);
    expect(
      ungrounded("Termin 2026-10-20 potwierdzony: 20.10.", ["Wizyta: 2026-10-20 10:00"]),
    ).toEqual([]);
  });
});

describe("hours from ranges only", () => {
  test("a bare number elsewhere does not ground an hour; an ISO date gives no hours", () => {
    expect(ungrounded("Czynne do 20:00.", ["Telefon 22 600 10 20"]).map((c) => c.text)).toEqual([
      "20:00",
    ]);
    expect(ungrounded("Czynne do 20:00.", ["Wizyta 2026-10-20"]).map((c) => c.text)).toEqual([
      "20:00",
    ]);
    expect(ungrounded("Czynne do 20:00.", ["Czynne 8–20"])).toEqual([]);
  });
});

describe("splitMissing", () => {
  test("the marker line never reaches the patient and becomes a question", () => {
    const r = splitMissing(
      "Dzień dobry, recepcja potwierdzi godziny pracy pracowni.\nBRAK W BAZIE: godziny pracy pracowni RTG",
    );
    expect(r.text).toBe("Dzień dobry, recepcja potwierdzi godziny pracy pracowni.");
    expect(r.missing).toEqual(["godziny pracy pracowni RTG"]);
    expect(splitMissing("Hello.\nnot in knowledge base: X-ray hours").missing).toEqual([
      "X-ray hours",
    ]);
  });
});

describe("gapKey", () => {
  test("case, diacritics and punctuation do not make a second gap", () => {
    expect(gapKey("Czy macie USG?")).toBe(gapKey("czy macie usg"));
    expect(gapKey("Godziny pracy pracowni RTG")).toBe(gapKey("godziny pracy  pracowni rtg!"));
    expect(gapKey("Cena łóżka")).toBe(gapKey("cena lozka"));
  });
});
