import { createServerFn } from "@tanstack/react-start";
import { desc, eq, inArray } from "drizzle-orm";
import { allowReporter, requireUser } from "./require-user";
import { t } from "@/lib/i18n";

/**
 * PRM_Agent for the dashboard: the latest signals, the upcoming visits most
 * at risk of a no-show, and what the model is. Read-only, so the reviewer
 * role may see it; recomputing on demand is an administrator's call.
 */

export interface AgentSignalView {
  key: string;
  dimension: string;
  value: number;
  previous: number | null;
  count: number;
}

export interface AgentRiskView {
  visitId: string;
  contactId: string;
  patient: string;
  prmId: string;
  startsAt: number | null;
  title: string;
  doctor: string;
  probability: number;
  factors: { feature: string; contribution: number }[];
}

export interface AgentOverview {
  computed: { day: string; computedAt: number } | null;
  signals: AgentSignalView[];
  risks: AgentRiskView[];
  model: { mode: "trained" | "prior"; samples: number; baseRate: number } | null;
}

export const getAgentOverview = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<AgentOverview> => {
    const { getDb } = await import("../db/client.server");
    const { agentModels, agentScores, contactVisits, contacts } = await import("../db/schema");
    const { latestSignals } = await import("../agent/signals.server");
    const db = getDb();

    const latest = await latestSignals();
    const scores = await db
      .select()
      .from(agentScores)
      .where(eq(agentScores.kind, "no-show"))
      .orderBy(desc(agentScores.score))
      .limit(8);
    const visitIds = scores.map((s) => s.visitId).filter((v): v is string => !!v);
    const visits = visitIds.length
      ? await db.select().from(contactVisits).where(inArray(contactVisits.id, visitIds))
      : [];
    const people = scores.length
      ? await db
          .select({
            id: contacts.id,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
            prmId: contacts.prmId,
          })
          .from(contacts)
          .where(inArray(contacts.id, [...new Set(scores.map((s) => s.contactId))]))
      : [];
    const visitOf = new Map(visits.map((v) => [v.id, v]));
    const personOf = new Map(people.map((p) => [p.id, p]));
    const model = await db.select().from(agentModels).where(eq(agentModels.id, "no-show")).get();
    const params = (model?.params ?? null) as {
      mode?: "trained" | "prior";
      baseRate?: number;
    } | null;

    return {
      computed: latest ? { day: latest.day, computedAt: latest.computedAt } : null,
      signals: (latest?.rows ?? []).map((r) => ({
        key: r.key,
        dimension: r.dimension,
        value: r.value,
        previous: r.previous,
        count: r.count,
      })),
      risks: scores
        .map((s) => {
          const v = s.visitId ? visitOf.get(s.visitId) : undefined;
          const p = personOf.get(s.contactId);
          return {
            visitId: s.visitId ?? "",
            contactId: s.contactId,
            patient: p ? `${p.firstName} ${p.lastName}`.trim() : "—",
            prmId: p?.prmId ?? "",
            startsAt: v?.startsAt ?? null,
            title: v?.title ?? "",
            doctor: v?.doctor ?? "",
            probability: s.score,
            factors: s.factors,
          };
        })
        .filter((r) => r.visitId),
      model:
        model && params
          ? { mode: params.mode ?? "prior", samples: model.samples, baseRate: params.baseRate ?? 0 }
          : null,
    };
  });

export const runAgentNow = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => {
    const { getSessionUser } = await import("../auth/session.server");
    const user = await getSessionUser();
    if (!user || user.role !== "admin")
      throw new Error(t("Tylko administrator może uruchomić liczenie sygnałów."));
    const { runAgentNightly } = await import("../agent/signals.server");
    const result = await runAgentNightly();
    return {
      ok: true as const,
      signals: result.signals,
      mode: result.model.mode,
      samples: result.model.samples,
    };
  });
