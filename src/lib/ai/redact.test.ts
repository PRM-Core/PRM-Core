import { describe, expect, test } from "bun:test";
import { identifiersOf, pseudonym, redactText } from "./redact";

describe("redactText — by shape", () => {
  test("e-mail, phone and PESEL disappear wherever they are", () => {
    const text =
      "Pacjentka pisze z anna.kowalska@example.invalid, tel. +48 600 100 200, PESEL 90010112345.";
    const out = redactText(text);
    expect(out).toBe("Pacjentka pisze z {{email}}, tel. {{phone}}, PESEL {{nationalId}}.");
  });
  test("dates and short numbers are not phones", () => {
    const text = "Wizyta 2026-09-12 o 10:30, gabinet 12, cena 150 zł, 3 wizyty.";
    expect(redactText(text)).toBe(text);
  });
  test("a date with its time is not a phone", () => {
    const text =
      "Dziś: 2026-10-16 19:41. Wizyty: 2026-10-23 05:08, 2026-10-05T09:30:00, 23.10.2026, 05:08.";
    expect(redactText(text)).toBe(text);
  });
  test("a phone right after a date is still a phone", () => {
    expect(redactText("2026-10-16 19:41 tel. 600 100 200")).toBe("2026-10-16 19:41 tel. {{phone}}");
  });
  test("phone formats seen in Polish data", () => {
    for (const p of [
      "600100200",
      "600-100-200",
      "+48 600 100 200",
      "0048 600100200",
      "+1 415 555 0132",
    ]) {
      expect(redactText(`tel: ${p} ok`)).toBe("tel: {{phone}} ok");
    }
  });
});

describe("redactText — known identifiers", () => {
  const known = identifiersOf({
    firstName: "Anna",
    lastName: "Kowalska",
    email: "anna.k@example.invalid",
    phone: "+48 600 100 200",
    pesel: "90010112345",
  });
  test("names as whole words, in any case", () => {
    expect(redactText("Dzień dobry, Anna Kowalska! Pani ANNA pytała.", known)).toBe(
      "Dzień dobry, {{firstName}} {{lastName}}! Pani {{firstName}} pytała.",
    );
  });
  test("declined forms go too; a longer name that merely starts the same stays", () => {
    expect(
      redactText("Dzwoniłem do Anny Kowalskiej, potem do pani Kowalskiej z Anną.", known),
    ).toBe("Dzwoniłem do {{firstName}} {{lastName}}, potem do pani {{lastName}} z {{firstName}}.");
    expect(redactText("Annalena to inna osoba", known)).toBe("Annalena to inna osoba");
  });
  test("the exact known values go even when the shape would not catch them", () => {
    expect(redactText("tel +48 600 100 200 / 90010112345", known)).toBe(
      "tel {{phone}} / {{nationalId}}",
    );
  });
  test("idempotent", () => {
    const once = redactText("Anna Kowalska <anna.k@example.invalid>", known);
    expect(redactText(once, known)).toBe(once);
  });
});

describe("pseudonym", () => {
  test("stable, short, and not the id", () => {
    expect(pseudonym("contact-123")).toBe(pseudonym("contact-123"));
    expect(pseudonym("contact-123")).not.toBe(pseudonym("contact-124"));
    expect(pseudonym("contact-123")).toMatch(/^#[0-9a-f]{6}$/);
    expect(pseudonym("contact-123")).not.toContain("123");
  });
});
