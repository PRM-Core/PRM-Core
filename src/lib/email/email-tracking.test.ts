/**
 * Śledzenie w wysyłanej treści — bez bazy i bez sieci: sama zamiana tekstu.
 */
import { describe, expect, test } from "bun:test";
import { injectTracking } from "./email-tracking.server";

const BAZA = "https://crm.przyklad.pl";

describe("injectTracking", () => {
  const html = `<html><head><link href="%%BASE_URL%%/fonts/studio.css" rel="stylesheet"></head><body><a style="color:red" href="https://przyklad.pl/wizyta">Umów</a></body></html>`;
  const wynik = injectTracking(html, "tok", BAZA);

  test("arkusz czcionek z adresu instalacji, bez przekierowania kliknięć", () => {
    expect(wynik).toContain(`<link href="${BAZA}/fonts/studio.css" rel="stylesheet">`);
    expect(wynik).not.toContain("%%BASE_URL%%");
  });

  test("odnośnik <a> idzie przez licznik kliknięć", () => {
    expect(wynik).toContain(
      `<a style="color:red" href="${BAZA}/e/click/tok?u=${encodeURIComponent("https://przyklad.pl/wizyta")}">`,
    );
  });

  test("piksel otwarcia na końcu treści", () => {
    expect(wynik).toContain(`${BAZA}/e/open/tok`);
  });
});
