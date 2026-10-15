import { AiProviderError, priceCall } from "../ai/provider.server";
import {
  getAiConfig,
  getKeyStatus,
  isOverDailyLimit,
  type ResolvedAiConfig,
} from "../ai/settings.server";
import { logStep } from "../engine/log.server";
import {
  briefSystemPrompt,
  draftSystemPrompt,
  draftTextOk,
  draftUserPrompt,
  inventedNumbers,
  INTRO_MAX,
  draftRetryPrompt,
  type DraftFacts,
} from "./language";
import { DIRECTIONS } from "./directions";
import { fitSentences } from "./grounding";
import { examplesFor, isEnabled } from "./directions.server";
import type { DirectionKey } from "../db/schema";
import { t } from "@/lib/i18n";

/**
 * The language layer — the part that talks to a model.
 *
 * Every call goes through the same provider as the rest of PRM_Agent, so
 * `PRM_AI_MODE`, the egress guard, the redaction layer and the daily budget
 * all apply. The inputs here carry no patient: a brief is numbers, a draft
 * is a purpose and a count. What comes back is accepted only if the pure
 * checks in `language.ts` pass; otherwise the template text stays and the
 * engine log says why.
 */

const BRIEF_TOKENS = 400;
const DRAFT_TOKENS = 400;

export type Gate = { ok: true; config: ResolvedAiConfig } | { ok: false; reason: string };

/** Whether a model may be used right now, and which. */
export async function modelGate(capability?: DirectionKey): Promise<Gate> {
  // What the agent may *start* doing is the administrator's decision —
  // a direction proposed on PRM_Agent → Kierunki, enabled or not.
  if (capability && !(await isEnabled(capability)))
    return {
      ok: false,
      reason: t("Kierunek „{title}” czeka na decyzję administratora (PRM_Agent → Kierunki).", {
        title: DIRECTIONS[capability].title,
      }),
    };
  const config = await getAiConfig();
  if (config.mode === "off")
    return { ok: false, reason: t("Model językowy jest wyłączony (PRM_AI_MODE=off).") };
  if (!(await getKeyStatus())[config.providerId])
    return {
      ok: false,
      reason:
        config.mode === "local"
          ? t(
              "Serwer modelu lokalnego nie jest skonfigurowany (PRM_AI_LOCAL_URL, PRM_AI_LOCAL_MODEL).",
            )
          : t("Brak klucza API dostawcy {providerId}.", { providerId: config.providerId }),
    };
  const limit = await isOverDailyLimit();
  if (limit.over)
    return {
      ok: false,
      reason: limit.reason,
    };
  return { ok: true, config };
}

export type Rewrite = { ok: true; text: string; model: string } | { ok: false; reason: string };

async function ask(
  config: ResolvedAiConfig,
  system: string,
  user: string,
  maxTokens: number,
  feature: string,
  message: string,
): Promise<Rewrite> {
  try {
    const completion = await config.provider.complete({
      model: config.model,
      system,
      messages: [{ role: "user", text: user }],
      tools: [],
      maxTokens,
    });
    await logStep({
      kind: "ai",
      message,
      detail: { feature, provider: config.providerId, model: config.model },
      tokensIn: completion.usage.inputTokens,
      tokensOut: completion.usage.outputTokens,
      costUsd: priceCall(config.providerId, config.model, completion.usage),
    });
    const text = completion.text.trim();
    if (!text) return { ok: false, reason: t("model nie zwrócił treści") };
    return { ok: true, text, model: `${config.providerId}/${config.model}` };
  } catch (err) {
    return { ok: false, reason: err instanceof AiProviderError ? err.message : String(err) };
  }
}

/**
 * One question to the model in reach, for the evaluation harness: the same
 * provider, boundary and log as every other call, but no direction gate —
 * the harness is how an administrator decides whether to open one.
 */
export async function askModel(
  system: string,
  user: string,
  maxTokens: number,
  feature: string,
): Promise<Rewrite> {
  const gate = await modelGate();
  if (!gate.ok) return gate;
  return ask(
    gate.config,
    system,
    user,
    maxTokens,
    feature,
    t("PRM_Agent: sprawdzian modelu ({feature}).", { feature }),
  );
}

/**
 * The brief with an opening in plain language. A small model cannot be
 * trusted to rewrite a page of numbers faithfully, so it writes only the
 * opening — what matters this week — and the template follows unchanged.
 * Accepted when the opening uses no number the brief does not contain.
 */
export async function polishBrief(text: string): Promise<Rewrite> {
  const gate = await modelGate("brief_by_model");
  if (!gate.ok) return gate;
  const r = await ask(
    gate.config,
    briefSystemPrompt(),
    text,
    BRIEF_TOKENS,
    "agent-brief",
    t("PRM_Agent: brief wygładzony przez model."),
  );
  if (!r.ok) return r;
  // A model asked for "2–4 sentences" often writes ten: keep the whole
  // sentences that fit, never a cut one.
  const intro = fitSentences(r.text, INTRO_MAX);
  const invented = inventedNumbers(text, intro);
  if (invented.length > 0 || !intro) {
    await logStep({
      kind: "agent",
      message: t("Model nie zachował liczb w briefie — zostaje wersja z szablonu."),
      detail: {
        feature: "agent-brief",
        invented: invented.join(", "),
        length: String(intro.length),
      },
    });
    return {
      ok: false,
      reason: invented.length > 0 ? t("model zmienił liczby") : t("pusty wstęp"),
    };
  }
  return { ...r, text: `${intro}\n\n${text}` };
}

/** A draft message from the facts behind a signal — accepted only when the draft checks pass. */
export async function writeDraftText(facts: DraftFacts): Promise<Rewrite> {
  const gate = await modelGate("drafts_by_model");
  if (!gate.ok) return gate;
  const r = await ask(
    gate.config,
    draftSystemPrompt(facts.channel),
    draftUserPrompt(
      facts,
      (await examplesFor(facts.channel, facts.audienceSignal)).map((e) => e.text),
    ),
    DRAFT_TOKENS,
    "agent-draft",
    t("PRM_Agent: treść draftu „{title}” napisana przez model.", { title: facts.title }),
  );
  if (!r.ok) return r;
  let text = r.text;
  let check = draftTextOk(text, facts.channel);
  // A local model often fixes what it is told was wrong: one more try with
  // the checker's reason, then the template stands.
  if (!check.ok) {
    const again = await ask(
      gate.config,
      draftSystemPrompt(facts.channel),
      `${draftUserPrompt(facts)}\n\n${draftRetryPrompt(text, check.reason)}`,
      DRAFT_TOKENS,
      "agent-draft",
      t("PRM_Agent: treść draftu „{title}” — druga próba.", { title: facts.title }),
    );
    if (again.ok) {
      text = again.text;
      check = draftTextOk(text, facts.channel);
    }
  }
  if (!check.ok) {
    await logStep({
      kind: "agent",
      message: t("Tekst modelu dla draftu „{title}” odrzucony ({reason}) — zostaje szablon.", {
        title: facts.title,
        reason: check.reason,
      }),
      detail: { feature: "agent-draft", reason: check.reason },
    });
    return { ok: false, reason: check.reason };
  }
  return { ...r, text };
}
