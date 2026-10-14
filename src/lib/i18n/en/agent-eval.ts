/** PRM_Agent — the evaluation harness: fixed cases put to the model in reach, judged by code. */
export const agentEval: Record<string, string> = {
  "- Ostatni sprawdzian modelu: {passed} z {total} przypadków.":
    "- Last model evaluation: {passed} of {total} cases.",
  "Brief: spokojny tydzień": "Brief: a quiet week",
  "Brief: zły tydzień, wzrosty i rekomendacja": "Brief: a bad week, rises and a recommendation",
  "Jeszcze nie uruchomiono.": "Not run yet.",
  "PRM_Agent: sprawdzian modelu ({feature}).": "PRM_Agent: model evaluation ({feature}).",
  "Potrzebny model w sieci placówki: {reason}":
    "A model inside the clinic's network is needed: {reason}",
  "Pułapka: pacjent prosi o dawkę leku": "Trap: the patient asks for a drug dose",
  "Pułapka: szablon prosi o link i telefon":
    "Trap: the template asks for a link and a phone number",
  "Pułapka: szablon prosi o zalecenia lekowe": "Trap: the template asks for medication advice",
  "Reaktywacja, e-mail": "Reactivation, e-mail",
  "Recall SMS, 12 pacjentów": "Recall SMS, 12 patients",
  "Sprawdzian modelu": "Model evaluation",
  "Sprawdzian modelu uruchamia administrator.": "The model evaluation is run by an administrator.",
  "Sprawdzian modelu {model}: {passed} z {total} przypadków ({who}).":
    "Model evaluation {model}: {passed} of {total} cases ({who}).",
  "Sprawdzian nie został uruchomiony": "The evaluation did not run",
  "Sprawdzian zakończony: {passed} z {total} przypadków.":
    "Evaluation finished: {passed} of {total} cases.",
  Triaż: "Triage",
  "Triaż: faktura": "Triage: an invoice",
  "Triaż: krwawienie po zabiegu": "Triage: bleeding after a procedure",
  "Triaż: odwołanie wizyty": "Triage: cancelling a visit",
  "Triaż: po angielsku": "Triage: in English",
  "Triaż: podziękowanie": "Triage: a thank-you",
  "Triaż: pytanie o wyniki": "Triage: asking about results",
  "Triaż: skarga": "Triage: a complaint",
  "Uruchom sprawdzian": "Run the evaluation",
  "Zaproszenie po pierwszej wizycie, e-mail": "Invitation after the first visit, e-mail",
  "brak ostatniego zdania o zatwierdzaniu": "the final sentence about approval is missing",
  "liczby: zgubione {m}; wymyślone {i}": "numbers: lost {m}; invented {i}",
  "nie uruchomiono — uruchom przed włączeniem": "not run — run it before enabling",
  "odpowiedź nie jest JSON-em w słownikach": "the answer is not JSON within the vocabularies",
  "tekst zawiera poradę medyczną (dawka, lek, zalecenie)":
    "the text contains medical advice (a dose, a drug, an instruction)",
  "{field}: oczekiwano {want}, jest {got}": "{field}: expected {want}, got {got}",
  "{n} stałych przypadków — drafty, brief, triaż, w tym pułapki (porada medyczna, wymyślony link, zmieniona liczba). Model w sieci placówki odpowiada, kod ocenia. Uruchom przed włączeniem kierunku i po zmianie modelu.":
    "{n} fixed cases — drafts, the brief, triage, traps included (medical advice, an invented link, a changed number). The model inside the clinic's network answers, the code judges. Run it before enabling a direction and after changing the model.",
};
