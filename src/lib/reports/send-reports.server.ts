import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { checkConsent } from "../consent/consent.server";
import { resolveAudience } from "../campaigns/campaigns.server";
import {
  campaigns,
  contactVisits,
  contacts,
  emailEvents,
  emailSends,
  popupEvents,
  smsSends,
} from "../db/schema";
import { t } from "@/lib/i18n";

/**
 * Raport pojedynczej wysyłki.
 *
 * **Zasada nadrzędna: `null` znaczy „nie wiemy", a nie „zero".** Bounce rate
 * bez wpiętego Event Webhooka SendGrida jest nieznany — i tak ma się pokazać.
 * Wpisanie tam zera dałoby ekran, na którym każda wysyłka wygląda idealnie,
 * a placówka podejmuje na tej podstawie decyzje o kolejnych tysiącach
 * wiadomości. To jest jedyne miejsce w tym module, które naprawdę wymaga
 * dyscypliny; reszta to arytmetyka.
 */

/** Ile dni po wysyłce rezerwacja liczy się jako jej skutek. */
export const ATTRIBUTION_DAYS = 7;

export interface RecipientRow {
  contactId: string | null;
  name: string;
  email: string;
  openedAt: number | null;
  clickedAt: number | null;
  clickedUrl: string | null;
}

/** Ktoś z segmentu, do kogo wiadomość nie wyszła — wraz z tym, co o tym wiemy. */
export interface NotSentRow {
  contactId: string;
  name: string;
  email: string;
  reason: string;
}

export interface SendReportDetail {
  id: string;
  name: string;
  channel: "email" | "newsletter" | "sms" | "popup";
  status: string;
  segmentName: string;
  /** Ilu było w segmencie w chwili przeliczenia, minutę przed startem. */
  segmentSize: number | null;
  sentAt: number | null;
  sent: number;
  skipped: number;
  failed: number;

  /** Poniżej `null`, dopóki Event Webhook nie jest wpięty — patrz nota u góry. */
  delivered: number | null;
  bounced: number | null;
  spamReports: number | null;
  unsubscribed: number | null;

  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;

  /** Udziały jako ułamek 0–1; `null`, gdy mianownik jest zerem albo nieznany. */
  openRate: number | null;
  clickRate: number | null;
  clickToOpenRate: number | null;
  bounceRate: number | null;

  /** Rezerwacje wizyt w oknie `ATTRIBUTION_DAYS` po wysyłce. */
  conversions: number;
  /** Suma cen tych wizyt, w groszach. */
  revenueGrosze: number;
  /** Ile z policzonych wizyt nie miało podanej ceny — inaczej przychód kłamie w dół. */
  conversionsWithoutPrice: number;

  hourly: { hour: number; opens: number; clicks: number }[];
  links: { url: string; clicks: number }[];
  recipients: RecipientRow[];
  /** Osoby z segmentu bez wysyłki — patrz `notSentFor`. */
  notSent: NotSentRow[];

  /** Czy w ogóle mamy dane o doręczeniach — do pokazania podpowiedzi na ekranie. */
  hasDeliveryData: boolean;
}

/** Ułamek albo `null`, gdy mianownik nie niesie informacji. */
function ratio(numerator: number, denominator: number | null): number | null {
  if (denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

/**
 * Raport wysyłki e-mail albo newslettera.
 *
 * Wszystkie liczby pochodzą z `email_sends` i `email_events` powiązanych
 * **identyfikatorem kampanii**, a nie szablonem: dwie kampanie na tym samym
 * szablonie muszą dać dwa różne raporty.
 */
async function emailReport(
  campaign: typeof campaigns.$inferSelect,
  /**
   * `false` przy budowaniu listy.
   *
   * **Lista nie potrzebuje ani odbiorców, ani „nie wysłano", a oba kosztują
   * najwięcej**: to drugie przelicza segment po całej bazie kontaktów, więc
   * przy dwudziestu kampaniach byłoby dwadzieścia przejść po 14 tysiącach
   * wierszy — na każde wejście na ekran raportów.
   */
  detailed = true,
): Promise<SendReportDetail> {
  const db = getDb();

  const sends = await db
    .select()
    .from(emailSends)
    .where(eq(emailSends.campaignId, campaign.id))
    .all();
  const tokens = sends.map((s) => s.token);

  const events =
    tokens.length === 0
      ? []
      : await db.select().from(emailEvents).where(inArray(emailEvents.token, tokens)).all();

  const byKind = (kind: string) => events.filter((e) => e.kind === kind);
  const uniqueTokens = (kind: string) => new Set(byKind(kind).map((e) => e.token)).size;

  // Zdarzenia doręczenia istnieją wyłącznie wtedy, gdy webhook je przysłał.
  const hasDeliveryData = events.some((e) =>
    ["delivered", "bounce", "dropped", "spamreport", "unsubscribe"].includes(e.kind),
  );
  const delivered = hasDeliveryData ? uniqueTokens("delivered") : null;
  const bounced = hasDeliveryData ? uniqueTokens("bounce") + uniqueTokens("dropped") : null;
  const spamReports = hasDeliveryData ? uniqueTokens("spamreport") : null;
  const unsubscribed = hasDeliveryData ? uniqueTokens("unsubscribe") : null;

  const uniqueOpens = uniqueTokens("open");
  const uniqueClicks = uniqueTokens("click");

  // Mianownik dla OR i CTR: doręczone, jeśli je znamy; inaczej wysłane.
  // Bez doręczeń wskaźnik jest **lekko zaniżony**, bo odbicia zostają
  // w mianowniku — lepsze to niż udawanie, że wszystko doszło.
  const base = delivered ?? (campaign.sentCount > 0 ? campaign.sentCount : null);

  const first = sends.reduce<number | null>(
    (min, s) => (min === null || s.sentAt < min ? s.sentAt : min),
    null,
  );

  // Rozkład godzinowy liczony w godzinach od wysyłki, nie w porze dnia:
  // „najwięcej otwarć w drugiej godzinie" to informacja, „o 10:00" przy
  // wysyłce rozłożonej limitami — już nie.
  const hourlyMap = new Map<number, { opens: number; clicks: number }>();
  if (first !== null) {
    for (const e of events) {
      if (e.kind !== "open" && e.kind !== "click") continue;
      const h = Math.max(0, Math.floor((e.occurredAt - first) / 3_600_000));
      const slot = hourlyMap.get(h) ?? { opens: 0, clicks: 0 };
      if (e.kind === "open") slot.opens++;
      else slot.clicks++;
      hourlyMap.set(h, slot);
    }
  }

  const linkMap = new Map<string, number>();
  for (const e of byKind("click")) {
    if (!e.url) continue;
    linkMap.set(e.url, (linkMap.get(e.url) ?? 0) + 1);
  }

  // Odbiorcy: adres z wysyłki, imię z kontaktu, czasy z pierwszego zdarzenia.
  const emails = [...new Set(sends.map((s) => s.toEmail.toLowerCase()))];
  const people =
    emails.length === 0
      ? []
      : await db
          .select({
            id: contacts.id,
            email: contacts.email,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
          })
          .from(contacts)
          .where(inArray(contacts.email, emails))
          .all();
  const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p]));

  const recipients: RecipientRow[] = sends.map((s) => {
    const own = events.filter((e) => e.token === s.token);
    const open = own
      .filter((e) => e.kind === "open")
      .sort((a, b) => a.occurredAt - b.occurredAt)[0];
    const click = own
      .filter((e) => e.kind === "click")
      .sort((a, b) => a.occurredAt - b.occurredAt)[0];
    const person = byEmail.get(s.toEmail.toLowerCase());
    return {
      contactId: person?.id ?? null,
      name: person ? `${person.firstName} ${person.lastName}`.trim() : s.toEmail,
      email: s.toEmail,
      openedAt: open?.occurredAt ?? null,
      clickedAt: click?.occurredAt ?? null,
      clickedUrl: click?.url ?? null,
    };
  });

  const conv = await conversions(
    recipients.map((r) => r.contactId).filter((id): id is string => !!id),
    first,
  );

  return {
    id: campaign.id,
    name: campaign.templateName,
    channel: campaign.kind === "newsletter" ? "newsletter" : "email",
    status: campaign.status,
    segmentName: campaign.segmentName,
    segmentSize: campaign.audienceCount,
    sentAt: first,
    sent: campaign.sentCount,
    skipped: campaign.skippedCount,
    failed: campaign.failedCount,
    delivered,
    bounced,
    spamReports,
    unsubscribed,
    opens: byKind("open").length,
    uniqueOpens,
    clicks: byKind("click").length,
    uniqueClicks,
    openRate: ratio(uniqueOpens, base),
    clickRate: ratio(uniqueClicks, base),
    clickToOpenRate: ratio(uniqueClicks, uniqueOpens > 0 ? uniqueOpens : null),
    bounceRate: bounced === null ? null : ratio(bounced, campaign.sentCount || null),
    ...conv,
    hourly: [...hourlyMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, v]) => ({ hour, ...v })),
    links: [...linkMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([url, clicks]) => ({ url, clicks })),
    recipients: detailed ? recipients : [],
    notSent: detailed
      ? await notSentFor(
          campaign,
          new Set(recipients.map((r) => r.contactId).filter((id): id is string => !!id)),
          new Set(sends.map((s) => s.toEmail.toLowerCase())),
        )
      : [],
    hasDeliveryData,
  };
}

/**
 * Kto z segmentu **nie dostał** tej wiadomości i dlaczego.
 *
 * **Segment liczony jest DZIŚ, nie w chwili wysyłki** — i to jest jedyne
 * uczciwe, co da się zrobić: audytorium nie jest nigdzie zapisywane, mamy
 * tylko jego liczebność (`audienceCount`). Jeśli ktoś wszedł do segmentu po
 * wysyłce, pojawi się tu jako „nie wysłano", choć w chwili wysyłki go nie
 * było. Ekran mówi o tym wprost, zamiast udawać, że to migawka sprzed
 * tygodnia.
 *
 * **Powód jest odczytywany teraz, nie zapisany wtedy.** Silnik liczy tylko
 * ile osób pominął, nie dlaczego u każdej z osobna. Zgoda sprawdzana dziś jest
 * najlepszym przybliżeniem — pacjent mógł ją cofnąć po wysyłce i wtedy powód
 * będzie mylący. Dlatego brzmi „brak zgody dziś", a nie „pominięty z powodu
 * braku zgody".
 */
async function notSentFor(
  campaign: typeof campaigns.$inferSelect,
  reachedContactIds: Set<string>,
  reachedEmails: Set<string>,
): Promise<NotSentRow[]> {
  const audience = await resolveAudience(campaign.segmentId);
  const out: NotSentRow[] = [];

  for (const c of audience) {
    if (reachedContactIds.has(c.id)) continue;
    // Kontakt bez dopasowania po identyfikatorze mógł zostać dopasowany po
    // adresie (wysyłka trzyma adres, nie identyfikator).
    if (c.email && reachedEmails.has(c.email.toLowerCase())) continue;

    const channel = campaign.kind === "sms" ? ("sms" as const) : ("email" as const);
    let reason: string;
    if (channel === "email" && !c.email?.trim()) {
      reason = "Brak adresu e-mail";
    } else if (channel === "sms" && !c.phone?.trim()) {
      reason = "Brak numeru telefonu";
    } else {
      const decision = checkConsent(c, channel);
      reason = decision.allowed
        ? campaign.status === "sent"
          ? t("Nie wyszła — sprawdź dziennik silnika")
          : t("Wysyłka jeszcze nie dotarła do tej osoby")
        : // Skrócone do pierwszego zdania: pełny komunikat zgody jest
          // instrukcją dla wysyłającego, a tu potrzebna jest etykieta.
          t("{v0} (stan na dziś)", {
            v0: (decision.reason ?? t("Wysyłka zablokowana")).split("—")[0].trim(),
          });
    }

    out.push({
      contactId: c.id,
      name: `${c.firstName} ${c.lastName}`.trim() || c.email || c.phone,
      email: c.email || c.phone || "",
      reason,
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

/**
 * Rezerwacje wizyt jako skutek wysyłki.
 *
 * **Przypisanie po oknie czasu, nie po deklaracji.** Wizyta zarezerwowana
 * w ciągu `ATTRIBUTION_DAYS` dni po wysyłce, przez kogoś, kto tę wysyłkę
 * dostał, liczy się jako konwersja. To jest przybliżenie i trzeba je tak
 * nazywać: pacjent mógł zadzwonić z zupełnie innego powodu.
 *
 * **Cena bywa pusta** (`priceGrosze` jest nullowalne — system rezerwacji nie
 * zawsze ją podaje). Takie wizyty liczymy do konwersji, ale **nie** do
 * przychodu, i mówimy ile ich było. Doliczenie ich jako zero zaniżałoby
 * przychód bez śladu.
 */
async function conversions(
  contactIds: string[],
  since: number | null,
): Promise<{ conversions: number; revenueGrosze: number; conversionsWithoutPrice: number }> {
  if (contactIds.length === 0 || since === null) {
    return { conversions: 0, revenueGrosze: 0, conversionsWithoutPrice: 0 };
  }
  const db = getDb();
  const until = since + ATTRIBUTION_DAYS * 24 * 3_600_000;
  const rows = await db
    .select({ price: contactVisits.priceGrosze })
    .from(contactVisits)
    .where(
      and(
        inArray(contactVisits.contactId, contactIds),
        gte(contactVisits.createdAt, since),
        lte(contactVisits.createdAt, until),
      ),
    )
    .all();

  return {
    conversions: rows.length,
    revenueGrosze: rows.reduce((sum, r) => sum + (r.price ?? 0), 0),
    conversionsWithoutPrice: rows.filter((r) => r.price === null).length,
  };
}

/** Raport wysyłki SMS. SMS nie ma otwarć ani kliknięć — i to nie jest brak danych. */
async function smsReport(
  campaign: typeof campaigns.$inferSelect,
  detailed = true,
): Promise<SendReportDetail> {
  const db = getDb();
  const rows = await db.select().from(smsSends).where(eq(smsSends.campaignId, campaign.id)).all();
  const first = rows.reduce<number | null>(
    (min, r) => (min === null || r.sentAt < min ? r.sentAt : min),
    null,
  );
  const conv = await conversions(
    rows.map((r) => r.contactId),
    first,
  );

  return {
    id: campaign.id,
    name: campaign.templateName,
    channel: "sms",
    status: campaign.status,
    segmentName: campaign.segmentName,
    segmentSize: campaign.audienceCount,
    sentAt: first,
    sent: campaign.sentCount,
    skipped: campaign.skippedCount,
    failed: campaign.failedCount,
    // Operator nie odsyła nam potwierdzeń doręczenia, a SMS nie ma otwarć.
    delivered: null,
    bounced: null,
    spamReports: null,
    unsubscribed: null,
    opens: 0,
    uniqueOpens: 0,
    clicks: 0,
    uniqueClicks: 0,
    openRate: null,
    clickRate: null,
    clickToOpenRate: null,
    bounceRate: null,
    ...conv,
    hourly: [],
    links: [],
    recipients: [],
    notSent: detailed
      ? await notSentFor(campaign, new Set(rows.map((r) => r.contactId)), new Set())
      : [],
    hasDeliveryData: false,
  };
}

export async function getSendReport(campaignId: string): Promise<SendReportDetail | null> {
  const db = getDb();
  const campaign = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign) return null;
  return campaign.kind === "sms" ? smsReport(campaign) : emailReport(campaign);
}

export interface SendReportSummary {
  id: string;
  name: string;
  channel: string;
  status: string;
  segmentName: string;
  sentAt: number | null;
  sent: number;
  openRate: number | null;
  clickRate: number | null;
  bounceRate: number | null;
}

/** Lista wysyłek do tabeli. Liczy tylko wskaźniki — szczegóły dopiero po wejściu. */
export async function listSendReports(): Promise<SendReportSummary[]> {
  const db = getDb();
  const rows = await db.select().from(campaigns).all();
  const out: SendReportSummary[] = [];
  for (const c of rows) {
    const r = c.kind === "sms" ? await smsReport(c, false) : await emailReport(c, false);
    out.push({
      id: r.id,
      name: r.name,
      channel: r.channel,
      status: r.status,
      segmentName: r.segmentName,
      sentAt: r.sentAt,
      sent: r.sent,
      openRate: r.openRate,
      clickRate: r.clickRate,
      bounceRate: r.bounceRate,
    });
  }
  return out.sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0));
}

/** Statystyki pop-upu — wyświetlenia i kliknięcia, po treści. */
export async function popupStats(
  contentItemId: string,
): Promise<{ impressions: number; clicks: number; ctr: number | null }> {
  const db = getDb();
  const rows = await db
    .select()
    .from(popupEvents)
    .where(eq(popupEvents.contentItemId, contentItemId))
    .all();
  const impressions = rows.filter((r) => r.kind === "impression").length;
  const clicks = rows.filter((r) => r.kind === "click").length;
  return { impressions, clicks, ctr: ratio(clicks, impressions || null) };
}
