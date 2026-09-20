import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { allowReporter } from "./require-user";
import { normalStatus, rangeError } from "../dashboard/activity";
import { loadPatientActivity, type PatientActivity } from "../dashboard/activity.server";

import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  automations,
  contacts,
  emailEvents,
  emailSends,
  engineLog,
  inboxMessages,
} from "../db/schema";
import { intlLocale, t } from "@/lib/i18n";

// Everything the dashboard shows, counted from the database.
//
// The previous version was five hardcoded numbers (12 482 contacts, 24 610
// emails) with invented deltas, a seven-day chart from mock-data and three
// fictional campaigns. On a screen whose whole job is "what is happening right
// now", that is the most misleading thing in the app.
//
// Where a number genuinely cannot be derived — how many automations were active
// a month ago, for instance — the delta is simply absent rather than invented.

const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** SQLite caps bound parameters per statement — same reason as in engine.functions.ts. */
const IN_CHUNK = 400;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** "YYYY-MM-DD" in local time — the format `contacts.created_at` already uses. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface DashboardKpi {
  label: string;
  value: number;
  /**
   * Change against the previous period of the same length, as a fraction.
   * `null` when there is nothing to compare against — either the metric has no
   * history (how many automations were active last month is not recorded) or
   * the previous period was empty, which makes a percentage meaningless.
   */
  delta: number | null;
  /** Set when the previous period was zero but this one is not. */
  isNew?: boolean;
  hint?: string;
}

export interface DashboardEvent {
  id: string;
  who: string;
  what: string;
  when: string;
  contactId: string | null;
}

export interface DashboardCampaign {
  id: string;
  name: string;
  sent: number;
  openRate: number | null;
  clickRate: number | null;
}

export interface DashboardData {
  windowDays: number;
  kpis: DashboardKpi[];
  /** Stan bieżący całej bazy w rozbiciu na statusy — odpowiedź na „ilu mam leadów, ilu pacjentów". */
  statusTotals: { status: string; count: number }[];
  events: DashboardEvent[];
  campaigns: DashboardCampaign[];
}

function delta(current: number, previous: number): Pick<DashboardKpi, "delta" | "isNew"> {
  if (previous === 0) return current > 0 ? { delta: null, isNew: true } : { delta: null };
  return { delta: (current - previous) / previous };
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<DashboardData> => {
    const db = getDb();
    const now = Date.now();
    const windowStart = now - WINDOW_DAYS * DAY_MS;
    const previousStart = now - 2 * WINDOW_DAYS * DAY_MS;
    const windowStartDay = dayKey(new Date(windowStart));
    const previousStartDay = dayKey(new Date(previousStart));

    const [contactRows, activeAutomations, sendsWindow, sendsPrevious, actionRows] =
      await Promise.all([
        // Status dobierany razem z datą — wykres rozbija nowe kontakty na
        // statusy, a druga podróż do bazy po to samo byłaby marnotrawstwem.
        db.select({ createdAt: contacts.createdAt, status: contacts.status }).from(contacts),
        db
          .select({ count: sql<number>`count(*)` })
          .from(automations)
          .where(eq(automations.status, "active"))
          .get(),
        db
          .select({ token: emailSends.token })
          .from(emailSends)
          .where(gte(emailSends.sentAt, windowStart)),
        db
          .select({ token: emailSends.token })
          .from(emailSends)
          .where(and(gte(emailSends.sentAt, previousStart), lt(emailSends.sentAt, windowStart))),
        db
          .select({
            detail: engineLog.detail,
            automationId: engineLog.automationId,
            createdAt: engineLog.createdAt,
          })
          .from(engineLog)
          .where(and(eq(engineLog.kind, "action"), gte(engineLog.createdAt, previousStart))),
      ]);

    // ── contacts ────────────────────────────────────────────────────────────
    const newInWindow = contactRows.filter((c) => c.createdAt >= windowStartDay).length;
    const newInPrevious = contactRows.filter(
      (c) => c.createdAt >= previousStartDay && c.createdAt < windowStartDay,
    ).length;

    // ── SMS ─────────────────────────────────────────────────────────────────
    // Two sources, no overlap: campaign sends are engine actions, while replies
    // typed in the inbox and messages the agent writes are inbox rows. Engine
    // campaign sends deliberately never enter the inbox (see inbox.server.ts).
    const engineSms = actionRows.filter((r) => r.detail?.action === "send_sms");
    const inboxSms = await db
      .select({ createdAt: inboxMessages.createdAt })
      .from(inboxMessages)
      .where(
        and(
          eq(inboxMessages.channel, "sms"),
          eq(inboxMessages.direction, "out"),
          gte(inboxMessages.createdAt, previousStart),
        ),
      );
    const smsWindow =
      engineSms.filter((r) => r.createdAt >= windowStart).length +
      inboxSms.filter((r) => r.createdAt >= windowStart).length;
    const smsPrevious =
      engineSms.filter((r) => r.createdAt < windowStart).length +
      inboxSms.filter((r) => r.createdAt < windowStart).length;

    const kpis: DashboardKpi[] = [
      {
        label: t("Kontakty"),
        value: contactRows.length,
        ...delta(contactRows.length, contactRows.length - newInWindow),
      },
      {
        label: t("Nowe kontakty ({WINDOW_DAYS} dni)", { WINDOW_DAYS: WINDOW_DAYS }),
        value: newInWindow,
        ...delta(newInWindow, newInPrevious),
      },
      {
        label: t("Aktywne automatyzacje"),
        value: Number(activeAutomations?.count ?? 0),
        // Status history is not recorded anywhere, so there is no honest
        // previous value to compare against.
        delta: null,
        hint: t("Stan bieżący — historia włączeń nie jest zapisywana."),
      },
      {
        label: t("Wysłane e-maile ({WINDOW_DAYS} dni)", { WINDOW_DAYS: WINDOW_DAYS }),
        value: sendsWindow.length,
        ...delta(sendsWindow.length, sendsPrevious.length),
        hint: t("Wszystkie wysyłki z trackingiem — kampanie, odpowiedzi ze skrzynki i testy."),
      },
      {
        label: t("Wysłane SMS ({WINDOW_DAYS} dni)", { WINDOW_DAYS: WINDOW_DAYS }),
        value: smsWindow,
        ...delta(smsWindow, smsPrevious),
        hint: t("Kroki silnika oraz wiadomości wysłane ze skrzynki."),
      },
    ];

    // ── stan bieżący bazy wg statusów ───────────────────────────────────────
    //
    // Liczone agregatem po CAŁEJ tabeli, nie z okna wykresu: pytanie „ilu mam
    // pacjentów" dotyczy bazy, a nie ostatnich siedmiu dni.
    const statusRows = await db.all<{ status: string; n: number }>(
      sql`select status as status, count(*) as n from contacts
          where phone_only = 0 group by status order by n desc`,
    );
    // Scalanie PO normalizacji: SQL grupuje po surowej wartości, więc pusty
    // status i `lead` przychodziły jako dwie grupy, które obie dostawały nazwę
    // „lead". Legenda pokazywała wtedy „Lead" dwa razy z różnymi liczbami,
    // a React ostrzegał o zdublowanym kluczu.
    const merged = new Map<string, number>();
    for (const r of statusRows ?? []) {
      const key = normalStatus(r.status);
      merged.set(key, (merged.get(key) ?? 0) + Number(r.n));
    }
    const statusTotals = [...merged.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    // ── recent events ───────────────────────────────────────────────────────
    const [recentLog, recentInbox] = await Promise.all([
      db.select().from(engineLog).orderBy(desc(engineLog.createdAt)).limit(12),
      db
        .select()
        .from(inboxMessages)
        .where(eq(inboxMessages.direction, "in"))
        .orderBy(desc(inboxMessages.createdAt))
        .limit(12),
    ]);

    const contactIds = [
      ...new Set(
        [...recentLog, ...recentInbox].map((r) => r.contactId).filter((id): id is string => !!id),
      ),
    ];
    const names = new Map<string, string>();
    if (contactIds.length > 0) {
      const rows = await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
        })
        .from(contacts)
        .where(inArray(contacts.id, contactIds));
      for (const r of rows) {
        names.set(r.id, `${r.firstName} ${r.lastName}`.trim() || r.email);
      }
    }

    const events: DashboardEvent[] = [
      ...recentInbox.map((m) => ({
        id: `msg-${m.id}`,
        who: names.get(m.contactId) ?? "Pacjent",
        what: t("napisał(a) — {channel}", { channel: m.channel }),
        at: m.createdAt,
        contactId: m.contactId,
      })),
      ...recentLog.map((l) => ({
        id: `log-${l.id}`,
        who: l.contactId ? (names.get(l.contactId) ?? "Kontakt") : "PRM Engine",
        what: l.message,
        at: l.createdAt,
        contactId: l.contactId,
      })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, 8)
      .map(({ at, ...rest }) => ({
        ...rest,
        when: new Date(at).toLocaleString(intlLocale(), {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));

    // ── per-automation send stats ───────────────────────────────────────────
    // Same counting rules as the Statystyki tab: only "action" rows, so a failed
    // send never inflates the total, and rates come from the tracking token each
    // send recorded.
    const perAutomation = new Map<string, { tokens: string[] }>();
    for (const row of actionRows) {
      if (row.createdAt < windowStart) continue;
      const action = row.detail?.action;
      if (action !== "send_email" && action !== "send_newsletter") continue;
      const id = row.automationId ?? "";
      if (!id) continue;
      if (!perAutomation.has(id)) perAutomation.set(id, { tokens: [] });
      perAutomation.get(id)!.tokens.push(row.detail?.token ?? "");
    }

    let campaigns: DashboardCampaign[] = [];
    if (perAutomation.size > 0) {
      const allTokens = [...perAutomation.values()].flatMap((v) => v.tokens).filter(Boolean);
      const opened = new Set<string>();
      const clicked = new Set<string>();
      for (const part of chunk(allTokens, IN_CHUNK)) {
        const rows = await db
          .select({ token: emailEvents.token, kind: emailEvents.kind })
          .from(emailEvents)
          .where(inArray(emailEvents.token, part));
        for (const e of rows) (e.kind === "open" ? opened : clicked).add(e.token);
      }

      const automationRows = await db
        .select({ id: automations.id, name: automations.name })
        .from(automations)
        .where(inArray(automations.id, [...perAutomation.keys()]));
      const automationNames = new Map(automationRows.map((a) => [a.id, a.name]));

      campaigns = [...perAutomation.entries()]
        .map(([id, { tokens }]) => ({
          id,
          name: automationNames.get(id) ?? t("Automatyzacja usunięta"),
          sent: tokens.length,
          openRate:
            tokens.length > 0 ? tokens.filter((t) => opened.has(t)).length / tokens.length : null,
          clickRate:
            tokens.length > 0 ? tokens.filter((t) => clicked.has(t)).length / tokens.length : null,
        }))
        .sort((a, b) => b.sent - a.sent)
        .slice(0, 5);
    }

    return { windowDays: WINDOW_DAYS, kpis, statusTotals, events, campaigns };
  });

/**
 * Karta „Aktywność pacjentów": zakres dat, filtr statusów, porównanie tydzień
 * do tygodnia.
 *
 * **Osobno od `getDashboard`**, bo zmienia się przy każdym ruchu filtrem —
 * przeliczanie przy tym wskaźników, zdarzeń i kampanii całego pulpitu byłoby
 * kilkoma zbędnymi zapytaniami na każde kliknięcie.
 */
export const getPatientActivity = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(
    z.object({
      from: z.string(),
      to: z.string(),
      statuses: z.array(z.string().max(64)).max(50).default([]),
    }),
  )
  .handler(async ({ data }): Promise<PatientActivity> => {
    // Ta sama walidacja co na ekranie — serwer nie ufa temu, że ekran ją zrobił.
    const blad = rangeError(data.from, data.to);
    if (blad) throw new Error(blad);
    return loadPatientActivity(data);
  });
