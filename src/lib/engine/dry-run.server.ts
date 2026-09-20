import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  automations,
  contactFunnelProgress,
  contacts,
  contentSnapshots,
  popupQueue,
} from "../db/schema";
import type { ContactRow } from "../db/schema";
import type { AutomationGraph, AutomationNode } from "../automation-flow";
import { pickSplitVariant } from "../automation-flow";
import { nodeTitle } from "../automation-catalog";
import { evaluateCondition, evaluatePath, DNC_TAG } from "./actions.server";
import { snapshotId } from "./snapshots.server";
import { resolveSmsSender } from "../sms/senders.server";
import { checkConsent, type SendMode } from "../consent/consent.server";
import { t as tr } from "@/lib/i18n";

// "Przetestuj na kontakcie" — walks a real contact through a real graph and
// reports what WOULD happen, touching nothing.
//
// The whole point is that the branching is evaluated for real: conditions and
// Path filters are read-only, so the preview calls the very same code the
// engine does. Everything that writes (sends, tags, funnel moves) is described
// instead of executed. Without this, the only way to find out which branch a
// patient takes was to switch the automation on and wait for a real one.

const MAX_STEPS = 60;

export type DryRunOutcome = "ok" | "warning" | "blocked" | "info";

export interface DryRunStep {
  nodeId: string;
  kind: string;
  title: string;
  /** What would happen here, in plain Polish. */
  message: string;
  outcome: DryRunOutcome;
  /** Which branch the contact leaves by, when the step has several. */
  branch?: string;
}

export interface DryRunResult {
  ok: boolean;
  error?: string;
  contactName?: string;
  automationName?: string;
  steps: DryRunStep[];
  /** True when the walk stopped because it ran out of graph, not out of patience. */
  finished: boolean;
}

function cfg(node: AutomationNode, key: string): string {
  return (node.config?.[key] ?? "").trim();
}

function isDnc(contact: ContactRow): boolean {
  return (contact.tags ?? []).some((t) => t.toLowerCase() === DNC_TAG);
}

/** Mirrors sendMode() in actions.server.ts — the preview must read the node the same way. */
function previewMode(node: AutomationNode): SendMode {
  return cfg(node, "sendMode") === "Administracyjny" ? "administrative" : "marketing";
}

/** Describes a send step without sending: template published? channel reachable? consent? */
async function previewSend(
  node: AutomationNode,
  contact: ContactRow,
  kind: "email" | "newsletter" | "sms" | "popup",
): Promise<{ message: string; outcome: DryRunOutcome }> {
  const template = cfg(node, "template");
  if (!template) {
    return { message: tr("Nie wybrano szablonu — silnik pominie ten krok."), outcome: "blocked" };
  }

  const db = getDb();
  const snapshot = await db
    .select()
    .from(contentSnapshots)
    .where(eq(contentSnapshots.id, snapshotId(kind, template)))
    .get();
  if (!snapshot) {
    return {
      message: tr(
        "Szablon „{template}” nie jest opublikowany na serwerze — krok zakończy się błędem. Zapisz automatyzację ponownie.",
        { template: template },
      ),
      outcome: "blocked",
    };
  }

  if (kind === "sms") {
    if (!contact.phone) {
      return {
        message: tr(
          "Wysłałby SMS „{template}”, ale ten kontakt nie ma numeru telefonu — krok zostanie pominięty.",
          { template: template },
        ),
        outcome: "warning",
      };
    }
    const smsConsent = checkConsent(contact, "sms", previewMode(node));
    if (!smsConsent.allowed) {
      return {
        message: smsConsent.reason ?? tr("Brak zgody — krok zostanie pominięty."),
        outcome: "warning",
      };
    }
    // Read-only, so the preview can name the sender that would really be used
    // rather than guessing which one the default is.
    const sender = await resolveSmsSender(cfg(node, "sender"));
    if (!sender) {
      return {
        message: tr(
          "Wysłałby SMS „{template}”, ale nie ma skonfigurowanego nadawcy — krok skończy się błędem.",
          { template: template },
        ),
        outcome: "blocked",
      };
    }
    return {
      message: tr("Wysłałby SMS „{template}” na {phone} od „{value}”{v3}.", {
        template: template,
        phone: contact.phone,
        value: sender.value,
        v3:
          sender.kind === "alphanumeric"
            ? tr(" (nadawca jednokierunkowy — pacjent nie odpisze)")
            : "",
      }),
      outcome: "ok",
    };
  }

  if (kind === "popup") {
    const pending = await db
      .select({ id: popupQueue.id })
      .from(popupQueue)
      .where(eq(popupQueue.contactId, contact.id))
      .get();
    return {
      message: tr(
        "Zakolejkowałby pop-up „{template}” — pokazałby się przy najbliższej wizycie tego pacjenta na stronie.{v1}",
        {
          template: template,
          v1: pending ? tr(" (Ten pacjent ma już coś w kolejce pop-upów.)") : "",
        },
      ),
      outcome: "ok",
    };
  }

  if (!contact.email) {
    return {
      message: tr(
        "Wysłałby „{template}”, ale ten kontakt nie ma adresu e-mail — krok zostanie pominięty.",
        { template: template },
      ),
      outcome: "warning",
    };
  }
  const emailConsent = checkConsent(contact, "email", previewMode(node));
  if (!emailConsent.allowed) {
    return {
      message: emailConsent.reason ?? tr("Brak zgody — krok zostanie pominięty."),
      outcome: "warning",
    };
  }
  const subject = cfg(node, "subject") || snapshot.subject || snapshot.name;
  return {
    message: tr("Wysłałby e-mail „{subject}” na {email}.", {
      subject: subject,
      email: contact.email,
    }),
    outcome: "ok",
  };
}

/** Describes any action node. Nothing here writes. */
async function previewAction(
  node: AutomationNode,
  contact: ContactRow,
): Promise<{ message: string; outcome: DryRunOutcome; stop?: boolean }> {
  const key = node.key ?? "";

  switch (key) {
    case "send_email":
      return previewSend(node, contact, "email");
    case "send_newsletter":
      return previewSend(node, contact, "newsletter");
    case "send_sms":
      return previewSend(node, contact, "sms");
    case "show_popup":
      return previewSend(node, contact, "popup");

    case "change_tags": {
      const tag = cfg(node, "tag");
      if (!tag)
        return { message: tr("Nie podano tagu — krok zostanie pominięty."), outcome: "blocked" };
      const remove = cfg(node, "mode") === "Usuń";
      const has = (contact.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase());
      if (remove) {
        return has
          ? { message: tr("Usunąłby tag „{tag}”.", { tag: tag }), outcome: "ok" }
          : {
              message: tr("Usunąłby tag „{tag}”, ale kontakt go nie ma — bez zmian.", { tag: tag }),
              outcome: "info",
            };
      }
      return has
        ? {
            message: tr("Dodałby tag „{tag}”, ale kontakt już go ma — bez zmian.", { tag: tag }),
            outcome: "info",
          }
        : { message: tr("Dodałby tag „{tag}”.", { tag: tag }), outcome: "ok" };
    }

    case "change_segment": {
      const segment = cfg(node, "segment");
      if (!segment) {
        return {
          message: tr("Nie podano segmentu — krok zostanie pominięty."),
          outcome: "blocked",
        };
      }
      const remove = cfg(node, "mode") === "Usuń";
      const has = (contact.segments ?? []).some((s) => s.toLowerCase() === segment.toLowerCase());
      return {
        message: remove
          ? tr("Usunąłby z segmentu „{segment}”{v1}.", {
              segment: segment,
              v1: has ? "" : tr(" — kontakt i tak w nim nie jest"),
            })
          : tr("Dodałby do segmentu „{segment}”{v1}.", {
              segment: segment,
              v1: has ? tr(" — kontakt już w nim jest") : "",
            }),
        outcome: has === !remove ? "info" : "ok",
      };
    }

    case "change_stage": {
      const funnel = node.config?.funnelName || cfg(node, "funnelId");
      const stage = node.config?.stageName || cfg(node, "stageId");
      if (!funnel || !stage) {
        return {
          message: tr("Nie wybrano lejka lub etapu — krok zostanie pominięty."),
          outcome: "blocked",
        };
      }
      return {
        message: tr("Przeniósłby pacjenta na etap „{stage}” w lejku „{funnel}”.", {
          stage: stage,
          funnel: funnel,
        }),
        outcome: "ok",
      };
    }

    case "assign_funnel": {
      const funnelId = cfg(node, "funnelId");
      const funnelName = node.config?.funnelName || funnelId;
      if (!funnelId) {
        return { message: tr("Nie wybrano lejka — krok zostanie pominięty."), outcome: "blocked" };
      }
      const stage = node.config?.stageName || "";
      // Read-only, so the preview can check where this patient actually stands
      // instead of guessing — the same reason conditions are evaluated for real.
      const current = await getDb()
        .select()
        .from(contactFunnelProgress)
        .where(eq(contactFunnelProgress.contactId, contact.id))
        .get();
      if (current?.funnelId === funnelId) {
        return {
          message: tr(
            "Pacjent jest już w lejku „{funnelName}” — krok zostanie pominięty, etap bez zmian.",
            { funnelName: funnelName },
          ),
          outcome: "info",
        };
      }
      const target = stage ? `, etap „${stage}”` : " na pierwszy etap";
      return {
        message: current
          ? tr(
              "Przeniósłby pacjenta do lejka „{funnelName}”{target} (obecnie jest w innym lejku).",
              { funnelName: funnelName, target: target },
            )
          : tr("Przypisałby pacjenta do lejka „{funnelName}”{target}.", {
              funnelName: funnelName,
              target: target,
            }),
        outcome: "ok",
      };
    }

    case "remove_from_funnel": {
      const current = await getDb()
        .select()
        .from(contactFunnelProgress)
        .where(eq(contactFunnelProgress.contactId, contact.id))
        .get();
      return current
        ? { message: tr("Wypisałby pacjenta z lejka."), outcome: "ok" }
        : {
            message: tr(
              "Wypisałby z lejka — pacjent i tak nie jest w żadnym, krok zostanie pominięty.",
            ),
            outcome: "info",
          };
    }

    case "update_field": {
      const field = cfg(node, "field");
      const value = cfg(node, "value");
      if (!field)
        return { message: tr("Nie wskazano pola — krok zostanie pominięty."), outcome: "blocked" };
      return {
        message: tr("Ustawiłby pole „{field}” na „{value}”.", { field: field, value: value }),
        outcome: "ok",
      };
    }

    case "set_dnc":
      return isDnc(contact)
        ? {
            message: tr("Oznaczyłby „nie kontaktować” — kontakt już jest tak oznaczony."),
            outcome: "info",
          }
        : { message: tr("Oznaczyłby kontakt jako „nie kontaktować”."), outcome: "ok" };

    case "send_push":
      return {
        message: tr(
          "Zapisałby notatkę — powiadomienia push są symulowane, system nie ma tej integracji.",
        ),
        outcome: "info",
      };

    case "change_points":
      return {
        message: tr("Krok bez efektu — punktacja nie istnieje jako pole kontaktu."),
        outcome: "blocked",
      };

    case "delete_contact":
      return {
        message: tr("USUNĄŁBY ten kontakt z bazy i zakończył przebieg."),
        outcome: "warning",
        stop: true,
      };

    case "end_process":
      return { message: tr("Koniec procesu."), outcome: "info", stop: true };

    default:
      return {
        message: tr("Nieznana akcja „{key}” — krok zostanie pominięty.", { key: key }),
        outcome: "blocked",
      };
  }
}

/**
 * Walks the graph for one contact. Conditions and Path filters are evaluated
 * for real (they only read); everything else is described.
 */
export async function dryRun(input: {
  automationId: string;
  contactId: string;
}): Promise<DryRunResult> {
  const db = getDb();
  const [automation, contact] = await Promise.all([
    db.select().from(automations).where(eq(automations.id, input.automationId)).get(),
    db.select().from(contacts).where(eq(contacts.id, input.contactId)).get(),
  ]);

  if (!automation?.flow) {
    return {
      ok: false,
      error: tr("Ta automatyzacja nie ma jeszcze scenariusza."),
      steps: [],
      finished: false,
    };
  }
  if (!contact) {
    return { ok: false, error: tr("Nie znaleziono kontaktu."), steps: [], finished: false };
  }

  const graph: AutomationGraph = automation.flow;
  const trigger = graph.nodes.find((n) => n.kind === "trigger");
  if (!trigger) {
    return { ok: false, error: tr("Scenariusz nie ma wyzwalacza."), steps: [], finished: false };
  }

  const contactName =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;
  const steps: DryRunStep[] = [];

  // The walk starts AFTER the trigger: we are asking "what happens to this
  // contact once they enter", not "would they enter" (that depends on a live
  // event, which a preview cannot conjure).
  steps.push({
    nodeId: trigger.id,
    kind: "trigger",
    title: nodeTitle(trigger),
    message: isDnc(contact)
      ? tr(
          "Wejście do scenariusza. Uwaga: kontakt ma tag „nie-kontaktowac” — agent AI odmówi wysyłki, kroki deterministyczne zadziałają normalnie.",
        )
      : tr("Wejście do scenariusza."),
    outcome: isDnc(contact) ? "warning" : "info",
  });

  let currentId: string | null = nextFrom(graph, trigger.id, "out");
  let finished = false;

  for (let i = 0; i < MAX_STEPS; i++) {
    if (!currentId) {
      finished = true;
      break;
    }
    const node = graph.nodes.find((n) => n.id === currentId);
    if (!node) {
      steps.push({
        nodeId: currentId,
        kind: "error",
        title: tr("Krok nie istnieje"),
        message: tr("Krawędź prowadzi do kroku, którego nie ma w scenariuszu."),
        outcome: "blocked",
      });
      break;
    }

    let handle = "out";
    let stop = false;

    if (node.kind === "delay") {
      const unit = node.unit === "minutes" ? "min" : node.unit === "hours" ? "godz." : "dni";
      steps.push({
        nodeId: node.id,
        kind: node.kind,
        title: nodeTitle(node),
        message: tr("Pacjent czekałby tutaj {v0} {unit}.", { v0: node.amount ?? 0, unit: unit }),
        outcome: "info",
      });
    } else if (node.kind === "condition") {
      const result = await evaluateCondition(node, contact.id);
      handle = result.matched ? "matched" : "unmatched";
      steps.push({
        nodeId: node.id,
        kind: node.kind,
        title: nodeTitle(node),
        message: result.message,
        outcome: "ok",
        branch: result.matched ? tr("spełniony") : tr("niespełniony"),
      });
    } else if (node.kind === "path") {
      const result = await evaluatePath(node, contact.id);
      handle = result.handle;
      steps.push({
        nodeId: node.id,
        kind: node.kind,
        title: nodeTitle(node),
        message: result.message,
        outcome: "ok",
        branch: node.branches?.find((b) => b.id === result.handle)?.label,
      });
    } else if (node.kind === "split") {
      // A random pick would make the preview unrepeatable, which defeats the
      // point — so the preview shows the odds and follows the heaviest branch.
      const variants = node.variants ?? [];
      const heaviest = [...variants].sort((a, b) => b.weight - a.weight)[0];
      handle = heaviest?.id ?? "";
      steps.push({
        nodeId: node.id,
        kind: node.kind,
        title: nodeTitle(node),
        message: tr(
          "Losowy podział: {v0}. W podglądzie idziemy najczęstszym wariantem — realny pacjent trafia losowo.",
          { v0: variants.map((v) => `${v.label} ${v.weight}%`).join(", ") },
        ),
        outcome: "info",
        branch: heaviest?.label,
      });
    } else if (node.kind === "aiAgent") {
      // Deliberately not calling the model: a preview that costs money and
      // answers differently each time is not a preview.
      const first = node.paths?.[0];
      handle = first?.id ?? "";
      steps.push({
        nodeId: node.id,
        kind: node.kind,
        title: nodeTitle(node),
        message: tr(
          "Agent AI oceniłby kontakt na żywo i wybrał jedną ze ścieżek: {v0}. Podgląd nie wywołuje modelu (koszt i nieprzewidywalność) — idziemy pierwszą ścieżką.",
          { v0: (node.paths ?? []).map((p) => p.label).join(", ") },
        ),
        outcome: "info",
        branch: first?.label,
      });
    } else {
      const result = await previewAction(node, contact);
      steps.push({
        nodeId: node.id,
        kind: node.kind,
        title: nodeTitle(node),
        message: result.message,
        outcome: result.outcome,
      });
      stop = result.stop ?? false;
    }

    if (stop) {
      finished = true;
      break;
    }
    currentId = nextFrom(graph, node.id, handle);
  }

  return {
    ok: true,
    contactName,
    automationName: automation.name,
    steps,
    finished,
  };
}

function nextFrom(graph: AutomationGraph, nodeId: string, handle: string): string | null {
  const edge = graph.edges.find(
    (e) =>
      e.source === nodeId && (e.sourceHandle === handle || (handle === "out" && !e.sourceHandle)),
  );
  return edge?.target ?? null;
}
