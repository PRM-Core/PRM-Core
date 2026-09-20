import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { findContentItem, renderContentItem } from "../content/content-items.server";
import { and, count, desc, eq, gte, isNull, inArray } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  automations,
  automationRuns,
  engineJobs,
  engineEvents,
  engineLog,
  emailEvents,
  contacts,
} from "../db/schema";
import { getEngineStatus, runTickOnce } from "../engine/loop.server";
import { recentLog } from "../engine/log.server";
import { saveSnapshot } from "../engine/snapshots.server";
import { dryRun, type DryRunResult, type DryRunStep } from "../engine/dry-run.server";

// Re-exported so the dialog imports its row type from the same place it imports
// the call — client code has no business reaching into a *.server.ts module.
export type { DryRunStep, DryRunResult };
import {
  countOpenCritical,
  listInsights,
  runSupervisor,
  setInsightStatus,
} from "../engine/supervisor.server";
import { saveBaseUrl } from "../engine/settings.server";
import type { AutomationRunStatus } from "../db/schema";
import { nodeTitle } from "../automation-catalog";
import { formatActivityDate } from "@/lib/activity-date";
import { t } from "@/lib/i18n";

// RPC surface for the PRM Engine panel. Everything server-only lives behind a
// *.server.ts import (node:crypto, the DB client, the loop handle) — this file
// only wraps it, per the project convention (CONTRIBUTING.md).

export interface EngineLogEntry {
  id: string;
  runId: string | null;
  automationId: string | null;
  contactId: string | null;
  nodeId: string | null;
  kind: string;
  message: string;
  createdAt: number;
}

export interface EngineOverview {
  running: boolean;
  lastTickAt: number | null;
  lastError: string | null;
  ticks: number;
  intervalMs: number;
  runsActive: number;
  runsCompleted: number;
  runsFailed: number;
  jobsPending: number;
  eventsUnprocessed: number;
  log: EngineLogEntry[];
}

export const getEngineOverview = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<EngineOverview> => {
    const db = getDb();
    const status = getEngineStatus();

    // Aggregated in SQL, not in JS: this endpoint is polled every 4 seconds by
    // an open panel, and shipping every run row over the wire to count it would
    // scale with total history rather than with the answer.
    const [runCounts, jobs, events, log] = await Promise.all([
      db
        .select({ status: automationRuns.status, n: count() })
        .from(automationRuns)
        .groupBy(automationRuns.status),
      db.select({ n: count() }).from(engineJobs).where(eq(engineJobs.status, "pending")),
      db.select({ n: count() }).from(engineEvents).where(isNull(engineEvents.processedAt)),
      recentLog(60),
    ]);
    const byStatus = Object.fromEntries(runCounts.map((r) => [r.status, r.n]));

    return {
      running: status.running,
      lastTickAt: status.lastTickAt,
      lastError: status.lastError,
      ticks: status.ticks,
      intervalMs: status.intervalMs,
      runsActive: (byStatus.running ?? 0) + (byStatus.waiting ?? 0),
      runsCompleted: byStatus.completed ?? 0,
      runsFailed: byStatus.failed ?? 0,
      jobsPending: jobs[0]?.n ?? 0,
      eventsUnprocessed: events[0]?.n ?? 0,
      log: log.map((l) => ({
        id: l.id,
        runId: l.runId,
        automationId: l.automationId,
        contactId: l.contactId,
        nodeId: l.nodeId,
        kind: l.kind,
        message: l.message,
        createdAt: l.createdAt,
      })),
    };
  });

/**
 * "Przetestuj na kontakcie" — walks a real contact through the graph and
 * reports what would happen, writing nothing. See dry-run.server.ts.
 */
export const dryRunAutomation = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ automationId: z.string(), contactId: z.string() }))
  .handler(async ({ data }): Promise<DryRunResult> => dryRun(data));

/** Contacts to choose from in the dry-run picker — id and label only. */
export const listContactOptions = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<Array<{ id: string; label: string }>> => {
    const db = getDb();
    const rows = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
      })
      .from(contacts)
      .limit(200);
    return rows.map((r) => ({
      id: r.id,
      label: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email,
    }));
  });

export interface InsightView {
  id: string;
  kind: string;
  severity: string;
  title: string;
  detail: string;
  proposedAction: string;
  evidence: Record<string, string>;
  automationId: string | null;
  status: string;
  fromAi: boolean;
  seenCount: number;
  updatedAt: number;
}

/** M4 supervisor findings for the PRM Engine panel. */
export const getInsights = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<{ insights: InsightView[]; openCritical: number }> => {
    const [rows, openCritical] = await Promise.all([listInsights(), countOpenCritical()]);
    return {
      insights: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        severity: row.severity,
        title: row.title,
        detail: row.detail,
        proposedAction: row.proposedAction,
        evidence: row.evidence ?? {},
        automationId: row.automationId,
        status: row.status,
        fromAi: row.fromAi === 1,
        seenCount: row.seenCount,
        updatedAt: row.updatedAt,
      })),
      openCritical,
    };
  });

/**
 * "Analizuj teraz". `withAi` is opt-in and costs money, so it is a parameter
 * rather than a default — the periodic sweep runs detectors only.
 */
export const runSupervisorNow = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ withAi: z.boolean().default(false) }))
  .handler(async ({ data }) => runSupervisor({ withAi: data.withAi }));

export const updateInsightStatus = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({ id: z.string(), status: z.enum(["new", "acknowledged", "dismissed"]) }),
  )
  .handler(async ({ data }) => {
    await setInsightStatus(data.id, data.status);
    return { ok: true };
  });

/** "Uruchom teraz" — the same tick the interval fires, on demand. */
export const runEngineTick = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => {
    const result = await runTickOnce();
    return result ?? { events: 0, runsStarted: 0, jobs: 0 };
  });

/** How many contacts have entered each automation — the real number behind the "użytkownicy" column. */
export const getRunCounts = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<Record<string, number>> => {
    const db = getDb();
    // GROUP BY in SQL — the automation list polls this every 6 seconds.
    const rows = await db
      .select({ automationId: automationRuns.automationId, n: count() })
      .from(automationRuns)
      .groupBy(automationRuns.automationId);
    return Object.fromEntries(rows.map((r) => [r.automationId, r.n]));
  });

/**
 * Timeline categories for what the engine did to one contact. Deliberately
 * finer-grained than the log's `kind`: on a patient card "wysłano e-mail" and
 * "krok pominięty" should not look alike.
 */
export type EngineActivityKind =
  | "engine_run"
  | "engine_action"
  | "engine_condition"
  | "engine_delay"
  | "engine_ai"
  | "engine_skipped"
  | "engine_error";

export interface EngineActivityItem {
  id: string;
  type: EngineActivityKind;
  title: string;
  description: string;
  /** "YYYY-MM-DD HH:mm" (UTC) — the format every other timeline source uses, so plain string sort works. */
  date: string;
}

const ENGINE_LOG_KINDS: Record<string, EngineActivityKind> = {
  run_started: "engine_run",
  run_ended: "engine_run",
  action: "engine_action",
  condition: "engine_condition",
  delay: "engine_delay",
  ai: "engine_ai",
  skipped: "engine_skipped",
  error: "engine_error",
};

/**
 * What PRM Engine did to this contact, for their activity timeline — the last
 * open piece of M2.
 *
 * Reads `engine_log` rather than `engine_events`: the log is the engine's own
 * account of each step it took, while the event bus mostly restates things the
 * timeline already shows from their original source (opens and clicks from
 * `email_events`, visits from `tracking_pings`), which would double every row.
 */
export const getEngineActivityForContact = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ contactId: z.string() }))
  .handler(async ({ data }): Promise<EngineActivityItem[]> => {
    const db = getDb();
    const rows = await db
      .select()
      .from(engineLog)
      .where(eq(engineLog.contactId, data.contactId))
      .orderBy(desc(engineLog.createdAt))
      .limit(200);
    if (rows.length === 0) return [];

    // One lookup for the whole timeline instead of a query per entry.
    const ids = [...new Set(rows.map((r) => r.automationId).filter((id): id is string => !!id))];
    const named = ids.length
      ? await db
          .select({ id: automations.id, name: automations.name })
          .from(automations)
          .where(inArray(automations.id, ids))
      : [];
    const nameById = new Map(named.map((a) => [a.id, a.name]));

    return rows.map((row) => {
      const context = row.automationId
        ? // A run whose automation was deleted still happened to this patient —
          // say so rather than showing a raw id or an empty line.
          `Automatyzacja „${nameById.get(row.automationId) ?? t("usunięta")}”`
        : "PRM Engine";
      const cost =
        row.tokensIn || row.tokensOut
          ? t(" · {v0}/{v1} tokenów{v2}", {
              v0: row.tokensIn ?? 0,
              v1: row.tokensOut ?? 0,
              v2: row.costUsd ? ` · $${row.costUsd.toFixed(5).replace(".", ",")}` : "",
            })
          : "";
      return {
        id: `engine-${row.id}`,
        type: ENGINE_LOG_KINDS[row.kind] ?? "engine_action",
        title: row.message,
        description: `${context}${cost}`,
        date: formatActivityDate(row.createdAt),
      };
    });
  });

export interface AutomationKpis {
  /** Size of the reporting window, so the UI never hardcodes "30d" next to a number from elsewhere. */
  windowDays: number;
  emailsSent: number;
  smsSent: number;
  /** Share of engine-sent emails with at least one open. `null` when nothing was sent. */
  openRate: number | null;
  clickRate: number | null;
  runsCompleted: number;
}

const KPI_WINDOW_DAYS = 30;
/** SQLite caps bound parameters per statement; token lists can outgrow it after a large send. */
const IN_CHUNK = 400;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Headline numbers for the Statystyki tab. Everything here is counted from what
 * the engine actually did — sends are `engine_log` rows of kind "action" (the
 * runner logs errors and skips under different kinds, so a failed send never
 * counts), and open/click rates come from `email_events` joined on the tracking
 * token each send action recorded. Deliberately scoped to engine traffic: test
 * sends from the Email tab also land in `email_sends`, and folding them into an
 * automation report would inflate it.
 */
export const getAutomationKpis = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<AutomationKpis> => {
    const db = getDb();
    const since = Date.now() - KPI_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    const [actions, completed] = await Promise.all([
      db
        .select({ detail: engineLog.detail })
        .from(engineLog)
        .where(and(eq(engineLog.kind, "action"), gte(engineLog.createdAt, since))),
      db
        .select({ id: automationRuns.id })
        .from(automationRuns)
        .where(and(eq(automationRuns.status, "completed"), gte(automationRuns.endedAt, since))),
    ]);

    const emailTokens: string[] = [];
    let smsSent = 0;
    for (const row of actions) {
      const action = row.detail?.action;
      if (action === "send_email" || action === "send_newsletter") {
        // A send with no token would be an email we cannot measure, not one we
        // did not send — count it, it just never shows up in the rate numerator.
        if (row.detail?.token) emailTokens.push(row.detail.token);
        else emailTokens.push("");
      } else if (action === "send_sms") {
        smsSent += 1;
      }
    }

    const trackable = emailTokens.filter(Boolean);
    const opened = new Set<string>();
    const clicked = new Set<string>();
    for (const part of chunk(trackable, IN_CHUNK)) {
      const events = await db
        .select({ token: emailEvents.token, kind: emailEvents.kind })
        .from(emailEvents)
        .where(inArray(emailEvents.token, part));
      for (const e of events) {
        (e.kind === "open" ? opened : clicked).add(e.token);
      }
    }

    const emailsSent = emailTokens.length;
    return {
      windowDays: KPI_WINDOW_DAYS,
      emailsSent,
      smsSent,
      openRate: emailsSent > 0 ? opened.size / emailsSent : null,
      clickRate: emailsSent > 0 ? clicked.size / emailsSent : null,
      runsCompleted: completed.length,
    };
  });

export interface NodeStats {
  /** Contacts that have passed through this step at any point. */
  passed: number;
  /** Contacts sitting on this step right now (running or waiting on a delay). */
  current: number;
}

/**
 * Real per-node counts for the builder's "Pokaż kontakty w procesie" overlay,
 * derived from `automation_runs.path` — the list of nodes each contact
 * actually walked. This replaces the hash-derived placeholder numbers the
 * canvas used to show, which looked plausible and meant nothing.
 */
export const getNodeStats = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ automationId: z.string() }))
  .handler(async ({ data }): Promise<Record<string, NodeStats>> => {
    const db = getDb();
    const runs = await db
      .select({
        path: automationRuns.path,
        currentNodeId: automationRuns.currentNodeId,
        status: automationRuns.status,
      })
      .from(automationRuns)
      .where(eq(automationRuns.automationId, data.automationId));

    const stats: Record<string, NodeStats> = {};
    const bump = (nodeId: string, key: keyof NodeStats) => {
      stats[nodeId] ??= { passed: 0, current: 0 };
      stats[nodeId][key] += 1;
    };

    for (const run of runs) {
      // A node can appear twice in one path if the graph loops back; the
      // headline number is "how many contacts", not "how many visits".
      for (const nodeId of new Set(run.path ?? [])) bump(nodeId, "passed");

      const live = run.status === "running" || run.status === "waiting";
      if (live && run.currentNodeId) bump(run.currentNodeId, "current");
    }

    return stats;
  });

export interface AutomationRunSummary {
  id: string;
  contactId: string;
  /** Display name resolved server-side — a run list showing raw ids is unreadable. */
  contactName: string;
  status: string;
  currentNodeId: string | null;
  /** Node ids walked, in order — lets the UI show how far the contact got. */
  path: string[];
  lastError: string | null;
  startedAt: number;
  endedAt: number | null;
}

export const getRunsForAutomation = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ automationId: z.string() }))
  .handler(async ({ data }): Promise<AutomationRunSummary[]> => {
    const db = getDb();
    const rows = await db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.automationId, data.automationId))
      .orderBy(desc(automationRuns.startedAt))
      .limit(100);
    if (rows.length === 0) return [];

    // One lookup for the whole page rather than a query per run.
    const people = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
      })
      .from(contacts)
      .where(inArray(contacts.id, [...new Set(rows.map((r) => r.contactId))]));
    const byId = new Map(people.map((p) => [p.id, p]));

    return rows.map((r) => {
      const person = byId.get(r.contactId);
      const name = person
        ? [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email
        : "";
      return {
        id: r.id,
        contactId: r.contactId,
        // A deleted contact still has a run worth showing — say so rather than blanking the row.
        contactName: name || t("Kontakt {contactId} (usunięty)", { contactId: r.contactId }),
        status: r.status,
        currentNodeId: r.currentNodeId,
        path: r.path ?? [],
        lastError: r.lastError,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
      };
    });
  });

/**
 * Pushes rendered templates to the server so engine actions can send them.
 * Called by the automation page, which is the only place that can read the
 * localStorage-backed content builder. `baseUrl` rides along because the
 * engine sends mail with no request to derive an origin from.
 */
export const publishEngineTemplates = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      baseUrl: z.string().url(),
      /**
       * Odwołania do szablonów, nie ich treść.
       *
       * Treść wczytuje i renderuje serwer, czytając pozycję z bazy. Wcześniej
       * przychodziła gotowa z przeglądarki — bo szablony mieszkały
       * w `localStorage` — więc automatyzacja zapisana na jednym komputerze
       * publikowała migawki, których drugi komputer nie potrafił odtworzyć.
       */
      templates: z.array(
        z.object({
          kind: z.enum(["newsletter", "email", "popup", "sms"]),
          name: z.string().min(1),
          subject: z.string().default(""),
        }),
      ),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; published: number; missing: string[] }> => {
    await saveBaseUrl(data.baseUrl.replace(/\/$/, ""));

    const missing: string[] = [];
    let published = 0;

    for (const ref of data.templates) {
      const item = await findContentItem(ref.kind, ref.name);
      if (!item) {
        // Zgłoszone, nie przemilczane: brakująca migawka to automatyzacja,
        // która padnie dopiero przy pierwszym pacjencie.
        missing.push(`${ref.name} (${ref.kind})`);
        continue;
      }
      const rendered = renderContentItem(item);
      await saveSnapshot({
        kind: ref.kind,
        name: item.name,
        contentItemId: rendered.contentItemId,
        subject: ref.subject || item.name,
        html: rendered.html,
        smsBody: rendered.smsBody,
        config: popupConfigOrNull(rendered.popupConfig),
        attachments: rendered.attachments,
        senderId: rendered.senderId,
      });
      published += 1;
    }

    return { ok: true, published, missing };
  });

/**
 * Konfiguracja pop-upu przepuszczona przez walidację.
 *
 * Zniekształcony obiekt trafiłby stąd na cudzą stronę przez skrypt śledzący,
 * więc mimo że pochodzi z naszej własnej bazy, sprawdzamy kształt. Niezgodny
 * zostaje odrzucony na rzecz `null` — pop-up pojedzie wtedy na ustawieniach
 * domyślnych zamiast wywrócić tracker.
 */
function popupConfigOrNull(raw: unknown) {
  const parsed = popupConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const popupConfigSchema = z.object({
  format: z.enum(["modal", "corner", "bar"]),
  corner: z.enum(["bottom-right", "bottom-left"]),
  width: z.number(),
  height: z.number(),
  devices: z.enum(["all", "desktop", "mobile"]),
  cappingMode: z.enum(["session", "day"]),
  cappingLimit: z.number(),
  urlMode: z.enum(["all", "match"]).default("all"),
  urlRules: z.array(z.string()).default([]),
  background: z.string().default(""),
  backgroundImage: z.string().default(""),
  textColor: z.string().default(""),
  overlay: z.string().default(""),
  startsAt: z.string().default(""),
  endsAt: z.string().default(""),
});

// There is deliberately no "stop all runs" call here: switching an automation
// off already halts its journeys at their next step (see runStep in
// runner.server.ts), which stops them between steps rather than mid-send.

export interface ContactRunView {
  id: string;
  automationId: string;
  automationName: string;
  status: AutomationRunStatus;
  /** Krok, na którym stoi (albo stanął) — „Krok 3 z 6". */
  stepLabel: string;
  currentNodeTitle: string;
  startedAt: string;
  endedAt: string | null;
  lastError: string | null;
}

/**
 * Przebiegi automatyzacji dla jednego pacjenta — bieżące i zakończone.
 *
 * Nazwa automatyzacji dołączana z osobnej tabeli, bo przebieg trzyma tylko id,
 * a automatyzacja mogła zostać skasowana. Skasowana nie znaczy „nie było jej":
 * ten pacjent przez nią przeszedł i historia ma to pokazać.
 */
export const getContactRuns = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ contactId: z.string().min(1) }))
  .handler(async ({ data }): Promise<ContactRunView[]> => {
    const db = getDb();
    const runs = await db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.contactId, data.contactId))
      .orderBy(desc(automationRuns.startedAt))
      .limit(50);
    if (runs.length === 0) return [];

    const ids = [...new Set(runs.map((r) => r.automationId))];
    const named = await db.select().from(automations).where(inArray(automations.id, ids));
    const byId = new Map(named.map((a) => [a.id, a]));

    return runs.map((run) => {
      const automation = byId.get(run.automationId);
      const graph = automation?.flow ?? null;
      const total = graph?.nodes.filter((n) => n.kind !== "trigger").length ?? 0;
      const done = (run.path ?? []).length;
      const node = graph?.nodes.find((n) => n.id === run.currentNodeId);
      return {
        id: run.id,
        automationId: run.automationId,
        automationName: automation?.name ?? t("Automatyzacja usunięta"),
        status: run.status,
        stepLabel:
          total > 0
            ? t("Krok {v0} z {total}", { v0: Math.min(done, total), total: total })
            : t("Kroków: {done}", { done: done }),
        currentNodeTitle: node ? nodeTitle(node) : "",
        startedAt: formatActivityDate(run.startedAt),
        endedAt: run.endedAt ? formatActivityDate(run.endedAt) : null,
        lastError: run.lastError,
      };
    });
  });
