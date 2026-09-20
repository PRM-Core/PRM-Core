import { describe, expect, test } from "bun:test";
import { findSource, type ReportWidget } from "./catalog";
import { resolveRange, shapeResult, timeBuckets } from "./results";

const w = (p: Partial<ReportWidget>): ReportWidget => ({
  id: "w",
  type: "table",
  title: "",
  width: "full",
  source: "visits",
  measures: ["count"],
  dimensions: [],
  filters: [],
  limit: 15,
  ...p,
});
const labelOf = (_d: string, v: string) => v.toUpperCase();
const visits = findSource("visits")!;
const emails = findSource("emails")!;

describe("resolveRange", () => {
  const today = "2026-09-15";
  test("presety liczone od dziś", () => {
    expect(resolveRange({ preset: "7", from: "", to: "" }, today)).toEqual({
      from: "2026-09-09",
      to: today,
    });
    expect(resolveRange({ preset: "this_month", from: "", to: "" }, today)).toEqual({
      from: "2026-09-01",
      to: today,
    });
    expect(resolveRange({ preset: "this_year", from: "", to: "" }, today)).toEqual({
      from: "2026-01-01",
      to: today,
    });
  });

  test("poprzedni miesiąc, także przez przełom roku", () => {
    expect(resolveRange({ preset: "last_month", from: "", to: "" }, today)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(resolveRange({ preset: "last_month", from: "", to: "" }, "2027-01-10")).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
    expect(resolveRange({ preset: "last_month", from: "", to: "" }, "2028-03-05")).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  test("własny zakres: błędy po polsku, limit trzech lat", () => {
    expect(resolveRange({ preset: "custom", from: "", to: "" }, today)).toEqual({
      error: "Podaj obie daty zakresu.",
    });
    expect(
      resolveRange({ preset: "custom", from: "2020-01-01", to: "2026-01-01" }, today),
    ).toHaveProperty("error");
    expect(resolveRange({ preset: "custom", from: "2024-01-01", to: "2026-09-15" }, today)).toEqual(
      {
        from: "2024-01-01",
        to: "2026-09-15",
      },
    );
  });
});

describe("timeBuckets", () => {
  test("tygodnie od poniedziałku, miesiące bez powtórzeń", () => {
    expect(timeBuckets("week", "2026-09-02", "2026-09-15")).toEqual([
      "2026-08-31",
      "2026-09-07",
      "2026-09-14",
    ]);
    expect(timeBuckets("month", "2026-08-30", "2026-10-01")).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });
});

describe("shapeResult", () => {
  test("liczba bez danych: zero dla sumowalnych, brak dla średniej", () => {
    const r = shapeResult({
      widget: w({ type: "table", measures: ["count", "avg_price"], dimensions: [] }),
      source: visits,
      raw: [],
      from: "2026-09-01",
      to: "2026-09-02",
      labelOf,
    });
    expect(r.rows).toEqual([{ m0: 0, m1: null }]);
  });

  test("kategorie: od największej, ucięte do limitu z informacją", () => {
    const raw = ["a", "b", "c", "d"].map((d, i) => ({ d0: d, m0: i + 1 }));
    const r = shapeResult({
      widget: w({ type: "bar", dimensions: ["doctor"], limit: 2 }),
      source: visits,
      raw,
      from: "2026-09-01",
      to: "2026-09-02",
      labelOf,
    });
    expect(r.rows.map((x) => x.d0)).toEqual(["d", "c"]);
    expect(r.truncated).toEqual({ shown: 2, total: 4 });
  });

  test("pusta wartość wymiaru to „(brak)”, reszta przez etykiety", () => {
    const r = shapeResult({
      widget: w({ dimensions: ["doctor"] }),
      source: visits,
      raw: [
        { d0: "", m0: 1 },
        { d0: "nowak", m0: 2 },
        { d0: null, m0: 3 },
      ],
      from: "2026-09-01",
      to: "2026-09-02",
      labelOf,
    });
    expect(r.rows.map((x) => x.d0_label)).toEqual(["(brak)", "NOWAK", "(brak)"]);
  });

  test("czas: puste okresy wypełnione, rosnąco", () => {
    const r = shapeResult({
      widget: w({ type: "line", dimensions: ["day"], measures: ["count", "avg_price"] }),
      source: visits,
      raw: [{ d0: "2026-09-03", m0: 5, m1: 120 }],
      from: "2026-09-01",
      to: "2026-09-03",
      labelOf,
    });
    expect(r.rows.map((x) => [x.d0, x.m0, x.m1])).toEqual([
      ["2026-09-01", 0, null],
      ["2026-09-02", 0, null],
      ["2026-09-03", 5, 120],
    ]);
  });

  test("rozbicie na serie: pivot, najliczniejsze serie, puste komórki", () => {
    const raw = [
      { d0: "2026-09-01", d1: "Kardiolog", m0: 4 },
      { d0: "2026-09-02", d1: "Kardiolog", m0: 1 },
      { d0: "2026-09-02", d1: "Ortopeda", m0: 9 },
    ];
    const r = shapeResult({
      widget: w({ type: "line", dimensions: ["day", "specialization"] }),
      source: visits,
      raw,
      from: "2026-09-01",
      to: "2026-09-02",
      labelOf,
    });
    expect(r.series).toEqual([
      { key: "s0", value: "Ortopeda", label: "ORTOPEDA" },
      { key: "s1", value: "Kardiolog", label: "KARDIOLOG" },
    ]);
    expect(r.rows).toEqual([
      { d0: "2026-09-01", d0_label: "2026-09-01", s0: 0, s1: 4 },
      { d0: "2026-09-02", d0_label: "2026-09-02", s0: 9, s1: 1 },
    ]);
  });

  test("rozbicie wskaźnika: brak danych w serii to brak, nie 0%", () => {
    const r = shapeResult({
      widget: w({
        type: "bar",
        source: "emails",
        measures: ["open_rate"],
        dimensions: ["template", "origin"],
      }),
      source: emails,
      raw: [
        { d0: "Newsletter", d1: "campaign", m0: 0.4 },
        { d0: "Przypomnienie", d1: "other", m0: 0.2 },
      ],
      from: "2026-09-01",
      to: "2026-09-02",
      labelOf,
    });
    const newsletter = r.rows.find((x) => x.d0 === "Newsletter")!;
    const inna = r.series!.find((s) => s.value === "other")!.key;
    expect(newsletter[inna]).toBeNull();
  });

  test("więcej serii niż się mieści: informacja o ucięciu", () => {
    const raw = Array.from({ length: 11 }, (_, i) => ({ d0: "x", d1: `s${i}`, m0: i + 1 }));
    const r = shapeResult({
      widget: w({ type: "bar", dimensions: ["doctor", "specialization"] }),
      source: visits,
      raw,
      from: "2026-09-01",
      to: "2026-09-02",
      labelOf,
    });
    expect(r.series).toHaveLength(8);
    expect(r.seriesTruncated).toEqual({ shown: 8, total: 11 });
  });

  test("tabela z dwoma wymiarami: grupy obok siebie, największa grupa pierwsza", () => {
    const raw = [
      { d0: "mala", d1: "x", m0: 1 },
      { d0: "duza", d1: "x", m0: 3 },
      { d0: "duza", d1: "y", m0: 5 },
    ];
    const r = shapeResult({
      widget: w({ type: "table", dimensions: ["doctor", "specialization"] }),
      source: visits,
      raw,
      from: "2026-09-01",
      to: "2026-09-02",
      labelOf,
    });
    expect(r.rows.map((x) => `${x.d0}/${x.d1}`)).toEqual(["duza/y", "duza/x", "mala/x"]);
  });
});

describe("partialBuckets — niepełne okresy", () => {
  test("tydzień obcięty z obu stron zakresu", async () => {
    const { partialBuckets } = await import("./results");
    // 18.06.2026 to czwartek, 15.09.2026 to wtorek.
    expect(partialBuckets("week", "2026-06-18", "2026-09-15")).toEqual([
      "2026-06-15",
      "2026-09-14",
    ]);
  });

  test("pełne tygodnie od poniedziałku do niedzieli nie są niepełne", async () => {
    const { partialBuckets } = await import("./results");
    expect(partialBuckets("week", "2026-09-07", "2026-09-20")).toEqual([]);
  });

  test("miesiące, także luty w roku przestępnym", async () => {
    const { partialBuckets } = await import("./results");
    expect(partialBuckets("month", "2028-02-01", "2028-02-29")).toEqual([]);
    expect(partialBuckets("month", "2028-02-01", "2028-02-28")).toEqual(["2028-02"]);
    expect(partialBuckets("month", "2026-08-17", "2026-09-30")).toEqual(["2026-08"]);
  });

  test("dni nigdy nie są niepełne", async () => {
    const { partialBuckets } = await import("./results");
    expect(partialBuckets("day", "2026-09-01", "2026-09-15")).toEqual([]);
  });
});
