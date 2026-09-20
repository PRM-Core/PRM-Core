import { latestPlanFor, planByName } from "./treatment-plans.server";
import type { Contact } from "../contacts";
import { t } from "@/lib/i18n";

/**
 * Plan leczenia w treści wiadomości.
 *
 * **Składnia**:
 *   `%%PLAN%%`            — plan **ostatnio przypisany temu pacjentowi**
 *   `%%PLAN:Bariatria%%`  — konkretny plan po nazwie, ten sam dla wszystkich
 *
 * Pierwsza postać jest tą, dla której to powstało: jeden newsletter „Twój plan
 * na najbliższy tydzień” trafia do całego segmentu, a każdy pacjent dostaje
 * w nim swój plan. Druga przydaje się w wiadomości do grupy, która z definicji
 * dostaje to samo — na przykład przygotowanie do badania.
 *
 * Znacznik `%%…%%` z tego samego powodu co przy feedach: przechodzi przez
 * edytor, migawkę i wysyłkę bez szwanku, dokładnie jak `%%PRM_UNSUBSCRIBE%%`.
 *
 * **Plan wyłączony nadal się podstawia.** Wyłączenie znaczy „nie proponuj go
 * przy przypisywaniu”, a nie „urwij treść pacjentom, którzy go już mają”.
 */

const PLAN_TAG = /%%PLAN(?::([^%|]+))?%%/g;

export interface PlanResolveResult {
  html: string;
  /** Znaczniki bez pokrycia — do zgłoszenia, nie do przemilczenia. */
  misses: string[];
}

export async function resolvePlanTags(html: string, contact: Contact): Promise<PlanResolveResult> {
  const misses: string[] = [];
  const matches = [...html.matchAll(PLAN_TAG)];
  if (matches.length === 0) return { html, misses };

  // Jeden odczyt na nazwę (i jeden na plan pacjenta) — wiadomość potrafi
  // powoływać się na ten sam plan w kilku miejscach.
  const cache = new Map<string, string | null>();
  let out = html;

  for (const m of matches) {
    const whole = m[0];
    const name = (m[1] ?? "").trim();
    const key = name || " ostatni";

    if (!cache.has(key)) {
      const plan = name ? await planByName(name) : await latestPlanFor(contact.id);
      if (!plan) {
        cache.set(key, null);
      } else {
        cache.set(key, plan.html);
        if (!plan.html.trim()) {
          misses.push(t("Plan „{name}” nie ma jeszcze treści", { name: plan.name }));
        }
      }
    }

    const value = cache.get(key) ?? null;
    if (value === null) {
      misses.push(
        name
          ? t("Plan: brak planu o nazwie „{name}”", { name: name })
          : t("Plan: pacjent nie ma przypisanego żadnego planu"),
      );
      // Znika z treści — surowe `%%PLAN%%` u pacjenta wyglądałoby jak awaria.
      // Ale `misses` sprawia, że nikt nie dowiaduje się o tym dopiero od pacjenta.
      out = out.split(whole).join("");
      continue;
    }
    out = out.split(whole).join(value);
  }

  return { html: out, misses };
}
