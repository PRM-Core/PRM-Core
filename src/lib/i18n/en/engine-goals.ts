/** PRM Engine — goals and conversion. */
export const engineGoals: Record<string, string> = {
  " — osiągnięcie kończy przebieg": " — reaching it ends the run",
  "({converted} z {matured}; w trakcie {pending})":
    "({converted} of {matured}; {pending} in progress)",
  "Bez celu — ustaw, co jest sukcesem tej automatyzacji (np. umówiona wizyta), żeby mierzyć konwersję.":
    "No goal — set what success means for this automation (e.g. a booked visit) to measure conversion.",
  "Cel automatyzacji": "Automation goal",
  "Cel osiągnięty: {goal} — przebieg zakończony.": "Goal reached: {goal} — the run has ended.",
  "Cel: {goal} w ciągu {days} dni{exit}.": "Goal: {goal} within {days} days{exit}.",
  "Cel: {goal} w {days} dni: ": "Goal: {goal} in {days} days: ",
  "Co jest sukcesem tej automatyzacji — zdarzenie pacjenta w ciągu kilku dni od wejścia. Konwersja liczy się dla całej automatyzacji i dla każdego wariantu splitu A/B.":
    "What success means for this automation — the patient's event within a few days of entering. Conversion is counted for the whole automation and for each A/B split variant.",
  "Osiągnęło {converted} z {matured} ({rate}); w trakcie {pending}.":
    "Reached by {converted} of {matured} ({rate}); {pending} in progress.",
  "Pacjent, który już umówił wizytę, przestaje dostawać zachęty do umówienia — kolejne kroki tej automatyzacji go nie dotyczą.":
    "A patient who has already booked stops getting prompts to book — the remaining steps of this automation no longer apply to them.",
  "Różnica między wariantami jest istotna (p = {p}).":
    "The difference between the variants is significant (p = {p}).",
  "Różnica między wariantami mieści się w przypadku (p = {p}).":
    "The difference between the variants is within chance (p = {p}).",
  "Ustaw cel": "Set a goal",
  "Usuń cel": "Remove the goal",
  "W ciągu dni od wejścia": "Within days of entering",
  "Wariant {label}: {rate} ({converted} z {entered})":
    "Variant {label}: {rate} ({converted} of {entered})",
  "Za mało przebiegów, by rozstrzygnąć test A/B (potrzeba co najmniej 30 na wariant).":
    "Too few runs to decide the A/B test (at least 30 per variant are needed).",
  "Zakończ przebieg po osiągnięciu celu": "End the run when the goal is reached",
  "Zmień cel": "Change the goal",
};
