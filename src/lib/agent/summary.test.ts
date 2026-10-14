import { describe, expect, test } from "bun:test";
import { preview, summarize, type SummaryFacts } from "./summary";

const AT = Date.parse("2026-09-01T08:00:00Z");
const base: SummaryFacts = {
  completed: 0,
  noShows: 0,
  cancelled: 0,
  firstVisitAt: null,
  lastVisit: null,
  nextVisit: null,
  lastInbound: null,
  openTriage: null,
  lastOutbound: null,
};

describe("summarize", () => {
  test("always three sentences: visits, ahead, correspondence", () => {
    expect(summarize(base)).toEqual([
      "Jeszcze bez odbytej wizyty.",
      "Nic nie jest umówione.",
      "Bez korespondencji w systemie.",
    ]);
  });

  test("a regular patient with a risky visit ahead and a question waiting", () => {
    const [visits, ahead, mail] = summarize({
      ...base,
      completed: 4,
      noShows: 1,
      firstVisitAt: AT - 400 * 86_400_000,
      lastVisit: { at: AT, title: "Kontrola", doctor: "lek. Jan Kowalski" },
      nextVisit: { at: AT + 20 * 86_400_000, title: "USG", doctor: "", risk: 0.41 },
      lastInbound: {
        at: AT + 86_400_000,
        channel: "sms",
        preview: "Czy mogę przesunąć wizytę?",
        answered: false,
      },
      openTriage: { urgency: "normal", topic: "cancellation" },
    });
    expect(visits).toMatch(
      /4 odbytych wizyt, ostatnio 01\.09\.2026 \(Kontrola, lek\. Jan Kowalski\); nieobecności: 1\./,
    );
    expect(ahead).toMatch(/USG.*ryzyko nieobecności 41%/);
    expect(mail).toMatch(
      /^Czeka na odpowiedź od 02\.09\.2026 \(sms\): „Czy mogę przesunąć wizytę\?” — zwykłe, odwołanie/,
    );
  });

  test("an answered message, or only the clinic writing, says so", () => {
    expect(
      summarize({
        ...base,
        lastInbound: { at: AT, channel: "email", preview: "Dziękuję", answered: true },
      })[2],
    ).toMatch(/— odpowiedziano\./);
    expect(
      summarize({
        ...base,
        lastOutbound: { at: AT, channel: "email", subject: "Przypomnienie", opened: false },
      })[2],
    ).toBe(
      "Bez wiadomości od pacjenta; ostatnia od placówki 01.09.2026 (e-mail: „Przypomnienie”, nieotwarta).",
    );
  });

  test("a low risk is not worth a word; cancellations alone are counted", () => {
    expect(
      summarize({ ...base, nextVisit: { at: AT, title: "Kontrola", doctor: "", risk: 0.1 } })[1],
    ).not.toMatch(/ryzyko/);
    expect(summarize({ ...base, cancelled: 2 })[0]).toBe(
      "Jeszcze bez odbytej wizyty (2 odwołanych).",
    );
  });
});

describe("preview", () => {
  test("one line, cut with an ellipsis", () => {
    expect(preview("a\n  b")).toBe("a b");
    expect(preview("x".repeat(100), 10)).toBe(`${"x".repeat(9)}…`);
  });
});
