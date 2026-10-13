import { desc, eq, like } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  agentBriefs,
  agentInsights,
  agentModels,
  agentScores,
  type AgentBriefRow,
} from "../db/schema";
import { buildBrief } from "./brief";
import { polishBrief } from "./language.server";
import { latestSignals } from "./signals.server";

/**
 * The brief as a stored thing: composed from the template every night, and
 * polished by a model inside the perimeter when one is available. The
 * template text is always kept — it is what the polished version is checked
 * against, and what the screen shows when there is no model.
 */

const RISKS_IN_BRIEF = 8;

/** Today's brief from the template, straight from the database. */
export async function composeBrief(): Promise<{ day: string; text: string } | null> {
  const latest = await latestSignals();
  if (!latest) return null;
  const db = getDb();
  const [scores, insights, model] = await Promise.all([
    db
      .select({ score: agentScores.score })
      .from(agentScores)
      .where(eq(agentScores.kind, "no-show"))
      .orderBy(desc(agentScores.score))
      .limit(RISKS_IN_BRIEF),
    db
      .select()
      .from(agentInsights)
      .where(like(agentInsights.signature, "agent:%"))
      .orderBy(desc(agentInsights.updatedAt))
      .limit(10),
    db.select().from(agentModels).where(eq(agentModels.id, "no-show")).get(),
  ]);
  const params = (model?.params ?? null) as { mode?: "trained" | "prior" } | null;
  const text = buildBrief({
    day: latest.day,
    signals: latest.rows,
    recommendations: insights
      .filter((r) => r.status !== "dismissed" && r.status !== "resolved")
      .map((r) => ({
        signature: r.signature,
        severity: r.severity,
        title: r.title,
        detail: r.detail,
        proposedAction: r.proposedAction,
        evidence: r.evidence ?? {},
      })),
    risks: scores.map((s) => ({ patient: "", startsAt: null, probability: s.score })),
    model: model && params ? { mode: params.mode ?? "prior", samples: model.samples } : null,
  });
  return { day: latest.day, text };
}

/** Compose and save today's brief; with a model in reach, polish it too. Never throws over the model. */
export async function storeBrief(now = Date.now()): Promise<AgentBriefRow | null> {
  const composed = await composeBrief();
  if (!composed) return null;
  const polished = await polishBrief(composed.text);
  const db = getDb();
  await db
    .insert(agentBriefs)
    .values({
      day: composed.day,
      text: composed.text,
      polished: polished.ok ? polished.text : "",
      model: polished.ok ? polished.model : "",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: agentBriefs.day,
      set: {
        text: composed.text,
        polished: polished.ok ? polished.text : "",
        model: polished.ok ? polished.model : "",
        updatedAt: now,
      },
    });
  return (
    (await db.select().from(agentBriefs).where(eq(agentBriefs.day, composed.day)).get()) ?? null
  );
}

export async function latestBrief(): Promise<AgentBriefRow | null> {
  const row = await getDb()
    .select()
    .from(agentBriefs)
    .orderBy(desc(agentBriefs.day))
    .limit(1)
    .get();
  return row ?? null;
}

/** Polish the latest stored brief on request; says why when it cannot. */
export async function polishLatestBrief(
  now = Date.now(),
): Promise<{ ok: boolean; error?: string; brief?: AgentBriefRow }> {
  const row = await latestBrief();
  if (!row) return { ok: false, error: "" };
  const polished = await polishBrief(row.text);
  if (!polished.ok) return { ok: false, error: polished.reason };
  const db = getDb();
  await db
    .update(agentBriefs)
    .set({ polished: polished.text, model: polished.model, updatedAt: now })
    .where(eq(agentBriefs.day, row.day));
  return { ok: true, brief: (await latestBrief()) ?? undefined };
}
