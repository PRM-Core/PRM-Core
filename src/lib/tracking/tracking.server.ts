import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { trackingDomains, trackingPings } from "../db/schema";
import { getBaseUrl } from "../engine/settings.server";
import { t } from "@/lib/i18n";

/**
 * Stan śledzenia — liczony z faktów, nie z deklaracji.
 *
 * Cała ta warstwa istnieje po to, żeby odpowiedzieć na jedno pytanie: „czy
 * z tej konkretnej strony coś do nas dociera?”. Wcześniej ekran ustawień
 * pokazywał jeden status dla całego systemu, więc jedna działająca witryna
 * maskowała drugą, na której kodu w ogóle nie było — i to jest dokładnie ten
 * przypadek, który wydarzył się naprawdę.
 */

/** Sygnał z ostatnich 30 minut znaczy „strona żyje”. Wcześniej okno wynosiło 5 minut, co przy małym ruchu pokazywało „brak” na działającej instalacji. */
const LIVE_WINDOW_MS = 30 * 60 * 1000;

/** Ujednolica to, co człowiek wpisze: „https://www.klinika-abc.pl/” → „klinika-abc.pl”. */
export function normaliseDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol).hostname.replace(/^www\./, "");
  } catch {
    return trimmed.replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

export interface DomainStatus {
  domain: string;
  label: string;
  /** Kiedy ostatnio przyszedł sygnał z tej domeny. */
  lastPingAt: number | null;
  lastPingUrl: string | null;
  /** Ile sygnałów w ciągu doby — pokazuje skalę, nie tylko „coś przyszło”. */
  pings24h: number;
  live: boolean;
  /** Domena widziana w sygnałach, ale nieobecna na liście — do dopisania jednym kliknięciem. */
  undeclared?: boolean;
}

export async function listTrackedDomains(): Promise<DomainStatus[]> {
  const db = getDb();
  const declared = await db.select().from(trackingDomains).orderBy(trackingDomains.domain);
  const dayAgo = Date.now() - 24 * 3600_000;

  // Jedno zapytanie na wszystkie hosty zamiast jednego na domenę.
  const seen = await db
    .select({
      host: trackingPings.host,
      last: sql<number>`max(${trackingPings.receivedAt})`,
      count24h: sql<number>`sum(case when ${trackingPings.receivedAt} > ${dayAgo} then 1 else 0 end)`,
    })
    .from(trackingPings)
    .where(sql`${trackingPings.host} <> ''`)
    .groupBy(trackingPings.host);

  const byHost = new Map(seen.map((s) => [s.host, s]));
  const now = Date.now();

  const lastUrlFor = async (host: string): Promise<string | null> => {
    const row = await db
      .select({ url: trackingPings.url })
      .from(trackingPings)
      .where(eq(trackingPings.host, host))
      .orderBy(desc(trackingPings.receivedAt))
      .limit(1)
      .get();
    return row?.url ?? null;
  };

  const out: DomainStatus[] = [];
  for (const d of declared) {
    const stat = byHost.get(d.domain);
    out.push({
      domain: d.domain,
      label: d.label,
      lastPingAt: stat?.last ?? null,
      lastPingUrl: stat ? await lastUrlFor(d.domain) : null,
      pings24h: Number(stat?.count24h ?? 0),
      live: Boolean(stat && now - stat.last < LIVE_WINDOW_MS),
    });
    byHost.delete(d.domain);
  }

  // Domeny, z których sygnały przychodzą, choć nikt ich nie zadeklarował.
  // Cisza w drugą stronę też jest informacją: ktoś wkleił kod tam, gdzie nie
  // planowano, albo domena zmieniła nazwę.
  for (const [host, stat] of byHost) {
    out.push({
      domain: host,
      label: "",
      lastPingAt: stat.last,
      lastPingUrl: await lastUrlFor(host),
      pings24h: Number(stat.count24h ?? 0),
      live: now - stat.last < LIVE_WINDOW_MS,
      undeclared: true,
    });
  }

  return out;
}

export async function saveTrackedDomains(
  domains: { domain: string; label: string }[],
): Promise<{ ok: boolean; saved: number }> {
  const db = getDb();
  const clean = domains
    .map((d) => ({ domain: normaliseDomain(d.domain), label: d.label.trim() }))
    .filter((d) => d.domain);

  // Zamiana całej listy, bo ekran wysyła jej pełny stan po kliknięciu „Zapisz”.
  // Sygnały zostają nietknięte — historia śledzenia nie jest ustawieniem.
  await db.delete(trackingDomains);
  const now = Date.now();
  for (const d of clean) {
    await db
      .insert(trackingDomains)
      .values({ domain: d.domain, label: d.label, createdAt: now })
      .onConflictDoNothing();
  }
  return { ok: true, saved: clean.length };
}

export interface InstallCheck {
  domain: string;
  reachable: boolean;
  /** Kod znaleziony wprost w HTML strony. */
  snippetInHtml: boolean;
  /** Strona ładuje Google Tag Managera — kod może siedzieć w kontenerze. */
  usesTagManager: boolean;
  gtmIds: string[];
  /** Adres, na który kod znaleziony w HTML wysyła dane. Zdradza wklejony localhost. */
  collectorInHtml: string | null;
  message: string;
}

/**
 * Sprawdza instalację, pobierając stronę z serwera.
 *
 * Świadomie NIE udaje, że to dowód. Kod wklejony przez Google Tag Managera nie
 * pojawia się w źródle strony — kontener dokłada go dopiero w przeglądarce.
 * Dlatego wynik „nie znaleziono w HTML” przy obecnym GTM znaczy tylko tyle, że
 * trzeba sprawdzić kontener, a jedynym rozstrzygającym dowodem pozostaje
 * odebrany sygnał. Ekran mówi to wprost, zamiast pokazywać zielony ptaszek,
 * któremu nie można ufać.
 */
export async function checkInstallation(rawDomain: string): Promise<InstallCheck> {
  const domain = normaliseDomain(rawDomain);
  const base: InstallCheck = {
    domain,
    reachable: false,
    snippetInHtml: false,
    usesTagManager: false,
    gtmIds: [],
    collectorInHtml: null,
    message: "",
  };
  if (!domain) return { ...base, message: t("Pusta domena.") };

  let html = "";
  try {
    const res = await fetch(`https://${domain}/`, {
      redirect: "follow",
      headers: {
        // Bez tego część serwisów oddaje stronę uproszczoną albo blokadę bota.
        "User-Agent": "Mozilla/5.0 (compatible; PRM-Core-Install-Check/1.0)",
      },
      signal: AbortSignal.timeout(15_000),
    });
    base.reachable = res.ok;
    if (!res.ok)
      return {
        ...base,
        message: t("Strona odpowiedziała kodem {status}.", { status: res.status }),
      };
    html = await res.text();
  } catch (err) {
    return {
      ...base,
      message: t("Nie udało się pobrać strony: {v0}", {
        v0: err instanceof Error ? err.message : String(err),
      }),
    };
  }

  base.snippetInHtml = /PrmTracking|prm-tracker\.js/i.test(html);
  base.gtmIds = [...new Set([...html.matchAll(/GTM-[A-Z0-9]+/g)].map((m) => m[0]))];
  base.usesTagManager = base.gtmIds.length > 0;

  const collector = /collectorBaseUrl\s*:\s*["']([^"']+)["']/.exec(html);
  const inline = /"script",\s*"[^"]*",\s*"([^"]+)"/.exec(html);
  base.collectorInHtml = collector?.[1] ?? inline?.[1] ?? null;

  if (base.snippetInHtml) {
    base.message = base.collectorInHtml?.includes("localhost")
      ? t(
          "Kod jest w źródle strony, ale wysyła dane na localhost — to adres, który działa wyłącznie na komputerze programisty. Wklej kod jeszcze raz, z tej strony.",
        )
      : t("Kod znaleziony w źródle strony.");
  } else if (base.usesTagManager) {
    base.message = t(
      "Nie ma kodu w źródle strony, ale działa tam Google Tag Manager ({v0}). Kod może siedzieć w kontenerze — sprawdź go tam. Rozstrzyga dopiero odebrany sygnał.",
      { v0: base.gtmIds.join(", ") },
    );
  } else {
    base.message = t("Nie znaleziono kodu w źródle strony ani menedżera tagów.");
  }
  return base;
}

/** Publiczny adres PRM Core — ten sam, którym podpisywane są linki w e-mailach. */
export async function collectorBaseUrl(): Promise<string> {
  return getBaseUrl();
}

/** Ostatnie sygnały, do podglądu „czy właśnie teraz coś przyszło”. */
export async function recentPings(limit = 15) {
  return getDb().select().from(trackingPings).orderBy(desc(trackingPings.receivedAt)).limit(limit);
}

/** Ile sygnałów mamy w ogóle i ile z nich dało się przypisać do kontaktu. */
export async function trackingTotals(): Promise<{ total: number; identified: number }> {
  const db = getDb();
  const total = await db
    .select({ n: sql<number>`count(*)` })
    .from(trackingPings)
    .get();
  const identified = await db
    .select({ n: sql<number>`count(*)` })
    .from(trackingPings)
    .where(sql`${trackingPings.contactToken} is not null and ${trackingPings.contactToken} <> ''`)
    .get();
  return { total: Number(total?.n ?? 0), identified: Number(identified?.n ?? 0) };
}
