/**
 * Time-based triggers — the calendar arithmetic, with no database and no
 * clock, so the edge cases (the end of a month, 29 February, a PESEL from
 * 2005) are tested on paper.
 *
 * Every other trigger reacts to an event that just happened. Recurring care
 * has no such event: nobody books "a year since my last check-up". These
 * triggers fire when a date comes — N months after the last visit, or a
 * birthday — and the engine's scan turns that date into an ordinary event.
 */

/** A calendar day, "YYYY-MM-DD". */
export type Day = string;

const pad = (n: number) => String(n).padStart(2, "0");
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number) =>
  [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

function parts(day: Day): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y, m, d];
}

/**
 * The same day N months later — the end of the month when that day does not
 * exist: 31 January + 1 month is 28 (or 29) February, not 3 March.
 */
export function addMonths(day: Day, months: number): Day {
  const [y, m, d] = parts(day);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysIn(ny, nm)))}`;
}

/** Days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: Day, b: Day): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * The date of birth a PESEL encodes, or null when it is not a valid PESEL.
 *
 * The month carries the century: +80 for the 1800s, +0 for the 1900s, +20
 * for the 2000s, +40 and +60 after that. The last digit is a checksum — a
 * typo in the number must not send someone birthday wishes on a wrong day.
 */
export function birthDateFromPesel(pesel: string): Day | null {
  const digits = pesel.replace(/[\s-]/g, "");
  if (!/^\d{11}$/.test(digits)) return null;
  const n = digits.split("").map(Number);
  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const sum = weights.reduce((acc, w, i) => acc + w * n[i], 0);
  if ((10 - (sum % 10)) % 10 !== n[10]) return null;

  const yy = n[0] * 10 + n[1];
  const mm = n[2] * 10 + n[3];
  const dd = n[4] * 10 + n[5];
  const centuries: [number, number][] = [
    [80, 1800],
    [60, 2200],
    [40, 2100],
    [20, 2000],
    [0, 1900],
  ];
  const found = centuries.find(([offset]) => mm > offset && mm <= offset + 12);
  if (!found) return null;
  const year = found[1] + yy;
  const month = mm - found[0];
  if (dd < 1 || dd > daysIn(year, month)) return null;
  return `${year}-${pad(month)}-${pad(dd)}`;
}

/** The birthday in a given year — 28 February for someone born on 29 February, in a common year. */
export function birthdayIn(birth: Day, year: number): Day {
  const [, m, d] = parts(birth);
  return `${year}-${pad(m)}-${pad(Math.min(d, daysIn(year, m)))}`;
}

/** How far back a newly due date still counts — a scan missed for a few days catches up. */
export const CATCH_UP_DAYS = 7;

/**
 * Is a recall due today, N months after the last visit?
 *
 * "Newly due" (the default) fires only within a week of the date, so turning
 * an automation on does not send to everyone whose last visit was years
 * ago; "overdue" fires for all of them too — a win-back for a list built
 * over years, paced by the sending limits.
 */
export function recallDue(
  lastVisit: Day,
  months: number,
  today: Day,
  includeOverdue: boolean,
): boolean {
  if (!Number.isFinite(months) || months < 1) return false;
  const due = addMonths(lastVisit, Math.floor(months));
  const late = daysBetween(due, today);
  return late >= 0 && (includeOverdue || late <= CATCH_UP_DAYS);
}

/** Is today this person's birthday? */
export function birthdayDue(birth: Day, today: Day): boolean {
  const [ty] = parts(today);
  const late = daysBetween(birthdayIn(birth, ty), today);
  // Only the day itself: a birthday wish a week late is worse than none.
  return late === 0;
}
