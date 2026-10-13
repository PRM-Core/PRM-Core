/** PRM_Agent — triage of inbound messages: urgency, topic, owner. */
export const agentTriage: Record<string, string> = {
  "Kanał: {channel}\n\n{text}": "Channel: {channel}\n\n{text}",
  "Nie udało się ocenić rozmowy.": "Could not triage the conversation.",
  'Nie udzielasz porad medycznych i nie odpowiadasz pacjentowi. Odpowiedz wyłącznie JSON w jednej linii: {"urgency":"…","topic":"…","owner":"…","reason":"jedno zdanie dla rejestracji"}. Język zdania: {lang}.':
    'You give no medical advice and do not answer the patient. Reply only with one line of JSON: {"urgency":"…","topic":"…","owner":"…","reason":"one sentence for the front desk"}. Language of the sentence: {lang}.',
  "PRM_Agent: oceń pilność, temat i właściciela jeszcze raz":
    "PRM_Agent: assess urgency, topic and owner again",
  "PRM_Agent: triaż skrzynki nie powiódł się: {err}": "PRM_Agent: inbox triage failed: {err}",
  "PRM_Agent: triaż wiadomości ({channel}).": "PRM_Agent: message triage ({channel}).",
  "Pilność: high — zdrowie lub dzisiejszy termin wymaga reakcji teraz; normal — zwykła sprawa; low — podziękowanie albo nic do zrobienia. Temat: appointment, cancellation, results, prescription, complaint, billing, other. Właściciel: reception, doctor, billing, manager.":
    "Urgency: high — health or today's appointment needs a reaction now; normal — an ordinary matter; low — thanks or nothing to do. Topic: appointment, cancellation, results, prescription, complaint, billing, other. Owner: reception, doctor, billing, manager.",
  "Pomagasz rejestracji placówki medycznej uporządkować wiadomości od pacjentów. Dostaniesz treść ostatnich wiadomości pacjenta (dane osobowe zastąpione symbolami). Oceń: jak pilna jest sprawa, czego dotyczy i kto powinien ją przejąć.":
    "You help a medical clinic's front desk sort patient messages. You will receive the patient's latest messages (personal data replaced with placeholders). Assess how urgent the matter is, what it is about and who should take it.",
  "Reguły — bez słów-kluczy, zwykła wiadomość.": "Rules — no keywords, an ordinary message.",
  "Reguły — słowa: {words}.": "Rules — words: {words}.",
  "Triaż: model niedostępny ({err}) — zostają reguły.":
    "Triage: model unavailable ({err}) — the rules stand.",
  "Triaż: odpowiedź modelu poza słownikiem — zostają reguły.":
    "Triage: the model's answer is outside the vocabulary — the rules stand.",
  "bez pośpiechu": "no hurry",
  inne: "other",
  kierownik: "manager",
  lekarz: "doctor",
  "ocena modelu w sieci placówki": "assessed by a model inside the clinic's network",
  "odwołanie / przełożenie": "cancellation / rescheduling",
  pilne: "urgent",
  płatności: "billing",
  "recepta / leki": "prescription / medication",
  rejestracja: "front desk",
  rozliczenia: "billing",
  skarga: "complaint",
  "umówienie wizyty": "appointment",
  "wyniki badań": "test results",
  zwykłe: "ordinary",
};
