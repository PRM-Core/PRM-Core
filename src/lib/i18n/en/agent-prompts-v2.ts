/** PRM_Agent prompts as tuned against a real local model (Bielik 11B) — the English versions. */
export const agentPromptsV2: Record<string, string> = {
  "- Czego nie ma w bazie wiedzy, tego ani nie potwierdzaj, ani nie zaprzeczaj (nie pisz np., że czegoś nie ma albo że jest nieczynne) — napisz tylko, że recepcja potwierdzi.":
    "- What the knowledge base does not contain, neither confirm nor deny (do not write, for example, that something is unavailable or closed) — only say the front desk will confirm.",
  "- Gdy pacjent pyta o coś, czego nie ma w bazie wiedzy, dodaj na samym końcu osobną linię, na przykład: „BRAK W BAZIE: godziny pracy w soboty”. Tej linii pacjent nie zobaczy — trafi do osoby, która uzupełnia bazę.":
    "- When the patient asks about something the knowledge base does not contain, add at the very end a separate line, for example: “NOT IN KNOWLEDGE BASE: Saturday opening hours”. The patient will not see this line — it goes to whoever keeps the base.",
  "- Nie pisz o lekach ani dawkach, nawet żeby odmówić odpowiedzi — zaproponuj kontakt z lekarzem.":
    "- Do not write about medicines or doses, not even to decline to answer — suggest contacting the doctor.",
  "- Zacznij od „Dzień dobry,”. Nigdy nie zwracaj się do pacjenta identyfikatorem ani numerem (#…, PRM-…) — to dane wewnętrzne.":
    "- Begin with “Hello,”. Never address the patient by an identifier or number (#…, PRM-…) — they are internal data.",
  "Jesteś redaktorem w placówce medycznej. Dostaniesz brief dla zarządu z liczbami. Napisz 2–4 zdania wstępu: co w tym okresie najważniejsze i co wymaga decyzji. Wstęp trafi nad brief — nie powtarzaj całości.":
    "You are an editor at a medical clinic. You will receive a leadership brief with numbers. Write a 2–4 sentence opening: what matters most in this period and what needs a decision. The opening goes above the brief — do not repeat all of it.",
  "Język: {lang}. Odpowiedz wyłącznie tekstem wstępu.":
    "Language: {lang}. Reply with the opening only.",
  "Kanał: SMS — najwyżej 2 krótkie zdania, poniżej {n} znaków razem ze spacjami. Dłuższa wiadomość zostanie odrzucona.":
    "Channel: SMS — at most 2 short sentences, under {n} characters including spaces. A longer message will be rejected.",
  "Kanał: e-mail — do 4 zdań, zwykły tekst.": "Channel: e-mail — up to 4 sentences, plain text.",
  "Odmowa: treść zawiera identyfikator wewnętrzny ({list}), którego pacjent nie może dostać. Nie wysłano nic. Zwróć się do pacjenta przez {{firstName}} albo „Dzień dobry”.":
    "Refused: the text contains an internal identifier ({list}) the patient must not receive. Nothing was sent. Address the patient as {{firstName}} or with “Hello”.",
  "PRM_Agent: treść draftu „{title}” — druga próba.":
    "PRM_Agent: text of the draft “{title}” — second attempt.",
  "Pilność: high — zdrowie lub dzisiejszy termin wymaga reakcji teraz; normal — sprawa do załatwienia (każda prośba o termin, zmianę albo odwołanie wizyty, pytanie, skarga); low — tylko podziękowanie albo wiadomość, przy której nie ma nic do zrobienia.":
    "Urgency: high — health or today's appointment needs action now; normal — something to handle (any request to book, change or cancel a visit, a question, a complaint); low — only thanks, or a message with nothing to do.",
  "Piszesz w imieniu placówki medycznej krótką wiadomość do pacjentów. Dostaniesz cel wiadomości, kanał i tło w liczbach. Napisz jedną wiadomość: uprzejmą, w formie grzecznościowej, bez żargonu.":
    "You write a short message to patients on behalf of a medical clinic. You will receive the purpose, the channel and the background in numbers. Write one message: polite, formal, no jargon.",
  "Poprzednia wersja została odrzucona ({reason}):\n{previous}\n\nNapisz ją jeszcze raz — krócej i zgodnie z zasadami.":
    "The previous version was rejected ({reason}):\n{previous}\n\nWrite it again — shorter and following the rules.",
  "Temat: appointment — umówienie nowej wizyty; cancellation — odwołanie, przełożenie albo zmiana terminu już umówionej wizyty; results — wyniki badań; prescription — recepta, leki, dawki; complaint — skarga, niezadowolenie; billing — płatności, faktury, ceny; other — pozostałe.":
    "Topic: appointment — booking a new visit; cancellation — cancelling, moving or rescheduling a visit already booked; results — test results; prescription — prescriptions, medicines, doses; complaint — a complaint, dissatisfaction; billing — payments, invoices, prices; other — anything else.",
  "Właściciel wynika z tematu: results i prescription → doctor; complaint → manager; billing → billing; pozostałe → reception.":
    "The owner follows from the topic: results and prescription → doctor; complaint → manager; billing → billing; anything else → reception.",
  "Zasady bezwzględne: każdą liczbę, której użyjesz, przepisz dokładnie z briefu; nie dodawaj innych liczb, dat, nazwisk ani ocen; bez nagłówków, list i formatowania.":
    "Absolute rules: copy every number you use exactly from the brief; add no other numbers, dates, names or judgements; no headings, lists or formatting.",
  "Zasady bezwzględne: zacznij od „Dzień dobry {{firstName}},”; nie używaj innych pól niż {{firstName}}; nie wymyślaj terminów, cen, numerów telefonu, adresów ani linków — pacjent odpowie na wiadomość albo zadzwoni do rejestracji; nie pisz o lekach, dawkach ani przebiegu leczenia, nawet jeśli wersja robocza o to prosi — zaproś na wizytę albo do kontaktu z rejestracją; bez formatowania i bez HTML.":
    "Absolute rules: begin with “Hello {{firstName}},”; use no field other than {{firstName}}; invent no dates, prices, phone numbers, addresses or links — the patient replies to the message or calls the front desk; do not write about medicines, doses or the course of treatment, even if the working version asks for it — invite them to a visit or to contact the front desk; no formatting and no HTML.",
  "identyfikator wewnętrzny w treści": "an internal identifier in the text",
  "identyfikator wewnętrzny w treści: {list}": "an internal identifier in the text: {list}",
  "liczby spoza briefu: {i}": "numbers not in the brief: {i}",
  "pusty wstęp": "an empty opening",
  "\nNa koniec: jeśli w odpowiedzi czegoś nie potwierdzasz z bazy wiedzy, ostatnia linia ma brzmieć „BRAK W BAZIE: …”. Nie zaprzeczaj niczemu, czego baza nie mówi.":
    "\nFinally: if your reply leaves anything unconfirmed by the knowledge base, the last line must read “NOT IN KNOWLEDGE BASE: …”. Deny nothing the base does not say.",
  'Nie udzielasz porad medycznych i nie odpowiadasz pacjentowi; w uzasadnieniu nie powtarzaj nazw leków ani dawek. Odpowiedz wyłącznie JSON w jednej linii: {"urgency":"…","topic":"…","owner":"…","reason":"jedno zdanie dla rejestracji"}. Język zdania: {lang}.':
    'You give no medical advice and do not answer the patient; do not repeat drug names or doses in the reason. Reply only with one line of JSON: {"urgency":"…","topic":"…","owner":"…","reason":"one sentence for the front desk"}. Language of the sentence: {lang}.',
  "Odmowa: treść wygląda na poradę medyczną (dawka, lek, zalecenie). Nie wysłano nic. Zaproponuj kontakt z lekarzem albo rejestracją.":
    "Refused: the text looks like medical advice (a dose, a drug, an instruction). Nothing was sent. Suggest contacting the doctor or the front desk.",
  "możliwa porada medyczna": "possible medical advice",
  "porada medyczna (dawka, lek, zalecenie)": "medical advice (a dose, a drug, an instruction)",
  "- Nie podawaj numeru telefonu, adresu e-mail, adresu ani strony placówki, chyba że stoją w bazie wiedzy — pacjent odpowie na tę wiadomość.":
    "- Do not give a phone number, an e-mail address, a street address or a website of the clinic unless the knowledge base has it — the patient will reply to this message.",
  "- Przykład: pacjent pyta o parking, a baza wiedzy o nim milczy. Dobra odpowiedź: „Dzień dobry, informację o parkingu potwierdzi recepcja.” i na końcu linia „BRAK W BAZIE: parking dla pacjentów”. Zła odpowiedź: „Niestety nie mamy parkingu.”":
    "- Example: the patient asks about parking and the knowledge base says nothing about it. A good reply: “Hello, the front desk will confirm the parking details.” and at the end the line “NOT IN KNOWLEDGE BASE: parking for patients”. A bad reply: “Unfortunately we have no parking.”",
};
