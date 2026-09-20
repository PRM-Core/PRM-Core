/** PRM Engine: step results, dry run, runner, supervisor findings, AI agent tools. */
export const engine: Record<string, string> = {
  tak: "yes",
  nie: "no",
  wszystkie: "all",
  Dodano: "Added",
  "Dodano do": "Added to",
  "Usunięto z": "Removed from",
  "godz.": "h",
  "(brak)": "(none)",

  // Actions
  "Krok pominięty — nie wybrano szablonu.": "Step skipped — no template selected.",
  "Brak opublikowanej treści szablonu „{templateName}”. Zapisz automatyzację ponownie, aby wysłać jej szablony na serwer.":
    "No published content for template “{templateName}”. Save the automation again to send its templates to the server.",
  "Kontakt nie ma adresu e-mail.": "The contact has no email address.",
  "Brak zgody na wysyłkę.": "No consent to send.",
  "Wysyłka e-maila nie powiodła się: {message}": "Email sending failed: {message}",
  "Krok pominięty — nie wybrano szablonu SMS.": "Step skipped — no SMS template selected.",
  "Brak opublikowanej treści szablonu SMS „{templateName}”. Zapisz automatyzację ponownie.":
    "No published content for SMS template “{templateName}”. Save the automation again.",
  "Kontakt nie ma numeru telefonu.": "The contact has no phone number.",
  "Wysłano SMS na {phone} (nadawca „{value}”).": "SMS sent to {phone} (sender “{value}”).",
  "Wysyłka SMS nie powiodła się: {message}": "SMS sending failed: {message}",
  "Krok pominięty — nie wybrano szablonu pop-upu.": "Step skipped — no pop-up template selected.",
  "Brak opublikowanej treści pop-upu „{templateName}”. Zapisz automatyzację ponownie, aby wysłać jej szablony na serwer.":
    "No published content for pop-up “{templateName}”. Save the automation again to send its templates to the server.",
  "Pop-up „{name}” już czeka w kolejce tego pacjenta — nie dodano drugiej kopii.":
    "Pop-up “{name}” is already in this patient's queue — no second copy added.",
  "Pop-up „{name}” zakolejkowany dla pacjenta — pokaże się przy najbliższej wizycie na stronie z kodem śledzącym.":
    "Pop-up “{name}” queued for the patient — it will show on their next visit to a page with the tracking code.",
  "Krok pominięty — nie wybrano lejka i etapu.": "Step skipped — no funnel and stage selected.",
  "Lejek „{v0}” już nie istnieje.": "Funnel “{v0}” no longer exists.",
  "Etap „{v0}” nie istnieje już w lejku „{name}”.":
    "Stage “{v0}” no longer exists in funnel “{name}”.",
  "Przeniesiono do etapu „{label}” w lejku „{name}”.":
    "Moved to stage “{label}” in funnel “{name}”.",
  "Krok pominięty — nie wybrano lejka.": "Step skipped — no funnel selected.",
  "Lejek „{name}” nie ma żadnych etapów.": "Funnel “{name}” has no stages.",
  "Pacjent jest już w lejku „{name}” (etap „{v1}”) — nie zmieniono etapu.":
    "The patient is already in funnel “{name}” (stage “{v1}”) — stage not changed.",
  "Przypisano do lejka „{name}”, etap „{label}”{movedFrom}.":
    "Assigned to funnel “{name}”, stage “{label}”{movedFrom}.",
  "Pacjent nie był przypisany do żadnego lejka.": "The patient was not in any funnel.",
  "Usunięto z lejka „{v0}”.": "Removed from funnel “{v0}”.",
  "Pole „{v0}” nie jest zapisywalne. Dozwolone: {v1}.":
    "Field “{v0}” is not writable. Allowed: {v1}.",
  "„{value}” nie jest poprawnym statusem (active/lead/patient/inactive).":
    "“{value}” is not a valid status (active/lead/patient/inactive).",
  "Pole {column} ma już wartość „{value}”.": "Field {column} already has the value “{value}”.",
  "Ustawiono {column} = „{value}”.": "Set {column} = “{value}”.",
  "Krok pominięty — nie podano tagu.": "Step skipped — no tag given.",
  "{v0} tag „{tag}”.": "{v0} tag “{tag}”.",
  "Tag „{tag}” bez zmian (kontakt już był w tym stanie).":
    "Tag “{tag}” unchanged (the contact was already in this state).",
  "Krok pominięty — nie podano segmentu.": "Step skipped — no segment given.",
  "{v0} segmentu „{segment}”.": "{v0} segment “{segment}”.",
  "Segment „{segment}” bez zmian (kontakt już był w tym stanie).":
    "Segment “{segment}” unchanged (the contact was already in this state).",
  "Oznaczono kontakt jako „nie kontaktować”.": "Contact marked “do not contact”.",
  "PRM Engine — symulacja powiadomienia push:\n{content}":
    "PRM Engine — simulated push notification:\n{content}",
  "Powiadomienie push zasymulowane (brak infrastruktury push — zapisano notatkę).":
    "Push notification simulated (no push infrastructure — a note was saved).",
  "Koniec procesu.": "End of workflow.",
  "Kontakt usunięty z bazy.": "Contact deleted from the database.",
  "Punktacja nie istnieje jeszcze jako pole kontaktu — krok pominięty.":
    "The score does not exist as a contact field yet — step skipped.",
  "Nieznana akcja „{key}” — krok pominięty.": "Unknown action “{key}” — step skipped.",
  "Błąd wykonania akcji „{key}”: {v1}": "Error running action “{key}”: {v1}",
  "Rozgałęzienie nie ma żadnej odnogi — przebieg zatrzymany.":
    "The branch step has no branches — run stopped.",
  "Odnoga „{label}” (bez filtra — pozostali).": "Branch “{label}” (no filter — everyone else).",
  "Odnoga „{label}” — filtr spełniony ({v1} z {length}).":
    "Branch “{label}” — filter matched ({v1} of {length}).",
  "Żadna odnoga nie pasowała — kontakt skierowany na ostatnią („{label}”).":
    "No branch matched — the contact was sent to the last one (“{label}”).",
  "Kontakt nie istnieje — warunek niespełniony.": "The contact does not exist — condition not met.",
  "Segment dynamiczny „{segment}”: {v1}.": "Dynamic segment “{segment}”: {v1}.",
  "Segment „{segment}”: {v1}.": "Segment “{segment}”: {v1}.",
  "Tag „{tag}”: {v1}.": "Tag “{tag}”: {v1}.",
  "Nieznane pole „{v0}” — warunek niespełniony.": "Unknown field “{v0}” — condition not met.",
  "Pole {label} („{value}”) {v2} „{v3}”: {v4}.": "Field {label} (“{value}”) {v2} “{v3}”: {v4}.",
  "Kontakt otworzył wcześniejszą wiadomość.": "The contact opened an earlier message.",
  "Brak zarejestrowanego otwarcia wiadomości.": "No recorded message open.",
  "Kontakt ma status „nie kontaktować”.": "The contact has the “do not contact” status.",
  "Kontakt nie ma statusu „nie kontaktować”.":
    "The contact does not have the “do not contact” status.",
  "Nieznany warunek „{key}” — traktowany jako niespełniony.":
    "Unknown condition “{key}” — treated as not met.",

  // Dry run
  "Nie wybrano szablonu — silnik pominie ten krok.":
    "No template selected — the engine will skip this step.",
  "Szablon „{template}” nie jest opublikowany na serwerze — krok zakończy się błędem. Zapisz automatyzację ponownie.":
    "Template “{template}” is not published on the server — the step will fail. Save the automation again.",
  "Wysłałby SMS „{template}”, ale ten kontakt nie ma numeru telefonu — krok zostanie pominięty.":
    "Would send SMS “{template}”, but this contact has no phone number — the step will be skipped.",
  "Brak zgody — krok zostanie pominięty.": "No consent — the step will be skipped.",
  "Wysłałby SMS „{template}”, ale nie ma skonfigurowanego nadawcy — krok skończy się błędem.":
    "Would send SMS “{template}”, but no sender is configured — the step will fail.",
  "Wysłałby SMS „{template}” na {phone} od „{value}”{v3}.":
    "Would send SMS “{template}” to {phone} from “{value}”{v3}.",
  " (nadawca jednokierunkowy — pacjent nie odpisze)":
    " (one-way sender — the patient cannot reply)",
  "Zakolejkowałby pop-up „{template}” — pokazałby się przy najbliższej wizycie tego pacjenta na stronie.{v1}":
    "Would queue pop-up “{template}” — it would show on this patient's next website visit.{v1}",
  " (Ten pacjent ma już coś w kolejce pop-upów.)":
    " (This patient already has something in the pop-up queue.)",
  "Wysłałby „{template}”, ale ten kontakt nie ma adresu e-mail — krok zostanie pominięty.":
    "Would send “{template}”, but this contact has no email address — the step will be skipped.",
  "Wysłałby e-mail „{subject}” na {email}.": "Would send email “{subject}” to {email}.",
  "Nie podano tagu — krok zostanie pominięty.": "No tag given — the step will be skipped.",
  "Usunąłby tag „{tag}”.": "Would remove tag “{tag}”.",
  "Usunąłby tag „{tag}”, ale kontakt go nie ma — bez zmian.":
    "Would remove tag “{tag}”, but the contact does not have it — no change.",
  "Dodałby tag „{tag}”, ale kontakt już go ma — bez zmian.":
    "Would add tag “{tag}”, but the contact already has it — no change.",
  "Dodałby tag „{tag}”.": "Would add tag “{tag}”.",
  "Nie podano segmentu — krok zostanie pominięty.": "No segment given — the step will be skipped.",
  "Usunąłby z segmentu „{segment}”{v1}.": "Would remove from segment “{segment}”{v1}.",
  "Dodałby do segmentu „{segment}”{v1}.": "Would add to segment “{segment}”{v1}.",
  " — kontakt już w nim jest": " — the contact is already in it",
  " — kontakt i tak w nim nie jest": " — the contact is not in it anyway",
  "Nie wybrano lejka lub etapu — krok zostanie pominięty.":
    "No funnel or stage selected — the step will be skipped.",
  "Przeniósłby pacjenta na etap „{stage}” w lejku „{funnel}”.":
    "Would move the patient to stage “{stage}” in funnel “{funnel}”.",
  "Nie wybrano lejka — krok zostanie pominięty.": "No funnel selected — the step will be skipped.",
  "Pacjent jest już w lejku „{funnelName}” — krok zostanie pominięty, etap bez zmian.":
    "The patient is already in funnel “{funnelName}” — the step will be skipped, stage unchanged.",
  "Przeniósłby pacjenta do lejka „{funnelName}”{target} (obecnie jest w innym lejku).":
    "Would move the patient to funnel “{funnelName}”{target} (currently in another funnel).",
  "Przypisałby pacjenta do lejka „{funnelName}”{target}.":
    "Would assign the patient to funnel “{funnelName}”{target}.",
  "Wypisałby pacjenta z lejka.": "Would remove the patient from the funnel.",
  "Wypisałby z lejka — pacjent i tak nie jest w żadnym, krok zostanie pominięty.":
    "Would remove from the funnel — the patient is not in any, so the step will be skipped.",
  "Nie wskazano pola — krok zostanie pominięty.": "No field given — the step will be skipped.",
  "Ustawiłby pole „{field}” na „{value}”.": "Would set field “{field}” to “{value}”.",
  "Oznaczyłby „nie kontaktować” — kontakt już jest tak oznaczony.":
    "Would mark “do not contact” — the contact is already marked.",
  "Oznaczyłby kontakt jako „nie kontaktować”.": "Would mark the contact “do not contact”.",
  "Zapisałby notatkę — powiadomienia push są symulowane, system nie ma tej integracji.":
    "Would save a note — push notifications are simulated, the system has no such integration.",
  "Krok bez efektu — punktacja nie istnieje jako pole kontaktu.":
    "Step without effect — the score does not exist as a contact field.",
  "USUNĄŁBY ten kontakt z bazy i zakończył przebieg.":
    "Would DELETE this contact from the database and end the run.",
  "Nieznana akcja „{key}” — krok zostanie pominięty.":
    "Unknown action “{key}” — the step will be skipped.",
  "Ta automatyzacja nie ma jeszcze scenariusza.": "This automation has no workflow yet.",
  "Nie znaleziono kontaktu.": "Contact not found.",
  "Scenariusz nie ma wyzwalacza.": "The workflow has no trigger.",
  "Wejście do scenariusza. Uwaga: kontakt ma tag „nie-kontaktowac” — agent AI odmówi wysyłki, kroki deterministyczne zadziałają normalnie.":
    "Entering the workflow. Note: the contact has the “nie-kontaktowac” tag — the AI agent will refuse to send, deterministic steps will run normally.",
  "Wejście do scenariusza.": "Entering the workflow.",
  "Krok nie istnieje": "Step does not exist",
  "Krawędź prowadzi do kroku, którego nie ma w scenariuszu.":
    "A connection leads to a step that is not in the workflow.",
  "Pacjent czekałby tutaj {v0} {unit}.": "The patient would wait here {v0} {unit}.",
  "Losowy podział: {v0}. W podglądzie idziemy najczęstszym wariantem — realny pacjent trafia losowo.":
    "Random split: {v0}. The preview takes the most common variant — a real patient is assigned at random.",
  "Agent AI oceniłby kontakt na żywo i wybrał jedną ze ścieżek: {v0}. Podgląd nie wywołuje modelu (koszt i nieprzewidywalność) — idziemy pierwszą ścieżką.":
    "The AI agent would assess the contact live and choose one of the paths: {v0}. The preview does not call the model (cost and unpredictability) — it takes the first path.",

  // Runner
  "Zdarzenie {type} pominięte — kontakt jest już w trakcie tej automatyzacji.":
    "Event {type} skipped — the contact is already going through this automation.",
  "Uruchomiono „{name}” po zdarzeniu {type}.": "Started “{name}” after event {type}.",
  "Oczekiwanie {amount} {v1}.": "Waiting {amount} {v1}.",
  "Split: wariant „{label}” ({weight}/{total}).": "Split: variant “{label}” ({weight}/{total}).",
  "Błąd dopasowania zdarzenia {type}: {v1}": "Error matching event {type}: {v1}",
  "Nieobsłużony błąd kroku: {v0}": "Unhandled step error: {v0}",
  "Błąd obsługi wysyłek: {v0}": "Error handling sends: {v0}",

  // Supervisor
  "„{v0}” — {count} nieudanych przebiegów": "“{v0}” — {count} failed runs",
  "Powtarzający się błąd kroku{v0} ({count}×)": "Recurring step error{v0} ({count}×)",
  "„{name}” jest aktywna, ale nie ma czym wysłać":
    "“{name}” is active but has nothing to send with",
  "„{name}” wymaga kluczy, których nie skonfigurowano":
    "“{name}” needs keys that are not configured",
  "„{name}” — wyzwalacz nie prowadzi do żadnego kroku": "“{name}” — the trigger leads to no step",
  "„{name}” jest aktywna, ale scenariusz jest niespójny":
    "“{name}” is active, but the workflow is inconsistent",
  "„{v0}” — {count} przebiegów stoi w miejscu": "“{v0}” — {count} runs are stuck",
  "{length} kroków przerwanych w trakcie wykonania": "{length} steps interrupted while running",
  "Węzeł AI zawsze wybiera „{path}”{v1}": "The AI step always chooses “{path}”{v1}",
  "Dzienny limit kosztów AI wyczerpany": "Daily AI cost limit reached",
  "Dzienny limit kosztów AI na {v0}%": "Daily AI cost limit at {v0}%",
  "{count} odrzuconych wywołań webhooka leadów": "{count} rejected lead webhook calls",
  "Nietypowy przyrost kontaktów: {todayCount} dzisiaj":
    "Unusual growth in contacts: {todayCount} today",

  // AI agent tools
  "Wybierz ścieżkę, którą ma dalej pójść ten pacjent. Wywołaj dokładnie raz, na końcu, po ewentualnych innych narzędziach.":
    "Choose the path this patient should take next. Call exactly once, at the end, after any other tools.",
  "Identyfikator ścieżki. Dostępne: {v0}": "Path identifier. Available: {v0}",
  "Krótkie uzasadnienie po polsku — trafi na oś czasu pacjenta, więc pisz zrozumiale dla marketingowca.":
    "A short justification in English — it goes on the patient's timeline, so write it so a marketer understands it.",
  "Zapisz notatkę na karcie pacjenta.": "Save a note on the patient card.",
  "Dodaj tagi pacjentowi.": "Add tags to the patient.",
  "Usuń tagi, które są już nieaktualne (np. pacjent przestał być leadem). Nie usuwaj tagów, których znaczenia nie rozumiesz.":
    "Remove tags that are out of date (e.g. the patient is no longer a lead). Do not remove tags whose meaning you do not understand.",
  "Napisz i wyślij wiadomość do pacjenta. Opieraj treść wyłącznie na bazie wiedzy i danych pacjenta — nie obiecuj terminów, cen ani efektów leczenia, których nie masz w materiałach. Podpisz się jako placówka, nie jako AI.":
    "Write and send a message to the patient. Base it only on the knowledge base and the patient's data — do not promise appointments, prices or treatment results that are not in the materials. Sign as the clinic, not as AI.",
  "Kanał wysyłki. SMS tylko dla krótkich, konkretnych treści.":
    "Channel. SMS only for short, specific messages.",
  "Temat — wymagany dla e-maila, pomijany przy SMS.":
    "Subject — required for email, ignored for SMS.",
  "Treść wiadomości, zwykłym tekstem, po polsku.": "Message text, plain text, in English.",
  "Przypisz pacjenta do JUŻ ISTNIEJĄCEGO segmentu nadawanego wprost. Nazwa musi być dokładnie jedną z podanych — inna zostanie odrzucona. Segmentów z warunkami nie ma na tej liście, bo do nich się nie przypisuje: pacjent trafia tam sam, gdy zacznie spełniać warunki.":
    "Assign the patient to an ALREADY EXISTING manually assigned segment. The name must be exactly one of those given — any other is rejected. Segments with conditions are not on this list, because you do not assign to them: a patient joins them by themselves when they meet the conditions.",
  "Dokładna nazwa segmentu z modułu Segmenty.": "The exact segment name from the Segments module.",
  "Utwórz NOWY segment w module Segmenty i przypisz do niego pacjenta. Segment będzie widoczny w module Segmenty i obejmie wszystkich pacjentów z tą etykietą. Używaj tylko, gdy żaden istniejący segment nie pasuje, a zachowanie pacjenta jest powtarzalnym wzorcem.":
    "Create a NEW segment in the Segments module and assign the patient to it. The segment will be visible in the Segments module and will include all patients with this label. Use only when no existing segment fits and the patient's behaviour is a recurring pattern.",
  "Krótka, opisowa nazwa segmentu.": "A short, descriptive segment name.",
  "Po co jest ten segment i kogo ma obejmować — zobaczy to marketingowiec w module Segmenty.":
    "What this segment is for and whom it should include — a marketer will see this in the Segments module.",
  "{description} (segment utworzony przez PRM_Agent)":
    "{description} (segment created by PRM_Agent)",
  "Segment utworzony przez PRM_Agent.": "Segment created by PRM_Agent.",
  "PRM_Agent: {text}": "PRM_Agent: {text}",
  "{v0}\n\nZdecyduj, którą ścieżką poprowadzić tego pacjenta.":
    "{v0}\n\nDecide which path this patient should take.",
  "PRM_Agent skierował pacjenta na ścieżkę „{label}”. Uzasadnienie: {v1}":
    "PRM_Agent routed the patient to path “{label}”. Reasoning: {v1}",
  "PRM_Agent wybrał ścieżkę „{label}”{note}. {reasoning}":
    "PRM_Agent chose path “{label}”{note}. {reasoning}",
};
