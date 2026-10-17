/** PRM_Agent on the contact card: the cached summary, the short facts, the background pass. */
export const contactSummary: Record<string, string> = {
  "- {name} · {n}× · ostatnio {status}, start {last}":
    "- {name} · {n}× · last {status}, started {last}",
  "- {url} · {n}× · ostatnio {last}": "- {url} · {n}× · last {last}",
  "Dane pacjenta zmieniły się od tego czasu — kliknij „Podsumuj ponownie”.":
    "The patient's data has changed since — click “Summarise again”.",
  "NOTATKI — {shown} najnowszych z {total}:": "NOTES — the {shown} newest of {total}:",
  "Napisz podsumowanie tego pacjenta dla osoby z recepcji, która za chwilę z nim rozmawia. Bez wstępu i bez list punktowanych — dokładnie cztery krótkie sekcje, razem około 100 słów:\n\n**Kim jest** (do 15 słów) — kto to i od kiedy z nami.\n**Historia** (do 40 słów) — tylko to, co najważniejsze dla rozmowy: wizyty, wiadomości, wysyłki.\n**Na co uważać** (do 20 słów) — brakujące zgody, brakujące dane, sygnały ostrzegawcze.\n**Proponowany następny krok** (do 20 słów) — jeden, wynikający z faktów i możliwy w ramach zgód.\n\nJeśli danych jest mało, napisz to wprost zamiast rozbudowywać domysły.":
    "Write a summary of this patient for a receptionist who is about to talk to them. Answer in English. No introduction and no bullet lists — exactly four short sections, about 100 words in all:\n\n**Who they are** (up to 15 words) — who this is and since when they have been with us.\n**History** (up to 40 words) — only what matters for the conversation: visits, messages, sends.\n**Watch out for** (up to 20 words) — missing consents, missing data, warning signs.\n**Suggested next step** (up to 20 words) — one, following from the facts and possible within the consents.\n\nIf there is little data, say so plainly instead of building on guesses.",
  "PRM_Agent przygotował podsumowanie pacjenta przed wizytą.":
    "PRM_Agent prepared the patient summary ahead of the visit.",
  "PRM_Agent: podsumowania przed wizytą nie powiodły się: {err}":
    "PRM_Agent: summaries ahead of visits failed: {err}",
  "PRM_Agent: podsumowanie przed wizytą nie powstało ({err}).":
    "PRM_Agent: the summary ahead of the visit was not written ({err}).",
  "Podsumowanie przygotowane przed wizytą, {date}.": "Summary prepared ahead of the visit, {date}.",
  "Podsumowanie z {date}.": "Summary from {date}.",
  "WEJŚCIA NA STRONĘ ({length}) — adresy od najczęstszych:":
    "WEBSITE VISITS ({length}) — addresses, most visited first:",
  "WIADOMOŚCI W SKRZYNCE — {shown} najnowszych z {total}:":
    "INBOX MESSAGES — the {shown} newest of {total}:",
  "WIZYTY MINIONE — {shown} najnowszych z {total}:": "PAST VISITS — the {shown} newest of {total}:",
};
