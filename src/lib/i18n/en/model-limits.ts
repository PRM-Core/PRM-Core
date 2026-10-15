/** Daily model-run limits — the installation's and each automation's. */
export const modelLimits: Record<string, string> = {
  "Automatyzacja „{name}” nie korzysta z modelu (limit 0).":
    "The automation “{name}” does not use the model (limit 0).",
  "Automatyzacja „{name}” wykorzystała dzienny limit uruchomień modelu ({used} / {limit}).":
    "The automation “{name}” has used its daily limit of model runs ({used} / {limit}).",
  "Czas modelu w sieci placówki jest ograniczony: po przekroczeniu limitu kroki z modelem są pomijane do północy (węzły agenta idą pierwszą ścieżką), reszta systemu działa. Każda automatyzacja ma też własny limit w edytorze.":
    "The model's time inside the clinic's network is limited: past the limit, steps that use the model are skipped until midnight (agent nodes take the first path) and the rest of the system keeps working. Each automation also has its own limit in the editor.",
  "Dzienny limit modelu wykorzystany ({used} z {limit}) — do północy węzły agenta idą pierwszą ścieżką.":
    "Daily model limit used ({used} of {limit}) — until midnight agent nodes take the first path.",
  "Dzienny limit uruchomień modelu na {v0}%": "Daily limit of model runs at {v0}%",
  "Dzienny limit uruchomień modelu wyczerpany": "Daily limit of model runs used up",
  "Dzienny limit uruchomień modelu wyczerpany ({used} / {limit}) — do północy kroki z modelem są pomijane. Limit ustawia administrator w Ustawienia → PRM_Agent.":
    "Daily limit of model runs used up ({used} / {limit}) — steps that use the model are skipped until midnight. An administrator sets the limit in Settings → PRM_Agent.",
  "Kroki z modelem są pomijane do północy — węzły agenta idą pierwszą ścieżką. Deterministyczne kroki działają normalnie.":
    "Steps that use the model are skipped until midnight — agent nodes take the first path. Deterministic steps work normally.",
  "Limit na dobę": "Daily limit",
  "Limit uruchomień modelu na dobę": "Daily limit of model runs",
  "Limit uruchomień modelu ustawia administrator.":
    "The limit of model runs is set by an administrator.",
  "Limit zapisany.": "Limit saved.",
  "Model dziś: {used} z {limit} uruchomień dla tej automatyzacji.":
    "Model today: {used} of {limit} runs for this automation.",
  "Nie udało się zapisać limitu": "Could not save the limit",
  "Po przekroczeniu limitu kroki z modelem zaczną być pomijane.":
    "Past the limit, steps that use the model will be skipped.",
  "Sprawdź w Raportach → Finanse i w dzienniku agenta, która automatyzacja zużywa model; ogranicz jej limit w edytorze albo podnieś limit instalacji w Ustawienia → PRM_Agent.":
    "Check in Reports → Finance and the agent's log which automation uses the model; lower its limit in the editor or raise the installation's limit in Settings → PRM_Agent.",
  "Uruchomienia modelu dziś": "Model runs today",
  "Uruchomień na dobę": "Runs per day",
  "Węzły agenta nie korzystają z modelu — zawsze idą pierwszą ścieżką.":
    "Agent nodes do not use the model — they always take the first path.",
  "bez modelu": "no model",
  "dziś {used} z {limit}": "today {used} of {limit}",
  "{reason} Do północy jej węzły agenta idą pierwszą ścieżką.":
    "{reason} Until midnight its agent nodes take the first path.",
  "{reason} Pominięto analizę modelem.": "{reason} The model analysis was skipped.",
  "{reason} Węzeł pominięty, wybrano pierwszą ścieżkę.":
    "{reason} The node was skipped, the first path taken.",
  "{used} z {limit} uruchomień. {rest}": "{used} of {limit} runs. {rest}",
};
