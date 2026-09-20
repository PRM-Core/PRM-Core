import { warsawToday } from "./visits/warsaw-time";
export type DomainPurpose = "tracking" | "landing" | "all";
export type DomainStatus = "pending" | "verified" | "failed";

export interface TrackedDomain {
  id: string;
  domain: string;
  purpose: DomainPurpose;
  status: DomainStatus;
  isDefault: boolean;
  addedAt: string;
}

const STORAGE_KEY = "prm-tracking-domains";

/**
 * Host tej instalacji, na który wskazują rekordy CNAME domen własnych.
 *
 * Do 1.60.0 była tu wpisana na sztywno domena jednej instalacji. Skutek dla
 * kopii z GitHuba byłby dotkliwy w obie strony: ekran kazałby użytkownikom
 * skierować CNAME na cudzy serwer, a ten serwer dostawałby ruch trackingowy
 * obcych placówek — z ich danymi w adresach.
 *
 * Pusta wartość jest poprawna i znaczy „ta instalacja nie obsługuje domen
 * własnych". Ekran Domeny mówi wtedy wprost, czego brakuje, zamiast pokazywać
 * rekord prowadzący donikąd.
 *
 * `VITE_`, bo wartość jest potrzebna w przeglądarce (ekran Ustawienia → Domeny)
 * i nie jest sekretem — to publiczna nazwa hosta.
 */
export const PLATFORM_CNAME_TARGET = import.meta.env.VITE_PLATFORM_CNAME_TARGET || "";

/**
 * Domyślna domena śledząca. Bez `VITE_PLATFORM_CNAME_TARGET` lista startuje
 * pusta — wpisanie tu czegokolwiek na sztywno oznaczałoby, że świeża instalacja
 * pokazuje jako „zweryfikowaną" domenę, której jej właściciel nigdy nie widział.
 */
const seedDomains: TrackedDomain[] = PLATFORM_CNAME_TARGET
  ? [
      {
        id: "default",
        domain: PLATFORM_CNAME_TARGET,
        purpose: "all",
        status: "verified",
        isDefault: true,
        addedAt: "2026-01-10",
      },
    ]
  : [];

function readDomains(): TrackedDomain[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TrackedDomain[]) : null;
  } catch {
    return null;
  }
}

function writeDomains(list: TrackedDomain[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // no-op during SSR (no localStorage on the server) — the browser call after hydration succeeds
  }
}

export function getAllDomains(): TrackedDomain[] {
  const stored = readDomains();
  if (stored) return stored;
  writeDomains(seedDomains);
  return seedDomains;
}

export function getActiveDomain(): TrackedDomain {
  const all = getAllDomains();
  return all.find((d) => d.isDefault) ?? all[0] ?? seedDomains[0];
}

export function makeDomainId(): string {
  return `dom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function addDomain(domain: string, purpose: DomainPurpose): TrackedDomain {
  const clean = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const entry: TrackedDomain = {
    id: makeDomainId(),
    domain: clean,
    purpose,
    status: "pending",
    isDefault: false,
    addedAt: warsawToday(),
  };
  writeDomains([...getAllDomains(), entry]);
  return entry;
}

export function deleteDomain(id: string) {
  writeDomains(getAllDomains().filter((d) => d.id !== id));
}

/** Simulated DNS/CNAME check — a real backend would query DNS here. */
export function verifyDomain(id: string): DomainStatus {
  const all = getAllDomains();
  const target = all.find((d) => d.id === id);
  if (!target) return "failed";
  const looksValid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(
    target.domain,
  );
  const status: DomainStatus = looksValid ? "verified" : "failed";
  writeDomains(all.map((d) => (d.id === id ? { ...d, status } : d)));
  return status;
}

export function setDefaultDomain(id: string) {
  const all = getAllDomains();
  const target = all.find((d) => d.id === id);
  if (!target || target.status !== "verified") return;
  writeDomains(all.map((d) => ({ ...d, isDefault: d.id === id })));
}
