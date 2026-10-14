/** The knowledge base as the single source of facts: checks, gaps and their screens. */
export const knowledgeGrounding: Record<string, string> = {
  "- Gdy pacjent pyta o coś, czego nie ma w bazie wiedzy, napisz, że recepcja potwierdzi, i dodaj na samym końcu osobną linię: „BRAK W BAZIE: <czego brakuje, kilka słów>”. Tej linii pacjent nie zobaczy — trafi do osoby, która uzupełnia bazę.":
    "- When the patient asks about something the knowledge base does not contain, say the front desk will confirm, and add at the very end a separate line: “NOT IN KNOWLEDGE BASE: <what is missing, a few words>”. The patient will not see this line — it goes to whoever keeps the base.",
  "- Każda cena, godzina, data, telefon, czas trwania i link w wiadomości są sprawdzane z bazą wiedzy i danymi pacjenta; wiadomość z faktem spoza nich nie zostanie wysłana. Gdy czegoś brakuje, dopisz na końcu treści osobną linię „BRAK W BAZIE: <czego brakuje>” — pacjent jej nie zobaczy.":
    "- Every price, hour, date, phone number, duration and link in the message is checked against the knowledge base and the patient's data; a message with a fact from outside them will not be sent. When something is missing, add at the end of the text a separate line “NOT IN KNOWLEDGE BASE: <what is missing>” — the patient will not see it.",
  "Agent nie zgadywał — napisał pacjentowi, że recepcja potwierdzi, i zapisał pytanie tutaj. Dopisz odpowiedź, a następnym razem poda ją sam.":
    "The agent did not guess — it told the patient the front desk would confirm and kept the question here. Add the answer and next time it will give it itself.",
  "Baza wiedzy nie odpowiada na {n} pytań pacjentów":
    "The knowledge base does not answer {n} patient questions",
  "Baza wiedzy nie odpowiada na: {q} — dopisano do listy w Ustawienia → PRM_Agent.":
    "The knowledge base does not answer: {q} — added to the list in Settings → PRM_Agent.",
  "Bez pokrycia w bazie wiedzy:": "Not backed by the knowledge base:",
  "Dopisz odpowiedzi w Ustawienia → PRM_Agent → Baza wiedzy; następnym razem agent poda je sam.":
    "Add the answers in Settings → PRM_Agent → Knowledge base; next time the agent will give them itself.",
  "Dopisz odpowiedź": "Add the answer",
  "Odmowa: w treści są fakty bez pokrycia w bazie wiedzy ani w danych pacjenta: {list}. Nie wysłano nic. Usuń je albo napisz, że recepcja potwierdzi szczegóły.":
    "Refused: the text has facts backed by neither the knowledge base nor the patient's data: {list}. Nothing was sent. Remove them or say the front desk will confirm the details.",
  Odpowiedzi: "Replies",
  "Odpowiedź: cena, która jest w bazie": "Reply: a price that is in the base",
  "Odpowiedź: godziny, których nie ma w bazie": "Reply: hours that are not in the base",
  Pomiń: "Skip",
  "Pułapka: pacjent pyta w skrzynce o dawkę leku":
    "Trap: the patient asks the inbox for a drug dose",
  "Pytania, na które baza nie odpowiada ({n})": "Questions the base does not answer ({n})",
  "Sprawdź przed wysłaniem albo zastąp zdaniem, że recepcja potwierdzi.":
    "Check before sending or replace it with a sentence that the front desk will confirm.",
  "Wiadomość agenta zatrzymana — fakty bez pokrycia w bazie wiedzy ani w danych pacjenta: {list}.":
    "Agent message stopped — facts backed by neither the knowledge base nor the patient's data: {list}.",
  "Zadane łącznie {asked} razy. Agent nie zgadywał — pisał, że recepcja potwierdzi. Najczęstsze: {top}.":
    "Asked {asked} times in all. The agent did not guess — it said the front desk would confirm. Most frequent: {top}.",
  automatyzacja: "automation",
  "brak linii „BRAK W BAZIE” przy pytaniu spoza bazy":
    "no “NOT IN KNOWLEDGE BASE” line for a question outside the base",
  "brak odpowiedzi z bazy: {v}": "the answer from the base is missing: {v}",
  "fakty spoza bazy wiedzy: {list}": "facts from outside the knowledge base: {list}",
  skrzynka: "inbox",
};
