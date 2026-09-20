/**
 * Sygnał „spostrzeżenia się zmieniły" między panelem nadzorcy a dzwonkiem.
 *
 * **Po co to istnieje.** Dzwonek w pasku górnym odpytuje serwer co minutę.
 * Panel nadzorcy siedzi w zupełnie innym miejscu drzewa, więc po odznaczeniu
 * alertu licznik przy dzwonku zostawał na starej liczbie nawet przez minutę —
 * wyglądało to jak „odznaczyłem, a i tak wisi". Kontekst Reacta byłby tu
 * armatą na wróbla: to jedno zdarzenie bez żadnego stanu do dzielenia.
 *
 * Zwykłe `CustomEvent` na `window`, bo obie strony żyją w tej samej karcie
 * przeglądarki i nie ma czego serializować.
 */
const EVENT = "prm:insights-changed";

export function notifyInsightsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Zwraca funkcję odsubskrybowania — do użycia wprost w `useEffect`. */
export function onInsightsChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
