import { resolveFeedTags } from "../feeds/feed-tags.server";
import { resolvePlanTags } from "../care/plan-tags.server";
import type { Contact } from "../contacts";

/**
 * Wszystkie pola dynamiczne treści, w jednym przebiegu.
 *
 * **Po co osobny plik.** Pola z feedów były rozwijane wyłącznie przy wysyłce do
 * segmentu — automatyzacja wysyłała ten sam szablon z surowym `%%FEED:…%%`
 * w środku, bo są dwie drogi wyjścia wiadomości, a resolver wpięto tylko
 * w jedną. Dopóki każda ścieżka woła resolvery z osobna, ten błąd musi się
 * powtórzyć przy następnym rodzaju pola. Teraz obie wołają jedną funkcję,
 * a nowy rodzaj dokłada się w jednym miejscu.
 *
 * **Kolejność ma znaczenie**: najpierw plany, potem feedy. Plan jest kawałkiem
 * treści i sam może zawierać pole z feedu (link do lekarza prowadzącego); gdyby
 * feedy szły pierwsze, taki znacznik trafiłby do wiadomości surowy.
 *
 * Znaczniki personalizacji (`%%IMIE%%` i spółka) podstawia wołający **po** tym
 * przebiegu — dzięki temu działają także w treści wstawionej z planu.
 */
export interface DynamicFieldsResult {
  html: string;
  /** Wszystko bez pokrycia — do jednego wpisu w dzienniku, nie do ciszy. */
  misses: string[];
}

export async function resolveDynamicFields(
  html: string,
  contact: Contact,
): Promise<DynamicFieldsResult> {
  const plans = await resolvePlanTags(html, contact);
  const feeds = await resolveFeedTags(plans.html, contact);
  return { html: feeds.html, misses: [...plans.misses, ...feeds.misses] };
}
