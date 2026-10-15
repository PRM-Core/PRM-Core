/**
 * The calendar arithmetic behind the time-based triggers, on paper. PESEL
 * numbers are generated here with a valid checksum — no real person's.
 */
import { describe, expect, test } from "bun:test";
import {
  addMonths,
  birthDateFromPesel,
  birthdayDue,
  birthdayIn,
  daysBetween,
  recallDue,
} from "./time-triggers";

/** Ten digits plus the checksum that makes them a well-formed PESEL. */
function withChecksum(head: string): string {
  const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const sum = head.split("").reduce((acc, c, i) => acc + Number(c) * w[i], 0);
  return head + String((10 - (sum % 10)) % 10);
}

/** A valid PESEL for a date of birth — the century goes into the month. */
export function peselFor(day: string, serial = "0001"): string {
  const [y, m, d] = day.split("-").map(Number);
  const offset = y >= 2200 ? 60 : y >= 2100 ? 40 : y >= 2000 ? 20 : y >= 1900 ? 0 : 80;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return withChecksum(`${p2(y % 100)}${p2(m + offset)}${p2(d)}${serial}`);
}

describe("calendar months", () => {
  test("the same day N months later", () => {
    expect(addMonths("2025-10-15", 12)).toBe("2026-10-15");
    expect(addMonths("2025-11-30", 3)).toBe("2026-02-28");
    expect(addMonths("2023-08-31", 6)).toBe("2024-02-29");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  test("days between two dates", () => {
    expect(daysBetween("2026-10-15", "2026-10-22")).toBe(7);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2); // across the change of time
  });
});

describe("recall due", () => {
  test("from the date for a week; not before, not long after — unless overdue is asked for", () => {
    expect(recallDue("2025-10-15", 12, "2026-10-14", false)).toBe(false);
    expect(recallDue("2025-10-15", 12, "2026-10-15", false)).toBe(true);
    expect(recallDue("2025-10-15", 12, "2026-10-22", false)).toBe(true);
    expect(recallDue("2025-10-15", 12, "2026-10-23", false)).toBe(false);
    expect(recallDue("2022-01-10", 12, "2026-10-15", false)).toBe(false);
    expect(recallDue("2022-01-10", 12, "2026-10-15", true)).toBe(true);
  });

  test("a nonsense number of months fires nothing", () => {
    expect(recallDue("2025-10-15", 0, "2026-10-15", true)).toBe(false);
    expect(recallDue("2025-10-15", Number.NaN, "2026-10-15", true)).toBe(false);
  });
});

describe("date of birth from a PESEL", () => {
  test("the century is in the month", () => {
    expect(birthDateFromPesel(peselFor("1985-03-07"))).toBe("1985-03-07");
    expect(birthDateFromPesel(peselFor("2005-12-24"))).toBe("2005-12-24");
    expect(birthDateFromPesel(peselFor("1899-01-01"))).toBe("1899-01-01");
  });

  test("a wrong checksum, a wrong length or an impossible day is no date", () => {
    const ok = peselFor("1985-03-07");
    const typo = ok.slice(0, 10) + String((Number(ok[10]) + 1) % 10);
    expect(birthDateFromPesel(typo)).toBeNull();
    expect(birthDateFromPesel("1234")).toBeNull();
    expect(birthDateFromPesel("")).toBeNull();
    // 31 February and month 13, each with a checksum that passes.
    expect(birthDateFromPesel(withChecksum("9002310001"))).toBeNull();
    expect(birthDateFromPesel(withChecksum("9013010001"))).toBeNull();
  });

  test("spaces and dashes are ignored", () => {
    const p = peselFor("1985-03-07");
    expect(birthDateFromPesel(`${p.slice(0, 6)}-${p.slice(6)}`)).toBe("1985-03-07");
  });
});

describe("birthdays", () => {
  test("29 February falls on 28 February in a common year", () => {
    expect(birthdayIn("2000-02-29", 2026)).toBe("2026-02-28");
    expect(birthdayIn("2000-02-29", 2028)).toBe("2028-02-29");
  });

  test("only on the day itself", () => {
    expect(birthdayDue("1985-10-15", "2026-10-15")).toBe(true);
    expect(birthdayDue("1985-10-15", "2026-10-16")).toBe(false);
    expect(birthdayDue("1985-10-15", "2026-10-14")).toBe(false);
  });
});
