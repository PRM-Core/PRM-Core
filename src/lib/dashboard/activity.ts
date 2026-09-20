import { t as tr } from "@/lib/i18n"; /**
 * „Aktywność pacjentów" na pulpicie — liczenie, bez bazy danych.
 *
 * Wydzielone z funkcji serwerowej, bo to tu siedzą decyzje, które łatwo
 * pomylić po cichu: granice doby, porównanie z tym samym dniem tygodnia
 * i filtr statusów. Moduł jest czysty (bez `node:*` i bez bazy), więc importują
 * go i serwer, i ekran — ten sam kod liczy zmianę procentową po obu stronach.
 *
 * **Status to status bieżący**, nie ten z dnia zdarzenia. Historia zmian
 * statusu nie jest zapisywana, więc „tylko pacjenci" znaczy: kontakty, które
 * DZIŚ są pacjentami. Lead z zeszłego wtorku, który w piątek umówił wizytę,
 * liczy się we wtorek jako pacjent.
 */

export const MAX_RANGE_DAYS = 366;
export const WEEK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pasmo, w którym zmianę tydzień do tygodnia nazywamy „stabilnie".
 *
 * Bez niego 41 → 42 nowych kontaktów świeciłoby się na zielono jako wzrost,
 * a to zwykłe wahanie. 5% to próg umowny — ma tylko odsiać szum.
 */
export const STABLE_BAND = 0.05;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Czy tekst to poprawna data kalendarzowa `RRRR-MM-DD` (także 2026-02-30 → nie). */
export function isDay(value: string): boolean {
  if (!DAY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Przesunięcie o pełne dni **kalendarzowe**.
 *
 * Liczone na północy UTC, a nie w strefie procesu: w UTC nie ma zmiany czasu,
 * więc „dzień później" jest zawsze dokładnie następną datą. W czasie lokalnym
 * doba z przestawieniem zegarów ma 23 albo 25 godzin i dodawanie 24 h potrafi
 * dać tę samą datę dwa razy.
 */
export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Liczba dni w zakresie, z obydwoma końcami włącznie. */
export function rangeLength(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** Kolejne daty od `from` do `to` włącznie. */
export function daysBetween(from: string, to: string): string[] {
  const n = rangeLength(from, to);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(shiftDay(from, i));
  return out;
}

/**
 * Od którego dnia serwer musi pobrać dane, żeby porównanie było kompletne.
 *
 * Dwa punkty odniesienia sięgają przed zakres: „ten sam dzień tydzień
 * wcześniej" dla pierwszego dnia (`from − 7`) i „poprzedni tydzień" liczony od
 * końca zakresu (`to − 13`). Przy zakresie krótszym niż tydzień ten drugi jest
 * wcześniejszy — pobranie tylko od `from − 7` dałoby w porównaniu zaniżone zero.
 */
export function fetchStart(from: string, to: string): string {
  const a = shiftDay(from, -WEEK_DAYS);
  const b = shiftDay(to, -(2 * WEEK_DAYS - 1));
  return a < b ? a : b;
}

/**
 * Szybkie przypisanie chwili do doby — bez formatowania dat w pętli.
 *
 * `days[i]` trwa od `starts[i]` (włącznie) do `starts[i + 1]` (wyłącznie), więc
 * `starts` ma o jeden element więcej niż `days`: ostatni to początek doby
 * następnej po zakresie. Chwila poza zakresem daje `null`.
 *
 * **Po co.** Formatowanie daty ze strefą czasową (`toLocaleDateString` z
 * `timeZone`) jest wolne. Dla rocznego zakresu i 270 tys. wpisów dziennika
 * zajmowało 11 z 12 sekund odpowiedzi. Granice dób liczy się raz na dzień,
 * a potem każda chwila to wyszukiwanie binarne w kilkuset liczbach.
 */
export function dayLocator(days: string[], starts: number[]): (ms: number) => string | null {
  if (starts.length !== days.length + 1) {
    throw new Error(tr("dayLocator: granic musi być o jedną więcej niż dni."));
  }
  return (ms: number) => {
    if (ms < starts[0] || ms >= starts[starts.length - 1]) return null;
    let lo = 0;
    let hi = days.length - 1;
    // Największe i, dla którego starts[i] <= ms.
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= ms) lo = mid;
      else hi = mid - 1;
    }
    return days[lo];
  };
}

/** Co jest nie tak z zakresem — albo `null`, gdy wszystko w porządku. */
export function rangeError(from: string, to: string): string | null {
  if (!isDay(from) || !isDay(to)) return "Podaj obie daty.";
  if (from > to) return tr("Data początkowa jest późniejsza niż końcowa.");
  if (rangeLength(from, to) > MAX_RANGE_DAYS) {
    return tr("Zakres może obejmować najwyżej {MAX_RANGE_DAYS} dni.", {
      MAX_RANGE_DAYS: MAX_RANGE_DAYS,
    });
  }
  return null;
}

export interface Change {
  /** Zmiana jako ułamek (0.25 = +25%). `null`, gdy nie ma z czym porównać. */
  fraction: number | null;
  /** Poprzednio było zero, teraz nie — procent nie ma sensu, ale wzrost jest. */
  isNew: boolean;
  direction: "up" | "down" | "flat" | "none";
}

/**
 * Zmiana między dwiema liczbami, z pasmem stabilności.
 *
 * Zero w poprzednim okresie nie daje procentu (dzielenie przez zero udające
 * „+∞%" nic nie mówi) — wtedy `isNew`, jeśli teraz coś jest.
 */
export function change(current: number, previous: number): Change {
  if (previous === 0) {
    return current > 0
      ? { fraction: null, isNew: true, direction: "up" }
      : { fraction: null, isNew: false, direction: "none" };
  }
  const fraction = (current - previous) / previous;
  const direction = Math.abs(fraction) < STABLE_BAND ? "flat" : fraction > 0 ? "up" : "down";
  return { fraction, isNew: false, direction };
}

/** Nowy kontakt: dzień założenia (czas warszawski) i bieżący status. */
export interface ContactRow {
  createdAt: string;
  status: string;
}

/** Kontakt, z którym coś się działo danego dnia (czas warszawski). */
export interface TouchRow {
  contactId: string;
  day: string;
  status: string;
}

export interface ActivityDay {
  date: string;
  /** Nowe kontakty tego dnia — suma `byStatus`. */
  nowe: number;
  /** Różne kontakty, z którymi tego dnia coś się działo. */
  aktywni: number;
  byStatus: Record<string, number>;
  /** Ten sam dzień tygodnia tydzień wcześniej — punkt odniesienia porównania. */
  tydzienWczesniej: { date: string; nowe: number; aktywni: number };
}

export interface WeekTotals {
  od: string;
  do: string;
  nowe: number;
  /** Różne kontakty w całym tygodniu — nie suma dziennych (ta sama osoba w pon. i wt. to jedna osoba). */
  aktywni: number;
}

export interface ActivityResult {
  from: string;
  to: string;
  days: ActivityDay[];
  /** Statusy obecne w wyniku, od najliczniejszego. */
  statuses: string[];
  razem: { nowe: number; aktywni: number };
  /** Ostatnie 7 dni zakresu. */
  tydzien: WeekTotals;
  /** 7 dni bezpośrednio przed nimi. */
  poprzedniTydzien: WeekTotals;
}

/** Pusty status traktujemy jak „lead" — tak samo jak reszta aplikacji. */
export function normalStatus(status: string | null | undefined): string {
  return status || "lead";
}

/**
 * Składa dane karty z surowych wierszy.
 *
 * `contacts` i `touches` mogą obejmować szerzej niż zakres (serwer pobiera
 * dodatkowy tydzień wstecz na porównanie) — funkcja sama wybiera, co gdzie
 * wpada. Filtr statusów: pusta lista znaczy „wszystkie".
 */
export function buildActivity(input: {
  from: string;
  to: string;
  statuses: string[];
  contacts: ContactRow[];
  touches: TouchRow[];
}): ActivityResult {
  const { from, to } = input;
  const wanted = new Set(input.statuses);
  const passes = (status: string) => wanted.size === 0 || wanted.has(normalStatus(status));

  const newByDay = new Map<string, Record<string, number>>();
  for (const c of input.contacts) {
    if (!passes(c.status)) continue;
    const st = normalStatus(c.status);
    const bucket = newByDay.get(c.createdAt) ?? {};
    bucket[st] = (bucket[st] ?? 0) + 1;
    newByDay.set(c.createdAt, bucket);
  }

  const touchedByDay = new Map<string, Set<string>>();
  for (const t of input.touches) {
    if (!passes(t.status)) continue;
    const set = touchedByDay.get(t.day) ?? new Set<string>();
    set.add(t.contactId);
    touchedByDay.set(t.day, set);
  }

  const sum = (r: Record<string, number> | undefined) =>
    r ? Object.values(r).reduce((a, b) => a + b, 0) : 0;
  const newOn = (day: string) => sum(newByDay.get(day));
  const activeOn = (day: string) => touchedByDay.get(day)?.size ?? 0;

  const statusCount = new Map<string, number>();
  const days: ActivityDay[] = daysBetween(from, to).map((date) => {
    const byStatus = { ...(newByDay.get(date) ?? {}) };
    for (const [st, n] of Object.entries(byStatus)) {
      statusCount.set(st, (statusCount.get(st) ?? 0) + n);
    }
    const earlier = shiftDay(date, -WEEK_DAYS);
    return {
      date,
      nowe: sum(byStatus),
      aktywni: activeOn(date),
      byStatus,
      tydzienWczesniej: { date: earlier, nowe: newOn(earlier), aktywni: activeOn(earlier) },
    };
  });

  const distinctActive = (od: string, doDay: string) => {
    const ids = new Set<string>();
    for (const day of daysBetween(od, doDay)) {
      for (const id of touchedByDay.get(day) ?? []) ids.add(id);
    }
    return ids.size;
  };
  const week = (od: string, doDay: string): WeekTotals => ({
    od,
    do: doDay,
    nowe: daysBetween(od, doDay).reduce((n, day) => n + newOn(day), 0),
    aktywni: distinctActive(od, doDay),
  });

  // Tydzień zawsze pełny, liczony od końca zakresu — także gdy zakres jest
  // krótszy niż 7 dni. Porównanie „3 dni vs 7 dni" byłoby fałszywym spadkiem.
  const weekStart = shiftDay(to, -(WEEK_DAYS - 1));
  const tydzien = week(weekStart, to);
  const poprzedniTydzien = week(shiftDay(weekStart, -WEEK_DAYS), shiftDay(to, -WEEK_DAYS));

  return {
    from,
    to,
    days,
    statuses: [...statusCount.entries()].sort((a, b) => b[1] - a[1]).map(([st]) => st),
    razem: { nowe: days.reduce((n, d) => n + d.nowe, 0), aktywni: distinctActive(from, to) },
    tydzien,
    poprzedniTydzien,
  };
}
