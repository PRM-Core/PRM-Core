/**
 * Doba warszawska liczona w SQL-u musi zgadzać się z tą liczoną przez `Intl`.
 * Sprawdzane w prawdziwym SQLite, bo to on wykonuje wyrażenie.
 */
import { describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import { warsawDay, warsawOffset } from "../../visits/warsaw-time";
import { bucketExpr, bucketOfDay, dstIntervals, warsawDayExpr, warsawOffsetMs } from "./warsaw-sql";

const HOUR = 60 * 60 * 1000;

// Jeden formatter na cały test: `warsawOffset()` buduje dwa nowe przy każdym
// wywołaniu, przez co pętla po ~35 tys. godzin trwała ponad 3 s i na granicy
// 5 s limitu bun-a wywracała się pod obciążeniem. Samo formatowanie chwili
// gotowym formatterem to ~40 ms.
const intlWarsaw = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Warsaw",
  timeZoneName: "longOffset",
});

/** Offset Warszawy w ms według Intl — niezależnie od kodu produktu. */
function intlOffsetMs(ms: number): number {
  const name = intlWarsaw.formatToParts(ms).find((p) => p.type === "timeZoneName")?.value;
  if (name === "GMT+01:00") return HOUR;
  if (name === "GMT+02:00") return 2 * HOUR;
  throw new Error(`nieoczekiwany offset Intl: ${name}`);
}

describe("reguła czasu letniego", () => {
  test("offset zgadza się z Intl dla każdej godziny 2024–2027", () => {
    let rozbieznosci = 0;
    let godzin = 0;
    for (let ms = Date.UTC(2024, 0, 1); ms < Date.UTC(2028, 0, 1); ms += HOUR) {
      godzin++;
      if (warsawOffsetMs(ms) !== intlOffsetMs(ms)) rozbieznosci++;
    }
    expect(godzin).toBe(35064);
    expect(rozbieznosci).toBe(0);
  });

  test("warsawOffset() z kodu produktu zgadza się z Intl w południe każdej doby i wokół przejść", () => {
    // Pełna pętla po godzinach byłaby tu zbyt wolna (patrz wyżej), więc: każda
    // doba w południe UTC oraz każda godzina w promieniu 3 h od przejścia.
    const sprawdz = (ms: number) =>
      (warsawOffset(ms) === "+02:00" ? 2 * HOUR : HOUR) === intlOffsetMs(ms);
    let rozbieznosci = 0;
    for (let ms = Date.UTC(2024, 0, 1, 12); ms < Date.UTC(2028, 0, 1); ms += 24 * HOUR) {
      if (!sprawdz(ms)) rozbieznosci++;
    }
    for (const [start, end] of dstIntervals(Date.UTC(2024, 0, 1), Date.UTC(2028, 0, 1))) {
      for (const przejscie of [start, end]) {
        for (let h = -3; h <= 3; h++) if (!sprawdz(przejscie + h * HOUR)) rozbieznosci++;
      }
    }
    expect(rozbieznosci).toBe(0);
  });

  test("daty przejść 2026", () => {
    expect(dstIntervals(Date.UTC(2026, 5, 1), Date.UTC(2026, 5, 2))).toEqual([
      [Date.UTC(2026, 2, 29, 1), Date.UTC(2026, 9, 25, 1)],
    ]);
  });
});

describe("warsawDayExpr w SQLite", () => {
  test("każda godzina roku 2026 trafia do tej samej doby co warsawDay", async () => {
    const db = createClient({ url: ":memory:" });
    await db.execute("create table t (ts integer)");
    const from = Date.UTC(2025, 11, 31, 0);
    const to = Date.UTC(2027, 0, 1, 0);
    const values: number[] = [];
    for (let ms = from; ms < to; ms += HOUR) values.push(ms, ms + HOUR - 1);
    for (let i = 0; i < values.length; i += 500) {
      const part = values.slice(i, i + 500);
      await db.execute({
        sql: `insert into t (ts) values ${part.map(() => "(?)").join(",")}`,
        args: part,
      });
    }
    const expr = warsawDayExpr("t.ts", from, to);
    const rows = (await db.execute(`select t.ts as ts, ${expr} as d from t`)).rows;
    let rozbieznosci = 0;
    for (const r of rows) if (r.d !== warsawDay(Number(r.ts))) rozbieznosci++;
    expect(rows.length).toBe(values.length);
    expect(rozbieznosci).toBe(0);
  });

  test("NULL w kolumnie daje NULL, a nie datę z 1970", async () => {
    const db = createClient({ url: ":memory:" });
    await db.execute("create table t (ts integer)");
    await db.execute("insert into t values (null)");
    const expr = warsawDayExpr("t.ts", Date.UTC(2026, 0, 1), Date.UTC(2026, 1, 1));
    const r = (await db.execute(`select ${expr} as d from t`)).rows[0];
    expect(r.d).toBeNull();
  });

  test("nazwa kolumny spoza wzorca jest odrzucana", () => {
    expect(() => warsawDayExpr("t.ts; drop table x", 0, 1)).toThrow();
    expect(() => warsawDayExpr("ts", 0, 1)).toThrow();
  });
});

describe("kubełki tygodnia i miesiąca", () => {
  test("SQL i JS wybierają ten sam poniedziałek i miesiąc dla każdego dnia 2026", async () => {
    const db = createClient({ url: ":memory:" });
    const days: string[] = [];
    for (let ms = Date.UTC(2026, 0, 1); ms < Date.UTC(2027, 0, 1); ms += 24 * HOUR) {
      days.push(new Date(ms).toISOString().slice(0, 10));
    }
    await db.execute("create table d (day text)");
    await db.execute({
      sql: `insert into d (day) values ${days.map(() => "(?)").join(",")}`,
      args: days,
    });
    const rows = (
      await db.execute(
        `select day, ${bucketExpr("week", "d.day")} as w, ${bucketExpr("month", "d.day")} as m from d`,
      )
    ).rows;
    let rozbieznosci = 0;
    for (const r of rows) {
      const d = String(r.day);
      if (r.w !== bucketOfDay("week", d) || r.m !== bucketOfDay("month", d)) rozbieznosci++;
    }
    expect(rows.length).toBe(365);
    expect(rozbieznosci).toBe(0);
  });

  test("tydzień zaczyna się w poniedziałek, także gdy dzień to niedziela", () => {
    expect(bucketOfDay("week", "2026-09-14")).toBe("2026-09-14"); // pon
    expect(bucketOfDay("week", "2026-09-20")).toBe("2026-09-14"); // nd
    expect(bucketOfDay("week", "2026-09-21")).toBe("2026-09-21"); // pon
    expect(bucketOfDay("month", "2026-09-30")).toBe("2026-09");
  });
});
