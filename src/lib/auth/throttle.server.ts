/**
 * Ogranicznik prób logowania hasłem.
 *
 * **Po co.** Kody drugiego składnika miały limit prób od początku, samo hasło —
 * nie. Nic nie powstrzymywało zgadywania w pętli: adresy pracowników placówki
 * są publiczne, a hasło jest jedyną przeszkodą przed etapem, na którym system
 * w ogóle wysyła kod.
 *
 * **Licznik w pamięci procesu, nie w bazie.** Świadomie: zapis do bazy przy
 * każdej nieudanej próbie zamieniłby próbę zgadywania w atak na dysk, a przy
 * jednym procesie aplikacji pamięć wystarcza. Restart czyści liczniki —
 * i to jest akceptowalne, bo napastnik nie ma jak go wywołać.
 *
 * **Blokujemy parę (adres, IP), nie sam adres.** Blokada po samym adresie
 * pozwoliłaby obcemu zablokować recepcję przed jej własnym systemem: kilka
 * błędnych prób na cudzy e-mail i pracownik nie wejdzie. To zamiana włamania
 * na paraliż i nie jest to poprawa.
 */

import { getRequestHeaders } from "@tanstack/react-start/server";

const MAX_FAILURES = 8;
/** Ile trwa blokada po przekroczeniu limitu. */
const LOCK_MS = 15 * 60 * 1000;
/** Po tylu minutach bez próby licznik startuje od zera. */
const WINDOW_MS = 15 * 60 * 1000;

interface Entry {
  failures: number;
  first: number;
  lockedUntil: number;
}

const KEY = Symbol.for("prm.auth.throttle");
function store(): Map<string, Entry> {
  const g = globalThis as unknown as Record<symbol, Map<string, Entry>>;
  g[KEY] ??= new Map();
  return g[KEY];
}

function keyFor(email: string, ip: string): string {
  return `${email.trim().toLowerCase()}|${ip}`;
}

export interface ThrottleVerdict {
  allowed: boolean;
  /** Ile sekund do końca blokady — do pokazania człowiekowi. */
  retryInSeconds: number;
}

/** Sprawdzenie **przed** porównaniem hasła. */
export function checkLoginAllowed(email: string, ip: string, now = Date.now()): ThrottleVerdict {
  const entry = store().get(keyFor(email, ip));
  if (!entry || entry.lockedUntil <= now) return { allowed: true, retryInSeconds: 0 };
  return { allowed: false, retryInSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
}

/** Nieudana próba. Zwraca werdykt na następne podejście. */
export function recordLoginFailure(email: string, ip: string, now = Date.now()): ThrottleVerdict {
  const map = store();
  const key = keyFor(email, ip);
  const entry = map.get(key);

  // Okno wygasło albo pierwsza próba — liczymy od nowa.
  if (!entry || now - entry.first > WINDOW_MS) {
    map.set(key, { failures: 1, first: now, lockedUntil: 0 });
    return { allowed: true, retryInSeconds: 0 };
  }

  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCK_MS;
    entry.failures = 0;
    entry.first = now;
    map.set(key, entry);
    return { allowed: false, retryInSeconds: Math.ceil(LOCK_MS / 1000) };
  }

  map.set(key, entry);
  return { allowed: true, retryInSeconds: 0 };
}

/** Udane logowanie kasuje licznik — pomyłki przed trafieniem nie mają się kumulować. */
export function clearLoginFailures(email: string, ip: string): void {
  store().delete(keyFor(email, ip));
}

/**
 * Adres klienta zza proxy.
 *
 * **Bierzemy OSTATNI wpis `X-Forwarded-For`, nie pierwszy.** Caddy **dokłada**
 * adres rozmówcy na koniec tego nagłówka, zamiast go nadpisywać — więc jeśli
 * napastnik sam wyśle `X-Forwarded-For: 1.2.3.4`, na serwer trafi
 * `1.2.3.4, <jego prawdziwy adres>`. Pierwszy wpis jest wtedy jego wymysłem
 * i przy każdym żądaniu może być inny, co czyni licznik bezużytecznym.
 * Ostatni wpis dopisuje nasze proxy i tylko on jest wiarygodny.
 *
 * (`getRequestIP` z h3 bierze pierwszy wpis — dlatego go tu nie używamy.)
 */
export function ipFromForwardedFor(value: string | null | undefined): string {
  const parts = (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * Adres bieżącego żądania. Poza kontekstem żądania (np. w teście) zwraca
 * `nieznany` — wspólny klucz jest gorszy niż osobny, ale nadal ogranicza tempo,
 * a wyjątek z tego miejsca zablokowałby logowanie wszystkim.
 */
export function currentClientIp(): string {
  try {
    const headers = getRequestHeaders();
    return (
      ipFromForwardedFor(headers.get("x-forwarded-for")) ||
      headers.get("x-real-ip")?.trim() ||
      "nieznany"
    );
  } catch {
    return "nieznany";
  }
}
