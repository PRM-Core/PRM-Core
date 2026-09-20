import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contacts, engineEvents, contactNotes } from "../db/schema";
import type { ContactRow } from "../db/schema";
import type { AutomationNode } from "../automation-flow";
import { addNote } from "../notes/notes.server";
import { applySegmentChange, applyTagChange, DNC_TAG } from "./actions.server";
import { ensureLabelSegment, listSegmentOptions } from "../segments/segments.server";
import { emailSettings } from "../db/schema";
import { escapeHtmlText } from "../content-builder";
import { sendEmail, SendGridError } from "../email/sendgrid.server";
import { sendSms, TwilioError } from "../sms/twilio.server";
import {
  createTrackedSend,
  deleteTrackedSend,
  injectTracking,
} from "../email/email-tracking.server";
import { getBaseUrl } from "./settings.server";
import { recordOutboundMessage } from "../inbox/inbox.server";
import { resolveReplySmsSender } from "../sms/senders.server";
import { checkConsent } from "../consent/consent.server";
import { knowledgeForPrompt } from "../ai/knowledge.server";
import { getAiConfig, isOverDailyLimit } from "../ai/settings.server";
import { priceCall, AiProviderError, type AiMessage, type AiToolDef } from "../ai/provider.server";
import { intlLocale, t } from "@/lib/i18n";

// The PRM_Agent as an automation node. It reads the contact and their recent
// history, then decides which outgoing path the run should take — and may tag,
// segment, or annotate the contact along the way if the node grants it that
// autonomy.
//
// Every decision is logged with the model's own reasoning. There is no black
// box here: whatever the agent did, the engine log says why.

const MAX_TOOL_ROUNDS = 4;
const MAX_TOKENS = 4096;
const RECENT_EVENT_LIMIT = 15;

export interface AgentDecision {
  /** Output handle to follow — always one of the node's configured path ids. */
  handle: string;
  message: string;
  detail: Record<string, string>;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  /** Set when the agent could not run at all; the runner falls back to the first path. */
  failed?: boolean;
}

/** Per-node autonomy switches, stored as strings in the node config. */
function allows(node: AutomationNode, key: string): boolean {
  return (node.config?.[key] ?? "") === "1";
}

function buildTools(node: AutomationNode, assignable: string[]): AiToolDef[] {
  const paths = node.paths ?? [];
  const tools: AiToolDef[] = [
    {
      name: "choose_path",
      description: t(
        "Wybierz ścieżkę, którą ma dalej pójść ten pacjent. Wywołaj dokładnie raz, na końcu, po ewentualnych innych narzędziach.",
      ),
      inputSchema: {
        type: "object",
        properties: {
          pathId: {
            type: "string",
            enum: paths.map((p) => p.id),
            description: t("Identyfikator ścieżki. Dostępne: {v0}", {
              v0: paths.map((p) => `${p.id} (${p.label})`).join(", "),
            }),
          },
          reasoning: {
            type: "string",
            description: t(
              "Krótkie uzasadnienie po polsku — trafi na oś czasu pacjenta, więc pisz zrozumiale dla marketingowca.",
            ),
          },
        },
        required: ["pathId", "reasoning"],
        additionalProperties: false,
      },
    },
    {
      name: "write_note",
      description: t("Zapisz notatkę na karcie pacjenta."),
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
    },
  ];

  if (allows(node, "canAddTags")) {
    tools.push({
      name: "add_tags",
      description: t("Dodaj tagi pacjentowi."),
      inputSchema: {
        type: "object",
        properties: { tags: { type: "array", items: { type: "string" } } },
        required: ["tags"],
        additionalProperties: false,
      },
    });
  }

  if (allows(node, "canRemoveTags")) {
    tools.push({
      name: "remove_tags",
      description: t(
        "Usuń tagi, które są już nieaktualne (np. pacjent przestał być leadem). Nie usuwaj tagów, których znaczenia nie rozumiesz.",
      ),
      inputSchema: {
        type: "object",
        properties: { tags: { type: "array", items: { type: "string" } } },
        required: ["tags"],
        additionalProperties: false,
      },
    });
  }

  if (allows(node, "canWriteMessages")) {
    tools.push({
      name: "send_message",
      description: t(
        "Napisz i wyślij wiadomość do pacjenta. Opieraj treść wyłącznie na bazie wiedzy i danych pacjenta — nie obiecuj terminów, cen ani efektów leczenia, których nie masz w materiałach. Podpisz się jako placówka, nie jako AI.",
      ),
      inputSchema: {
        type: "object",
        properties: {
          channel: {
            type: "string",
            enum: ["email", "sms"],
            description: t("Kanał wysyłki. SMS tylko dla krótkich, konkretnych treści."),
          },
          subject: {
            type: "string",
            description: t("Temat — wymagany dla e-maila, pomijany przy SMS."),
          },
          text: { type: "string", description: t("Treść wiadomości, zwykłym tekstem, po polsku.") },
        },
        required: ["channel", "text"],
        additionalProperties: false,
      },
    });
  }

  // Wolno przypisywać tylko do segmentów nadawanych wprost. Do segmentu
  // z warunkami nikogo się nie przypisuje — pacjent wchodzi do niego sam, gdy
  // zacznie je spełniać, a nadanie etykiety o tej samej nazwie nie poszerzyłoby
  // tamtego audytorium ani o jedną osobę.
  if (allows(node, "canAssignSegments") && assignable.length > 0) {
    tools.push({
      name: "assign_segment",
      description: t(
        "Przypisz pacjenta do JUŻ ISTNIEJĄCEGO segmentu nadawanego wprost. Nazwa musi być dokładnie jedną z podanych — inna zostanie odrzucona. Segmentów z warunkami nie ma na tej liście, bo do nich się nie przypisuje: pacjent trafia tam sam, gdy zacznie spełniać warunki.",
      ),
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            enum: assignable,
            description: t("Dokładna nazwa segmentu z modułu Segmenty."),
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    });
  }

  if (allows(node, "canCreateSegments")) {
    tools.push({
      name: "create_segment",
      description: t(
        "Utwórz NOWY segment w module Segmenty i przypisz do niego pacjenta. Segment będzie widoczny w module Segmenty i obejmie wszystkich pacjentów z tą etykietą. Używaj tylko, gdy żaden istniejący segment nie pasuje, a zachowanie pacjenta jest powtarzalnym wzorcem.",
      ),
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: t("Krótka, opisowa nazwa segmentu.") },
          description: {
            type: "string",
            description: t(
              "Po co jest ten segment i kogo ma obejmować — zobaczy to marketingowiec w module Segmenty.",
            ),
          },
        },
        required: ["name", "description"],
        additionalProperties: false,
      },
    });
  }

  return tools;
}

async function loadContext(
  contact: ContactRow,
  existingSegments: { name: string; fromLabel: boolean }[],
): Promise<string> {
  const db = getDb();

  const [events, notes] = await Promise.all([
    db
      .select()
      .from(engineEvents)
      .where(eq(engineEvents.contactId, contact.id))
      .orderBy(desc(engineEvents.occurredAt))
      .limit(RECENT_EVENT_LIMIT),
    db
      .select()
      .from(contactNotes)
      .where(eq(contactNotes.contactId, contact.id))
      .orderBy(desc(contactNotes.createdAt))
      .limit(5),
  ]);

  const timeline =
    events.length > 0
      ? events
          .map(
            (e) =>
              `- ${new Date(e.occurredAt).toLocaleString(intlLocale())} — ${e.type}${
                Object.keys(e.payload ?? {}).length > 0 ? ` ${JSON.stringify(e.payload)}` : ""
              }`,
          )
          .join("\n")
      : t("- (brak zarejestrowanych zdarzeń)");

  return [
    "## Pacjent",
    t("Imię i nazwisko: {v0}", {
      v0: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "(brak)",
    }),
    `E-mail: ${contact.email || "(brak)"}`,
    `Telefon: ${contact.phone || "(brak)"}`,
    `Status: ${contact.status}`,
    `Segmenty: ${(contact.segments ?? []).join(", ") || "(brak)"}`,
    `Tagi: ${(contact.tags ?? []).join(", ") || "(brak)"}`,
    t("Źródło: {v0}", {
      v0:
        [contact.source, contact.medium, contact.campaign].filter(Boolean).join(" / ") || "(brak)",
    }),
    t("W bazie od: {createdAt}", { createdAt: contact.createdAt }),
    "",
    t("## Ostatnie zdarzenia (od najnowszych)"),
    timeline,
    "",
    t("## Notatki na karcie"),
    notes.length > 0 ? notes.map((n) => `- ${n.text.replace(/\n/g, " ")}`).join("\n") : "- (brak)",
    "",
    t("## Segmenty istniejące w systemie (moduł Segmenty)"),
    existingSegments.length > 0
      ? existingSegments
          .map(
            (s) =>
              `- ${s.name}${s.fromLabel ? "" : t(" — segment z warunkami, przypisać się do niego nie da")}`,
          )
          .join("\n")
      : t("- (brak — nie ma jeszcze żadnego segmentu)"),
  ].join("\n");
}

/**
 * Sends the message the agent composed. Consent is enforced here rather than
 * in the prompt — a model talked into ignoring an instruction must still not
 * be able to message someone who opted out.
 */
async function sendAgentMessage(
  input: Record<string, unknown>,
  contact: ContactRow,
): Promise<string> {
  const channel = String(input.channel ?? "email");

  // The agent writes marketing-adjacent messages on its own initiative, so it
  // is held to the marketing bar: consent required, no administrative bypass.
  // Enforced here in code, not in the prompt — a model talked out of its
  // instructions still cannot get past this.
  const consent = checkConsent(contact, channel === "sms" ? "sms" : "email", "marketing");
  if (!consent.allowed) {
    return t("Odmowa: {reason} Nie wysłano nic.", { reason: consent.reason });
  }

  const text = String(input.text ?? "").trim();
  if (!text) return t("Pusta treść — nie wysłano nic.");

  const db = getDb();

  if (channel === "sms") {
    if (!contact.phone) return t("Pacjent nie ma numeru telefonu — nie wysłano SMS-a.");
    // A message the agent writes is one the patient may answer, so it goes out
    // from a reply-capable sender when one exists.
    const sender = await resolveReplySmsSender();
    if (!sender) return t("Brak skonfigurowanego nadawcy SMS — nie wysłano nic.");
    try {
      await sendSms({ to: contact.phone, fromNumber: sender.value, body: text });
      // Into the inbox, so the thread shows the whole exchange — the agent
      // writing to a patient is a conversation, not a campaign, and whoever
      // picks up the reply needs to see what was already said.
      await recordOutboundMessage({
        contactId: contact.id,
        channel: "sms",
        subject: "SMS",
        body: text,
        source: "agent",
      });
      return t("Wysłano SMS na {phone}.", { phone: contact.phone });
    } catch (err) {
      return t("Nie udało się wysłać SMS-a: {v0}", {
        v0: err instanceof TwilioError ? err.message : String(err),
      });
    }
  }

  if (!contact.email) return t("Pacjent nie ma adresu e-mail — nie wysłano wiadomości.");
  const subject = String(input.subject ?? "").trim() || t("Wiadomość z kliniki");
  const settings = await db.select().from(emailSettings).get();
  const baseUrl = await getBaseUrl();

  // Plain text from the model, wrapped in the same minimal shell the content
  // builder uses, so open/click tracking works exactly as for any other send.
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;font-size:14px;color:#111;white-space:pre-wrap">${escapeHtmlText(text)}</div></body></html>`;

  const token = await createTrackedSend({ toEmail: contact.email, subject });
  try {
    await sendEmail({
      to: contact.email,
      fromEmail: settings?.fromEmail ?? "",
      fromName: settings?.fromName ?? "",
      subject,
      html: injectTracking(html, token, baseUrl),
    });
    await recordOutboundMessage({
      contactId: contact.id,
      channel: "email",
      subject,
      body: text,
      html,
      source: "agent",
      sendToken: token,
    });
    return t("Wysłano e-mail „{subject}” na {email}.", { subject: subject, email: contact.email });
  } catch (err) {
    await deleteTrackedSend(token);
    return t("Nie udało się wysłać e-maila: {v0}", {
      v0: err instanceof SendGridError ? err.message : String(err),
    });
  }
}

/** Applies a tool the agent asked for, and returns what to tell it back. */
async function runTool(
  name: string,
  input: Record<string, unknown>,
  contact: ContactRow,
  applied: string[],
  /**
   * Segmenty z modułu: `known` to wszystkie (żeby nie zakładać duplikatu pod
   * inną nazwą), `assignable` to te nadawane wprost. Mutowane, gdy agent
   * utworzy nowy.
   */
  segments: { known: string[]; assignable: string[] },
): Promise<string> {
  switch (name) {
    case "add_tags": {
      const tags = Array.isArray(input.tags) ? input.tags.map(String).filter(Boolean) : [];
      for (const tag of tags) await applyTagChange(contact, tag, "add");
      applied.push(`tagi: ${tags.join(", ")}`);
      return t("Dodano tagi: {v0}", { v0: tags.join(", ") });
    }
    case "remove_tags": {
      const tags = Array.isArray(input.tags) ? input.tags.map(String).filter(Boolean) : [];
      for (const tag of tags) await applyTagChange(contact, tag, "remove");
      applied.push(t("usunięte tagi: {v0}", { v0: tags.join(", ") }));
      return t("Usunięto tagi: {v0}", { v0: tags.join(", ") });
    }
    case "send_message": {
      const result = await sendAgentMessage(input, contact);
      applied.push(t("wiadomość ({v0})", { v0: String(input.channel ?? "email") }));
      return result;
    }
    case "assign_segment": {
      const segment = String(input.name ?? "").trim();
      if (!segment) return "Nie podano nazwy segmentu.";
      // Sprawdzane w kodzie, nie tylko przez `enum` w schemacie: model potrafi
      // podać segment, którego nie ma, a przepuszczenie tego założyłoby
      // etykietę, której nikt nie zdefiniował — czyli dokładnie to, co reguła
      // „tylko istniejące" wyklucza.
      const match = segments.assignable.find((s) => s.toLowerCase() === segment.toLowerCase());
      if (!match) {
        const computed = segments.known.some((s) => s.toLowerCase() === segment.toLowerCase());
        return computed
          ? t(
              "Segment „{segment}” ma warunki — pacjent trafia do niego sam, gdy zacznie je spełniać. Nie da się do niego przypisać ręcznie i nie przypisano nic.",
              { segment: segment },
            )
          : t(
              "Segment „{segment}” nie istnieje w module Segmenty. Dostępne: {v1}. Nie przypisano nic.",
              { segment: segment, v1: segments.assignable.join(", ") || "(brak)" },
            );
      }
      await applySegmentChange(contact, match, "add");
      applied.push(`segment: ${match}`);
      return t("Pacjent przypisany do segmentu „{match}”.", { match: match });
    }
    case "create_segment": {
      const segment = String(input.name ?? "").trim();
      if (!segment) return "Nie podano nazwy segmentu.";
      // Nazwa jest tym, po czym odwołuje się do segmentu automatyzacja, więc
      // musi być unikalna. Zajęta przez segment z warunkami nie nadaje się na
      // etykietę: powstałby jeden wiersz znaczący dwie różne rzeczy.
      if (
        segments.known.some((s) => s.toLowerCase() === segment.toLowerCase()) &&
        !segments.assignable.some((s) => s.toLowerCase() === segment.toLowerCase())
      ) {
        return t(
          "Nazwa „{segment}” jest już zajęta przez segment z warunkami. Wybierz inną nazwę albo nie twórz segmentu.",
          { segment: segment },
        );
      }
      const description = String(input.description ?? "").trim();
      // Wiersz powstaje pierwszy, żeby segment był widoczny w module nawet
      // wtedy, gdy przypisanie niżej nic nie zmieni, bo pacjent już go ma.
      const result = await ensureLabelSegment({
        name: segment,
        description: description
          ? t("{description} (segment utworzony przez PRM_Agent)", { description: description })
          : t("Segment utworzony przez PRM_Agent."),
        updatedBy: "PRM_Agent",
      });
      if (!result) return t("Nie udało się utworzyć segmentu — pusta nazwa.");
      await applySegmentChange(contact, segment, "add");
      // Dopisane do obu list, żeby kolejna runda w tej samej turze mogła się do
      // tego segmentu odwołać.
      if (!segments.known.some((s) => s.toLowerCase() === segment.toLowerCase())) {
        segments.known.push(segment);
        segments.assignable.push(segment);
      }
      applied.push(`nowy segment: ${segment}`);
      return result.created
        ? t(
            "Utworzono segment „{segment}” — widoczny w module Segmenty — i przypisano do niego pacjenta.",
            { segment: segment },
          )
        : t("Segment „{segment}” już istniał; przypisano do niego pacjenta.", { segment: segment });
    }
    case "write_note": {
      const text = String(input.text ?? "").trim();
      if (!text) return t("Pusta notatka — pominięto.");
      await addNote({
        contactId: contact.id,
        text: t("PRM_Agent: {text}", { text: text }),
        source: "manual",
      });
      applied.push("notatka");
      return "Notatka zapisana.";
    }
    default:
      return t("Nieznane narzędzie „{name}”.", { name: name });
  }
}

/**
 * Runs the agent for one node. Never throws — a provider outage, a missing key,
 * or a blown cost limit come back as a failed decision so the run can continue
 * down the first path rather than dying mid-journey.
 */
export async function runAgentNode(
  node: AutomationNode,
  contactId: string,
): Promise<AgentDecision> {
  const paths = node.paths ?? [];
  const fallbackHandle = paths[0]?.id ?? "out";
  const fail = (message: string): AgentDecision => ({
    handle: fallbackHandle,
    message,
    detail: { fallback: paths[0]?.label ?? t("wyjście") },
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    failed: true,
  });

  if (paths.length === 0) {
    return fail(t("Węzeł Agent AI nie ma zdefiniowanych ścieżek — nie ma z czego wybierać."));
  }

  const limit = await isOverDailyLimit();
  if (limit.over) {
    return fail(
      t(
        "Dzienny limit kosztów AI wyczerpany ({v0} / {v1} USD) — węzeł pominięty, wybrano pierwszą ścieżkę.",
        { v0: limit.spent.toFixed(2), v1: limit.limit.toFixed(2) },
      ),
    );
  }

  const db = getDb();
  const contact = await db.select().from(contacts).where(eq(contacts.id, contactId)).get();
  if (!contact) return fail(t("Kontakt nie istnieje już w bazie."));

  const config = await getAiConfig();
  // Źródłem prawdy o tym, czym jest segment, jest moduł — nie etykiety
  // rozsypane po wierszach kontaktów. `listSegmentOptions` najpierw przejmuje
  // do modułu każdą zabłąkaną etykietę, więc te dwa nie mają jak się rozejść.
  //
  // Dwie listy, bo to dwa różne pytania: agent ma **wiedzieć** o wszystkich
  // segmentach (żeby nie zakładać drugiego pod inną nazwą), ale **przypisywać**
  // wolno mu tylko do tych nadawanych wprost.
  const options = await listSegmentOptions();
  const known = options.map((s) => s.name);
  const assignable = options.filter((s) => s.fromLabel).map((s) => s.name);
  const tools = buildTools(node, assignable);
  const applied: string[] = [];

  // Knowledge and web access only travel with the messaging permission — an
  // agent that just picks a branch has no use for the price list, and the
  // tokens would be spent on every AI node for nothing.
  const canWrite = allows(node, "canWriteMessages");
  const wantsWeb = canWrite && (node.config?.knowledgeScope ?? "internal") === "web";
  const webSearch = wantsWeb && config.provider.supportsWebSearch;
  const knowledge = canWrite ? await knowledgeForPrompt() : null;

  const system = [
    t("Jesteś PRM_Agent — moduł decyzyjny systemu PRM Core, CRM dla placówki medycznej."),
    t(
      "Twoim zadaniem jest zdecydować, którą ścieżką komunikacji poprowadzić pacjenta w automatyzacji marketingowej.",
    ),
    "",
    "Zasady:",
    t(
      "- Decyduj na podstawie realnych danych pacjenta, nie domysłów. Jeśli danych jest mało, wybierz ścieżkę najbardziej ogólną.",
    ),
    t(
      "- Zawsze zakończ wywołaniem narzędzia choose_path. To jedyny sposób, żeby przebieg ruszył dalej.",
    ),
    t(
      "- Uzasadnienie pisz po polsku, zwięźle, językiem zrozumiałym dla marketingowca — trafi na oś czasu pacjenta.",
    ),
    t("- Nie wymyślaj faktów medycznych ani historii wizyt, których nie ma w danych."),
    t(
      "- Segmenty i tagi zmieniaj tylko wtedy, gdy realnie porządkują bazę. Nie duplikuj istniejących segmentów pod inną nazwą.",
    ),
    t(
      "- Segment, który utworzysz, pojawia się w module Segmenty i widzi go cały zespół marketingu — nadawaj nazwy zrozumiałe dla człowieka, nie robocze.",
    ),
    t(
      "- Przypisywać wolno wyłącznie do segmentów z listy poniżej. Jeśli żaden nie pasuje, albo utwórz nowy (o ile masz takie uprawnienie), albo nie przypisuj nic.",
    ),
    ...(canWrite
      ? [
          "",
          t("Pisanie do pacjenta:"),
          t(
            "- Treść opieraj na bazie wiedzy poniżej i na danych pacjenta. Czego tam nie ma, tego nie twierdź.",
          ),
          t(
            "- Nie podawaj cen, terminów ani rokowań, których nie masz w materiałach — zamiast tego zaproponuj kontakt z rejestracją.",
          ),
          t("- Nie stawiaj diagnoz i nie odradzaj kontaktu z lekarzem."),
          t(
            "- Piszesz w imieniu placówki. Nie przedstawiaj się jako sztuczna inteligencja i nie obiecuj niczego w jej imieniu.",
          ),
          wantsWeb
            ? webSearch
              ? t(
                  "- Możesz doszukać informacji w sieci. Wiedza placówki ma pierwszeństwo przed tym, co znajdziesz — jeśli źródła są sprzeczne, trzymaj się materiałów placówki.",
                )
              : t(
                  "- Wyszukiwanie w sieci jest niedostępne u wybranego dostawcy modelu. Opieraj się wyłącznie na bazie wiedzy; czego w niej nie ma, o tym napisz, że sprawdzi to rejestracja.",
                )
            : t("- Nie masz dostępu do internetu. Opieraj się wyłącznie na bazie wiedzy poniżej."),
        ]
      : []),
    "",
    `Cel tego kroku, zdefiniowany przez marketingowca: ${node.goal?.trim() || t("(nie podano — kieruj się wyłącznie danymi pacjenta)")}`,
    "",
    t("Dostępne ścieżki wyjściowe:"),
    ...paths.map((p) => `- ${p.id}: ${p.label}`),
    ...(knowledge ? ["", t("## Baza wiedzy placówki"), knowledge] : []),
    ...(canWrite && !knowledge
      ? [
          "",
          t("## Baza wiedzy placówki"),
          t("(pusta — nie masz materiałów, na których mógłbyś oprzeć treść)"),
        ]
      : []),
  ].join("\n");

  const messages: AiMessage[] = [
    {
      role: "user",
      text: t("{v0}\n\nZdecyduj, którą ścieżką poprowadzić tego pacjenta.", {
        v0: await loadContext(contact, options),
      }),
    },
  ];

  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await config.provider.complete({
        model: config.model,
        system,
        messages,
        tools,
        maxTokens: MAX_TOKENS,
        webSearch,
      });

      tokensIn += completion.usage.inputTokens;
      tokensOut += completion.usage.outputTokens;
      costUsd += priceCall(config.providerId, config.model, completion.usage);

      const choice = completion.toolCalls.find((call) => call.name === "choose_path");
      if (choice) {
        const wanted = String(choice.input.pathId ?? "");
        const match = paths.find((p) => p.id === wanted);
        const reasoning = String(choice.input.reasoning ?? "").trim();

        // A hallucinated path id would send the run down an edge that doesn't
        // exist, so an unknown value falls back to the first path out loud.
        const handle = match?.id ?? fallbackHandle;
        const label = match?.label ?? paths[0].label;
        const note = match
          ? ""
          : t(" (model wskazał nieistniejącą ścieżkę „{wanted}” — użyto pierwszej)", {
              wanted: wanted,
            });

        await addNote({
          contactId: contact.id,
          text: t("PRM_Agent skierował pacjenta na ścieżkę „{label}”. Uzasadnienie: {v1}", {
            label: label,
            v1: reasoning || t("(brak)"),
          }),
          source: "manual",
        });

        return {
          handle,
          message: t("PRM_Agent wybrał ścieżkę „{label}”{note}. {reasoning}", {
            label: label,
            note: note,
            reasoning: reasoning,
          }),
          detail: {
            path: label,
            model: `${config.providerId}/${config.model}`,
            ...(applied.length > 0 ? { zmiany: applied.join("; ") } : {}),
          },
          tokensIn,
          tokensOut,
          costUsd,
        };
      }

      // A server-side search hit its iteration cap: there is nothing to answer,
      // the turn just has to be re-sent to let the model carry on.
      if (completion.paused) {
        messages.push({ role: "assistant", raw: completion.raw });
        continue;
      }

      if (!completion.wantsTools || completion.toolCalls.length === 0) {
        return fail(
          t(
            "PRM_Agent nie wybrał ścieżki (model odpowiedział tekstem: „{v0}”) — wybrano pierwszą ścieżkę.",
            { v0: completion.text.slice(0, 200) },
          ),
        );
      }

      messages.push({
        role: "assistant",
        text: completion.text,
        toolCalls: completion.toolCalls,
        raw: completion.raw,
      });
      messages.push({
        role: "user",
        toolResults: await Promise.all(
          completion.toolCalls.map(async (call) => ({
            toolUseId: call.id,
            content: await runTool(call.name, call.input, contact, applied, {
              known,
              assignable,
            }),
          })),
        ),
      });
    }

    return fail(
      t("PRM_Agent nie podjął decyzji w {MAX_TOOL_ROUNDS} rundach — wybrano pierwszą ścieżkę.", {
        MAX_TOOL_ROUNDS: MAX_TOOL_ROUNDS,
      }),
    );
  } catch (err) {
    const message =
      err instanceof AiProviderError
        ? err.message
        : t("Błąd wywołania AI: {v0}", { v0: String(err) });
    return {
      ...fail(t("{message} Wybrano pierwszą ścieżkę.", { message: message })),
      tokensIn,
      tokensOut,
      costUsd,
    };
  }
}
