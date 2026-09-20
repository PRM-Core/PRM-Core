import process from "node:process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getCredential } from "@/lib/credentials/store.server";

/**
 * Cienka warstwa nad Graph API Mety.
 *
 * **Wersja API jest przypięta.** Meta wyłącza kolejne wersje po około dwóch
 * latach i wywołanie bez numeru dostaje najstarszą wspieraną — czyli tę, która
 * zniknie najwcześniej. Podniesienie tej stałej to świadoma decyzja, a nie
 * skutek uboczny upływu czasu.
 */
export const GRAPH_VERSION = "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class MetaError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    /** Kod błędu Mety — po nim rozpoznajemy wygaśnięcie tokenu (190). */
    public readonly code?: number,
  ) {
    super(message);
    this.name = "MetaError";
  }
}

export function metaAppId(): Promise<string> {
  return getCredential("META_APP_ID");
}

export function metaAppSecret(): Promise<string> {
  return getCredential("META_APP_SECRET");
}

export async function metaConfigured(): Promise<boolean> {
  return !!(await metaAppId()) && !!(await metaAppSecret());
}

/**
 * Weryfikacja podpisu `X-Hub-Signature-256`.
 *
 * **To jedyne, co odróżnia powiadomienie od Mety od żądania kogokolwiek
 * innego** — adres webhooka jest publiczny i nie da się go ukryć. Bez tego
 * sprawdzenia obcy mógłby wstrzykiwać nam „leady", czyli zakładać kontakty
 * w bazie placówki.
 *
 * Porównanie stałoczasowe: zwykłe `===` na napisach kończy się przy pierwszej
 * różnicy i wycieka informację o tym, ile znaków się zgadza.
 */
export async function verifySignature(rawBody: string, header: string | null): Promise<boolean> {
  const secret = await metaAppSecret();
  if (!secret || !header) return false;
  const [algo, sent] = header.split("=");
  if (algo !== "sha256" || !sent) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sent, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { method: "GET" });
  const body = (await res.json().catch(() => null)) as
    | { error?: { message?: string; code?: number } }
    | T
    | null;

  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: number } } | null)?.error;
    throw new MetaError(err?.message ?? res.statusText, res.status, err?.code);
  }
  return body as T;
}

/** Pole formularza tak, jak oddaje je Meta: nazwa + lista wartości. */
export interface LeadFieldEntry {
  name: string;
  values: string[];
}

export interface RawLead {
  id: string;
  created_time: string;
  form_id?: string;
  ad_id?: string;
  campaign_id?: string;
  /** Czytelne nazwy — jeśli Meta je odda przy tej wersji API. */
  campaign_name?: string;
  ad_name?: string;
  adset_name?: string;
  field_data: LeadFieldEntry[];
}

/** Pola pewne — działają w każdej wersji Graph API. */
const LEAD_FIELDS_BASE = "id,created_time,field_data,form_id,ad_id,campaign_id";
/** Z czytelnymi nazwami. Nie wszystkie wersje je znają, stąd próba i odwrót. */
const LEAD_FIELDS_RICH = `${LEAD_FIELDS_BASE},campaign_name,ad_name,adset_name`;

/**
 * Pojedynczy lead po identyfikatorze z powiadomienia.
 *
 * **Najpierw z nazwami, w razie czego bez.** Nieznane pole w `fields` wywraca
 * całe żądanie, a lead jest ważniejszy niż ładna nazwa kampanii: gdyby Meta
 * przestała je znać, wolimy zapisać kontakt z samym numerem niż nie zapisać
 * go wcale.
 */
export async function fetchLead(leadgenId: string, pageToken: string): Promise<RawLead> {
  try {
    return await call<RawLead>(leadgenId, {
      access_token: pageToken,
      fields: LEAD_FIELDS_RICH,
    });
  } catch {
    return call<RawLead>(leadgenId, { access_token: pageToken, fields: LEAD_FIELDS_BASE });
  }
}

/**
 * Nazwa kampanii po identyfikatorze — ostatnia deska ratunku.
 *
 * **Z pamięcią podręczną**, bo jedna kampania rodzi setki leadów i pytanie
 * o tę samą nazwę przy każdym z nich byłoby marnowaniem limitu zapytań Mety
 * na informację, która się nie zmienia.
 *
 * Pusty wynik nie jest błędem: token strony nie zawsze ma dostęp do konta
 * reklamowego, a wtedy zostaje numer — i to jest uczciwsze niż zgadywanie.
 */
const campaignNames = new Map<string, string>();

export async function resolveCampaignName(id: string, token: string): Promise<string> {
  if (!id) return "";
  const cached = campaignNames.get(id);
  if (cached !== undefined) return cached;
  try {
    const res = await call<{ name?: string }>(id, { access_token: token, fields: "name" });
    const name = res.name ?? "";
    campaignNames.set(id, name);
    return name;
  } catch {
    // Zapamiętujemy też porażkę — inaczej każdy lead z tej kampanii ponawiałby
    // to samo nieudane zapytanie.
    campaignNames.set(id, "");
    return "";
  }
}

/**
 * Leady z formularza od podanego czasu — do nadrabiania zaległości.
 *
 * **Potrzebne, bo Meta kasuje leady po 90 dniach bezpowrotnie.** Jedno
 * nieodebrane powiadomienie (restart serwera, awaria sieci, wdrożenie
 * w złej chwili) to przy samym webhooku lead stracony na zawsze. Dopytanie
 * raz dziennie zamyka tę dziurę.
 */
export async function fetchLeadsForPage(
  pageId: string,
  pageToken: string,
  sinceMs: number,
): Promise<RawLead[]> {
  const out: RawLead[] = [];
  const forms = await call<{ data: { id: string }[] }>(`${pageId}/leadgen_forms`, {
    access_token: pageToken,
    limit: "100",
  });

  for (const form of forms.data ?? []) {
    const leads = await call<{ data: RawLead[] }>(`${form.id}/leads`, {
      access_token: pageToken,
      // Meta oczekuje sekund, nie milisekund.
      filtering: JSON.stringify([
        { field: "time_created", operator: "GREATER_THAN", value: Math.floor(sinceMs / 1000) },
      ]),
      fields: LEAD_FIELDS_RICH,
      limit: "100",
    });
    out.push(...(leads.data ?? []));
  }
  return out;
}

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
}

/**
 * Strony, na których zalogowana osoba może reklamować.
 *
 * **Dwie drogi, bo jedna nie wystarcza.** `/me/accounts` oddaje strony
 * przypisane do konta osobistego. Strony należące do portfolio firmowego
 * bywają tam nieobecne — i wtedy trzeba wejść przez samo portfolio
 * (`owned_pages` to strony firmy, `client_pages` to strony klientów, którymi
 * agencja zarządza). Placówka z Business Managerem trafia dokładnie w ten
 * przypadek.
 *
 * Wyniki są scalane po identyfikatorze: ta sama strona potrafi wrócić obiema
 * drogami i nie ma powodu podłączać jej dwa razy.
 */
export async function fetchPages(userToken: string): Promise<MetaPage[]> {
  const found = new Map<string, MetaPage>();

  const collect = (rows: MetaPage[] | undefined) => {
    for (const p of rows ?? []) {
      // Bez tokenu strony nie da się pobrać leada — taka pozycja jest
      // bezużyteczna i lepiej jej nie pokazywać jako podłączonej.
      if (p?.id && p.access_token) found.set(p.id, p);
    }
  };

  try {
    const res = await call<{ data: MetaPage[] }>("me/accounts", {
      access_token: userToken,
      fields: "id,name,access_token",
      limit: "100",
    });
    collect(res.data);
  } catch {
    // Brak uprawnienia do tej ścieżki nie może przekreślić drugiej.
  }

  if (found.size === 0) {
    try {
      const businesses = await call<{ data: { id: string }[] }>("me/businesses", {
        access_token: userToken,
        limit: "50",
      });
      for (const biz of businesses.data ?? []) {
        for (const edge of ["owned_pages", "client_pages"]) {
          try {
            const res = await call<{ data: MetaPage[] }>(`${biz.id}/${edge}`, {
              access_token: userToken,
              fields: "id,name,access_token",
              limit: "100",
            });
            collect(res.data);
          } catch {
            // Portfolio bez tej krawędzi albo bez uprawnienia — próbujemy dalej.
          }
        }
      }
    } catch {
      // Brak dostępu do portfolio; zostaje to, co dało `/me/accounts`.
    }
  }

  return [...found.values()];
}

/** Zapisanie strony na powiadomienia o leadach. */
export async function subscribePage(pageId: string, pageToken: string): Promise<void> {
  const url = new URL(`${GRAPH}/${pageId}/subscribed_apps`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscribed_fields: "leadgen", access_token: pageToken }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new MetaError(body?.error?.message ?? res.statusText, res.status);
  }
}

/**
 * Uprawnienia, o które prosimy przy logowaniu.
 *
 * Dokładnie tyle, ile potrzeba do odbierania leadów — ani jednego więcej.
 * Każde nadmiarowe uprawnienie to kolejna pozycja, którą Meta każe uzasadnić
 * przy przeglądzie, i kolejna rzecz, na którą placówka się zgadza.
 */
export const OAUTH_SCOPES = [
  "leads_retrieval",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_manage_ads",
  "ads_management",
  /**
   * **Bez tego `/me/accounts` zwraca pustą listę**, gdy strony należą do
   * portfolio firmowego, a nie do prywatnego konta — czyli w każdej placówce,
   * która ma Business Managera. Objaw jest mylący: logowanie kończy się
   * sukcesem, uprawnienia są nadane, a lista stron pusta.
   */
  "business_management",
].join(",");

/** Adres okna logowania Facebooka. */
export async function authorizeUrl(redirectUri: string, state: string): Promise<string> {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", await metaAppId());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", OAUTH_SCOPES);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

/**
 * Kod z przekierowania → token użytkownika, od razu długożyciowy.
 *
 * Token krótki żyje godzinę i nie ma z niego pożytku: tokeny stron wyprowadza
 * się z tokenu użytkownika, a te dziedziczą jego trwałość. Wymiana na
 * długożyciowy **przed** pobraniem stron jest więc warunkiem, żeby połączenie
 * przetrwało dłużej niż jedno popołudnie.
 */
export async function exchangeCodeForLongLivedToken(
  code: string,
  redirectUri: string,
): Promise<string> {
  const short = await call<{ access_token: string }>("oauth/access_token", {
    client_id: await metaAppId(),
    client_secret: await metaAppSecret(),
    redirect_uri: redirectUri,
    code,
  });

  const long = await call<{ access_token: string }>("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: await metaAppId(),
    client_secret: await metaAppSecret(),
    fb_exchange_token: short.access_token,
  });

  return long.access_token;
}
