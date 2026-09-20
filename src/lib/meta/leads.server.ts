import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { metaConnections } from "../db/schema";
import { createContactFromLead } from "../contacts.server";
import { addNote } from "../notes/notes.server";
import { emitEvent } from "../engine/events.server";
import { logStep } from "../engine/log.server";
import { splitFullName, normalizePersonName } from "../contacts-import";
import {
  fetchLead,
  fetchLeadsForPage,
  MetaError,
  resolveCampaignName,
  type RawLead,
} from "./graph.server";
import { intlLocale, t } from "@/lib/i18n";

/**
 * Zamiana leada z Mety na kontakt.
 *
 * **Nazwy pól w formularzu ustala reklamodawca**, nie Meta. „email",
 * „adres_e-mail", „E-mail", „mail" — wszystko jedno, co ktoś wpisał zakładając
 * formularz. Dlatego dopasowanie jest po znormalizowanym kluczu i po liście
 * synonimów, dokładnie tak jak przy imporcie CSV i webhooku Zapiera; sztywna
 * lista nazw kończy się leadem bez adresu i wysyłką, która „się udała".
 */

/**
 * Wartość odpowiedzi w postaci do czytania.
 *
 * Facebook oddaje warianty odpowiedzi jako klucze z podkreśleniami
 * (`nigdy_nie_nosiłem/-am_aparatu_słuchowego`). Zamiana na spacje jest
 * bezpieczna **tylko wtedy, gdy w wartości nie ma już spacji** — inaczej
 * zepsulibyśmy odpowiedź, w której podkreślenie napisał sam pacjent.
 */
function cleanValue(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (value.includes(" ") || !value.includes("_")) return value;
  return value.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function foldKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => "acelnoszz"["ąćęłńóśźż".indexOf(ch)])
    .replace(/[\s_-]+/g, "");
}

const EMAIL_KEYS = ["email", "emailaddress", "adresemail", "mail", "adresmailowy"];
const PHONE_KEYS = ["phonenumber", "phone", "telefon", "numertelefonu", "tel", "komorka"];
const FULL_NAME_KEYS = ["fullname", "name", "imienazwisko", "imieinazwisko", "nazwa"];
const FIRST_KEYS = ["firstname", "imie", "first"];
const LAST_KEYS = ["lastname", "nazwisko", "last", "surname"];

function pick(fields: Map<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = fields.get(k);
    if (v?.trim()) return v.trim();
  }
  return "";
}

/**
 * Pierwsza linia notatki z leada — **jednocześnie jej znacznik**.
 *
 * Po nim skrypt nadrabiający rozpoznaje notatki, które sam ma podmienić.
 * Gdyby ten tekst kiedyś się zmienił, stare notatki przestaną być
 * rozpoznawane — dlatego jest stałą, a nie wpisany w dwóch miejscach.
 */
export const LEAD_NOTE_PREFIX = "Lead z Facebooka —";

/**
 * Treść notatki z leada.
 *
 * **Jedna funkcja dla wysyłki na żywo i dla skryptu nadrabiającego** — dwie
 * kopie rozjechałyby się przy pierwszej poprawce, a wtedy notatka poprawiona
 * wstecz wyglądałaby inaczej niż świeża.
 */
export function buildLeadNote(
  raw: RawLead,
  pageLabel: string,
  campaign: string,
  fields: Map<string, string>,
  labels: Map<string, string>,
  used: Set<string>,
): string {
  const extra = [...fields.entries()]
    .filter(([k]) => !used.has(k))
    // Podpis z oryginalnego pytania; klucz tylko wtedy, gdy Facebook nie podał
    // nazwy — lepszy skrót niż pusty wiersz.
    .map(([k, v]) => [labels.get(k) || k, v] as const);

  return [
    `${LEAD_NOTE_PREFIX} ${pageLabel}`,
    raw.created_time
      ? t("Wypełniony: {v0}", { v0: new Date(raw.created_time).toLocaleString(intlLocale()) })
      : "",
    ...(raw.form_id ? [`Formularz: ${raw.form_id}`] : []),
    ...(campaign ? [`Kampania: ${campaign}`] : []),
    ...(raw.adset_name ? [`Zestaw reklam: ${raw.adset_name}`] : []),
    ...(raw.ad_name ? [`Reklama: ${raw.ad_name}`] : []),
    ...extra.map(([k, v]) => `${k}: ${v}`),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Rozbiór pól leada: klucz do **dopasowywania** i tekst do **pokazania**.
 *
 * `foldKey` zdejmuje spacje i ogonki, żeby „Adres e-mail" trafiło w `email`
 * niezależnie od tego, jak nazwał to pole autor formularza. Ale ta postać jest
 * nieczytelna (`odkiedynieslyszysz`) i **nie wolno jej pokazywać człowiekowi**
 * — Facebook przysyła pytanie normalnie i to ono idzie do notatki.
 */
export function readLeadFields(raw: RawLead): {
  fields: Map<string, string>;
  labels: Map<string, string>;
} {
  const fields = new Map<string, string>();
  const labels = new Map<string, string>();
  for (const f of raw.field_data ?? []) {
    const value = cleanValue((f.values ?? []).join(", "));
    if (!value) continue;
    const key = foldKey(f.name);
    fields.set(key, value);
    labels.set(key, f.name.trim());
  }
  return { fields, labels };
}

/** Klucze zużyte na dane kontaktowe — reszta idzie do notatki jako odpowiedzi. */
export const CONTACT_KEYS = new Set([
  ...EMAIL_KEYS,
  ...PHONE_KEYS,
  ...FULL_NAME_KEYS,
  ...FIRST_KEYS,
  ...LAST_KEYS,
]);

export interface IngestResult {
  created: boolean;
  contactId: string | null;
  /** Powód pominięcia — pusty, gdy lead wszedł. */
  skipped?: string;
}

/**
 * Jeden lead → kontakt.
 *
 * **Zgody NIE są zakładane.** Wypełnienie formularza reklamowego jest zgodą na
 * kontakt w sprawie, o którą pytano — ale zgoda marketingowa w rozumieniu RODO
 * to osobne oświadczenie, którego Meta nam nie przekazuje. Kontakt wchodzi
 * więc bez zgód, ze statusem „lead", a treść formularza ląduje w notatce.
 * Zaznaczenie zgody za pacjenta byłoby wpisem, którego nikt nie obroni.
 */
export async function ingestLead(
  raw: RawLead,
  pageId: string,
  pageName: string,
  /** Ustawienia strony — tagi i status z ekranu Integracji. */
  settings?: { leadTags?: string; leadStatus?: string },
  /** Token strony — potrzebny tylko do dopytania o nazwę kampanii. */
  pageToken?: string,
): Promise<IngestResult> {
  const { fields, labels } = readLeadFields(raw);

  const email = pick(fields, EMAIL_KEYS).toLowerCase();
  const phone = pick(fields, PHONE_KEYS);

  // Bez adresu i bez telefonu nie ma czego założyć — kontakt bez żadnego
  // kanału to wiersz, do którego nikt nigdy nie napisze.
  if (!email && !phone) {
    return { created: false, contactId: null, skipped: t("Lead bez adresu e-mail i bez telefonu") };
  }

  let firstName = normalizePersonName(pick(fields, FIRST_KEYS));
  let lastName = normalizePersonName(pick(fields, LAST_KEYS));
  if (!firstName && !lastName) {
    const full = pick(fields, FULL_NAME_KEYS);
    if (full) ({ firstName, lastName } = splitFullName(full));
  }

  /**
   * **Nazwa kampanii, nie numer.** `6975548113607` nic nikomu nie mówi, a to
   * pole ląduje na karcie pacjenta jako „Kampania pozyskania" i po nim buduje
   * się segmenty. Nazwa bierze się z samego leada, gdy Meta ją odda; jeśli nie
   * — dopytujemy raz na kampanię. Gdy i to zawiedzie, zostaje numer: gorszy
   * opis jest lepszy niż puste pole.
   */
  let campaign = raw.campaign_name?.trim() ?? "";
  if (!campaign && raw.campaign_id && pageToken) {
    campaign = await resolveCampaignName(raw.campaign_id, pageToken);
  }
  if (!campaign) campaign = raw.campaign_id ?? "";

  const { created, contactId } = await createContactFromLead({
    firstName,
    lastName,
    email,
    phone,
    source: "Meta",
    medium: "paid_social",
    campaign,
    // **Tagi i status z ustawień TEJ strony**, nie zaszyte w kodzie: placówka
    // prowadzi kampanie na kilka specjalizacji i sama wie, jak je opisać.
    // `createContactFromLead` nie dokłada już nic od siebie, więc puste
    // ustawienie naprawdę znaczy „bez tagu".
    tags: (settings?.leadTags ?? "meta-lead")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    status: (settings?.leadStatus ?? "lead").trim(),
  });

  // Cała treść formularza w notatce: pytania bywają branżowe („którego
  // specjalistę szukasz"), a odpowiedź jest tym, po co ten lead powstał.
  const used = CONTACT_KEYS;
  await addNote({
    contactId,
    text: buildLeadNote(raw, pageName || pageId, campaign, fields, labels, used),
    source: "form",
  });
  await emitEvent({
    type: "form.submitted",
    contactId,
    payload: { form: "Facebook Lead Ads", source: "facebook", campaign },
  });

  return { created, contactId };
}

/** Powiadomienie z webhooka: pobierz lead i załóż kontakt. */
export async function handleLeadgenNotification(
  leadgenId: string,
  pageId: string,
): Promise<IngestResult> {
  const db = getDb();
  const conn = await db
    .select()
    .from(metaConnections)
    .where(eq(metaConnections.pageId, pageId))
    .get();
  if (!conn) {
    // Powiadomienie ze strony, której nie podłączyliśmy — nie mamy czym pobrać
    // treści. Mówimy o tym w dzienniku zamiast milczeć.
    await logStep({
      kind: "error",
      message: t("Meta: lead ze strony {pageId}, która nie jest podłączona w Integracjach.", {
        pageId: pageId,
      }),
    });
    return { created: false, contactId: null, skipped: t("Strona niepodłączona") };
  }

  try {
    const raw = await fetchLead(leadgenId, conn.pageAccessToken);
    const result = await ingestLead(
      raw,
      pageId,
      conn.pageName,
      { leadTags: conn.leadTags, leadStatus: conn.leadStatus },
      conn.pageAccessToken,
    );
    await db
      .update(metaConnections)
      .set({ lastLeadAt: Date.now(), lastError: null, lastErrorAt: null })
      .where(eq(metaConnections.pageId, pageId));
    return result;
  } catch (err) {
    const message = err instanceof MetaError ? err.message : String(err);
    await db
      .update(metaConnections)
      .set({ lastError: message, lastErrorAt: Date.now() })
      .where(eq(metaConnections.pageId, pageId));
    await logStep({
      kind: "error",
      message: t("Meta: nie pobrano leada {leadgenId} — {message}", {
        leadgenId: leadgenId,
        message: message,
      }),
    });
    throw err;
  }
}

/**
 * Dopytanie zaległości dla wszystkich podłączonych stron.
 *
 * **Zamyka dziurę, której webhook sam nie zamknie.** Meta ponawia
 * powiadomienie tylko przez pewien czas; restart w złej chwili albo błąd sieci
 * to lead, o którym nigdy się nie dowiemy — a po 90 dniach Meta kasuje go
 * bezpowrotnie. Wołane raz dziennie przez silnik.
 *
 * Okno cofa się o **7 dni** od ostatniego udanego dopytania: nadmiar jest
 * darmowy (kontakt i tak dopasuje się po e-mailu), a niedomiar oznacza
 * bezpowrotną stratę.
 */
export async function backfillMetaLeads(): Promise<{ pages: number; leads: number }> {
  const db = getDb();
  const conns = await db.select().from(metaConnections).all();
  let leads = 0;

  for (const conn of conns) {
    const since = conn.backfilledTo ?? Date.now() - 7 * 24 * 3_600_000;
    const from = Math.min(since, Date.now() - 7 * 24 * 3_600_000);
    try {
      const raws = await fetchLeadsForPage(conn.pageId, conn.pageAccessToken, from);
      for (const raw of raws) {
        // `createContactFromLead` dopasowuje po e-mailu i telefonie, więc lead
        // odebrany już webhookiem nie utworzy drugiego kontaktu.
        await ingestLead(
          raw,
          conn.pageId,
          conn.pageName,
          { leadTags: conn.leadTags, leadStatus: conn.leadStatus },
          conn.pageAccessToken,
        );
        leads += 1;
      }
      await db
        .update(metaConnections)
        .set({ backfilledTo: Date.now(), lastError: null, lastErrorAt: null })
        .where(eq(metaConnections.pageId, conn.pageId));
    } catch (err) {
      const message = err instanceof MetaError ? err.message : String(err);
      await db
        .update(metaConnections)
        .set({ lastError: message, lastErrorAt: Date.now() })
        .where(eq(metaConnections.pageId, conn.pageId));
      await logStep({
        kind: "error",
        message: t("Meta: dopytanie zaległości dla strony {v0} nie powiodło się — {message}", {
          v0: conn.pageName || conn.pageId,
          message: message,
        }),
      });
    }
  }

  return { pages: conns.length, leads };
}

/**
 * Harmonogram dopytania zaległości — raz na dobę, na zegarze silnika.
 *
 * Stan w pamięci, jak przy systemie rezerwacji: po restarcie przebieg rusza od razu,
 * co jest zachowaniem pożądanym — wdrożenie w środku dnia ma nadrobić to, co
 * mogło przepaść w czasie restartu.
 */
const BACKFILL_EVERY_MS = 24 * 60 * 60 * 1000;
const META_STATE = Symbol.for("prm.meta.backfill");

export async function maybeBackfillMeta(now: number = Date.now()): Promise<void> {
  const g = globalThis as unknown as Record<symbol, { lastAt: number; busy: boolean }>;
  g[META_STATE] ??= { lastAt: 0, busy: false };
  const state = g[META_STATE];

  if (state.busy || now - state.lastAt < BACKFILL_EVERY_MS) return;

  const db = getDb();
  // Bez podłączonej strony nie ma czego dopytywać — i nie ma po co budzić
  // licznika, żeby po podłączeniu przebieg ruszył od razu.
  const any = await db.select().from(metaConnections).limit(1).all();
  if (any.length === 0) return;

  state.busy = true;
  state.lastAt = now;
  try {
    const r = await backfillMetaLeads();
    if (r.leads > 0) {
      await logStep({
        kind: "action",
        message: t("Meta: dopytanie zaległości — {leads} leadów z {pages} stron.", {
          leads: r.leads,
          pages: r.pages,
        }),
      });
    }
  } catch (err) {
    // Awaria Mety nie może wywalić ticku silnika — automatyzacje mają chodzić.
    await logStep({
      kind: "error",
      message: t("Meta: dopytanie zaległości padło — {v0}", { v0: String(err) }),
    });
  } finally {
    state.busy = false;
  }
}
