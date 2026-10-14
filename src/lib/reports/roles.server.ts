import { and, eq, gte, inArray, like, lt } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  appSettings,
  automations,
  campaigns,
  contactVisits,
  contacts,
  emailEvents,
  emailSends,
  engineLog,
  smsSends,
} from "../db/schema";
import { outcome } from "../agent/signals.server";
import { channelCost, compareRates, smsSegments, type UnitPrices } from "./roles";

/**
 * Role views — the database side. The same tables the agent reads, cut the
 * way two roles ask: finance (what went out, what it cost, what the visits
 * brought and what no-shows lost) and marketing (how each campaign did and
 * which split variant won). Nothing here is estimated: a price nobody set
 * is "not set", a rate with no sends is "no data".
 */

const DAY = 86_400_000;
const PRICE_KEYS = {
  smsPartGrosze: "cost.sms_part_grosze",
  emailPer1000Grosze: "cost.email_per_1000_grosze",
} as const;

export async function getUnitPrices(): Promise<UnitPrices> {
  const rows = await getDb()
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, Object.values(PRICE_KEYS)));
  const val = (k: string) =>
    Math.max(0, Math.round(Number(rows.find((r) => r.key === k)?.value ?? 0)) || 0);
  return {
    smsPartGrosze: val(PRICE_KEYS.smsPartGrosze),
    emailPer1000Grosze: val(PRICE_KEYS.emailPer1000Grosze),
  };
}

export async function saveUnitPrices(p: UnitPrices): Promise<void> {
  const db = getDb();
  for (const [field, key] of Object.entries(PRICE_KEYS) as [keyof UnitPrices, string][]) {
    const value = String(Math.max(0, Math.round(p[field])));
    await db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value } });
  }
}

// ── finance ─────────────────────────────────────────────────────────────────

export interface ChannelLine {
  channel: "email" | "sms";
  source: string;
  sent: number;
  previous: number;
  /** SMS parts billed (SMS only). */
  parts: number;
  /** Grosze; null when the unit price is not set. */
  cost: number | null;
  costPrevious: number | null;
}

export interface FinanceView {
  windowDays: number;
  prices: UnitPrices;
  channels: ChannelLine[];
  totalCost: number | null;
  totalCostPrevious: number | null;
  /** Share of SMS bodies billed at the 70-character rate (Polish letters). */
  unicodeSmsShare: number | null;
  aiCostUsd: number;
  visits: {
    completed: number;
    completedPrevious: number;
    revenue: number;
    revenuePrevious: number;
    noShows: number;
    noShowsPrevious: number;
    lostRevenue: number;
    lostRevenuePrevious: number;
    /** Decided visits without a price — revenue figures leave them out. */
    unpriced: number;
  };
  /** Communication cost per completed visit, in grosze; null when a price or a visit is missing. */
  costPerVisit: number | null;
}

export async function financeView(now = Date.now(), windowDays = 30): Promise<FinanceView> {
  const db = getDb();
  const cur = now - windowDays * DAY;
  const prev = now - 2 * windowDays * DAY;
  const prices = await getUnitPrices();

  const emails = await db
    .select({ sentAt: emailSends.sentAt, campaignId: emailSends.campaignId })
    .from(emailSends)
    .where(and(gte(emailSends.sentAt, prev), lt(emailSends.sentAt, now)));
  const sms = await db
    .select({ sentAt: smsSends.sentAt, source: smsSends.source, body: smsSends.body })
    .from(smsSends)
    .where(and(gte(smsSends.sentAt, prev), lt(smsSends.sentAt, now)));

  const inCur = (t: number) => t >= cur;
  const channels: ChannelLine[] = [];
  const emailBy = (pred: (e: (typeof emails)[number]) => boolean, source: string) => {
    const a = emails.filter((e) => pred(e) && inCur(e.sentAt)).length;
    const b = emails.filter((e) => pred(e) && !inCur(e.sentAt)).length;
    channels.push({
      channel: "email",
      source,
      sent: a,
      previous: b,
      parts: a,
      cost: channelCost(a, prices.emailPer1000Grosze, 1000),
      costPrevious: channelCost(b, prices.emailPer1000Grosze, 1000),
    });
  };
  emailBy((e) => !!e.campaignId, "campaign");
  emailBy((e) => !e.campaignId, "other");

  const smsSources = [...new Set(sms.map((s) => s.source || "other"))].sort();
  for (const source of smsSources) {
    const rows = sms.filter((s) => (s.source || "other") === source);
    const a = rows.filter((s) => inCur(s.sentAt));
    const b = rows.filter((s) => !inCur(s.sentAt));
    const partsA = a.reduce((n, s) => n + smsSegments(s.body), 0);
    const partsB = b.reduce((n, s) => n + smsSegments(s.body), 0);
    channels.push({
      channel: "sms",
      source,
      sent: a.length,
      previous: b.length,
      parts: partsA,
      cost: channelCost(partsA, prices.smsPartGrosze),
      costPrevious: channelCost(partsB, prices.smsPartGrosze),
    });
  }

  const sum = (xs: (number | null)[]) =>
    xs.some((x) => x === null) ? null : xs.reduce<number>((n, x) => n + (x ?? 0), 0);
  const used = channels.filter((c) => c.sent > 0 || c.previous > 0);
  const totalCost = sum(used.map((c) => c.cost));
  const totalCostPrevious = sum(used.map((c) => c.costPrevious));

  const smsCur = sms.filter((s) => inCur(s.sentAt));
  const { isUnicodeSms } = await import("./roles");
  const unicodeSmsShare = smsCur.length
    ? smsCur.filter((s) => isUnicodeSms(s.body)).length / smsCur.length
    : null;

  const ai = await db
    .select({ costUsd: engineLog.costUsd })
    .from(engineLog)
    .where(
      and(eq(engineLog.kind, "ai"), gte(engineLog.createdAt, cur), lt(engineLog.createdAt, now)),
    );
  const aiCostUsd = ai.reduce((n, r) => n + (r.costUsd ?? 0), 0);

  const visits = await db
    .select()
    .from(contactVisits)
    .where(and(gte(contactVisits.startsAt, prev), lt(contactVisits.startsAt, now)));
  const v = {
    completed: 0,
    completedPrevious: 0,
    revenue: 0,
    revenuePrevious: 0,
    noShows: 0,
    noShowsPrevious: 0,
    lostRevenue: 0,
    lostRevenuePrevious: 0,
    unpriced: 0,
  };
  for (const visit of visits) {
    const o = outcome(visit, now);
    if (o === null) continue;
    const isCur = inCur(visit.startsAt as number);
    if (isCur && visit.priceGrosze === null) v.unpriced += 1;
    const price = visit.priceGrosze ?? 0;
    if (o === 0) {
      if (isCur) {
        v.completed += 1;
        v.revenue += price;
      } else {
        v.completedPrevious += 1;
        v.revenuePrevious += price;
      }
    } else if (isCur) {
      v.noShows += 1;
      v.lostRevenue += price;
    } else {
      v.noShowsPrevious += 1;
      v.lostRevenuePrevious += price;
    }
  }

  return {
    windowDays,
    prices,
    channels,
    totalCost,
    totalCostPrevious,
    unicodeSmsShare,
    aiCostUsd,
    visits: v,
    costPerVisit:
      totalCost !== null && v.completed > 0 ? Math.round(totalCost / v.completed) : null,
  };
}

// ── marketing ───────────────────────────────────────────────────────────────

/** Days after a send in which a booked visit counts towards it. */
export const BOOKING_WINDOW_DAYS = 14;

export interface CampaignLine {
  id: string;
  kind: string;
  name: string;
  segmentName: string;
  sentAt: number | null;
  sent: number;
  opened: number | null;
  clicked: number | null;
  unsubscribed: number | null;
  /** Recipients who booked a visit within the window after the send. */
  booked: number;
}

export interface VariantLine {
  label: string;
  entered: number;
  emails: number;
  opened: number;
  clicked: number;
  booked: number;
  /** Against the first variant: booked rate. */
  bookedTest: { diff: number; p: number | null; significant: boolean } | null;
  /** Against the first variant: open rate. */
  openTest: { diff: number; p: number | null; significant: boolean } | null;
}

export interface SplitLine {
  automationId: string;
  automationName: string;
  nodeId: string;
  variants: VariantLine[];
}

export interface MarketingView {
  windowDays: number;
  bookingWindowDays: number;
  campaigns: CampaignLine[];
  splits: SplitLine[];
}

/** Contacts who booked a visit within the window after `at`, from a set of contact ids. */
function bookedAfter(
  visits: { contactId: string; createdAt: number }[],
  contactIds: Set<string>,
  at: number,
): Set<string> {
  const until = at + BOOKING_WINDOW_DAYS * DAY;
  return new Set(
    visits
      .filter((v) => contactIds.has(v.contactId) && v.createdAt > at && v.createdAt <= until)
      .map((v) => v.contactId),
  );
}

export async function marketingView(now = Date.now(), windowDays = 90): Promise<MarketingView> {
  const db = getDb();
  const from = now - windowDays * DAY;
  const visits = await db
    .select({ contactId: contactVisits.contactId, createdAt: contactVisits.createdAt })
    .from(contactVisits)
    .where(gte(contactVisits.createdAt, from));
  const people = await db
    .select({ id: contacts.id, email: contacts.email, phone: contacts.phone })
    .from(contacts);
  const byEmail = new Map(
    people.filter((p) => p.email).map((p) => [p.email.trim().toLowerCase(), p.id] as const),
  );

  // Campaigns: e-mail ones measured by their tracked sends, SMS by sent count.
  const camps = await db.select().from(campaigns).where(gte(campaigns.createdAt, from));
  const campaignLines: CampaignLine[] = [];
  for (const c of camps) {
    const sends = await db
      .select({ token: emailSends.token, toEmail: emailSends.toEmail, sentAt: emailSends.sentAt })
      .from(emailSends)
      .where(eq(emailSends.campaignId, c.id));
    const tokens = sends.map((s) => s.token);
    const events = tokens.length
      ? await db
          .select({ token: emailEvents.token, kind: emailEvents.kind })
          .from(emailEvents)
          .where(inArray(emailEvents.token, tokens))
      : [];
    const distinct = (kind: string) =>
      new Set(events.filter((e) => e.kind === kind).map((e) => e.token)).size;
    const sentAt = sends.length
      ? Math.min(...sends.map((s) => s.sentAt))
      : (c.scheduledAt ?? c.createdAt);
    const recipients = new Set(
      sends.map((s) => byEmail.get(s.toEmail.trim().toLowerCase())).filter((x): x is string => !!x),
    );
    const isEmail = c.kind !== "sms";
    campaignLines.push({
      id: c.id,
      kind: c.kind,
      name: c.subject || c.templateName,
      segmentName: c.segmentName,
      sentAt,
      sent: isEmail ? sends.length : c.sentCount,
      opened: isEmail ? distinct("open") : null,
      clicked: isEmail ? distinct("click") : null,
      unsubscribed: isEmail ? distinct("unsubscribe") : null,
      booked: bookedAfter(visits, recipients, sentAt).size,
    });
  }
  campaignLines.sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0));

  // Splits: the runner logs the variant each run took; the run's later e-mails
  // carry their tracking token in the log, and the contact's bookings follow.
  const picks = await db
    .select()
    .from(engineLog)
    .where(
      and(
        eq(engineLog.kind, "condition"),
        like(engineLog.detail, '%"variant":%'),
        gte(engineLog.createdAt, from),
      ),
    );
  const runIds = [...new Set(picks.map((p) => p.runId).filter((x): x is string => !!x))];
  const runLogs = runIds.length
    ? await db
        .select({ runId: engineLog.runId, detail: engineLog.detail })
        .from(engineLog)
        .where(and(inArray(engineLog.runId, runIds), like(engineLog.detail, '%"token":%')))
    : [];
  const tokensOf = new Map<string, string[]>();
  for (const r of runLogs) {
    const token = r.detail?.token;
    if (r.runId && token) tokensOf.set(r.runId, [...(tokensOf.get(r.runId) ?? []), token]);
  }
  const allTokens = [...tokensOf.values()].flat();
  const events = allTokens.length
    ? await db
        .select({ token: emailEvents.token, kind: emailEvents.kind })
        .from(emailEvents)
        .where(inArray(emailEvents.token, allTokens))
    : [];
  const openedTokens = new Set(events.filter((e) => e.kind === "open").map((e) => e.token));
  const clickedTokens = new Set(events.filter((e) => e.kind === "click").map((e) => e.token));

  const groups = new Map<string, typeof picks>();
  for (const p of picks) {
    const key = `${p.automationId ?? ""}|${p.nodeId ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const autoIds = [...new Set(picks.map((p) => p.automationId).filter((x): x is string => !!x))];
  const names = autoIds.length
    ? new Map(
        (
          await db
            .select({ id: automations.id, name: automations.name })
            .from(automations)
            .where(inArray(automations.id, autoIds))
        ).map((a) => [a.id, a.name]),
      )
    : new Map<string, string>();

  const splits: SplitLine[] = [];
  for (const [key, rows] of groups) {
    const [automationId, nodeId] = key.split("|");
    const labels = [...new Set(rows.map((r) => r.detail?.variant ?? ""))].filter(Boolean).sort();
    const variants: VariantLine[] = labels.map((label) => {
      const mine = rows.filter((r) => r.detail?.variant === label);
      const tokens = mine.flatMap((r) => (r.runId ? (tokensOf.get(r.runId) ?? []) : []));
      let booked = 0;
      for (const r of mine)
        if (r.contactId && bookedAfter(visits, new Set([r.contactId]), r.createdAt).size > 0)
          booked += 1;
      return {
        label,
        entered: mine.length,
        emails: tokens.length,
        opened: tokens.filter((t) => openedTokens.has(t)).length,
        clicked: tokens.filter((t) => clickedTokens.has(t)).length,
        booked,
        bookedTest: null,
        openTest: null,
      };
    });
    const base = variants[0];
    for (const v of variants.slice(1)) {
      v.bookedTest = compareRates(base.booked, base.entered, v.booked, v.entered);
      v.openTest =
        v.emails && base.emails ? compareRates(base.opened, base.emails, v.opened, v.emails) : null;
    }
    splits.push({ automationId, automationName: names.get(automationId) ?? "", nodeId, variants });
  }

  return { windowDays, bookingWindowDays: BOOKING_WINDOW_DAYS, campaigns: campaignLines, splits };
}
