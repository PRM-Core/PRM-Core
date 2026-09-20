import { asc, eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contacts, inboxMessages, inboxThreads } from "../db/schema";
import { getAiConfig, isOverDailyLimit, getKeyStatus } from "./settings.server";
import { priceCall, AiProviderError } from "./provider.server";
import { knowledgeForPrompt } from "./knowledge.server";
import { logStep } from "../engine/log.server";
import { t } from "@/lib/i18n";

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
}

function buildSystemPrompt(knowledge: string | null): string {
  return [
    t(
      "Jesteś asystentem recepcji polskiej placówki medycznej. Piszesz PROPOZYCJĘ odpowiedzi na wiadomość pacjenta.",
    ),
    t(
      "Odpowiedź trafia do człowieka, który ją przeczyta, poprawi i dopiero wyśle — nie jest wysyłana automatycznie.",
    ),
    "",
    t("ŹRÓDŁO FAKTÓW — najważniejsza zasada:"),
    t("Jedynym źródłem informacji o placówce jest baza wiedzy na końcu tego promptu."),
    t("Godziny otwarcia, dostępność lekarzy i pracowni, terminy, ceny, czas oczekiwania i zakres"),
    t("usług podawaj WYŁĄCZNIE wtedy, gdy dosłownie stoją w bazie wiedzy. Jeśli ich tam nie ma,"),
    t("napisz, że recepcja potwierdzi szczegóły — nigdy nie zgaduj ani nie podawaj przykładowej"),
    t("wartości. Zmyślony termin albo cena to wiadomość, na podstawie której pacjent podejmie"),
    t("decyzję, więc jest gorsza niż brak odpowiedzi."),
    "",
    "OCHRONA DANYCH:",
    t(
      "Nigdy nie proś pacjenta o PESEL, numer dokumentu, dane karty ani hasła. Kanały marketingowe",
    ),
    t("nie służą do zbierania danych wrażliwych, a placówka i tak ma te dane w kartotece."),
    "",
    t("Pozostałe zasady:"),
    t("- Pisz po polsku, zwięźle (2–5 zdań), uprzejmie i konkretnie."),
    t("- Podpisuj się jako placówka, nigdy jako sztuczna inteligencja."),
    t(
      "- NIE stawiaj diagnoz i nie doradzaj w sprawach medycznych — w takiej sytuacji zaproponuj kontakt z lekarzem lub umówienie wizyty.",
    ),
    t(
      "- Jeśli brakuje danych, żeby odpowiedzieć rzetelnie, napisz wprost, o co recepcja powinna dopytać.",
    ),
    t("- Zwróć wyłącznie treść wiadomości, bez nagłówka, tematu i bez komentarza od siebie."),
    knowledge
      ? t("\nBaza wiedzy placówki (jedyne dozwolone źródło faktów):\n{knowledge}", {
          knowledge: knowledge,
        })
      : t(
          "\nBaza wiedzy placówki jest PUSTA. Nie podawaj żadnych faktów o ofercie, cenach, godzinach ani dostępności — napisz tylko, że recepcja odezwie się z konkretami.",
        ),
  ].join("\n");
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
        `Pacjent: ${`${contact.firstName} ${contact.lastName}`.trim() || contact.email}`,
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
      system: buildSystemPrompt(knowledge),
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

    const text = completion.text.trim();
    if (!text) return { ok: false, error: t("Model nie zwrócił treści — spróbuj ponownie.") };
    return { ok: true, text };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AiProviderError ? err.message : String(err),
    };
  }
}
