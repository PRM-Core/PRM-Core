/** PRM_Agent — directions of development, the agent's self-training report, and the local-only language layer (2.0.0). */
export const agentDirections: Record<string, string> = {
  "- Agent nie ma jeszcze zatwierdzonych przykładów do nauki.":
    "- The agent has no approved examples to learn from yet.",
  "- Kierunki rozwoju czekające na decyzję administratora: {n} (PRM_Agent → Kierunki).":
    "- Directions of development awaiting the administrator's decision: {n} (PRM_Agent → Directions).",
  "- Model nieobecności: o {v} lepszy niż sama częstość bazowa{prev}.":
    "- No-show model: {v} better than the base rate alone{prev}.",
  "- Włączone kierunki rozwoju: {n}; nic nie czeka na decyzję.":
    "- Directions enabled: {n}; nothing awaits a decision.",
  "Agent nie ma jeszcze propozycji. Pojawią się, gdy będzie miał podstawy — np. serwer modelu w sieci placówki, pierwszy zatwierdzony draft albo lukę w danych.":
    "The agent has no proposals yet. They appear when it has grounds — e.g. a model server inside the clinic's network, a first approved draft or a gap in the data.",
  "Agent proponuje {n} kierunków rozwoju — czekają na Twoją decyzję.":
    "The agent proposes {n} directions of development — they await your decision.",
  "Agent rozwija się sam: co noc uczy model nieobecności na historii tej placówki, zapamiętuje, co zespół zatwierdził, i proponuje, co mógłby robić dalej. Każdy nowy kierunek czeka tu na decyzję administratora — nic nie rusza samo.":
    "The agent develops on its own: every night it trains the no-show model on this clinic's history, remembers what the team approved, and proposes what it could do next. Every new direction waits here for the administrator's decision — nothing starts by itself.",
  "Bez telefonu": "No phone",
  "Bez telefonu nie ma SMS-a, przypomnienia tuż przed wizytą ani szybkiego kontaktu z rejestracji; model ryzyka liczy to jako czynnik nieobecności.":
    "Without a phone there is no SMS, no reminder just before the visit and no quick call from the front desk; the risk model counts it as a no-show factor.",
  "Brak PRM_AI_LOCAL_URL albo PRM_AI_LOCAL_MODEL w .env — funkcje językowe nie działają, reszta agenta tak.":
    "PRM_AI_LOCAL_URL or PRM_AI_LOCAL_MODEL is missing in .env — the language features do not work, the rest of the agent does.",
  "Brief wygładzany przez model": "Brief polished by the model",
  "Co agent może robić z modelem — pisać treść draftów, wygładzać brief, oceniać wiadomości — włącza administrator na ekranie PRM_Agent → Kierunki. Agent sam proponuje, kiedy ma do tego podstawy.":
    "What the agent may do with the model — write draft texts, polish the brief, triage messages — is enabled by the administrator on PRM_Agent → Directions. The agent proposes it itself when it has grounds.",
  "Co najmniej jedna piąta kontaktów nie ma numeru telefonu.":
    "At least a fifth of the contacts have no phone number.",
  "Co noc brief dla zarządu dostaje wersję w pełnych zdaniach. Przyjmowana tylko wtedy, gdy zachowa każdą liczbę szablonu; inaczej zostaje szablon.":
    "Every night the leadership brief gets a version in full sentences. Accepted only when it keeps every number of the template; otherwise the template stays.",
  "Decyzja: {who}, {when}": "Decision: {who}, {when}",
  "Dlaczego teraz: {why}": "Why now: {why}",
  "Gdzie działa warstwa językowa agenta. Jedyna możliwość: model w sieci placówki — produkt nie ma dostawców zewnętrznych.":
    "Where the agent's language layer runs. The only option: a model inside the clinic's network — the product has no external providers.",
  "Jak rozwija się agent": "How the agent is developing",
  "Kierunek odrzucony. Możesz go włączyć później na tej liście.":
    "Direction declined. You can enable it later on this list.",
  "Kierunek odrzucony: {title} ({who}).": "Direction declined: {title} ({who}).",
  "Kierunek włączony — agent zacznie od najbliższego przebiegu.":
    "Direction enabled — the agent starts with its next run.",
  "Kierunek włączony: {title} ({who}).": "Direction enabled: {title} ({who}).",
  "Kierunek „{title}” czeka na decyzję administratora (PRM_Agent → Kierunki).":
    "The direction “{title}” awaits the administrator's decision (PRM_Agent → Directions).",
  Kierunki: "Directions",
  "Kierunki rozwoju agenta ustala administrator.":
    "The agent's directions of development are set by the administrator.",
  "Kontakty bez numeru telefonu — rejestracja dopyta przy najbliższym kontakcie.":
    "Contacts without a phone number — the front desk asks at the next contact.",
  "Model językowy jest wyłączony (PRM_AI_MODE=off). Wskaż serwer modelu w sieci placówki (PRM_AI_LOCAL_URL, PRM_AI_LOCAL_MODEL), żeby włączyć funkcje językowe; reszta agenta działa bez modelu.":
    "The language model is off (PRM_AI_MODE=off). Point to a model server inside the clinic's network (PRM_AI_LOCAL_URL, PRM_AI_LOCAL_MODEL) to enable the language features; the rest of the agent works without a model.",
  "Model językowy wyłączony (PRM_AI_MODE=off)": "Language model off (PRM_AI_MODE=off)",
  "Nie ma takiego kierunku.": "No such direction.",
  "Nowy draft kampanii dostaje tekst napisany przez model w sieci placówki z faktów za sygnałem; szablon zostaje jako wersja zapasowa i do porównania. Do modelu nie trafia żaden pacjent.":
    "A new campaign draft gets a text written by the model inside the clinic's network from the facts behind the signal; the template stays as the fallback and for comparison. No patient reaches the model.",
  "PRM_Agent proponuje kierunek: {title} — czeka na decyzję administratora.":
    "PRM_Agent proposes a direction: {title} — awaiting the administrator's decision.",
  "Pacjenci bez numeru telefonu trafiają na listę dla rejestracji (PRM_Agent → Listy) i do rekomendacji; bez telefonu nie ma SMS-a ani przypomnienia 2 godziny przed wizytą, a model ryzyka widzi to jako czynnik.":
    "Patients without a phone number go on a list for the front desk (PRM_Agent → Lists) and into the recommendations; without a phone there is no SMS and no reminder 2 hours before the visit, and the risk model sees it as a factor.",
  "Pilność, temat i właściciel wiadomości pacjenta oceniane przez model zamiast samych reguł; treść przechodzi przez pseudonimizację, odpowiedź liczy się tylko w ustalonych słownikach.":
    "Urgency, topic and owner of a patient's message assessed by the model instead of the rules alone; the text passes through pseudonymisation, and the answer counts only within the fixed vocabularies.",
  "Pozostałości po wersjach sprzed 2.0.0 w .env": "Leftovers of releases before 2.0.0 in .env",
  "Produkt nie używa: {list}. Usuń te wpisy — nic ich nie czyta, a klucz dostawcy zewnętrznego nie powinien leżeć na serwerze.":
    "The product does not use: {list}. Remove these entries — nothing reads them, and an external provider's key should not lie on the server.",
  "Przykłady zatwierdzone przez zespół (tak piszemy u nas):":
    "Examples approved by the team (this is how we write):",
  "Rejestracja dopyta o numer przy najbliższym kontakcie — lista w PRM_Agent → Listy → Bez telefonu.":
    "The front desk asks for the number at the next contact — the list is in PRM_Agent → Lists → No phone.",
  "Serwer modelu w sieci placówki jest skonfigurowany i odpowiada.":
    "A model server inside the clinic's network is configured and responds.",
  "Treść draftów pisana przez model": "Draft texts written by the model",
  "Triaż wiadomości przez model": "Message triage by the model",
  "Uzupełnianie brakujących telefonów": "Collecting missing phone numbers",
  Włączony: "Enabled",
  "Zaproponowany {when}": "Proposed {when}",
  "model językowy wyłączony (PRM_AI_MODE=off) — żadne zapytanie do modelu nie wychodzi":
    "language model off (PRM_AI_MODE=off) — no request to a model goes out",
  "model w sieci placówki: {host} ({klasa}), model {model}":
    "model inside the clinic's network: {host} ({klasa}), model {model}",
  "tryb local bez PRM_AI_LOCAL_URL / PRM_AI_LOCAL_MODEL — funkcje językowe nie działają":
    "local mode without PRM_AI_LOCAL_URL / PRM_AI_LOCAL_MODEL — the language features do not work",
  "w .env leżą wpisy, których produkt nie używa od 2.0.0: {list} — usuń je, żaden kod ich nie czyta":
    ".env carries entries the product has not used since 2.0.0: {list} — remove them, no code reads them",
  "w sieci placówki, skonfigurowany": "inside the clinic's network, configured",
  "wczoraj {v}": "yesterday {v}",
  "{n} pacjentów bez numeru telefonu": "{n} patients without a phone number",
  "Żadne zapytanie do modelu nie wychodzi z serwera. Sygnały, przewidywania, rekomendacje, listy, drafty z szablonu i brief działają bez modelu. Aby włączyć warstwę językową, wskaż w .env serwer modelu w sieci placówki: PRM_AI_LOCAL_URL i PRM_AI_LOCAL_MODEL.":
    "No request to a model leaves the server. Signals, predictions, recommendations, lists, template drafts and the brief work without a model. To enable the language layer, point .env to a model server inside the clinic's network: PRM_AI_LOCAL_URL and PRM_AI_LOCAL_MODEL.",
  "- Decyzji zespołu zapamiętanych do nauki: {n}.": "- Team decisions kept for learning: {n}.",
  "Nie ma takiej rozmowy.": "No such conversation.",
  "Nie udało się zapisać oceny": "Could not save the assessment",
  "Ocena poprawiona przez: {who}.": "Assessment corrected by: {who}.",
  "Ocena zapisana — agent uczy się z tej decyzji.":
    "Assessment saved — the agent learns from this decision.",
  "Ocenę rozmowy poprawia osoba z prawem do zmian.":
    "Only someone with change rights can correct a conversation's assessment.",
  "Odrzucone. Z włączoną nauką agent wróci z tym dopiero, gdy liczby będą wyraźnie gorsze.":
    "Dismissed. With learning enabled, the agent brings it back only when the numbers are clearly worse.",
  Pilność: "Urgency",
  "Popraw ocenę": "Correct the assessment",
  "Przykłady ocen zespołu (wiadomość → pilność/temat/właściciel):":
    "The team's assessments as examples (message → urgency/topic/owner):",
  "Rekomendacja wraca mimo odrzucenia — liczby są wyraźnie gorsze: {sig}.":
    "A recommendation returns despite its dismissal — the numbers are clearly worse: {sig}.",
  "Triaż poprawiony przez {who}: {label}.": "Triage corrected by {who}: {label}.",
  "Uczenie się z decyzji zespołu": "Learning from the team's decisions",
  Właściciel: "Owner",
  "Zapisz ocenę": "Save the assessment",
  "Zatwierdzone teksty draftów stają się przykładami „tak piszemy u nas”; poprawione przez rejestrację oceny wiadomości — przykładami „tak sortujemy”; odrzucona rekomendacja podnosi próg, przy którym wróci. Przykłady nie opuszczają bazy instalacji.":
    "Approved draft texts become “this is how we write” examples; message assessments corrected by the front desk become “this is how we sort” examples; a dismissed recommendation raises the bar it must clear to return. The examples never leave the installation's database.",
  "Zespół podjął co najmniej jedną decyzję: zatwierdził draft, poprawił ocenę wiadomości albo odrzucił rekomendację.":
    "The team has taken at least one decision: approved a draft, corrected a message assessment or dismissed a recommendation.",
  "Temat sprawy": "Topic",
};
