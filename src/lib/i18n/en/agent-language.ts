/** PRM_Agent — the language layer: a model inside the perimeter rewrites the brief and writes draft texts. */
export const agentLanguage: Record<string, string> = {
  "Brak klucza API dostawcy {providerId}.": "No API key for the {providerId} provider.",
  "Brief wygładzony — każda liczba sprawdzona z wersją z szablonu.":
    "Brief polished — every number checked against the template version.",
  "Cel: {title}": "Purpose: {title}",
  "Język: {lang}. Odpowiedz wyłącznie treścią wiadomości.":
    "Language: {lang}. Reply with the message text only.",
  "Kto dostanie: {n} pacjentów — {detail}": "Recipients: {n} patients — {detail}",
  "Model językowy jest wyłączony (PRM_AI_MODE=off).":
    "The language model is off (PRM_AI_MODE=off).",
  "Model nie napisał treści": "The model did not write a text",
  "Model nie wygładził briefu": "The model did not polish the brief",
  "Model nie zachował liczb w briefie — zostaje wersja z szablonu.":
    "The model did not keep the brief's numbers — the template version stays.",
  "Napisz modelem": "Write with the model",
  "PRM_Agent: brief wygładzony przez model.": "PRM_Agent: brief polished by the model.",
  "PRM_Agent: treść draftu „{title}” napisana przez model.":
    "PRM_Agent: text of the draft “{title}” written by the model.",
  "Pokaż wersję modelu": "Show the model's version",
  "Pokaż wersję z szablonu": "Show the template version",
  "Serwer modelu lokalnego nie jest skonfigurowany (PRM_AI_LOCAL_URL, PRM_AI_LOCAL_MODEL).":
    "The local model server is not configured (PRM_AI_LOCAL_URL, PRM_AI_LOCAL_MODEL).",
  "Tekst modelu dla draftu „{title}” odrzucony ({reason}) — zostaje szablon.":
    "The model's text for the draft “{title}” was refused ({reason}) — the template stays.",
  "Treść napisana przez model — sprawdź ją przed zatwierdzeniem.":
    "Text written by the model — read it before approving.",
  "Wersja robocza z szablonu (możesz napisać lepiej): {text}":
    "Working version from the template (you may write it better): {text}",
  "Wróć do szablonu": "Back to the template",
  "Wygładzony przez model w sieci placówki ({model}); każda liczba sprawdzona z wersją z szablonu.":
    "Polished by a model inside the clinic's network ({model}); every number checked against the template version.",
  "Wygładź modelem": "Polish with the model",
  "brak pola {{firstName}}": "the {{firstName}} field is missing",
  "model nie zwrócił treści": "the model returned no text",
  "model zmienił liczby": "the model changed the numbers",
  "napisał model w sieci placówki": "written by a model inside the clinic's network",
  "pusta treść": "empty text",
  "tekst z szablonu": "text from the template",
  "użyte pole inne niż {{firstName}}": "a field other than {{firstName}} was used",
  "wymyślona liczba, numer albo data": "an invented number, phone or date",
  "wymyślony link": "an invented link",
  "za długa ({n} znaków)": "too long ({n} characters)",
  "znaczniki HTML": "HTML tags",
};
