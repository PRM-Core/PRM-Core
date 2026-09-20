import type { AutomationGraph } from "../automation-flow";
import type { BuilderKind } from "../content-builder";
import { actionCatalog } from "../automation-catalog";

/**
 * Które szablony wskazuje ta automatyzacja.
 *
 * **Tylko odwołania — nazwy, nie treść.** Wcześniej ten plik czytał treści
 * z `localStorage` i renderował HTML w przeglądarce, bo serwer nie miał do nich
 * dostępu. Od czasu przeniesienia treści do bazy jest odwrotnie: to serwer ma
 * je wszystkie, a przeglądarka widzi tylko to, co sama zapisała. Zostawienie
 * renderowania po stronie klienta znaczyło, że automatyzacja zapisana na innym
 * komputerze publikowała puste albo nieaktualne migawki.
 *
 * Chodzenie po grafie zostaje tutaj, bo graf i tak jest w przeglądarce —
 * to jego edytor.
 */

export interface TemplateRef {
  kind: BuilderKind;
  name: string;
  /** Temat z konfiguracji węzła; pusty znaczy „użyj nazwy szablonu". */
  subject: string;
}

/** Do której sekcji treści odwołuje się pole „template" tego węzła — wprost z katalogu akcji. */
function templateKindFor(actionKey: string): BuilderKind | null {
  const item = actionCatalog.find((a) => a.key === actionKey);
  const field = item?.fields?.find((f) => f.type === "content-template");
  return field?.templateKind ?? null;
}

/** Wszystkie szablony, do których odwołuje się graf — bez powtórzeń. */
export function collectTemplateRefs(graph: AutomationGraph | null): TemplateRef[] {
  const refs: TemplateRef[] = [];
  if (!graph) return refs;

  const seen = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind !== "action" || !node.key) continue;
    const kind = templateKindFor(node.key);
    const name = (node.config?.template ?? "").trim();
    if (!kind || !name) continue;

    const dedupeKey = `${kind}:${name.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    refs.push({ kind, name, subject: (node.config?.subject ?? "").trim() });
  }

  return refs;
}
