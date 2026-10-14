import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contacts, inboxMessages, inboxThreads } from "../db/schema";
import { AiProviderError, priceCall } from "../ai/provider.server";
import { identifiersOf } from "../ai/redact";
import { logStep } from "../engine/log.server";
import { modelGate } from "./language.server";
import { parseModelTriage, triageByRules, triageSystemPrompt, type Triage } from "./triage";
import { t } from "@/lib/i18n";

/**
 * Triage of inbound conversations — the part that reads the database and may
 * ask a model. Runs from the engine tick, so a patient's message gets a look
 * within a minute of arriving without touching the webhooks that receive it.
 * The rules always answer; the model's answer replaces them only when it is
 * well-formed. The message goes to the model through the redaction layer,
 * with the patient's own identifiers named, so a name in the body is a
 * placeholder by the time it leaves the process.
 */

const MESSAGES_READ = 3;
const TEXT_LIMIT = 2000;
const MODEL_TOKENS = 200;
const BATCH = 10;
const INTERVAL_MS = 60_000;

export interface TriageResult extends Triage {
  source: "rules" | "model";
}

/** Triage one thread from its latest inbound messages and record it. Null when the thread is gone. */
export async function triageThread(
  threadId: string,
  now = Date.now(),
): Promise<TriageResult | null> {
  const db = getDb();
  const thread = await db.select().from(inboxThreads).where(eq(inboxThreads.id, threadId)).get();
  if (!thread) return null;
  const inbound = await db
    .select({ body: inboxMessages.body, subject: inboxMessages.subject })
    .from(inboxMessages)
    .where(and(eq(inboxMessages.threadId, threadId), eq(inboxMessages.direction, "in")))
    .orderBy(desc(inboxMessages.createdAt))
    .limit(MESSAGES_READ);
  if (inbound.length === 0) return null;
  // Oldest first, newest last — the newest is what the triage is about.
  const text = inbound
    .reverse()
    .map((m) => (m.subject ? `${m.subject}\n${m.body}` : m.body))
    .join("\n---\n")
    .slice(-TEXT_LIMIT);

  let result: TriageResult = { ...triageByRules(text), source: "rules" };
  const gate = await modelGate("triage_by_model");
  if (gate.ok) {
    const contact = await db.select().from(contacts).where(eq(contacts.id, thread.contactId)).get();
    try {
      const completion = await gate.config.provider.complete({
        model: gate.config.model,
        system: triageSystemPrompt(),
        messages: [
          {
            role: "user",
            text: t("Kanał: {channel}\n\n{text}", { channel: thread.channel, text }),
          },
        ],
        tools: [],
        maxTokens: MODEL_TOKENS,
        identifiers: contact ? identifiersOf(contact) : undefined,
      });
      await logStep({
        contactId: thread.contactId,
        kind: "ai",
        message: t("PRM_Agent: triaż wiadomości ({channel}).", { channel: thread.channel }),
        detail: { feature: "agent-triage", threadId },
        tokensIn: completion.usage.inputTokens,
        tokensOut: completion.usage.outputTokens,
        costUsd: priceCall(gate.config.providerId, gate.config.model, completion.usage),
      });
      const parsed = parseModelTriage(completion.text);
      if (parsed) result = { ...parsed, source: "model" };
      else
        await logStep({
          kind: "agent",
          message: t("Triaż: odpowiedź modelu poza słownikiem — zostają reguły."),
          detail: { feature: "agent-triage", threadId },
        });
    } catch (err) {
      await logStep({
        kind: "agent",
        message: t("Triaż: model niedostępny ({err}) — zostają reguły.", {
          err: err instanceof AiProviderError ? err.message : String(err),
        }),
        detail: { feature: "agent-triage", threadId },
      });
    }
  }

  await db
    .update(inboxThreads)
    .set({
      triageUrgency: result.urgency,
      triageTopic: result.topic,
      triageOwner: result.owner,
      triageReason: result.reason,
      triageSource: result.source,
      triageAt: now,
    })
    .where(eq(inboxThreads.id, threadId));
  return result;
}

/** Open threads whose latest message is inbound and newer than their last triage. */
export async function triageDueThreads(limit = BATCH, now = Date.now()): Promise<number> {
  const db = getDb();
  const due = await db
    .select({ id: inboxThreads.id })
    .from(inboxThreads)
    .where(
      and(
        eq(inboxThreads.status, "open"),
        eq(inboxThreads.lastDirection, "in"),
        or(isNull(inboxThreads.triageAt), lt(inboxThreads.triageAt, inboxThreads.lastMessageAt)),
      ),
    )
    .orderBy(desc(inboxThreads.lastMessageAt))
    .limit(limit);
  let n = 0;
  for (const row of due) if (await triageThread(row.id, now)) n += 1;
  return n;
}

let lastSweepAt = 0;

/** On the engine clock: at most once a minute, a small batch. Never throws. */
export async function maybeTriageInbox(now = Date.now()): Promise<void> {
  if (now - lastSweepAt < INTERVAL_MS) return;
  lastSweepAt = now;
  try {
    await triageDueThreads(BATCH, now);
  } catch (err) {
    await logStep({
      kind: "error",
      message: t("PRM_Agent: triaż skrzynki nie powiódł się: {err}", { err: String(err) }),
      detail: { source: "agent-triage" },
    });
  }
}
