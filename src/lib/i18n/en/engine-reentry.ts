/** PRM Engine — re-entry rules. */
export const engineReentry: Record<string, string> = {
  Dni: "Days",
  "Każdy pacjent przechodzi tę automatyzację tylko raz.":
    "Each patient goes through this automation only once.",
  "Pacjent może wejść ponownie, gdy jego poprzedni przebieg się zakończy.":
    "A patient may enter again once their previous run has ended.",
  "Ponowne wejście": "Re-entry",
  "Ponowne wejście najwcześniej {days} dni po poprzednim.":
    "Re-entry no sooner than {days} days after the previous one.",
  "Zdarzenie {type} pominięte — pacjent już przeszedł tę automatyzację (tylko raz).":
    "Event {type} skipped — the patient has already been through this automation (only once).",
  "Zdarzenie {type} pominięte — ponowne wejście możliwe od {from}.":
    "Event {type} skipped — re-entry possible from {from}.",
  "po N dniach": "after N days",
  "tylko raz": "only once",
  zawsze: "always",
};
