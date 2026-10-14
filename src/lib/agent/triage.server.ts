import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contacts, inboxMessages, inboxThreads } from "../db/schema";
import { AiProviderError, priceCall } from "../ai/provider.server";
import { identifiersOf, redactText } from "../ai/redact";
import { rememberTriage, triageExamples } from "./directions.server";
import { logStep } from "../engine/log.server";
import { modelGate } from "./language.server";
import {
  parseModelTriage,
  triageByRules,
  triageSystemPrompt,
  triageUserPrompt,
  type Triage,
} from "./triage";
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

/** The latest inbound messages of a thread, oldest first — what a triage is about. */
async function inboundText(threadId: string): Promise<string> {
  const inbound = await getDb()
    .select({ body: inboxMessages.body, subject: inboxMessages.subject })
    .from(inboxMessages)
    .where(and(eq(inboxMessages.threadId, threadId), eq(inboxMessages.direction, "in")))
    .orderBy(desc(inboxMessages.createdAt))
    .limit(MESSAGES_READ);
  // Oldest first, newest last — the newest is what the triage is about.
  return inbound
    .reverse()
    .map((m) => (m.subject ? `${m.subject}\n${m.body}` : m.body))
    .join("\n---\n")
    .slice(-TEXT_LIMIT);
}

/** Triage one thread from its latest inbound messages and record it. Null when the thread is gone. */
export async function triageThread(
  threadId: string,
  now = Date.now(),
): Promise<TriageResult | null> {
  const db = getDb();
  const thread = await db.select().from(inboxThreads).where(eq(inboxThreads.id, threadId)).get();
  if (!thread) return null;
  const text = await inboundText(threadId);
  if (!text) return null;

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
            // The team's own verdicts, when learning is enabled: "this is how we sort".
            text: triageUserPrompt(thread.channel, text, await triageExamples()),
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

/**
 * The front desk corrected a triage. The verdict stands on the thread until
 * the patient writes again; the message — pseudonymised before it is
 * stored — and the verdict become an example the model sees when learning
 * from decisions is enabled.
 */
export async function correctTriage(input: {
  threadId: string;
  triage: Omit<Triage, "reason">;
  decidedBy: string;
  now?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const now = input.now ?? Date.now();
  const thread = await db
    .select()
    .from(inboxThreads)
    .where(eq(inboxThreads.id, input.threadId))
    .get();
  if (!thread) return { ok: false, error: t("Nie ma takiej rozmowy.") };
  const { urgency, topic, owner } = input.triage;
  await db
    .update(inboxThreads)
    .set({
      triageUrgency: urgency,
      triageTopic: topic,
      triageOwner: owner,
      triageReason: t("Ocena poprawiona przez: {who}.", { who: input.decidedBy }),
      triageSource: "person",
      triageAt: now,
    })
    .where(eq(inboxThreads.id, input.threadId));

  const text = await inboundText(input.threadId);
  const contact = await db.select().from(contacts).where(eq(contacts.id, thread.contactId)).get();
  await rememberTriage({
    text: redactText(text, contact ? identifiersOf(contact) : {}),
    label: `${urgency}/${topic}/${owner}`,
    decidedBy: input.decidedBy,
    now,
  });
  await logStep({
    contactId: thread.contactId,
    kind: "agent",
    message: t("Triaż poprawiony przez {who}: {label}.", {
      who: input.decidedBy,
      label: `${urgency}/${topic}/${owner}`,
    }),
    detail: { source: "agent-learning", threadId: input.threadId },
  });
  return { ok: true };
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
