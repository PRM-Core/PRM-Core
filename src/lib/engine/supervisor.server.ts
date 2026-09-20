import { warsawToday } from "../visits/warsaw-time";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lt, notInArray } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  agentInsights,
  automations,
  automationRuns,
  contacts,
  contentSnapshots,
  engineEvents,
  engineJobs,
  engineLog,
} from "../db/schema";
import type { AgentInsightRow, InsightKind, InsightSeverity } from "../db/schema";
import { validateGraph } from "../automation-flow";
import type { AutomationGraph } from "../automation-flow";
import { getAiConfig, getSpendToday, getKeyStatus } from "../ai/settings.server";
import { purgeCopilotHistory } from "../ai/copilot.server";
import { getCredential } from "@/lib/credentials/store.server";
import { t } from "@/lib/i18n";

// M4: the PRM_Agent watching the engine instead of driving one contact through
// it. Everything here reads tables the engine already writes — no new
// collection, same principle as the event bus.
//
// The detectors are DETERMINISTIC on purpose. An insight that says "ta
// automatyzacja wysypała się 7 razy" has to be true, and a model is the wrong
// tool for counting rows. The optional model pass (supervisor-ai.server.ts)
// only interprets what the detectors found and proposes patterns.

const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
/** A run still "running" this long after its last step is not running, it is stuck. */
const STUCK_AFTER_MS = 6 * 60 * 60 * 1000;

export interface InsightDraft {
  signature: string;
  kind: InsightKind;
  severity: InsightSeverity;
  title: string;
  detail: string;
  proposedAction: string;
  evidence?: Record<string, string>;
  automationId?: string | null;
  fromAi?: boolean;
}

// ── detectors ───────────────────────────────────────────────────────────────

/** Automations whose runs are failing — the loudest signal there is. */
async function detectFailedRuns(since: number): Promise<InsightDraft[]> {
  const db = getDb();
  const rows = await db
    .select({
      automationId: automationRuns.automationId,
      lastError: automationRuns.lastError,
    })
    .from(automationRuns)
    .where(and(eq(automationRuns.status, "failed"), gte(automationRuns.startedAt, since)));
  if (rows.length === 0) return [];

  const byAutomation = new Map<string, { count: number; error: string }>();
  for (const row of rows) {
    const entry = byAutomation.get(row.automationId) ?? { count: 0, error: "" };
    entry.count += 1;
    entry.error = row.lastError ?? entry.error;
    byAutomation.set(row.automationId, entry);
  }

  const names = await automationNames([...byAutomation.keys()]);
  return [...byAutomation.entries()].map(([automationId, { count, error }]) => ({
    signature: `failed-runs:${automationId}`,
    kind: "performance" as const,
    // One failure is a hiccup; a handful is a broken automation reaching real patients.
    severity: count >= 5 ? ("critical" as const) : ("warning" as const),
    title: t("„{v0}” — {count} nieudanych przebiegów", {
      v0: names.get(automationId) ?? automationId,
      count: count,
    }),
    detail: error
      ? t("Ostatni błąd: {error}", { error: error })
      : t("Przebiegi kończą się statusem „failed” bez zapisanego powodu."),
    proposedAction: t(
      "Otwórz Przebiegi tej automatyzacji, sprawdź krok, na którym się zatrzymuje, i popraw jego konfigurację.",
    ),
    evidence: { nieudane: String(count), okno: `${WINDOW_DAYS} dni` },
    automationId,
  }));
}

/** Steps that errored without failing the whole run — the quieter version of the above. */
async function detectStepErrors(since: number): Promise<InsightDraft[]> {
  const db = getDb();
  const rows = await db
    .select({ automationId: engineLog.automationId, message: engineLog.message })
    .from(engineLog)
    .where(and(eq(engineLog.kind, "error"), gte(engineLog.createdAt, since)));

  const byKey = new Map<string, { count: number; message: string; automationId: string | null }>();
  for (const row of rows) {
    // Group by automation + the first sentence of the message: the same fault
    // repeated 40 times is one problem, not forty.
    const gist = row.message.split(/[.:(]/)[0].trim().slice(0, 80);
    const key = `${row.automationId ?? "-"}|${gist}`;
    const entry = byKey.get(key) ?? {
      count: 0,
      message: row.message,
      automationId: row.automationId,
    };
    entry.count += 1;
    byKey.set(key, entry);
  }

  const ids = [...byKey.values()].map((v) => v.automationId).filter((id): id is string => !!id);
  const names = await automationNames(ids);

  return [...byKey.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([key, v]) => ({
      signature: `step-errors:${key}`,
      kind: "performance" as const,
      severity: v.count >= 10 ? ("critical" as const) : ("warning" as const),
      title: t("Powtarzający się błąd kroku{v0} ({count}×)", {
        v0: v.automationId ? ` w „${names.get(v.automationId) ?? v.automationId}”` : "",
        count: v.count,
      }),
      detail: v.message.slice(0, 300),
      proposedAction: t(
        "Sprawdź konfigurację tego kroku — powtarzalny błąd zwykle oznacza brakujący szablon, pusty numer nadawcy albo nieosiągalną integrację.",
      ),
      evidence: { wystąpień: String(v.count), okno: `${WINDOW_DAYS} dni` },
      automationId: v.automationId,
    }));
}

/**
 * Active automations that send something the system currently cannot send:
 * a template that was never published, or an integration with no API key.
 * This is the check that catches "aktywna automatyzacja, która i tak nic nie
 * wyśle" BEFORE a patient is affected, rather than after.
 */
async function detectBrokenSendSteps(): Promise<InsightDraft[]> {
  const db = getDb();
  const active = await db.select().from(automations).where(eq(automations.status, "active"));
  if (active.length === 0) return [];

  const snapshots = await db
    .select({ id: contentSnapshots.id, kind: contentSnapshots.kind, name: contentSnapshots.name })
    .from(contentSnapshots);
  const published = new Set(snapshots.map((s) => s.id));
  const keys = await getKeyStatus();

  const drafts: InsightDraft[] = [];
  const kindForAction: Record<string, string> = {
    send_email: "email",
    send_newsletter: "newsletter",
    send_sms: "sms",
    show_popup: "popup",
  };

  for (const automation of active) {
    const graph = automation.flow as AutomationGraph | null;
    if (!graph) continue;

    const missingTemplates: string[] = [];
    const needs = { email: false, sms: false, ai: false };

    for (const node of graph.nodes) {
      if (node.kind === "aiAgent") needs.ai = true;
      if (node.kind !== "action" || !node.key) continue;
      const templateKind = kindForAction[node.key];
      if (!templateKind) continue;
      if (node.key === "send_sms") needs.sms = true;
      if (node.key === "send_email" || node.key === "send_newsletter") needs.email = true;

      const name = (node.config?.template ?? "").trim();
      if (!name) {
        missingTemplates.push(t("{key} — nie wybrano szablonu", { key: node.key }));
      } else if (!published.has(`${templateKind}:${name.toLowerCase()}`)) {
        missingTemplates.push(`${name} (${templateKind})`);
      }
    }

    if (missingTemplates.length > 0) {
      drafts.push({
        signature: `missing-templates:${automation.id}`,
        kind: "performance",
        severity: "critical",
        title: t("„{name}” jest aktywna, ale nie ma czym wysłać", { name: automation.name }),
        detail: t("Brakujące treści: {v0}. Kroki wysyłki zakończą się błędem.", {
          v0: missingTemplates.join(", "),
        }),
        proposedAction: t(
          "Otwórz automatyzację i zapisz ją ponownie — publikacja wyśle szablony na serwer. Jeśli szablon został skasowany, wybierz inny.",
        ),
        evidence: { brakujące: String(missingTemplates.length) },
        automationId: automation.id,
      });
    }

    const missingKeys: string[] = [];
    if (needs.email && !(await getCredential("SENDGRID_API_KEY")))
      missingKeys.push("SENDGRID_API_KEY");
    if (
      needs.sms &&
      !((await getCredential("TWILIO_ACCOUNT_SID")) && (await getCredential("TWILIO_AUTH_TOKEN")))
    ) {
      missingKeys.push("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN");
    }
    if (needs.ai && !keys.anthropic && !keys.openai && !keys.google) {
      missingKeys.push("klucz dostawcy AI");
    }
    if (missingKeys.length > 0) {
      drafts.push({
        signature: `missing-keys:${automation.id}`,
        kind: "security",
        severity: "critical",
        title: t("„{name}” wymaga kluczy, których nie skonfigurowano", { name: automation.name }),
        detail: t("Brakuje: {v0}. Kroki korzystające z tych integracji będą kończyć się błędem.", {
          v0: missingKeys.join(", "),
        }),
        proposedAction: t("Uzupełnij klucze w Integracje → Klucze i dane dostępowe."),
        evidence: { brakujące: missingKeys.join(", ") },
        automationId: automation.id,
      });
    }
  }

  return drafts;
}

/**
 * Active automations whose graph no longer holds together. `validateGraph`
 * gates activation, but nothing gates editing afterwards — disconnect the
 * trigger from an already-active scenario and it stays "aktywna" while every
 * run ends one step in, silently. Found exactly that way on a live workspace.
 */
async function detectInvalidActiveGraphs(): Promise<InsightDraft[]> {
  const db = getDb();
  const active = await db.select().from(automations).where(eq(automations.status, "active"));

  const drafts: InsightDraft[] = [];
  for (const automation of active) {
    const graph = automation.flow as AutomationGraph | null;
    const { valid, errors } = validateGraph(graph);
    if (valid) continue;

    // The specific case worth naming: a trigger that leads nowhere means the
    // automation runs and instantly ends, which looks like nothing at all.
    const trigger = graph?.nodes.find((n) => n.kind === "trigger");
    const triggerDangling = !!trigger && !graph?.edges.some((e) => e.source === trigger.id);

    drafts.push({
      signature: `invalid-graph:${automation.id}`,
      kind: "performance",
      severity: "critical",
      title: triggerDangling
        ? t("„{name}” — wyzwalacz nie prowadzi do żadnego kroku", { name: automation.name })
        : t("„{name}” jest aktywna, ale scenariusz jest niespójny", { name: automation.name }),
      detail: triggerDangling
        ? t(
            "Każdy pasujący kontakt uruchamia przebieg, który kończy się natychmiast — nic się nie wykona. Scenariusz przeszedł walidację przy aktywacji, więc krawędź zniknęła podczas późniejszej edycji.",
          )
        : errors.join(" "),
      proposedAction: t(
        "Otwórz automatyzację w builderze i połącz kroki. Przycisk „Przetestuj” pokaże na wybranym kontakcie, dokąd faktycznie dochodzi ścieżka.",
      ),
      evidence: { problemy: String(errors.length) },
      automationId: automation.id,
    });
  }
  return drafts;
}

/** Runs that stopped moving: still "running", nothing pending, last step hours ago. */
async function detectStuckRuns(): Promise<InsightDraft[]> {
  const db = getDb();
  const cutoff = Date.now() - STUCK_AFTER_MS;
  const live = await db
    .select({ id: automationRuns.id, automationId: automationRuns.automationId })
    .from(automationRuns)
    .where(
      and(
        eq(automationRuns.status, "running"),
        gte(automationRuns.startedAt, Date.now() - WINDOW_MS),
      ),
    );
  if (live.length === 0) return [];

  const pending = await db
    .select({ runId: engineJobs.runId })
    .from(engineJobs)
    .where(inArray(engineJobs.status, ["pending", "processing"]));
  const hasPending = new Set(pending.map((j) => j.runId));

  const stuck: Record<string, number> = {};
  for (const run of live) {
    if (hasPending.has(run.id)) continue;
    const last = await db
      .select({ createdAt: engineLog.createdAt })
      .from(engineLog)
      .where(eq(engineLog.runId, run.id))
      .orderBy(desc(engineLog.createdAt))
      .limit(1)
      .get();
    if (last && last.createdAt < cutoff) {
      stuck[run.automationId] = (stuck[run.automationId] ?? 0) + 1;
    }
  }

  const names = await automationNames(Object.keys(stuck));
  return Object.entries(stuck).map(([automationId, count]) => ({
    signature: `stuck-runs:${automationId}`,
    kind: "performance" as const,
    severity: "warning" as const,
    title: t("„{v0}” — {count} przebiegów stoi w miejscu", {
      v0: names.get(automationId) ?? automationId,
      count: count,
    }),
    detail: t(
      "Przebiegi mają status „w toku”, ale nie mają zaplanowanego kolejnego kroku i nic się w nich nie działo od ponad {v0} godzin.",
      { v0: Math.round(STUCK_AFTER_MS / 3600000) },
    ),
    proposedAction: t(
      "Sprawdź, czy krok, na którym stoją, nie został skasowany ze scenariusza. Wyłączenie i włączenie automatyzacji zamyka osierocone przebiegi.",
    ),
    evidence: { przebiegi: String(count) },
    automationId,
  }));
}

/**
 * Jobs claimed for execution that never finished — the server died mid-step.
 * Deliberately NOT auto-retried: the step may have been a send whose fate is
 * unknown, and re-running it risks a duplicate message to a patient. A human
 * looks at the log and decides.
 */
async function detectOrphanedProcessingJobs(): Promise<InsightDraft[]> {
  const db = getDb();
  const cutoff = Date.now() - 10 * 60 * 1000;
  const rows = await db
    .select({ id: engineJobs.id, runId: engineJobs.runId, createdAt: engineJobs.createdAt })
    .from(engineJobs)
    .where(eq(engineJobs.status, "processing"));
  const stale = rows.filter((j) => j.createdAt < cutoff);
  if (stale.length === 0) return [];

  return [
    {
      signature: "orphaned-processing-jobs",
      kind: "performance",
      severity: "critical",
      title: t("{length} kroków przerwanych w trakcie wykonania", { length: stale.length }),
      detail: t(
        "Serwer został zatrzymany w środku wykonywania kroku (status „processing” bez zakończenia). Krok mógł być wysyłką, której los jest nieznany — dlatego NIE jest ponawiany automatycznie.",
      ),
      proposedAction: t(
        "Sprawdź w dzienniku silnika, czy wiadomość z tego kroku wyszła (wiersz „action” obok wpisu przebiegu). Jeśli nie wyszła — wyłącz i włącz automatyzację, aby domknąć osierocone przebiegi.",
      ),
      evidence: { kroki: String(stale.length) },
    },
  ];
}

/** An AI node that always answers the same thing is a condition wearing a costume. */
async function detectMonotonousAiNodes(since: number): Promise<InsightDraft[]> {
  const db = getDb();
  const rows = await db
    .select({
      nodeId: engineLog.nodeId,
      automationId: engineLog.automationId,
      detail: engineLog.detail,
      costUsd: engineLog.costUsd,
    })
    .from(engineLog)
    .where(and(eq(engineLog.kind, "ai"), gte(engineLog.createdAt, since)));

  const byNode = new Map<
    string,
    { paths: Map<string, number>; cost: number; automationId: string | null }
  >();
  for (const row of rows) {
    const path = row.detail?.path;
    if (!row.nodeId || !path) continue;
    const entry = byNode.get(row.nodeId) ?? {
      paths: new Map<string, number>(),
      cost: 0,
      automationId: row.automationId,
    };
    entry.paths.set(path, (entry.paths.get(path) ?? 0) + 1);
    entry.cost += row.costUsd ?? 0;
    byNode.set(row.nodeId, entry);
  }

  const ids = [...byNode.values()].map((v) => v.automationId).filter((id): id is string => !!id);
  const names = await automationNames(ids);

  const drafts: InsightDraft[] = [];
  for (const [nodeId, entry] of byNode) {
    const total = [...entry.paths.values()].reduce((sum, n) => sum + n, 0);
    // Below this there is no pattern yet — an agent that ran three times and
    // agreed with itself is not evidence of anything.
    if (total < 10 || entry.paths.size !== 1) continue;
    const [path] = [...entry.paths.keys()];
    drafts.push({
      signature: `monotonous-ai:${nodeId}`,
      kind: "performance",
      severity: "info",
      title: t("Węzeł AI zawsze wybiera „{path}”{v1}", {
        path: path,
        v1: entry.automationId ? ` w „${names.get(entry.automationId) ?? entry.automationId}”` : "",
      }),
      detail: t("{total} wywołań, za każdym razem ta sama ścieżka. Koszt tych wywołań: ${v1}.", {
        total: total,
        v1: entry.cost.toFixed(4),
      }),
      proposedAction: t(
        "Rozważ zamianę tego węzła na warunek albo rozgałęzienie z filtrem — decyzja jest przewidywalna, a deterministyczny krok jest darmowy i szybszy.",
      ),
      evidence: { wywołań: String(total), koszt: `$${entry.cost.toFixed(4)}` },
      automationId: entry.automationId,
    });
  }
  return drafts;
}

/** Daily AI spend against the ceiling the user set. */
async function detectAiSpend(): Promise<InsightDraft[]> {
  const [config, spent] = await Promise.all([getAiConfig(), getSpendToday()]);
  if (config.dailyLimitUsd <= 0) return [];
  const ratio = spent / config.dailyLimitUsd;
  if (ratio < 0.8) return [];

  const over = ratio >= 1;
  return [
    {
      signature: `ai-spend:${warsawToday()}`,
      kind: "performance",
      severity: over ? "critical" : "warning",
      title: over
        ? t("Dzienny limit kosztów AI wyczerpany")
        : t("Dzienny limit kosztów AI na {v0}%", { v0: Math.round(ratio * 100) }),
      detail: t("Wydano ${v0} z limitu ${v1}. {v2}", {
        v0: spent.toFixed(4),
        v1: config.dailyLimitUsd.toFixed(2),
        v2: over
          ? t(
              "Węzły AI są pomijane — przebiegi idą pierwszą ścieżką. Deterministyczne kroki działają normalnie.",
            )
          : t("Po przekroczeniu limitu węzły AI zaczną być pomijane."),
      }),
      proposedAction: t(
        "Podnieś limit w Ustawienia → PRM_Agent albo ogranicz liczbę węzłów AI w aktywnych automatyzacjach.",
      ),
      evidence: { wydano: `$${spent.toFixed(4)}`, limit: `$${config.dailyLimitUsd.toFixed(2)}` },
    },
  ];
}

/** Rejected lead-webhook calls: someone is guessing the secret, or an integration broke. */
async function detectWebhookRejections(since: number): Promise<InsightDraft[]> {
  const db = getDb();
  // The webhook logs each rejection as a run-less error row (see
  // api.webhooks.leads.ts) tagged `detail.source = "lead-webhook"`. The message
  // is translated, so it is matched only for rows written before the tag
  // existed — those are Polish.
  const errors = await db
    .select({ message: engineLog.message, detail: engineLog.detail })
    .from(engineLog)
    .where(
      and(eq(engineLog.kind, "error"), gte(engineLog.createdAt, since), isNull(engineLog.runId)),
    );
  const count = errors.filter(
    (r) =>
      (r.detail as { source?: unknown } | null)?.source === "lead-webhook" ||
      r.message.includes("webhook leadów"),
  ).length;
  if (count < 3) return [];

  return [
    {
      signature: `webhook-rejections:${Math.floor(since / WINDOW_MS)}`,
      kind: "security",
      severity: count >= 20 ? "critical" : "warning",
      title: t("{count} odrzuconych wywołań webhooka leadów", { count: count }),
      detail: t(
        "Ktoś wywołuje /api/webhooks/leads z nieprawidłowym sekretem. To albo zepsuta integracja po zmianie sekretu, albo próba dobrania się do endpointu.",
      ),
      proposedAction: t(
        "Sprawdź w Integracje → Meta Ads, czy Zapier ma aktualny sekret. Jeśli tak — zrotuj sekret; stare wywołania przestaną przechodzić.",
      ),
      evidence: { odrzucone: String(count), okno: `${WINDOW_DAYS} dni` },
    },
  ];
}

/** A sudden flood of new contacts usually means a form is being spammed. */
async function detectContactVolumeAnomaly(): Promise<InsightDraft[]> {
  const db = getDb();
  const rows = await db.select({ createdAt: contacts.createdAt }).from(contacts);
  // `contacts.createdAt` is a YYYY-MM-DD string, so days are compared as text.
  const today = warsawToday();
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.createdAt, (counts.get(row.createdAt) ?? 0) + 1);

  const todayCount = counts.get(today) ?? 0;
  const otherDays = [...counts.entries()].filter(([day]) => day !== today);
  if (todayCount < 20 || otherDays.length < 3) return [];

  const average = otherDays.reduce((sum, [, n]) => sum + n, 0) / otherDays.length;
  if (todayCount < average * 5) return [];

  return [
    {
      signature: `contact-spike:${today}`,
      kind: "security",
      severity: "warning",
      title: t("Nietypowy przyrost kontaktów: {todayCount} dzisiaj", { todayCount: todayCount }),
      detail: t(
        "Średnia z pozostałych dni to {v0}. Taki skok zwykle oznacza bota wypełniającego formularz albo import.",
        { v0: average.toFixed(1) },
      ),
      proposedAction: t(
        "Sprawdź w Kontaktach źródło dzisiejszych wpisów. Jeśli to spam z formularza, rozważ dodanie pola-pułapki albo wyłączenie pop-upu z formularzem.",
      ),
      evidence: { dzisiaj: String(todayCount), średnia: average.toFixed(1) },
    },
  ];
}

// ── helpers ─────────────────────────────────────────────────────────────────

async function automationNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({ id: automations.id, name: automations.name })
    .from(automations)
    .where(inArray(automations.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * Writes drafts, folding repeats into the existing row. A finding the user has
 * already dismissed stays dismissed unless it gets worse — otherwise every
 * sweep would resurrect what they deliberately waved off.
 */
export async function saveInsights(
  drafts: InsightDraft[],
): Promise<{ created: number; updated: number }> {
  const db = getDb();
  const now = Date.now();
  let created = 0;
  let updated = 0;

  for (const draft of drafts) {
    const existing = await db
      .select()
      .from(agentInsights)
      .where(eq(agentInsights.signature, draft.signature))
      .get();

    if (!existing) {
      await db.insert(agentInsights).values({
        id: randomUUID(),
        signature: draft.signature,
        kind: draft.kind,
        severity: draft.severity,
        title: draft.title,
        detail: draft.detail,
        proposedAction: draft.proposedAction,
        evidence: draft.evidence ?? null,
        automationId: draft.automationId ?? null,
        fromAi: draft.fromAi ? 1 : 0,
        status: "new",
        seenCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      created += 1;
      continue;
    }

    const escalated = existing.severity !== "critical" && draft.severity === "critical";
    await db
      .update(agentInsights)
      .set({
        severity: draft.severity,
        title: draft.title,
        detail: draft.detail,
        proposedAction: draft.proposedAction,
        evidence: draft.evidence ?? null,
        seenCount: existing.seenCount + 1,
        // Getting worse is new information; the same problem at the same level is not.
        status: escalated ? "new" : existing.status,
        updatedAt: now,
      })
      .where(eq(agentInsights.id, existing.id));
    updated += 1;
  }

  return { created, updated };
}

/**
 * Closes findings that stopped reproducing. Only touches deterministic ones:
 * the model half runs on demand, so its insights are absent from an ordinary
 * sweep and auto-resolving them would erase them minutes after they appear.
 * Dismissed rows are left alone — the user already had the last word.
 */
async function resolveMissing(seen: Set<string>): Promise<number> {
  const db = getDb();
  const open = await db
    .select({ id: agentInsights.id, signature: agentInsights.signature })
    .from(agentInsights)
    .where(
      and(eq(agentInsights.fromAi, 0), inArray(agentInsights.status, ["new", "acknowledged"])),
    );

  const gone = open.filter((row) => !seen.has(row.signature));
  for (const row of gone) {
    await db
      .update(agentInsights)
      .set({ status: "resolved", updatedAt: Date.now() })
      .where(eq(agentInsights.id, row.id));
  }
  return gone.length;
}

/** Everything the deterministic half of the supervisor can see right now. */
export async function collectSignals(): Promise<InsightDraft[]> {
  const since = Date.now() - WINDOW_MS;
  const groups = await Promise.all([
    detectFailedRuns(since),
    detectStepErrors(since),
    detectBrokenSendSteps(),
    detectInvalidActiveGraphs(),
    detectStuckRuns(),
    detectOrphanedProcessingJobs(),
    detectMonotonousAiNodes(since),
    detectAiSpend(),
    detectWebhookRejections(since),
    detectContactVolumeAnomaly(),
  ]);
  return groups.flat();
}

/** How long finished queue rows are kept before the sweep deletes them. */
const RETENTION_DAYS = 30;

/**
 * The operational queues must not grow forever: engine_events and engine_jobs
 * are working state, and once processed/done they only slow every tick's scan
 * down. Purged after 30 days. `engine_log` is deliberately NOT touched — it is
 * the audit trail behind the contact timeline and the KPI numbers.
 */
export async function purgeOperationalTables(): Promise<{ events: number; jobs: number }> {
  const db = getDb();
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const events = await db
    .delete(engineEvents)
    .where(and(lt(engineEvents.processedAt, cutoff)))
    .returning({ id: engineEvents.id });
  const jobs = await db
    .delete(engineJobs)
    .where(and(inArray(engineJobs.status, ["done", "failed"]), lt(engineJobs.createdAt, cutoff)))
    .returning({ id: engineJobs.id });
  return { events: events.length, jobs: jobs.length };
}

export interface SupervisorResult {
  created: number;
  updated: number;
  /** Findings that stopped reproducing and were closed automatically. */
  resolved: number;
  checked: number;
  aiUsed: boolean;
  aiError?: string;
}

/** Guard so the loop can call this every tick without actually sweeping every tick. */
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
let lastSweepAt = 0;

/**
 * One supervision pass: deterministic detectors first, then — optionally — a
 * model to interpret them. `withAi: false` keeps the sweep free, which is what
 * the periodic run uses; the "Analizuj teraz" button asks for the model.
 */
export async function runSupervisor(options: { withAi?: boolean } = {}): Promise<SupervisorResult> {
  lastSweepAt = Date.now();
  const deterministic = await collectSignals();
  let drafts = deterministic;
  let aiUsed = false;
  let aiError: string | undefined;

  if (options.withAi) {
    // Imported lazily: this module is loaded by the engine loop on every boot,
    // and the AI half pulls in the provider SDKs.
    const { runAiSupervisor } = await import("../ai/supervisor-ai.server");
    const result = await runAiSupervisor(deterministic);
    aiUsed = result.used;
    aiError = result.error;
    drafts = [...deterministic, ...result.drafts];
  }

  const { created, updated } = await saveInsights(drafts);
  // Resolution is keyed on the deterministic pass, which always runs — so a
  // fixed problem disappears whether or not the model was invited along.
  const resolved = await resolveMissing(new Set(deterministic.map((d) => d.signature)));
  return { created, updated, resolved, checked: drafts.length, aiUsed, aiError };
}

/**
 * Called from the engine tick. Runs at most every 15 minutes and without the
 * model — supervision that quietly spends money in the background is not
 * something anyone asked for. The model pass is on the button.
 */
export async function maybeRunSupervisor(): Promise<void> {
  if (Date.now() - lastSweepAt < SWEEP_INTERVAL_MS) return;
  try {
    await runSupervisor({ withAi: false });
    await purgeOperationalTables();
    // Copilot transcripts quote patient data, so they expire on their own
    // schedule alongside the engine's operational tables.
    await purgeCopilotHistory();
  } catch (err) {
    console.error(t("[PRM Engine] nadzorca nie dokończył przeglądu"), err);
  }
}

export async function listInsights(includeResolved = false): Promise<AgentInsightRow[]> {
  const db = getDb();
  const query = db.select().from(agentInsights);
  const rows = includeResolved
    ? await query.orderBy(desc(agentInsights.updatedAt))
    : await query
        .where(notInArray(agentInsights.status, ["dismissed", "resolved"]))
        .orderBy(desc(agentInsights.updatedAt));
  return rows;
}

export async function setInsightStatus(
  id: string,
  status: "acknowledged" | "dismissed" | "new",
): Promise<void> {
  const db = getDb();
  await db
    .update(agentInsights)
    .set({ status, updatedAt: Date.now() })
    .where(eq(agentInsights.id, id));
}

/** How many unhandled critical findings there are — the number on the bell. */
export async function countOpenCritical(): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: agentInsights.id })
    .from(agentInsights)
    .where(and(eq(agentInsights.severity, "critical"), eq(agentInsights.status, "new")));
  return rows.length;
}
