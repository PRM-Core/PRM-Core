import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { and, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contacts, emailEvents, emailSends } from "../db/schema";
import { z } from "zod";
import { getSessionUser } from "../auth/session.server";
import {
  getSendReport,
  listSendReports,
  type SendReportDetail,
  type SendReportSummary,
} from "../reports/send-reports.server";
import { intlLocale, t } from "@/lib/i18n";

// The Raporty tab, counted from the database.
//
// It used to be four hardcoded KPIs (1 248 leads, 52.3% conversion, 48.2% open
// rate), a five-month conversion line and a source pie — all from mock-data.
// A report nobody can trace back to a row is worse than no report.

const WINDOW_DAYS = 30;
const MONTHS = 6;
const SEND_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const IN_CHUNK = 400;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface ReportKpi {
  label: string;
  value: string;
  delta: number | null;
  hint?: string;
}

export interface ReportMonthPoint {
  month: string;
  pozyskane: number;
  pacjenci: number;
}

export interface ReportSource {
  source: string;
  value: number;
}

export interface ReportSendPoint {
  day: string;
  wyslane: number;
  otwarcia: number;
  klikniecia: number;
}

export interface ReportsData {
  windowDays: number;
  kpis: ReportKpi[];
  months: ReportMonthPoint[];
  sources: ReportSource[];
  sends: ReportSendPoint[];
  /** True when nothing has been sent in the send window — the chart says so instead of drawing a flat line. */
  sendsEmpty: boolean;
}

export const getReports = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<ReportsData> => {
    const db = getDb();
    const now = Date.now();
    const windowStart = now - WINDOW_DAYS * DAY_MS;
    const previousStart = now - 2 * WINDOW_DAYS * DAY_MS;
    const windowStartDay = dayKey(new Date(windowStart));
    const previousStartDay = dayKey(new Date(previousStart));

    const [contactRows, sendsWindow, sendsPrevious, sendsForChart] = await Promise.all([
      db
        .select({
          createdAt: contacts.createdAt,
          status: contacts.status,
          source: contacts.source,
        })
        .from(contacts),
      db
        .select({ token: emailSends.token })
        .from(emailSends)
        .where(gte(emailSends.sentAt, windowStart)),
      db
        .select({ token: emailSends.token })
        .from(emailSends)
        .where(and(gte(emailSends.sentAt, previousStart), lt(emailSends.sentAt, windowStart))),
      db
        .select({ token: emailSends.token, sentAt: emailSends.sentAt })
        .from(emailSends)
        .where(gte(emailSends.sentAt, now - SEND_DAYS * DAY_MS)),
    ]);

    /** Unique tokens that were opened / clicked, for any token list. */
    const eventsFor = async (tokens: string[]) => {
      const opened = new Set<string>();
      const clicked = new Set<string>();
      for (const part of chunk(tokens.filter(Boolean), IN_CHUNK)) {
        const rows = await db
          .select({ token: emailEvents.token, kind: emailEvents.kind })
          .from(emailEvents)
          .where(inArray(emailEvents.token, part));
        for (const e of rows) (e.kind === "open" ? opened : clicked).add(e.token);
      }
      return { opened, clicked };
    };

    const windowTokens = sendsWindow.map((s) => s.token);
    const previousTokens = sendsPrevious.map((s) => s.token);
    const [windowEvents, previousEvents] = await Promise.all([
      eventsFor(windowTokens),
      eventsFor(previousTokens),
    ]);

    const rate = (hit: number, total: number) => (total > 0 ? hit / total : null);
    const openNow = rate(windowEvents.opened.size, windowTokens.length);
    const openPrev = rate(previousEvents.opened.size, previousTokens.length);
    const clickNow = rate(windowEvents.clicked.size, windowTokens.length);
    const clickPrev = rate(previousEvents.clicked.size, previousTokens.length);

    const newInWindow = contactRows.filter((c) => c.createdAt >= windowStartDay).length;
    const newInPrevious = contactRows.filter(
      (c) => c.createdAt >= previousStartDay && c.createdAt < windowStartDay,
    ).length;
    const patients = contactRows.filter((c) => c.status === "patient").length;

    const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
    /** Difference between two rates, expressed relative to the earlier one. */
    const rateDelta = (now_: number | null, prev: number | null) =>
      now_ === null || prev === null || prev === 0 ? null : (now_ - prev) / prev;

    const kpis: ReportKpi[] = [
      {
        label: t("Nowe kontakty ({WINDOW_DAYS} dni)", { WINDOW_DAYS: WINDOW_DAYS }),
        value: newInWindow.toLocaleString(intlLocale()),
        delta: newInPrevious > 0 ? (newInWindow - newInPrevious) / newInPrevious : null,
      },
      {
        label: t("Udział pacjentów"),
        value: contactRows.length > 0 ? pct(patients / contactRows.length) : "—",
        // Status changes are only recorded as events since the field_changed
        // work, so there is no reliable "a month ago" figure to compare with.
        delta: null,
        hint: t("{patients} z {length} kontaktów ma status Pacjent.", {
          patients: patients,
          length: contactRows.length,
        }),
      },
      {
        label: t("Open rate ({WINDOW_DAYS} dni)", { WINDOW_DAYS: WINDOW_DAYS }),
        value: pct(openNow),
        delta: rateDelta(openNow, openPrev),
        hint: t(
          "Unikalne otwarcia wobec wysyłek. Apple Mail zawyża ten wskaźnik u części odbiorców.",
        ),
      },
      {
        label: t("Click rate ({WINDOW_DAYS} dni)", { WINDOW_DAYS: WINDOW_DAYS }),
        value: pct(clickNow),
        delta: rateDelta(clickNow, clickPrev),
        hint: t("Unikalne kliknięcia wobec wysyłek."),
      },
    ];

    // ── acquisition and conversion per month ────────────────────────────────
    // "Pacjenci" is not a historical transition count — nothing records when a
    // status changed. It is: of the contacts acquired in that month, how many
    // carry the Pacjent status *today*. Stated that way in the UI too.
    const months: ReportMonthPoint[] = [];
    for (let i = MONTHS - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const inMonth = contactRows.filter((c) => c.createdAt.slice(0, 7) === key);
      months.push({
        month: d.toLocaleDateString(intlLocale(), { month: "short", year: "2-digit" }),
        pozyskane: inMonth.length,
        pacjenci: inMonth.filter((c) => c.status === "patient").length,
      });
    }

    // ── acquisition sources ─────────────────────────────────────────────────
    const bySource = new Map<string, number>();
    for (const c of contactRows) {
      const key = c.source.trim() || t("Nieznane źródło");
      bySource.set(key, (bySource.get(key) ?? 0) + 1);
    }
    const sources: ReportSource[] = [...bySource.entries()]
      .map(([source, value]) => ({ source, value }))
      .sort((a, b) => b.value - a.value);

    // ── sends and reactions per day ─────────────────────────────────────────
    const chartEvents = await eventsFor(sendsForChart.map((s) => s.token));
    const perDay = new Map<string, ReportSendPoint>();
    for (let i = SEND_DAYS - 1; i >= 0; i--) {
      const d = new Date(now - i * DAY_MS);
      perDay.set(dayKey(d), {
        day: d.toLocaleDateString(intlLocale(), { day: "2-digit", month: "2-digit" }),
        wyslane: 0,
        otwarcia: 0,
        klikniecia: 0,
      });
    }
    for (const s of sendsForChart) {
      const point = perDay.get(dayKey(new Date(s.sentAt)));
      if (!point) continue;
      point.wyslane += 1;
      // Reactions are counted on the day the message went out, not the day they
      // happened — that is what makes a bar comparable with the send above it.
      if (chartEvents.opened.has(s.token)) point.otwarcia += 1;
      if (chartEvents.clicked.has(s.token)) point.klikniecia += 1;
    }
    const sends = [...perDay.values()];

    return {
      windowDays: WINDOW_DAYS,
      kpis,
      months,
      sources,
      sends,
      sendsEmpty: sendsForChart.length === 0,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Raporty pojedynczych wysyłek
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **Listy odbiorców to dane osobowe pacjentów w kontekście zdrowotnym** — kto
 * otworzył wiadomość o kardiologii, ten prawdopodobnie ma powód. Dlatego obie
 * funkcje wymagają zalogowania, także ta zwracająca samą listę wysyłek.
 *
 * Logika liczenia siedzi w `reports/send-reports.server.ts`; tu jest brama.
 */
export type { SendReportDetail, SendReportSummary };

export const getSendReportsList = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<SendReportSummary[]> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return listSendReports();
  });

export const getSendReportDetail = createServerFn({ method: "POST" })
  .middleware([allowReporter])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }): Promise<SendReportDetail | null> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return getSendReport(data.id);
  });
