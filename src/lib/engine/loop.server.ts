import { tick, type TickResult } from "./runner.server";
import { isEngineEnabled } from "./settings.server";
import { maybeRunSupervisor } from "./supervisor.server";
import { maybeSyncBookingSystem } from "../booking-system/scheduler.server";
import { maybeBackfillMeta } from "../meta/leads.server";
import { maybeSendSecurityReport } from "../security/daily-report.server";
import { purgeExpiredAccounts } from "../auth/expiry.server";
import { purgeExpiredSegments } from "../segments/segments.server";
import { maybeCheckForUpdates } from "../updates/check.server";
import { t } from "@/lib/i18n";

// The engine's clock. Booted from src/server.ts (the SSR entry), so it lives
// exactly as long as the server process does — which is the honest limitation
// worth repeating: on the dev server the engine stops when the dev server
// stops. Durable state is all in engine_jobs, so a restart resumes rather than
// loses work; delayed steps simply fire late.

const TICK_INTERVAL_MS = 4000;

export interface EngineStatus {
  running: boolean;
  lastTickAt: number | null;
  lastResult: TickResult | null;
  lastError: string | null;
  ticks: number;
  intervalMs: number;
}

interface EngineState extends EngineStatus {
  timer: ReturnType<typeof setInterval> | null;
  busy: boolean;
}

// Vite re-evaluates modules on HMR; without a global handle a reload would
// leave the previous interval running and double every tick.
const STATE_KEY = Symbol.for("prm.engine.state");

function getState(): EngineState {
  const globals = globalThis as unknown as Record<symbol, EngineState | undefined>;
  if (!globals[STATE_KEY]) {
    globals[STATE_KEY] = {
      running: false,
      lastTickAt: null,
      lastResult: null,
      lastError: null,
      ticks: 0,
      intervalMs: TICK_INTERVAL_MS,
      timer: null,
      busy: false,
    };
  }
  return globals[STATE_KEY]!;
}

/** Runs one tick with overlap protection, and records the outcome for the status panel. */
export async function runTickOnce(): Promise<TickResult | null> {
  const state = getState();
  if (state.busy) return null;
  state.busy = true;
  try {
    // Informacje o aktualizacjach — także przy wyłączonym silniku, bo to
    // wiadomość dla administratora, nie krok automatyzacji. Sama pilnuje
    // częstotliwości (raz na 12 h) i nigdy nie rzuca.
    await maybeCheckForUpdates();
    if (!(await isEngineEnabled())) {
      state.lastTickAt = Date.now();
      return null;
    }
    const result = await tick();
    state.lastTickAt = Date.now();
    state.lastResult = result;
    state.lastError = null;
    state.ticks += 1;
    // M4 supervision rides along on the tick but rate-limits itself to a sweep
    // every 15 minutes, and never calls the model on its own — see
    // maybeRunSupervisor. Awaited, not fired off, so a slow sweep cannot
    // overlap with the next tick.
    await maybeRunSupervisor();
    // Synchronizacja z systemem rezerwacji jedzie na tym samym zegarze — jeden zegar
    // w systemie zamiast drugiego harmonogramu. Sama pilnuje częstotliwości
    // (pacjenci co godzinę, grafiki raz dziennie o 6:00) i wraca natychmiast,
    // gdy integracja nie jest skonfigurowana. Awaitowana, nie odpalana w tło,
    // żeby wolny przebieg wydłużył tick zamiast nałożyć się na następny.
    await maybeSyncBookingSystem();
    // Dopytanie zaległych leadów z Meta — raz na dobę, na tym samym zegarze.
    // Meta kasuje leady po 90 dniach bezpowrotnie, więc jedno nieodebrane
    // powiadomienie bez tego kroku znaczyłoby pacjenta straconego na zawsze.
    await maybeBackfillMeta();
    // Dobowy raport bezpieczeństwa — ten sam zegar, wysyłka po 7:00 czasu
    // warszawskiego. Owinięty w `catch`, bo raport o stanie systemu nie ma prawa
    // zatrzymać samego systemu: nieudana wysyłka zostaje w dzienniku, a tick
    // leci dalej.
    // Konta z terminem ważności (podgląd na czas audytu) znikają same. Tanie:
    // jedno zapytanie po indeksowanej kolumnie, prawie zawsze zero wierszy.
    // Segmenty doraźne znikają po 48 h — chyba że są w użyciu albo oznaczone
    // jako stałe. Tanie: zapytanie po indeksowanej kolumnie, zwykle zero wierszy.
    try {
      await purgeExpiredSegments();
    } catch (err) {
      console.error(t("[PRM Engine] sprzątanie segmentów nie powiodło się"), err);
    }
    try {
      await purgeExpiredAccounts();
    } catch (err) {
      console.error(t("[PRM Engine] sprzątanie wygasłych kont nie powiodło się"), err);
    }
    try {
      await maybeSendSecurityReport();
    } catch (err) {
      console.error(t("[PRM Engine] raport bezpieczeństwa nie wyszedł"), err);
    }
    return result;
  } catch (err) {
    state.lastError = String(err);
    state.lastTickAt = Date.now();
    console.error(t("[PRM Engine] tick nie powiódł się"), err);
    return null;
  } finally {
    state.busy = false;
  }
}

export function startEngine(): void {
  const state = getState();
  if (state.timer) return;
  state.timer = setInterval(() => {
    void runTickOnce();
  }, TICK_INTERVAL_MS);
  // Node keeps the process alive for pending timers; the engine loop must not
  // be the reason a server refuses to exit.
  state.timer.unref?.();
  state.running = true;
  console.info(
    t("[PRM Engine] pętla wystartowała (tick co {TICK_INTERVAL_MS} ms)", {
      TICK_INTERVAL_MS: TICK_INTERVAL_MS,
    }),
  );
}

export function stopEngine(): void {
  const state = getState();
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.running = false;
}

export function getEngineStatus(): EngineStatus {
  const { running, lastTickAt, lastResult, lastError, ticks, intervalMs } = getState();
  return { running, lastTickAt, lastResult, lastError, ticks, intervalMs };
}
