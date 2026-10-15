/** PRM Engine — the "wait for an event, with a timeout" step. */
export const engineWait: Record<string, string> = {
  "Czas minął": "Time ran out",
  "Czeka na „{label}” najdłużej do {at}.": "Waiting for “{label}” until {at} at the latest.",
  "Czeka, aż pacjent coś zrobi — odpisze, umówi wizytę, otworzy e-mail — najdłużej określony czas. Dwie ścieżki: „zdarzenie” i „czas minął”.":
    "Waits for the patient to do something — reply, book a visit, open an e-mail — for a set time at most. Two paths: “event” and “time ran out”.",
  "Czekaj na zdarzenie": "Wait for an event",
  "Czekaj na: {event} (najdłużej {amount} {unit})": "Wait for: {event} (at most {amount} {unit})",
  "Doczekano się „{label}” — ścieżka „zdarzenie”.": "“{label}” happened — the “event” path.",
  "Krok „Czekaj na zdarzenie” nie ma wybranego zdarzenia.":
    "The “Wait for an event” step has no event chosen.",
  "Liczy się tylko zdarzenie tego pacjenta, które nastąpi po wejściu w ten krok — nie to, które uruchomiło automatyzację. Gdy nastąpi, pacjent od razu idzie ścieżką „zdarzenie”; gdy czas minie, ścieżką „czas minął”. Na potwierdzenie wizyty czekaj na „Wiadomość od pacjenta” (odpowiedź SMS-em lub e-mailem).":
    "Only this patient's event after they reach this step counts — not the one that started the automation. When it happens, the patient goes down the “event” path at once; when the time runs out, down “time ran out”. To wait for a visit confirmation, wait for “Message from patient” (a reply by SMS or e-mail).",
  "Na co czekać": "What to wait for",
  Najdłużej: "At most",
  "Nie doczekano się „{label}” — ścieżka „czas minął”.":
    "“{label}” did not happen — the “time ran out” path.",
  "Pacjent czekałby tutaj na zdarzenie. W podglądzie idziemy ścieżką „czas minął”; gdy zdarzenie nastąpi wcześniej, pacjent pójdzie ścieżką „zdarzenie”.":
    "The patient would wait here for the event. The preview follows the “time ran out” path; if the event happens first, the patient goes down the “event” path.",
  Zdarzenie: "Event",
  "czas minął": "time ran out",
  "Ścieżka czeka, aż pacjent coś zrobi — najdłużej tyle, ile ustawisz. Potem idzie dalej jedną z dwóch dróg.":
    "The path waits for the patient to do something — at most as long as you set. Then it goes on one of two ways.",
  "Poczekaj {amount} {unit}": "Wait {amount} {unit}",
};
