import { warsawDay, warsawMinuteOfDay, warsawWallClockToIso } from "../visits/warsaw-time";
import { t } from "@/lib/i18n";

/**
 * Tempo wysyłki kampanii — limit na godzinę i na dobę.
 *
 * **Po co.** Operator SMS i filtry pocztowe patrzą nie tylko na to, ile
 * wiadomości wysyłamy, ale jak szybko. Tysiąc SMS-ów w minutę wygląda z zewnątrz
 * identycznie jak awaria albo spam i kończy się blokadą nadawcy — a odzyskanie
 * dobrej reputacji trwa tygodniami. Poza tym recepcja musi zdążyć odebrać
 * telefony, które taka wysyłka wywoła.
 *
 * **Rozłożone równomiernie, nie zrywami.** Limit „100 na godzinę" mógłby
 * znaczyć „100 w pierwszej minucie, potem 59 minut ciszy" — formalnie zgodnie
 * z limitem, w praktyce dokładnie ten zryw, przed którym limit ma chronić.
 * Dlatego okno godzinowe jest dzielone na równe sloty: przy 100/h jeden slot
 * co 36 sekund.
 *
 * **Godziny ciszy** to druga połowa tego samego pomysłu: limit mówi ILE,
 * okno mówi KIEDY. Pacjent, który dostaje SMS o 23:40, nie liczy, że dzienny
 * limit był przestrzegany.
 *
 * **Czysta arytmetyka, bez bazy i bez zegara.** Wszystko wchodzi argumentami,
 * dzięki czemu da się to sprawdzić testem na sucho — a to jedyny sposób, żeby
 * mieć pewność co do zachowania na przełomie doby i przy zmianie czasu, nie
 * czekając na te momenty w produkcji.
 */

const HOUR_MS = 60 * 60 * 1000;

export interface ThrottleState {
  /** Godzina otwarcia okna wysyłki, „HH:MM" czasu polskiego. Puste = całą dobę. */
  sendFrom: string;
  /** Godzina zamknięcia okna. Puste = całą dobę. */
  sendTo: string;
  /** `null` = bez ograniczenia. */
  perHourLimit: number | null;
  /** `null` = bez ograniczenia. */
  perDayLimit: number | null;
  hourWindowAt: number | null;
  hourSentCount: number;
  /** Doba, której dotyczy `daySentCount`, `RRRR-MM-DD` czasu polskiego. */
  dayKey: string;
  daySentCount: number;
}

export interface ThrottleDecision {
  /** Ile wiadomości wolno wysłać w tym przebiegu. `0` = czekamy. */
  allowance: number;
  /** Stan okien po przesunięciu — do zapisania razem z licznikami. */
  hourWindowAt: number;
  hourSentCount: number;
  dayKey: string;
  daySentCount: number;
  /** Kiedy najwcześniej zwolni się miejsce (ms epoki). `null` = nic nie blokuje. */
  nextAt: number | null;
  /** Co blokuje — do napisania człowiekowi, czemu wysyłka stoi. */
  blockedBy: "hour" | "day" | "window" | null;
}

/** Północ następnej doby czasu polskiego — moment zerowania limitu dobowego. */
export function nextWarsawMidnight(now: number): number {
  const [y, m, d] = warsawDay(now).split("-").map(Number);
  // Arytmetyka na UTC służy tu wyłącznie do przewinięcia kalendarza o dzień;
  // strefę dokłada dopiero `warsawWallClockToIso`, pytając o offset tej daty.
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return new Date(warsawWallClockToIso(tomorrow, "00:00")).getTime();
}

/**
 * Ile wolno wysłać teraz.
 *
 * @param cap Sufit techniczny przebiegu (wielkość partii) — limity mogą go
 *            tylko obniżyć, nigdy podnieść.
 */
export function planBatch(state: ThrottleState, now: number, cap: number): ThrottleDecision {
  const today = warsawDay(now);

  // ── przesunięcie okien ────────────────────────────────────────────────────
  // Okno godzinowe jest ruchome i startuje przy pierwszej wysyłce, a nie
  // o pełnej godzinie: kampania zlecona o 14:50 ma swoje okno 14:50–15:50,
  // zamiast dostać dziesięć minut i nagły reset.
  let hourWindowAt = state.hourWindowAt ?? now;
  let hourSentCount = state.hourSentCount;
  if (now - hourWindowAt >= HOUR_MS) {
    hourWindowAt = now;
    hourSentCount = 0;
  }

  let dayKey = state.dayKey;
  let daySentCount = state.daySentCount;
  if (dayKey !== today) {
    dayKey = today;
    daySentCount = 0;
  }

  const base: Omit<ThrottleDecision, "allowance" | "nextAt" | "blockedBy"> = {
    hourWindowAt,
    hourSentCount,
    dayKey,
    daySentCount,
  };

  // ── godziny wysyłki ───────────────────────────────────────────────────────
  //
  // Sprawdzane **pierwsze**, bo blokują najmocniej: poza oknem nie wyjdzie nic,
  // choćby cały budżet był wolny. Liczniki są już przesunięte, więc noc spędzona
  // poza oknem zeruje okno godzinowe i rano kampania rusza z pełnym budżetem.
  const window = parseWindow(state.sendFrom, state.sendTo);
  if (window && !insideWindow(warsawMinuteOfDay(now), window)) {
    return {
      ...base,
      allowance: 0,
      nextAt: nextWindowOpen(now, state.sendFrom),
      blockedBy: "window",
    };
  }

  // ── budżet dobowy ─────────────────────────────────────────────────────────
  // Sprawdzany pierwszy, bo blokuje na dłużej: wyczerpany dzień znaczy przerwę
  // do północy i to jest ważniejsza informacja niż „za 36 sekund".
  const perDay = normalize(state.perDayLimit);
  if (perDay !== null && daySentCount >= perDay) {
    return { ...base, allowance: 0, nextAt: nextWarsawMidnight(now), blockedBy: "day" };
  }

  // ── budżet godzinowy ──────────────────────────────────────────────────────
  const perHour = normalize(state.perHourLimit);
  let allowance = cap;
  let nextAt: number | null = null;
  let blockedBy: "hour" | "day" | null = null;

  if (perHour !== null) {
    const slotMs = HOUR_MS / perHour;
    // `+ 1`, bo slot numer zero należy się od razu — inaczej kampania z limitem
    // 100/h czekałaby 36 sekund, zanim wyśle pierwszą wiadomość.
    const opened = Math.min(perHour, Math.floor((now - hourWindowAt) / slotMs) + 1);
    const free = opened - hourSentCount;
    if (free <= 0) {
      nextAt =
        hourSentCount >= perHour
          ? hourWindowAt + HOUR_MS // limit godziny wyczerpany — czekamy na nowe okno
          : hourWindowAt + Math.ceil(hourSentCount * slotMs); // czekamy na kolejny slot
      return { ...base, allowance: 0, nextAt, blockedBy: "hour" };
    }
    allowance = Math.min(allowance, free);
  }

  if (perDay !== null) {
    const freeToday = perDay - daySentCount;
    if (freeToday < allowance) {
      allowance = freeToday;
      blockedBy = "day";
    }
  }

  return { ...base, allowance: Math.max(0, allowance), nextAt, blockedBy };
}

/** „HH:MM" na minutę doby. `null`, gdy pole puste albo bez sensu. */
export function parseHhMm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

interface Window {
  from: number;
  to: number;
}

/**
 * Okno wysyłki albo `null`, gdy żadne nie obowiązuje.
 *
 * `null` także wtedy, gdy obie godziny są równe: „od 8:00 do 8:00" znaczy dla
 * jednych całą dobę, dla innych zero minut. Zamiast zgadywać, którą intencję
 * miał autor, nie ograniczamy niczego — bo drugie odczytanie oznaczałoby
 * kampanię, która nigdy nie ruszy i nie powie dlaczego.
 */
function parseWindow(from: string, to: string): Window | null {
  const f = parseHhMm(from);
  const t = parseHhMm(to);
  if (f === null || t === null || f === t) return null;
  return { from: f, to: t };
}

function insideWindow(minute: number, w: Window): boolean {
  // Okno przełożone przez północ (22:00–06:00) to suma dwóch kawałków doby,
  // a nie przedział — stąd `||` zamiast `&&`.
  return w.from < w.to ? minute >= w.from && minute < w.to : minute >= w.from || minute < w.to;
}

/** Najbliższe otwarcie okna — dziś, jeśli jeszcze przed nim; inaczej jutro. */
function nextWindowOpen(now: number, from: string): number | null {
  const minute = parseHhMm(from);
  if (minute === null) return null;
  const today = warsawDay(now);
  const todayOpen = new Date(warsawWallClockToIso(today, from)).getTime();
  if (todayOpen > now) return todayOpen;
  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return new Date(warsawWallClockToIso(tomorrow, from)).getTime();
}

/** „7:00–18:00" albo pusto — do pokazania na liście wysyłek. */
export function windowLabel(from: string, to: string): string {
  return parseWindow(from, to) ? `${from}–${to}` : "";
}

/** Ile minut doby obejmuje okno. Pełna doba, gdy okna nie ma. */
export function windowMinutes(from: string, to: string): number {
  const w = parseWindow(from, to);
  if (!w) return 24 * 60;
  return w.from < w.to ? w.to - w.from : 24 * 60 - w.from + w.to;
}

/** Limit poniżej jedynki zatrzymałby wysyłkę na zawsze — traktujemy go jak brak limitu. */
function normalize(limit: number | null): number | null {
  if (limit === null || limit === undefined) return null;
  if (!Number.isFinite(limit) || limit < 1) return null;
  return Math.floor(limit);
}

/** „co 36 s" — do pokazania przy ustawianiu limitu, żeby tempo nie było abstrakcją. */
export function paceLabel(perHour: number | null): string {
  const n = normalize(perHour);
  if (n === null) return "bez ograniczenia tempa";
  const seconds = Math.round(HOUR_MS / n / 1000);
  if (seconds >= 60) return t("około 1 wiadomość co {v0} min", { v0: Math.round(seconds / 60) });
  return t("około 1 wiadomość co {seconds} s", { seconds: seconds });
}
