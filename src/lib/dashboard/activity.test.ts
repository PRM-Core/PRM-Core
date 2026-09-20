/**
 * Liczenie karty „Aktywność pacjentów".
 *
 * Najwięcej miejsca zajmują daty, bo tam błędy są niewidoczne: przesunięcie
 * o dobę przy zmianie czasu albo porównanie z niepełnym tygodniem daje liczby,
 * które wyglądają wiarygodnie i są nieprawdziwe.
 */
import { describe, expect, test } from "bun:test";
import {
  buildActivity,
  change,
  daysBetween,
  fetchStart,
  isDay,
  rangeError,
  rangeLength,
  shiftDay,
  type ContactRow,
  type TouchRow,
} from "./activity";

describe("daty kalendarzowe", () => {
  test("isDay odrzuca daty, których nie ma w kalendarzu", () => {
    expect(isDay("2026-09-14")).toBe(true);
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("2026-9-14")).toBe(false);
    expect(isDay("")).toBe(false);
  });

  test("shiftDay przechodzi przez miesiące i lata", () => {
    expect(shiftDay("2026-09-14", -7)).toBe("2026-09-07");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2027-01-03", -7)).toBe("2026-12-27");
  });

  test("zmiana czasu nie dubluje ani nie gubi dnia", () => {
    // 2026-03-29 i 2026-10-25 to doby 23- i 25-godzinne w Polsce. Dodawanie
    // 24 h w czasie lokalnym potrafiło tu dać tę samą datę dwa razy.
    expect(daysBetween("2026-03-28", "2026-03-30")).toEqual([
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
    ]);
    expect(daysBetween("2026-10-24", "2026-10-26")).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ]);
  });

  test("rangeLength liczy oba końce", () => {
    expect(rangeLength("2026-09-08", "2026-09-14")).toBe(7);
    expect(rangeLength("2026-09-14", "2026-09-14")).toBe(1);
    expect(rangeLength("2025-09-14", "2026-09-14")).toBe(366);
  });

  test("rangeError zatrzymuje zakresy, których nie da się policzyć", () => {
    expect(rangeError("2026-09-01", "2026-09-14")).toBeNull();
    expect(rangeError("2026-09-14", "2026-09-01")).toContain("późniejsza");
    expect(rangeError("", "2026-09-14")).toContain("obie daty");
    expect(rangeError("2025-01-01", "2026-09-14")).toContain("366");
  });

  test("fetchStart sięga dość daleko także dla krótkiego zakresu", () => {
    // 30 dni: wystarczy tydzień przed początkiem.
    expect(fetchStart("2026-08-16", "2026-09-14")).toBe("2026-08-09");
    // 3 dni: „poprzedni tydzień" liczony od końca zaczyna się 13 dni wcześniej,
    // czyli przed `from − 7`.
    expect(fetchStart("2026-09-12", "2026-09-14")).toBe("2026-09-01");
  });
});

describe("change — zmiana tydzień do tygodnia", () => {
  test("wzrost i spadek", () => {
    expect(change(12, 10)).toEqual({ fraction: 0.2, isNew: false, direction: "up" });
    expect(change(8, 10)).toEqual({ fraction: -0.2, isNew: false, direction: "down" });
  });

  test("drobne wahania to „stabilnie”, nie trend", () => {
    // 41 → 42 to +2,4% — zielona strzałka byłaby tu przesadą.
    expect(change(42, 41).direction).toBe("flat");
    expect(change(40, 41).direction).toBe("flat");
  });

  test("zero wcześniej nie daje procentu", () => {
    expect(change(5, 0)).toEqual({ fraction: null, isNew: true, direction: "up" });
    expect(change(0, 0)).toEqual({ fraction: null, isNew: false, direction: "none" });
  });

  test("spadek do zera to -100%, nie brak danych", () => {
    expect(change(0, 4)).toEqual({ fraction: -1, isNew: false, direction: "down" });
  });
});

describe("buildActivity", () => {
  const kontakty: ContactRow[] = [
    // tydzień wcześniej (07–13.09)
    { createdAt: "2026-09-07", status: "patient" },
    { createdAt: "2026-09-07", status: "lead" },
    { createdAt: "2026-09-10", status: "patient" },
    // ten tydzień (08–14.09 przy zakresie kończącym się 14.09)
    { createdAt: "2026-09-14", status: "patient" },
    { createdAt: "2026-09-14", status: "patient" },
    { createdAt: "2026-09-14", status: "lead" },
    { createdAt: "2026-09-14", status: "" },
  ];

  test("nowe kontakty w rozbiciu na statusy, pusty status jako lead", () => {
    const r = buildActivity({
      from: "2026-09-14",
      to: "2026-09-14",
      statuses: [],
      contacts: kontakty,
      touches: [],
    });
    expect(r.days).toHaveLength(1);
    expect(r.days[0].nowe).toBe(4);
    expect(r.days[0].byStatus).toEqual({ patient: 2, lead: 2 });
    expect(r.statuses).toEqual(["patient", "lead"]);
  });

  test("filtr „tylko pacjenci” działa na nowe kontakty", () => {
    const r = buildActivity({
      from: "2026-09-14",
      to: "2026-09-14",
      statuses: ["patient"],
      contacts: kontakty,
      touches: [],
    });
    expect(r.days[0].nowe).toBe(2);
    expect(r.days[0].byStatus).toEqual({ patient: 2 });
  });

  test("filtr po „lead” łapie też kontakty z pustym statusem", () => {
    const r = buildActivity({
      from: "2026-09-14",
      to: "2026-09-14",
      statuses: ["lead"],
      contacts: kontakty,
      touches: [],
    });
    expect(r.days[0].nowe).toBe(2);
  });

  test("każdy dzień ma odniesienie do tego samego dnia tydzień wcześniej", () => {
    const r = buildActivity({
      from: "2026-09-14",
      to: "2026-09-14",
      statuses: [],
      contacts: kontakty,
      touches: [],
    });
    expect(r.days[0].tydzienWczesniej).toEqual({ date: "2026-09-07", nowe: 2, aktywni: 0 });
  });

  test("porównanie z tygodniem wcześniej respektuje filtr", () => {
    // Inaczej „tylko pacjenci” porównywaliby się z wszystkimi kontaktami
    // sprzed tygodnia i pokazywali spadek, którego nie ma.
    const r = buildActivity({
      from: "2026-09-14",
      to: "2026-09-14",
      statuses: ["patient"],
      contacts: kontakty,
      touches: [],
    });
    expect(r.days[0].tydzienWczesniej.nowe).toBe(1);
  });

  test("tydzień jest zawsze pełny, nawet przy zakresie jednodniowym", () => {
    const r = buildActivity({
      from: "2026-09-14",
      to: "2026-09-14",
      statuses: [],
      contacts: kontakty,
      touches: [],
    });
    expect(r.tydzien).toMatchObject({ od: "2026-09-08", do: "2026-09-14", nowe: 5 });
    expect(r.poprzedniTydzien).toMatchObject({ od: "2026-09-01", do: "2026-09-07", nowe: 2 });
  });

  test("dni bez danych są w wyniku jako zera, a nie dziury na osi", () => {
    const r = buildActivity({
      from: "2026-09-11",
      to: "2026-09-14",
      statuses: [],
      contacts: kontakty,
      touches: [],
    });
    expect(r.days.map((d) => d.date)).toEqual([
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
    ]);
    expect(r.days.map((d) => d.nowe)).toEqual([0, 0, 0, 4]);
  });

  describe("aktywni", () => {
    const dotkniecia: TouchRow[] = [
      { contactId: "a", day: "2026-09-13", status: "patient" },
      { contactId: "a", day: "2026-09-13", status: "patient" },
      { contactId: "a", day: "2026-09-14", status: "patient" },
      { contactId: "b", day: "2026-09-14", status: "lead" },
    ];

    test("kilka zdarzeń tej samej osoby tego dnia to jeden aktywny", () => {
      const r = buildActivity({
        from: "2026-09-13",
        to: "2026-09-14",
        statuses: [],
        contacts: [],
        touches: dotkniecia,
      });
      expect(r.days.map((d) => d.aktywni)).toEqual([1, 2]);
    });

    test("aktywni w tygodniu to różne osoby, nie suma dni", () => {
      // „a" był aktywny dwa dni — to wciąż jedna osoba.
      const r = buildActivity({
        from: "2026-09-13",
        to: "2026-09-14",
        statuses: [],
        contacts: [],
        touches: dotkniecia,
      });
      expect(r.razem.aktywni).toBe(2);
      expect(r.tydzien.aktywni).toBe(2);
    });

    test("filtr statusów dotyczy też aktywnych", () => {
      const r = buildActivity({
        from: "2026-09-13",
        to: "2026-09-14",
        statuses: ["patient"],
        contacts: [],
        touches: dotkniecia,
      });
      expect(r.days.map((d) => d.aktywni)).toEqual([1, 1]);
    });
  });
});
