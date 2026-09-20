import { getAiConfig, isOverDailyLimit, getKeyStatus } from "./settings.server";
import { priceCall, type AiToolDef } from "./provider.server";
import { logStep } from "../engine/log.server";
import { previewSegment } from "../segments/segments.server";
import { listStatuses } from "../fields/statuses.server";
import {
  OPERATOR_LABELS,
  SEGMENT_FIELDS,
  withStatusOptions,
  type SegmentCondition,
  type SegmentDefinition,
  type SegmentOperator,
} from "../segments/segment-definition";
import { t, localized } from "@/lib/i18n";

/**
 * The segment assistant: a conversation that ends in a definition.
 *
 * Deliberately a chat and not a one-shot generator like the automation builder.
 * The thing people ask for most often is something the data cannot answer —
 * "kontakty, które kliknęły w ten przycisk" — and the useful response is not an
 * error, it is a sentence explaining what *is* recorded and an offer of the
 * nearest honest equivalent. That needs a back-and-forth.
 *
 * Two rules hold the whole feature up:
 *
 * 1. **The model may only use fields that exist.** They are handed to it as an
 *    enum, and anything outside it is dropped by the compiler with a warning
 *    rather than reaching the canvas.
 * 2. **Every proposal is counted before it is shown.** The reply carries the
 *    real number of matching contacts, computed by the same evaluator the saved
 *    segment uses. A proposal that would match nobody says so on the spot,
 *    instead of being discovered after saving.
 */

const MAX_TOKENS = 2000;
/** Enough turns to negotiate a definition, few enough that a long chat cannot quietly run up a bill. */
const MAX_HISTORY = 20;

export interface SegmentChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface SegmentProposal {
  definition: SegmentDefinition;
  /** The model's own one-line description of what it built. */
  summary: string;
  /** Suggested name for the segment, if the model offered one. */
  name?: string;
  /** Live count for this definition — computed here, not claimed by the model. */
  members: number;
  total: number;
  /** Conditions the compiler had to drop, and why. */
  warnings: string[];
}

export interface SegmentChatResult {
  ok: boolean;
  reply?: string;
  proposal?: SegmentProposal;
  error?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

/**
 * What the tool cannot express, written out for the model.
 *
 * This list is the point of the feature. Without it the model invents a
 * plausible-looking condition for "kliknął przycisk", the compiler drops it,
 * and the user gets a segment that quietly means something else.
 */
const NOT_POSSIBLE = localized(() => [
  t(
    "kliknięcie w przycisk, link lub dowolny element NA STRONIE — kod śledzący rejestruje wejścia na adresy, nie zdarzenia w treści strony (kliknięcia śledzimy tylko w wiadomościach e-mail)",
  ),
  t(
    "kolejność zdarzeń („najpierw wszedł na A, potem na B”) — warunki sprawdzają, czy coś się wydarzyło, nie w jakiej kolejności",
  ),
  t("czas spędzony na stronie, liczba odsłon, głębokość przewinięcia"),
  t("kwoty, płatności, historia zakupów — nie ma takiego modułu"),
  t(
    "wizyty odbyte, odwołane i przełożone — system widzi wyłącznie rezerwacje zrobione online przez stronę",
  ),
  t(
    "odpowiedzi z ankiet i formularzy — trafiają do notatki na karcie kontaktu, a po treści notatek nie da się filtrować",
  ),
  t("wiek, płeć, adres — nie ma takich pól, chyba że placówka dodała je jako pola własne"),
]);

function fieldCatalogue(
  custom: { key: string; label: string }[],
  statuses: { key: string; label: string }[],
): string {
  // Statusy z bazy, nie z zamkniętej listy w kodzie. Bez tego model widział
  // wyłącznie cztery wbudowane i na „zrób segment lekarzy" budował warunek
  // z wartością, której żaden kontakt nie ma — segment wychodził pusty,
  // a przyczyna była niewidoczna.
  const lines = withStatusOptions(SEGMENT_FIELDS, statuses).map((f) => {
    const ops = f.operators.map((o) => OPERATOR_LABELS[o]).join(" / ");
    const values = f.options
      ? t(" Dozwolone wartości: {v0}.", {
          v0: f.options.map((o) => `${o.value} (${o.label})`).join(", "),
        })
      : "";
    const window = f.supportsWindow
      ? t(" Obsługuje okno czasowe (days: 0 = kiedykolwiek, 7, 30, 90, 365).")
      : "";
    const hint = f.hint ? ` UWAGA: ${f.hint}` : "";
    return `- ${f.key} — „${f.label}”. Operatory: ${ops}.${values}${window}${hint}`;
  });
  for (const c of custom) {
    lines.push(
      t(
        "- {key} — „{label}” (pole własne placówki). Operatory: jest dokładnie / nie jest / zawiera / nie zawiera / zaczyna się od / jest uzupełnione / jest puste.",
        { key: c.key, label: c.label },
      ),
    );
  }
  return lines.join("\n");
}

function buildSystemPrompt(input: {
  custom: { key: string; label: string }[];
  statuses: { key: string; label: string }[];
  messages: { id: string; name: string; kind: string }[];
  current?: SegmentDefinition;
}): string {
  const templateList = input.messages.length
    ? input.messages.map((m) => `  - ${m.id} — „${m.name}” (${m.kind})`).join("\n")
    : t(
        "  (brak wysłanych wiadomości — warunki otwarcia/kliknięcia zostaw bez wskazania konkretnej)",
      );

  return t(
    'Jesteś asystentem budowania segmentów w PRM Core — systemie komunikacji z pacjentami polskiej placówki medycznej. Rozmawiasz po polsku, zwięźle i konkretnie.\n\nTWOJE ZADANIE\nZrozum, kogo użytkownik chce objąć segmentem, i zamień to na definicję warunków. Jeśli czegoś nie da się wyrazić — powiedz to WPROST i zaproponuj najbliższy sensowny odpowiednik, wyjaśniając, czym się różni od tego, o co pytał.\n\nJAK ZBUDOWANY JEST SEGMENT\nSegment to grupy warunków. W grupie warunki łączy „wszystkie” (AND) albo „dowolny” (OR); grupy między sobą tak samo. Dwa poziomy, głębiej się nie da.\n\nDOSTĘPNE WARUNKI — wolno ci używać WYŁĄCZNIE tych kluczy:\n{v0}\n\nWIADOMOŚCI, na które mogą wskazywać warunki otwarcia i kliknięcia (jako "value" podaj identyfikator z lewej, albo zostaw puste = dowolna wiadomość):\n{templateList}\n\nCZEGO SIĘ NIE DA — jeśli użytkownik o to prosi, powiedz otwarcie, że tego nie zbierzemy, i zaproponuj zamiennik:\n{v2}\n\nZASADY ROZMOWY\n1. Nie zgaduj adresów URL, nazw tagów, segmentów ani kampanii. Jeśli warunek ich potrzebuje, a użytkownik nie podał — DOPYTAJ. Lepiej zadać jedno pytanie niż zaproponować segment z wymyślonym adresem.\n2. Nie wywołuj narzędzia, dopóki nie masz kompletu informacji. Sama rozmowa nic nie kosztuje użytkownika poza czasem.\n3. Gdy masz komplet — wywołaj propose_segment i w treści odpowiedzi wyjaśnij po ludzku, kogo ten segment obejmie i czego NIE obejmie.\n4. Nigdy nie podawaj liczby osób. Nie znasz jej — system policzy ją sam i pokaże użytkownikowi.\n5. Jeśli prośba jest niewykonalna nawet w przybliżeniu, powiedz to i nie proponuj niczego na siłę.\n\nPRZYKŁAD ROZMOWY, O KTÓRY CHODZI\nUżytkownik: „Chcę segment z kontaktami, które kliknęły w przycisk «Umów wizytę» na stronie.”\nTy: wyjaśniasz, że kod śledzący zapisuje wejścia na adresy, a nie kliknięcia w elementy strony, więc kliknięcia w przycisk nie zobaczymy. Proponujesz zamiennik: osoby, które weszły na stronę rejestracji (bo tam prowadzi ten przycisk) — i pytasz o dokładny adres. Dodajesz, że jeśli chodzi o tych, którzy doszli dalej, można dołożyć drugi warunek na kolejny adres, ale system sprawdzi „był na obu”, a nie „najpierw na jednej, potem na drugiej” — kolejności nie zapisujemy.\n\n{v3}',
    {
      v0: fieldCatalogue(input.custom, input.statuses),
      templateList: templateList,
      v2: NOT_POSSIBLE.map((n) => `- ${n}`).join("\n"),
      v3:
        input.current && input.current.groups.some((g) => g.conditions.length)
          ? t(
              "UŻYTKOWNIK MA JUŻ ROZPOCZĘTĄ DEFINICJĘ:\n{v0}\nJeśli prosi o zmianę, zaproponuj pełną nową definicję uwzględniającą to, co już jest.",
              { v0: JSON.stringify(input.current) },
            )
          : "",
    },
  );
}

function buildTool(custom: { key: string; label: string }[]): AiToolDef {
  const fieldKeys = [...SEGMENT_FIELDS.map((f) => f.key), ...custom.map((c) => c.key)];
  return {
    name: "propose_segment",
    description: t(
      "Proponuje definicję segmentu. Wywołuj dopiero wtedy, gdy masz wszystkie potrzebne wartości (adresy, tagi, nazwy). Nie zgaduj ich.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: t("Krótka nazwa segmentu, np. „Zainteresowani implantem”."),
        },
        summary: {
          type: "string",
          description: t("Jedno zdanie: kogo obejmuje ten segment. Bez liczb."),
        },
        match: {
          type: "string",
          enum: ["all", "any"],
          description: t(
            "Jak łączą się grupy: all = wszystkie muszą pasować, any = wystarczy jedna.",
          ),
        },
        groups: {
          type: "array",
          description: t("Grupy warunków. Najczęściej wystarczy jedna."),
          items: {
            type: "object",
            properties: {
              match: { type: "string", enum: ["all", "any"] },
              conditions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string", enum: fieldKeys },
                    operator: {
                      type: "string",
                      enum: [
                        "equals",
                        "not_equals",
                        "contains",
                        "not_contains",
                        "starts",
                        "is_set",
                        "is_empty",
                        "occurred",
                        "not_occurred",
                      ],
                    },
                    value: {
                      type: "string",
                      description: t(
                        "Wartość warunku. Dla zdarzeń: fragment adresu / nazwa usługi / kanał, albo puste = dowolne.",
                      ),
                    },
                    days: {
                      type: "number",
                      description: t(
                        "Okno czasowe dla zdarzeń: 0 = kiedykolwiek, albo 7/30/90/365.",
                      ),
                    },
                  },
                  required: ["field", "operator"],
                },
              },
            },
            required: ["match", "conditions"],
          },
        },
      },
      required: ["summary", "match", "groups"],
    },
  };
}

const VALID_OPERATORS: SegmentOperator[] = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts",
  "is_set",
  "is_empty",
  "occurred",
  "not_occurred",
];

/**
 * Turns the model's answer into a definition, dropping anything it invented.
 *
 * Ids are ours, not the model's — the same reasoning as in the automation
 * compiler: what comes back is a description, and the structural details stay
 * on our side of the line.
 */
function compileProposal(
  payload: {
    match?: string;
    groups?: Array<{ match?: string; conditions?: Array<Record<string, unknown>> }>;
  },
  allowedFields: Set<string>,
): { definition: SegmentDefinition; warnings: string[] } {
  const warnings: string[] = [];
  let seq = 0;
  const groups = (payload.groups ?? []).map((g, gi) => {
    const conditions: SegmentCondition[] = [];
    for (const raw of g.conditions ?? []) {
      const field = String(raw.field ?? "");
      const operator = String(raw.operator ?? "") as SegmentOperator;
      if (!allowedFields.has(field)) {
        warnings.push(t("Pominięto warunek na nieistniejącym polu „{field}”.", { field: field }));
        continue;
      }
      if (!VALID_OPERATORS.includes(operator)) {
        warnings.push(
          t("Pominięto warunek „{field}” z nieznanym operatorem „{operator}”.", {
            field: field,
            operator: operator,
          }),
        );
        continue;
      }
      const days = typeof raw.days === "number" ? Math.max(0, Math.round(raw.days)) : undefined;
      conditions.push({
        id: `ai-${Date.now()}-${seq++}`,
        field,
        operator,
        value: raw.value === undefined || raw.value === null ? "" : String(raw.value),
        ...(days !== undefined ? { days } : {}),
      });
    }
    return {
      id: `g-ai-${gi + 1}`,
      match: g.match === "any" ? ("any" as const) : ("all" as const),
      conditions,
    };
  });

  const kept = groups.filter((g) => g.conditions.length > 0);
  return {
    definition: {
      match: payload.match === "any" ? "any" : "all",
      groups: kept.length > 0 ? kept : [{ id: "g-ai-1", match: "all", conditions: [] }],
    },
    warnings,
  };
}

export async function chatSegment(input: {
  messages: SegmentChatMessage[];
  currentDefinition?: SegmentDefinition;
  customFields: { key: string; label: string }[];
  emailMessages: { id: string; name: string; kind: string }[];
}): Promise<SegmentChatResult> {
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

  const history = input.messages.slice(-MAX_HISTORY);

  try {
    const completion = await config.provider.complete({
      model: config.model,
      system: buildSystemPrompt({
        custom: input.customFields,
        statuses: await listStatuses().then((rows) =>
          rows.map((r) => ({ key: r.key, label: r.label })),
        ),
        messages: input.emailMessages,
        current: input.currentDefinition,
      }),
      messages: history.map((m) => ({ role: m.role, text: m.text })),
      tools: [buildTool(input.customFields)],
      maxTokens: MAX_TOKENS,
    });

    const costUsd = priceCall(config.providerId, config.model, completion.usage);
    const usage = {
      tokensIn: completion.usage.inputTokens,
      tokensOut: completion.usage.outputTokens,
      costUsd,
    };

    // Same daily ceiling as every other AI feature — spending is spending.
    await logStep({
      kind: "ai",
      message: t("Asystent segmentów: „{v0}”.", {
        v0: (history[history.length - 1]?.text ?? "").slice(0, 80),
      }),
      detail: { feature: "segment-builder" },
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costUsd,
    });

    const call = completion.toolCalls.find((c) => c.name === "propose_segment");
    if (!call) {
      // No proposal is a perfectly good turn: the model is asking a question or
      // explaining why something cannot be done.
      return {
        ok: true,
        reply: completion.text || t("Nie mam pewności, o co chodzi — doprecyzuj proszę."),
        ...usage,
      };
    }

    const payload = call.input as {
      name?: string;
      summary?: string;
      match?: string;
      groups?: Array<{ match?: string; conditions?: Array<Record<string, unknown>> }>;
    };
    const allowed = new Set([
      ...SEGMENT_FIELDS.map((f) => f.key),
      ...input.customFields.map((c) => c.key),
    ]);
    const { definition, warnings } = compileProposal(payload, allowed);

    // Counted here, never claimed by the model: the number the user sees comes
    // from the same evaluator that a saved segment runs through.
    const preview = await previewSegment(definition);

    return {
      ok: true,
      reply: completion.text || payload.summary || t("Przygotowałem propozycję segmentu."),
      proposal: {
        definition,
        summary: payload.summary ?? "",
        name: payload.name,
        members: preview.members,
        total: preview.total,
        warnings: [...warnings, ...preview.warnings],
      },
      ...usage,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
