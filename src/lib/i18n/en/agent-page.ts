/** PRM_Agent — recommendations, drafts, lists and the brief (the /agent screen and the rules behind it). */
export const agentPage: Record<string, string> = {
  " dla: {where}": " for: {where}",
  "- Brak nadchodzących wizyt z podwyższonym ryzykiem nieobecności.":
    "- No upcoming visits with a raised no-show risk.",
  "- E-mail: otwarcia {o}, kliknięcia {c}.": "- E-mail: opens {o}, clicks {c}.",
  "- Największy wzrost nieobecności: {list}.": "- Largest rise in no-shows: {list}.",
  "- Nic pilnego. Liczby są w normie wobec poprzedniego okresu.":
    "- Nothing urgent. The numbers are in line with the previous period.",
  "- Nieobecności: {v} z {n} wizyt.": "- No-shows: {v} of {n} visits.",
  "- Ocena ryzyka: model nauczony na {n} wizytach tej placówki.":
    "- Risk scoring: a model trained on {n} of this clinic's visits.",
  "- Ocena ryzyka: za mało historii ({n} wizyt) — podana jest częstość bazowa.":
    "- Risk scoring: not enough history ({n} visits) — the base rate is shown.",
  "- Odpowiedzi pacjentów w skrzynce: {n}.": "- Patient replies in the inbox: {n}.",
  "- Pacjenci dryfujący (pół roku ciszy): {n}": "- Drifting patients (six months of silence): {n}",
  "- Po pierwszej wizycie bez kolejnej: {n}": "- First visit, no follow-up: {n}",
  "- Po wizycie w tym tygodniu, bez odpowiedzi: {n}": "- Seen this week, no reply: {n}",
  "- Recall do zrobienia: {n}": "- Recall due: {n}",
  "- Wizyty: {done} odbytych, {ns} nieobecności, {c} odwołanych.":
    "- Visits: {done} completed, {ns} no-shows, {c} cancelled.",
  "- {h} z {all} najbliższych wizyt ma ryzyko nieobecności ≥ 30%.":
    "- {h} of the {all} nearest visits carry a no-show risk of 30% or more.",
  "Analizuje, wyciąga wnioski, przygotowuje — decyzja należy do Ciebie. Dane pacjentów nie wychodzą poza tę instalację, a żadna wiadomość nie wychodzi bez zatwierdzenia.":
    "It analyses, draws conclusions and prepares — the decision is yours. Patient data never leaves this installation, and no message goes out without approval.",
  "Audytorium draftu PRM_Agent: {title}": "Audience of the PRM_Agent draft: {title}",
  "Bez szablonu — tylko segment": "No template — segment only",
  Brief: "Brief",
  "Brief PRM Core — {day}": "PRM Core brief — {day}",
  "Brief dla zarządu — {day}": "Leadership brief — {day}",
  "Brief powstanie po pierwszym nocnym liczeniu sygnałów.":
    "The brief appears after the first nightly signals run.",
  "Co proponuje agent": "What the agent proposes",
  "Co się zmieniło (30 dni wobec poprzednich 30)": "What changed (30 days against the 30 before)",
  "Czeka na decyzję": "Awaiting a decision",
  Czynniki: "Factors",
  Dalej: "Next",
  "Decyzję o drafcie może podjąć osoba z prawem do zmian.":
    "Only someone with change rights can decide on a draft.",
  "Dodaj drugie przypomnienie SMS 2 godziny przed wizytą{scope}. Jeśli to jedna pora dnia albo jeden dzień tygodnia, sprawdź listę wizyt zagrożonych nieobecnością na pulpicie.":
    "Add a second SMS reminder 2 hours before the visit{scope}. If it is one time of day or one weekday, check the at-risk visits list on the dashboard.",
  Draft: "Draft",
  "Draft odrzucony. Wróci najwcześniej za 14 dni.":
    "Draft rejected. It will not come back for at least 14 days.",
  "Draft odrzucony: {title} ({who}).": "Draft rejected: {title} ({who}).",
  "Draft zatwierdzony": "Draft approved",
  "Draft zatwierdzony i przekazany do wysyłki: {title} — {n} odbiorców, szablon „{tpl}” ({who}).":
    "Draft approved and handed to sending: {title} — {n} recipients, template “{tpl}” ({who}).",
  "Draft zatwierdzony: {title} — segment „{seg}” z {n} kontaktami gotowy w Wysyłkach ({who}).":
    "Draft approved: {title} — segment “{seg}” with {n} contacts ready in Sends ({who}).",
  Drafty: "Drafts",
  "Dzień dobry {{firstName}}, dawno się nie widzieliśmy. Jeśli chcą Państwo nadal otrzymywać od nas informacje o badaniach i terminach, nie trzeba nic robić — a jeśli nie, wystarczy jedno kliknięcie w link poniżej.":
    "Hello {{firstName}}, it has been a while. If you would like to keep receiving news about check-ups and appointments from us, there is nothing to do — if not, one click on the link below is enough.",
  "Dzień dobry {{firstName}}, dziękujemy za wizytę u nas. Jeśli chcą Państwo umówić wizytę kontrolną, wystarczy odpowiedzieć na tę wiadomość albo zadzwonić do rejestracji.":
    "Hello {{firstName}}, thank you for visiting us. To book a follow-up, simply reply to this message or call the front desk.",
  "Dzień dobry {{firstName}}, minął rok od Państwa ostatniej wizyty. Zapraszamy na kontrolę — odpowiedź TAK, a znajdziemy dogodny termin.":
    "Hello {{firstName}}, a year has passed since your last visit. We invite you for a check-up — reply YES and we will find a convenient time.",
  "Jedna odbyta wizyta 1–12 miesięcy temu i nic umówionego.":
    "One completed visit 1–12 months ago and nothing booked.",
  "Jedna odbyta wizyta 1–12 miesięcy temu i nic umówionego. Druga wizyta decyduje, czy pacjent zostaje.":
    "One completed visit 1–12 months ago and nothing booked. The second visit decides whether a patient stays.",
  "Kampania przekazana do wysyłki": "Campaign handed to sending",
  "Kampania w Wysyłkach": "Campaign in Sends",
  "Kampania wystartuje z tym opublikowanym szablonem — treść powyżej to podpowiedź dla jego autora.":
    "The campaign starts with this published template — the text above is a hint for its author.",
  "Lista do obdzwonienia dla rejestracji — zakładka PRM_Agent → Listy.":
    "A call list for the front desk — PRM_Agent → Lists.",
  Listy: "Lists",
  "Nadchodzące wizyty z ryzykiem nieobecności co najmniej 30%, z czynnikami.":
    "Upcoming visits with a no-show risk of 30% or more, with the factors.",
  "Następna wizyta": "Next visit",
  "Nic pilnego. Rekomendacje pojawią się, gdy nocne liczenie sygnałów znajdzie coś, co odbiega od poprzedniego okresu.":
    "Nothing urgent. Recommendations appear when the nightly signals run finds something that departs from the previous period.",
  "Nie ma takiego draftu.": "No such draft.",
  "Nie udało się zapisać decyzji": "Could not save the decision",
  "Nieobecności wzrosły: {prev} → {now}": "No-shows rose: {prev} → {now}",
  "Nieobecności wzrosły: {where} — {prev} → {now}": "No-shows rose: {where} — {prev} → {now}",
  "Nikogo na tej liście — albo sygnały nie były jeszcze liczone.":
    "Nobody on this list — or the signals have not been computed yet.",
  "Notatka (opcjonalnie)": "Note (optional)",
  Odrzucony: "Rejected",
  "Ostatnia wizyta": "Last visit",
  "Ostatnia wizyta ponad rok temu i nic umówionego.":
    "Last visit over a year ago and nothing booked.",
  "Ostatnia wizyta ponad rok temu i nic umówionego. To pacjenci, którzy znają placówkę — najtańsi do odzyskania.":
    "Last visit over a year ago and nothing booked. These patients know the clinic — the cheapest to win back.",
  "Ostatnie 30 dni wobec poprzednich 30, z {n} rozstrzygniętych wizyt. Wzrost o {pp} punktów procentowych.":
    "The last 30 days against the 30 before, from {n} settled visits. A rise of {pp} percentage points.",
  "Otwarcia e-maili spadły: {prev} → {now}": "E-mail opens fell: {prev} → {now}",
  "PRM_Agent — PRM Core": "PRM_Agent — PRM Core",
  Pilne: "Urgent",
  "Porównaj tematy i nadawcę ostatnich kampanii z poprzednimi; sprawdź, czy domena wysyłkowa nie trafiła na listę ostrzeżeń.":
    "Compare the subjects and sender of the recent campaigns with the earlier ones; check whether the sending domain has landed on a warning list.",
  "Powstanie segment z odbiorcami; kampanię uruchomisz w Wysyłkach, gdy szablon będzie gotowy.":
    "A segment with the recipients is created; start the campaign in Sends once the template is ready.",
  "Przed nami": "Ahead",
  "Przekazany do wysyłki": "Handed to sending",
  "Pół roku bez wizyty, bez otwartego e-maila i bez odpowiedzi.":
    "Six months without a visit, an opened e-mail or a reply.",
  "Pół roku bez wizyty, bez otwartego e-maila i bez odpowiedzi. Część z nich odeszła po cichu.":
    "Six months without a visit, an opened e-mail or a reply. Some of them have quietly left.",
  "Reaktywacja — pół roku bez kontaktu": "Reactivation — six months without contact",
  "Recall — pacjenci bez wizyty od roku": "Recall — patients with no visit for a year",
  Rekomendacje: "Recommendations",
  Rozstrzygnięte: "Decided",
  Ryzyko: "Risk",
  "Segment „{name}” gotowy w Wysyłkach": "Segment “{name}” ready in Sends",
  "Segment „{name}” jest gotowy. Wybierz go w Wysyłkach z dowolnym szablonem.":
    "Segment “{name}” is ready. Pick it in Sends with any template.",
  "Skopiowano brief.": "Brief copied.",
  "Szablon do wysyłki": "Template to send",
  "Szablon „{name}” nie jest opublikowany.": "Template “{name}” is not published.",
  "Telefon dzień wcześniej do pacjentów z tej listy — zakładka PRM_Agent → Listy.":
    "A call the day before to the patients on this list — PRM_Agent → Lists.",
  "Ten draft został już rozstrzygnięty.": "This draft has already been decided.",
  "Treść (z polami {{firstName}} itd.)": "Text (with fields such as {{firstName}})",
  Uwaga: "Warning",
  "Wizyta w ostatnich 7 dniach, brak odpowiedzi i nic umówionego.":
    "A visit in the last 7 days, no reply and nothing booked.",
  "Wizyta w ostatnich 7 dniach, brak odpowiedzi od tego czasu i nic umówionego.":
    "A visit in the last 7 days, no reply since and nothing booked.",
  "Wizyty zagrożone nieobecnością": "Visits at risk of a no-show",
  "Wysyłka rusza z limitami i bramką zgód Wysyłek — jak każda inna kampania.":
    "It goes out with the limits and consent gate of Sends — like any other campaign.",
  "Z czynnikami przy każdej: wyprzedzenie rezerwacji, wcześniejsze nieobecności, pora, brak telefonu.":
    "With the factors for each: booking lead time, earlier no-shows, time of day, no phone number.",
  "Z liczb tej instalacji, bez modelu językowego. Do wklejenia w e-mail albo na spotkanie.":
    "From this installation's numbers, with no language model. Ready to paste into an e-mail or bring to a meeting.",
  "Z {n} wysyłek w ostatnich 30 dniach. Taki spadek rzadko bierze się z treści — częściej z nadawcy, tematu albo godziny wysyłki.":
    "From {n} sends in the last 30 days. A drop like this rarely comes from the content — more often from the sender, the subject or the sending hour.",
  "Zaproszenie po pierwszej wizycie": "Invitation after the first visit",
  Zatwierdzony: "Approved",
  Zatwierdź: "Approve",
  "Zatwierdź draft kampanii reaktywacyjnej; kto nie zareaguje, wychodzi z aktywnej bazy.":
    "Approve the reactivation campaign draft; whoever does not respond leaves the active base.",
  "Zatwierdź draft kampanii recall (SMS albo e-mail) — audytorium jest gotowe.":
    "Approve the recall campaign draft (SMS or e-mail) — the audience is ready.",
  "Zatwierdź draft zaproszenia na wizytę kontrolną.": "Approve the follow-up invitation draft.",
  "Zauważone {when}": "Noticed {when}",
  "bez porównania": "no comparison",
  "o {n} pp": "by {n} pp",
  uwaga: "watch",
  "{n} nadchodzących wizyt z ryzykiem nieobecności ≥ 30%":
    "{n} upcoming visits with a no-show risk ≥ 30%",
  "{n} odbiorców · zaproponowany {when}": "{n} recipients · proposed {when}",
  "{n} pacjentów dryfuje": "{n} patients are drifting",
  "{n} pacjentów ma recall do zrobienia": "{n} patients have a recall due",
  "{n} pacjentów po pierwszej wizycie bez kolejnej":
    "{n} patients after a first visit with no follow-up",
  "{n} pacjentów po wizycie bez odpowiedzi": "{n} patients seen with no reply",
  "Żaden draft nie czeka na decyzję. Agent proponuje kampanię, gdy za sygnałem stoi wystarczająco dużo pacjentów — np. recall dla 10 i więcej osób.":
    "No draft is awaiting a decision. The agent proposes a campaign when enough patients stand behind a signal — e.g. a recall for 10 or more people.",
  "Żadna wiadomość nie wyszła bez zatwierdzenia. Drafty czekają w PRM_Agent → Drafty.":
    "No message went out without approval. Drafts are waiting in PRM_Agent → Drafts.",
};
