/** PRM Engine — the weekly cap on marketing messages per patient. */
export const engineMarketingCap: Record<string, string> = {
  "Marketing na pacjenta / 7 dni": "Marketing per patient / 7 days",
  "Marketing na pacjenta: ile wiadomości marketingowych jeden pacjent może dostać w ciągu 7 dni — ze wszystkich automatyzacji i kampanii razem. Krok automatyzacji ponad limit jest pomijany, przebieg idzie dalej. Wiadomości administracyjne (przypomnienia o wizycie) nie liczą się nigdy; kampanie liczą się, ale nie są wstrzymywane.":
    "Marketing per patient: how many marketing messages one patient may get in 7 days — from all automations and campaigns together. An automation step past the limit is skipped and the run goes on. Administrative messages (visit reminders) never count; campaigns count but are not held back.",
  "Pominięto — pacjent dostał już {sent} wiadomości marketingowych w ciągu 7 dni (limit {cap}). Przebieg idzie dalej.":
    "Skipped — the patient has already had {sent} marketing messages in 7 days (limit {cap}). The run goes on.",
  "Ta wiadomość marketingowa zostałaby pominięta — pacjent dostał już {sent} w ciągu 7 dni (limit {cap}). Przebieg idzie dalej.":
    "This marketing message would be skipped — the patient has already had {sent} in 7 days (limit {cap}). The run goes on.",
};
