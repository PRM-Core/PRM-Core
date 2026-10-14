import { asc, eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contacts, inboxMessages, inboxThreads } from "../db/schema";
import { getAiConfig, isOverDailyLimit, getKeyStatus } from "./settings.server";
import { priceCall, AiProviderError } from "./provider.server";
import { knowledgeForPrompt, knowledgeSources, recordGap } from "./knowledge.server";
import { buildInboxSystemPrompt } from "./inbox-prompt";
import { splitMissing, ungrounded } from "../agent/grounding";
import { logStep } from "../engine/log.server";
import { t } from "@/lib/i18n";
import { identifiersOf, pseudonym } from "./redact";

// "Sugestia AI" in the inbox: drafts a reply for a human to read, edit and send.
//
// It never sends anything. That is the whole design — a model writing directly
// to a patient belongs to the PRM_Agent node, where the automation author has
// explicitly granted it that autonomy; here a receptionist stays in the loop by
// construction, and the button is the only thing that spends money.

const MAX_TOKENS = 1000;
/** How much of the conversation the model sees. Clinic threads are short; the tail is what matters. */
const HISTORY_LIMIT = 12;

export interface InboxDraftResult {
  ok: boolean;
  text?: string;
  error?: string;
  /** Facts in the suggestion the knowledge base and the conversation do not contain — to check before sending. */
  unverified?: string[];
  /** What the patient asked that the base could not answer — recorded for whoever keeps it. */
  missing?: string[];
}

/**
 * Drafts a reply for one thread. Never throws: a missing key, a spent limit or a
 * provider outage come back as `{ ok: false, error }` so the inbox shows a
 * toast and the receptionist just writes the reply themselves.
 */
export async function draftInboxReply(threadId: string): Promise<InboxDraftResult> {
  const db = getDb();
  const thread = await db.select().from(inboxThreads).where(eq(inboxThreads.id, threadId)).get();
  if (!thread) return { ok: false, error: t("Nie znaleziono rozmowy.") };

  const messages = await db
    .select()
    .from(inboxMessages)
    .where(eq(inboxMessages.threadId, threadId))
    .orderBy(asc(inboxMessages.createdAt));
  if (messages.length === 0)
    return { ok: false, error: t("Rozmowa nie ma jeszcze żadnej wiadomości.") };

  const config = await getAiConfig();
  if (!(await getKeyStatus())[config.providerId]) {
    return {
      ok: false,
      error: t(
        "Brak klucza API dostawcy {providerId} — uzupełnij go w Integracje → Klucze i dane dostępowe.",
        { providerId: config.providerId },
      ),
    };
  }

  const limit = await isOverDailyLimit();
  if (limit.over) {
    return {
      ok: false,
      error: t(
        "Dzienny limit kosztów AI wyczerpany ({v0} / {v1} USD). Podnieś go w Ustawieniach → PRM_Agent.",
        { v0: limit.spent.toFixed(2), v1: limit.limit.toFixed(2) },
      ),
    };
  }

  const contact = await db.select().from(contacts).where(eq(contacts.id, thread.contactId)).get();
  const profile = contact
    ? [
        // A pseudonym, not a name: the model drafts a reply, it does not need
        // to know who the patient is.
        `Pacjent: ${pseudonym(contact.id)} (${contact.prmId})`,
        `Status: ${contact.status}`,
        (contact.segments ?? []).length > 0
          ? `Segmenty: ${(contact.segments ?? []).join(", ")}`
          : "",
        (contact.tags ?? []).length > 0 ? `Tagi: ${(contact.tags ?? []).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : t("Pacjent: brak danych w kartotece.");

  // Roles are flipped on purpose: the patient's words are what the model must
  // respond to, so they arrive as "user" turns and our own replies as
  // "assistant" ones. That is the conversation the model is continuing.
  const history = messages.slice(-HISTORY_LIMIT).map((m) => ({
    role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
    text: m.body,
  }));

  const knowledge = await knowledgeForPrompt();
  const channelName =
    thread.channel === "sms"
      ? t("SMS (krótka wiadomość, maksymalnie 320 znaków, bez formatowania)")
      : thread.channel === "email"
        ? "e-mail"
        : t("wiadomość z formularza na stronie — odpowiedź pójdzie e-mailem");

  try {
    const completion = await config.provider.complete({
      model: config.model,
      system: buildInboxSystemPrompt(knowledge),
      messages: [
        {
          role: "user",
          text: t("Kanał: {channelName}.\n{profile}\n\nRozmowa:", {
            channelName: channelName,
            profile: profile,
          }),
        },
        ...history,
      ],
      // No tools: this call has one job, and its answer is plain text a human
      // will read before anything reaches the patient.
      tools: [],
      maxTokens: MAX_TOKENS,
      identifiers: contact ? identifiersOf(contact) : undefined,
    });

    const costUsd = priceCall(config.providerId, config.model, completion.usage);
    // Logged as kind "ai" so it counts against the same daily ceiling as the
    // agent node and the scenario generator — spending is spending.
    await logStep({
      contactId: thread.contactId,
      kind: "ai",
      message: t("Sugestia odpowiedzi w skrzynce ({channel}).", { channel: thread.channel }),
      detail: { feature: "inbox-assist", threadId },
      tokensIn: completion.usage.inputTokens,
      tokensOut: completion.usage.outputTokens,
      costUsd,
    });

    const { text, missing } = splitMissing(completion.text.trim());
    if (!text) return { ok: false, error: t("Model nie zwrócił treści — spróbuj ponownie.") };
    // The base is the only source of facts — checked here, not trusted to the prompt.
    const sources = [...(await knowledgeSources()), ...messages.map((m) => m.body), profile];
    const unverified = ungrounded(text, sources).map((c) => c.text);
    for (const question of missing) await recordGap({ question, source: "inbox", threadId });
    return { ok: true, text, unverified, missing };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AiProviderError ? err.message : String(err),
    };
  }
}
