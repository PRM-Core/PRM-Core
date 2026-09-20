import { randomUUID } from "node:crypto";
import { getDb } from "../db/client.server";
import { engineLog } from "../db/schema";
import { activeBookingSystem } from "./provider";
import { syncDoctorSlots } from "./doctors.server";
import { syncPatients } from "./patients-sync.server";
import { linkPatients } from "./link-patients.server";
import { bookingSyncPaused } from "./pause.server";
import { t } from "@/lib/i18n";

/**
 * Kiedy odpytywać system rezerwacji.
 *
 * Doczepione do **istniejącego ticku silnika**, a nie do własnego
 * `setInterval` — drugi zegar w procesie to drugie miejsce, o którym trzeba
 * pamiętać przy każdym restarcie i przy HMR (patrz gotcha o `Symbol.for`
 * w `loop.server.ts`). Tick chodzi co 4 s; my dokładamy tylko ograniczenie
 * „nie częściej niż".
 *
 * **Bez podpiętego systemu rezerwacji nic się nie dzieje** — funkcja wraca
 * natychmiast. Instalacja bez integracji nie płaci za nią niczym.
 */

/**
 * Pacjenci i ich wizyty — **co 30 minut**.
 *
 * Koszt: dwa zapytania na powiązanego pacjenta na przebieg, czyli przy ~200
 * powiązanych ok. 800 zapytań na godzinę zamiast 400. Przebieg trwa ~0,5 s na
 * pacjenta, więc mieści się w oknie z dużym zapasem, a blokada `busy` i tak nie
 * pozwoli drugiemu wejść w środek pierwszego.
 */
const PATIENTS_EVERY_MS = 30 * 60 * 1000;
/** Grafiki lekarzy — raz dziennie, o tej godzinie czasu polskiego. */
const SLOTS_AT_HOUR = 6;
/**
 * Ilu pacjentów wolno powiązać w jednym przebiegu.
 *
 * Powiązywanie odpytuje grafik **na parę (lekarz, dzień)**, więc setka
 * kontaktów to kilkadziesiąt zapytań, nie setka. Limit jest tu po to, żeby
 * pierwszy przebieg po wdrożeniu — z zaległościami z całej bazy — nie ciągnął
 * się kwadransami, a nie dlatego, że zapytania są drogie. Reszta dojdzie
 * w kolejnych godzinach.
 */
const LINK_PER_RUN = 100;

interface ScheduleState {
  lastPatientsAt: number;
  lastPatientsResult: string;
  /** Dzień (YYYY-MM-DD, czas polski), dla którego grafiki już poszły. */
  slotsDoneFor: string;
  lastSlotsResult: string;
  lastLinkResult: string;
  busy: boolean;
}

// Ten sam wzorzec co pętla silnika: uchwyt na `globalThis`, żeby reload Vite
// nie zaczynał odliczania od zera i nie odpalał synchronizacji przy każdym HMR.
const STATE_KEY = Symbol.for("prm.booking.schedule");
function getState(): ScheduleState {
  const g = globalThis as unknown as Record<symbol, ScheduleState>;
  g[STATE_KEY] ??= {
    lastPatientsAt: 0,
    lastPatientsResult: "",
    slotsDoneFor: "",
    lastSlotsResult: "",
    lastLinkResult: "",
    busy: false,
  };
  return g[STATE_KEY];
}

/** Dzisiejszy dzień i godzina w Polsce — harmonogram jest lokalny, nie UTC. */
function warsawNow(now: number): { day: string; hour: number } {
  const d = new Date(now);
  return {
    day: d.toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" }),
    hour: Number(
      d.toLocaleString("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", hour12: false }),
    ),
  };
}

/**
 * Wpis do dziennika silnika — przebiegi synchronizacji mają być widoczne tam,
 * gdzie wszystko inne, a nie tylko w logu procesu, do którego nikt nie zagląda.
 */
async function logRun(kind: string, message: string, detail: Record<string, string>) {
  try {
    await getDb().insert(engineLog).values({
      id: randomUUID(),
      runId: null,
      automationId: null,
      contactId: null,
      nodeId: null,
      kind,
      message,
      detail,
      createdAt: Date.now(),
    });
  } catch {
    // Dziennik nie może być powodem, dla którego synchronizacja padnie.
  }
}

/**
 * Wołane z ticku silnika. Sama decyduje, czy już pora — dlatego może być
 * wywoływana co 4 sekundy bez żadnych konsekwencji.
 */
export async function maybeSyncBookingSystem(now: number = Date.now()): Promise<void> {
  if (!(await activeBookingSystem())) return;
  // Wstrzymanie z panelu. Sprawdzane **przy każdym przebiegu**, a nie raz przy
  // starcie — przełącznik ma działać od razu, bez restartu kontenera.
  if (await bookingSyncPaused()) return;
  const state = getState();
  // Przebieg trwa dziesiątki sekund, a tick wraca co 4 — bez tej blokady drugi
  // przebieg wszedłby w środek pierwszego.
  if (state.busy) return;

  const { day, hour } = warsawNow(now);
  const patientsDue = now - state.lastPatientsAt >= PATIENTS_EVERY_MS;
  const slotsDue = hour >= SLOTS_AT_HOUR && state.slotsDoneFor !== day;
  if (!patientsDue && !slotsDue) return;

  state.busy = true;
  try {
    if (slotsDue) {
      // Znacznik ustawiany **przed** przebiegiem: nieudana synchronizacja ma
      // wrócić jutro, a nie próbować w kółko co 4 sekundy przez cały dzień.
      state.slotsDoneFor = day;
      const month = day.slice(0, 7);
      try {
        const r = await syncDoctorSlots(month);
        state.lastSlotsResult = t("{ok} ok / {failed} błędów", { ok: r.ok, failed: r.failed });
        await logRun("action", t("Grafiki lekarzy zsynchronizowane ({month}).", { month }), {
          month,
          ok: String(r.ok),
          failed: String(r.failed),
        });
      } catch (err) {
        state.lastSlotsResult = t("błąd: {v0}", { v0: String(err).slice(0, 120) });
        await logRun(
          "error",
          t("Synchronizacja grafików nie powiodła się: {v0}", { v0: String(err) }),
          {},
        );
      }
    }

    if (patientsDue) {
      state.lastPatientsAt = now;
      // ── powiązania ──────────────────────────────────────────────────────
      //
      // **Najpierw**, bo `syncPatients` odświeża wyłącznie kontakty, które
      // mają już `externalPatientId`. Bez tego kroku pacjent, który właśnie
      // umówił się przez system rezerwacji, nigdy nie doczekałby się statusów
      // wizyt: webhook zakłada kontakt i wizytę, ale nikt nie łączy go
      // z kartoteką placówki.
      //
      // **Ostrożność zostaje**: przy dwóch osobach o tym samym imieniu
      // i inicjale u tego samego lekarza tego dnia powiązanie jest pomijane.
      // Wpięcie w cykl zmienia częstotliwość, nie regułę.
      try {
        const l = await linkPatients(LINK_PER_RUN);
        state.lastLinkResult = t("{linked} powiązanych, {v1} pominiętych", {
          linked: l.linked,
          v1: l.notFound + l.ambiguous,
        });
        // Także gdy kandydatów było zero, a ktoś odpadł na nierozpoznanym
        // lekarzu — to właśnie ten przypadek był wcześniej niewidoczny.
        if (l.candidates > 0 || l.noDoctor > 0) {
          await logRun("action", t("Powiązywanie pacjentów z systemem rezerwacji."), {
            kandydatow: String(l.candidates),
            zapytan: String(l.queries),
            powiazanych: String(l.linked),
            niejednoznacznych: String(l.ambiguous),
            nieznalezionych: String(l.notFound),
            bezRozpoznanegoLekarza: String(l.noDoctor),
            przerwaneNaLimicie: l.stoppedAtLimit ? "tak" : "nie",
          });
        }
      } catch (err) {
        state.lastLinkResult = t("błąd: {v0}", { v0: String(err).slice(0, 120) });
        await logRun(
          "error",
          t("Powiązywanie pacjentów nie powiodło się: {v0}", { v0: String(err) }),
          {},
        );
      }

      try {
        const r = await syncPatients();
        state.lastPatientsResult = t("{refreshed}/{linked} odświeżonych", {
          refreshed: r.refreshed,
          linked: r.linked,
        });
        await logRun("action", t("Synchronizacja pacjentów z systemu rezerwacji."), {
          powiazanych: String(r.linked),
          odswiezonych: String(r.refreshed),
          bledow: String(r.failed),
          wizytDodanych: String(r.visitsAdded),
          wizytZaktualizowanych: String(r.visitsUpdated),
          zakonczonych: String(r.completed),
          brakWizyty: String(r.noShow),
          scalonych: String(r.merged),
          odwolanych: String(r.cancelled),
          zdarzen: String(r.events),
        });
      } catch (err) {
        // Niedostępność systemu rezerwacji nie
        // może wywalić ticku silnika — automatyzacje mają chodzić dalej.
        state.lastPatientsResult = t("błąd: {v0}", { v0: String(err).slice(0, 120) });
        await logRun(
          "error",
          t("Synchronizacja pacjentów nie powiodła się: {v0}", { v0: String(err) }),
          {},
        );
      }
    }
  } finally {
    state.busy = false;
  }
}

/** Stan harmonogramu — do pokazania w panelu PRM Engine. */
export async function bookingScheduleStatus() {
  const s = getState();
  const system = await activeBookingSystem();
  return {
    configured: system !== null,
    systemName: system?.name ?? "",
    lastPatientsAt: s.lastPatientsAt,
    lastPatientsResult: s.lastPatientsResult,
    lastLinkResult: s.lastLinkResult,
    slotsDoneFor: s.slotsDoneFor,
    lastSlotsResult: s.lastSlotsResult,
    busy: s.busy,
    patientsEveryMinutes: PATIENTS_EVERY_MS / 60000,
    slotsAtHour: SLOTS_AT_HOUR,
  };
}
