/**
 * Granice doby warszawskiej, od których zależy, do którego dnia wpada zdarzenie.
 */
import { describe, expect, test } from "bun:test";
import { warsawDay } from "../visits/warsaw-time";
import { dayLocator, daysBetween, shiftDay } from "./activity";
import { warsawMidnight } from "./activity.server";

describe("warsawMidnight", () => {
  test("zwykły dzień letni i zimowy", () => {
    expect(new Date(warsawMidnight("2026-09-14")).toISOString()).toBe("2026-09-13T22:00:00.000Z");
    expect(new Date(warsawMidnight("2026-12-01")).toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });

  test("dni zmiany czasu mają północ ze starym offsetem", () => {
    // Zegar przestawia się o 2:00–3:00, więc północ 29.03 jest jeszcze w CET,
    // a północ 25.10 jeszcze w CEST. Offset z południa tego samego dnia dawał
    // tu granicę przesuniętą o godzinę.
    expect(new Date(warsawMidnight("2026-03-29")).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(new Date(warsawMidnight("2026-10-25")).toISOString()).toBe("2026-10-24T22:00:00.000Z");
  });

  test("granica jest dokładna: ostatnia milisekunda należy do poprzedniego dnia", () => {
    for (const day of ["2026-03-28", "2026-03-29", "2026-03-30", "2026-10-25", "2026-10-26"]) {
      const t = warsawMidnight(day);
      expect(warsawDay(t)).toBe(day);
      expect(warsawDay(t - 1)).not.toBe(day);
    }
  });
});

describe("dayLocator — przypisanie chwili do doby bez formatowania dat", () => {
  test("zgadza się z warsawDay co do godziny przez obie zmiany czasu", () => {
    // Porównanie z wolną, ale pewną ścieżką dla każdej pełnej godziny roku 2026.
    const days = daysBetween("2026-01-01", "2026-12-31");
    const starts = [...days, shiftDay("2026-12-31", 1)].map(warsawMidnight);
    const dayOf = dayLocator(days, starts);
    let rozbieznosci = 0;
    for (let ms = starts[0]; ms < starts[starts.length - 1]; ms += 60 * 60 * 1000) {
      if (dayOf(ms) !== warsawDay(ms)) rozbieznosci++;
    }
    expect(rozbieznosci).toBe(0);
  });

  test("końce zakresu: pierwsza chwila w środku, ostatnia milisekunda też, dalej już nie", () => {
    const days = ["2026-09-13", "2026-09-14"];
    const starts = ["2026-09-13", "2026-09-14", "2026-09-15"].map(warsawMidnight);
    const dayOf = dayLocator(days, starts);
    expect(dayOf(starts[0])).toBe("2026-09-13");
    expect(dayOf(starts[1] - 1)).toBe("2026-09-13");
    expect(dayOf(starts[1])).toBe("2026-09-14");
    expect(dayOf(starts[2] - 1)).toBe("2026-09-14");
    expect(dayOf(starts[2])).toBeNull();
    expect(dayOf(starts[0] - 1)).toBeNull();
  });

  test("źle podane granice to wyjątek, nie cicho przesunięte dni", () => {
    expect(() => dayLocator(["2026-09-14"], [1])).toThrow();
  });
});
