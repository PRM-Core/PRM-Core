import { inArray } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { agentDrafts, agentExamples, contacts } from "../db/schema";
import {
  buildNameIndex,
  buildTrainingSet,
  TRAINING_MIN_EXAMPLES,
  type TrainingExample,
  type TrainingSet,
} from "./training";

/**
 * The training set — the database side. Reads what the team decided and
 * the surnames to check against; writes nothing. The caller (the export
 * script) decides where the file goes, inside the installation.
 */

export async function trainingExamples(): Promise<TrainingExample[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(agentExamples)
    .where(inArray(agentExamples.kind, ["draft", "triage"]));
  const drafts = await db
    .select({
      channel: agentDrafts.channel,
      audienceSignal: agentDrafts.audienceSignal,
      decidedAt: agentDrafts.decidedAt,
      title: agentDrafts.title,
      audienceCount: agentDrafts.audienceCount,
      evidence: agentDrafts.evidence,
      templateMessage: agentDrafts.templateMessage,
    })
    .from(agentDrafts)
    .where(inArray(agentDrafts.status, ["approved", "handed_off"]));
  // An approved text is stored at the moment of approval, with the same
  // timestamp, channel and signal as the draft's decision.
  const byDecision = new Map<string, (typeof drafts)[number]>(
    drafts.map((d) => [`${d.channel}|${d.audienceSignal}|${d.decidedAt}`, d]),
  );
  return rows.map((r) => {
    const d =
      r.kind === "draft" ? byDecision.get(`${r.channel}|${r.audienceSignal}|${r.createdAt}`) : null;
    return {
      id: r.id,
      kind: r.kind,
      channel: r.channel,
      text: r.text,
      label: r.label,
      draft: d
        ? {
            title: d.title,
            audienceSignal: d.audienceSignal,
            audienceCount: d.audienceCount,
            detail: d.evidence?.detail ?? "",
            templateMessage: d.templateMessage,
          }
        : null,
    };
  });
}

export async function contactSurnames(): Promise<string[]> {
  const rows = await getDb().select({ lastName: contacts.lastName }).from(contacts);
  return rows.map((r) => r.lastName);
}

export async function exportTrainingSet(minimum = TRAINING_MIN_EXAMPLES): Promise<TrainingSet> {
  const [examples, surnames] = await Promise.all([trainingExamples(), contactSurnames()]);
  return buildTrainingSet(examples, buildNameIndex(surnames), minimum);
}
