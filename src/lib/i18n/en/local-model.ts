/** Every AI feature on a local model: tools in the prompt, facts a smaller model reads right. */
export const localModel: Record<string, string> = {
  "## Narzędzia": "## Tools",
  "## W skrócie (policzone przez system z wizyt i korespondencji)":
    "## In brief (counted by the system from visits and correspondence)",
  "- (brak danych)": "- (no data)",
  "6. Dane kontaktowe pacjenta nie są w faktach i nie piszesz ich ani nie wstawiasz za nie znaczników typu {{phone}}. Daty i godziny bierzesz dokładnie z faktów; o tym, co już było, a co dopiero będzie, decyduje DZIŚ.":
    "6. The patient's contact details are not in the facts: you do not write them or put placeholders such as {{phone}} in their place. Take dates and times exactly from the facts; TODAY decides what has happened and what is still ahead.",
  "DZIŚ: {today}": "TODAY: {today}",
  "Dziś: {today}": "Today: {today}",
  "Jedno narzędzie naraz. Liczb, nazw ani danych nie zgadujesz — najpierw narzędzie, potem odpowiedź na podstawie jego wyniku. Nie wymyślasz identyfikatorów, adresów ani linków, których nie ma w wynikach.":
    "One tool at a time. Do not guess numbers, names or data — first the tool, then an answer based on its result. Do not make up identifiers, addresses or links that are not in the results.",
  "Każda Twoja odpowiedź to dokładnie jeden obiekt JSON, bez tekstu przed ani po nim.":
    "Every reply of yours is exactly one JSON object, with no text before or after it.",
  "Model w użyciu nie widzi obrazów — wiadomość powstała z samego opisu, bez odczytania grafiki. Do kodowania z grafiki potrzebny jest model z obsługą obrazów (PRM_AI_LOCAL_MODEL).":
    "The model in use cannot see images — the message was written from the description alone, without reading the design. Coding from a design needs a model that takes images (PRM_AI_LOCAL_MODEL).",
  "Nie podałeś wywołania. Odpowiedz teraz jednym obiektem JSON: wywołaniem narzędzia albo odpowiedzią końcową.":
    "You did not write the call. Reply now with one JSON object: a tool call or the final answer.",
  "Odpowiadasz wyłącznie wywołaniem narzędzia — zwykły tekst nie zostanie odczytany.":
    "Reply only with a tool call — plain text will not be read.",
  "Odpowiedź końcowa dla użytkownika:": "The final answer for the user:",
  "Parametry (JSON Schema)": "Parameters (JSON Schema)",
  "W SKRÓCIE (policzone przez system z całej historii, pewne):":
    "IN BRIEF (counted by the system from the whole history, certain):",
  "WIZYTY ZAPLANOWANE — przyszłe, najbliższa pierwsza ({length}):":
    "BOOKED VISITS — upcoming, nearest first ({length}):",
  "Wynik narzędzia {name}:\n{content}": "Result of the tool {name}:\n{content}",
  "Wywołanie narzędzia (input musi pasować do jego parametrów):":
    "A tool call (input must match its parameters):",
};
