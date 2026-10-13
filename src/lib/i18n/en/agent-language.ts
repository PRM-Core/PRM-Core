/** PRM_Agent — the language layer: a model inside the perimeter rewrites the brief and writes draft texts. */
export const agentLanguage: Record<string, string> = {
  "Brak klucza API dostawcy {providerId}.": "No API key for the {providerId} provider.",
  "Brief wygładzony — każda liczba sprawdzona z wersją z szablonu.":
    "Brief polished — every number checked against the template version.",
  "Cel: {title}": "Purpose: {title}",
  "Dzienny limit kosztów AI wyczerpany ({v0} / {v1} USD).":
    "The daily AI spend limit is used up ({v0} / {v1} USD).",
  "Jesteś redaktorem w placówce medycznej. Dostaniesz brief dla zarządu napisany z szablonu. Przepisz go tak, żeby czytało się go jak notatkę od człowieka: pełne zdania, krótkie akapity, bez żargonu.":
    "You are an editor at a medical clinic. You will receive a leadership brief written from a template. Rewrite it so that it reads like a note from a person: full sentences, short paragraphs, no jargon.",
  "Język: {lang}. Odpowiedz wyłącznie tekstem briefu, bez komentarza.":
    "Language: {lang}. Reply with the brief's text only, no commentary.",
  "Język: {lang}. Odpowiedz wyłącznie treścią wiadomości.":
    "Language: {lang}. Reply with the message text only.",
  "Kanał: SMS — maksymalnie {n} znaków.": "Channel: SMS — at most {n} characters.",
  "Kanał: e-mail — do pięciu zdań, zwykły tekst.":
    "Channel: e-mail — up to five sentences, plain text.",
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
  "Piszesz w imieniu placówki medycznej krótką wiadomość do pacjentów. Dostaniesz cel wiadomości, kanał i tło w liczbach. Napisz jedną wiadomość: uprzejmą, w formie grzecznościowej, bez żargonu i bez porad medycznych.":
    "You write a short message to patients on behalf of a medical clinic. You will receive the purpose, the channel and the background in numbers. Write one message: polite, formal, no jargon and no medical advice.",
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
  "Zasady bezwzględne: zachowaj każdą liczbę dokładnie w tej postaci (procenty, liczby wizyt, daty, punkty procentowe); nie dodawaj żadnych faktów, liczb, nazwisk ani ocen, których nie ma w oryginale; zachowaj kolejność sekcji i ich nagłówki; zostaw ostatnie zdanie o zatwierdzaniu.":
    "Absolute rules: keep every number exactly as it is (percentages, visit counts, dates, percentage points); add no facts, numbers, names or judgements that are not in the original; keep the order of the sections and their headings; leave the final sentence about approval.",
  "Zasady bezwzględne: zacznij od „Dzień dobry {{firstName}}”; nie używaj innych pól niż {{firstName}}; nie wymyślaj terminów, cen, numerów telefonu, adresów ani linków — pacjent odpowie na wiadomość albo zadzwoni do rejestracji; bez formatowania i bez HTML.":
    "Absolute rules: begin with a greeting to {{firstName}} (“Dzień dobry” in Polish, “Hello” in English); use no field other than {{firstName}}; invent no dates, prices, phone numbers, addresses or links — the patient replies to the message or calls the front desk; no formatting and no HTML.",
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
