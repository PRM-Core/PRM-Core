/** PRM_Agent — the tuned model: a LoRA adapter of this installation, its training set and its gate. */
export const agentAdapter: Record<string, string> = {
  "Adapter jest wytrenowany na danych tej placówki i zostaje w tej instalacji — nie jest udostępniany innym placówkom ani wysyłany poza serwer modelu.":
    "The adapter is trained on this clinic's data and stays in this installation — it is not shared with other clinics or sent beyond the model server.",
  "Agent używa teraz modelu dostrojonego.": "The agent now uses the tuned model.",
  "Agent wrócił do modelu bazowego.": "The agent is back on the base model.",
  "Brak sprawdzianu modelu bazowego — uruchom porównanie.":
    "The base model has not been evaluated — run the comparison.",
  "Brak sprawdzianu modelu dostrojonego — uruchom porównanie.":
    "The tuned model has not been evaluated — run the comparison.",
  "Dostrojony model": "Tuned model",
  "Funkcje językowe agenta przechodzą na model z adapterem LoRA wytrenowanym na zatwierdzonych przykładach tej placówki. Włączyć można tylko wtedy, gdy w sprawdzianie wypada nie gorzej niż model bazowy — oba wyniki zostają zapisane przy decyzji; jedno kliknięcie wraca do modelu bazowego. Adapter powstaje i zostaje w tej instalacji: nie jest udostępniany innym placówkom.":
    "The agent's language features switch to the model with a LoRA adapter trained on this clinic's approved examples. It can be enabled only when it scores no worse than the base model in the evaluation — both scores are recorded with the decision; one click returns to the base model. The adapter is made and stays in this installation: it is not shared with other clinics.",
  "Model bazowy": "Base model",
  "Model dostrojony": "Tuned model",
  "Model dostrojony wypada gorzej niż bazowy: {tuned} wobec {base}. Zostaje model bazowy.":
    "The tuned model scores worse than the base: {tuned} against {base}. The base model stays.",
  "Model dostrojony wypada nie gorzej niż bazowy — można go włączyć.":
    "The tuned model scores no worse than the base — it can be enabled.",
  "Na serwerze modelu w sieci placówki zarejestrowano model z adapterem tej instalacji (PRM_AI_LOCAL_ADAPTER_MODEL).":
    "A model with this installation's adapter is registered on the model server inside the clinic's network (PRM_AI_LOCAL_ADAPTER_MODEL).",
  "Nie ma modelu z adapterem — ustaw PRM_AI_LOCAL_ADAPTER_MODEL (docs/AGENT.md, sekcja 12).":
    "There is no model with an adapter — set PRM_AI_LOCAL_ADAPTER_MODEL (docs/AGENT.md, section 12).",
  "Oba modele sprawdzano na różnych zestawach przypadków (np. przed i po aktualizacji) — uruchom porównanie jeszcze raz.":
    "The two models were evaluated on different sets of cases (e.g. before and after an update) — run the comparison again.",
  "Ocena zespołu: {topic}, przejmuje: {owner}.": "The team's verdict: {topic}, taken by: {owner}.",
  "PRM_Agent wraca do modelu bazowego: {reason}": "PRM_Agent returns to the base model: {reason}",
  "Porównaj modele": "Compare models",
  "Porównanie nie zostało uruchomione": "The comparison did not run",
  "Porównanie zakończone: model dostrojony nie wypada gorzej — można go włączyć.":
    "Comparison finished: the tuned model scores no worse — it can be enabled.",
  "Porównanie zakończone: {reason}": "Comparison finished: {reason}",
  "W użyciu: model bazowy.": "In use: the base model.",
  "W użyciu: model dostrojony.": "In use: the tuned model.",
  "Wróć do modelu bazowego": "Return to the base model",
  "Wyniki zapisane przy decyzji: bazowy {base}, dostrojony {tuned}.":
    "Scores recorded with the decision: base {base}, tuned {tuned}.",
  "Za mało przykładów do dostrojenia: {n} z wymaganych {min}. Adapter z tak małego zbioru uczy się przypadku, nie stylu placówki — zbierzcie więcej zatwierdzonych draftów i poprawionych ocen.":
    "Too few examples to tune on: {n} of the {min} required. An adapter from so small a set learns chance, not the clinic's style — collect more approved drafts and corrected triages.",
  "nie uruchomiono — uruchom porównanie": "not run — run the comparison",
};
