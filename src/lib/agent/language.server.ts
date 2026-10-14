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
  keepsFacts,
  type DraftFacts,
} from "./language";
import { DIRECTIONS } from "./directions";
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

const BRIEF_TOKENS = 1500;
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
      reason: t("Dzienny limit kosztów AI wyczerpany ({v0} / {v1} USD).", {
        v0: limit.spent.toFixed(2),
        v1: limit.limit.toFixed(2),
      }),
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

/** The brief in plain language — accepted only when every number survived and none appeared. */
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
  const check = keepsFacts(text, r.text);
  if (!check.ok) {
    await logStep({
      kind: "agent",
      message: t("Model nie zachował liczb w briefie — zostaje wersja z szablonu."),
      detail: {
        feature: "agent-brief",
        missing: check.missing.join(", "),
        invented: check.invented.join(", "),
      },
    });
    return { ok: false, reason: t("model zmienił liczby") };
  }
  return r;
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
  const check = draftTextOk(r.text, facts.channel);
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
  return r;
}
