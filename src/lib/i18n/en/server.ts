/** Server messages: AI features, API functions, auth, campaigns, consent, credentials, demo content. */
export const server: Record<string, string> = {
  "useCanvasContext must be used within CanvasContext.Provider":
    "useCanvasContext must be used within CanvasContext.Provider",
  "od razu": "immediately",
  "w jednej sesji": "in one session",
  "w ciągu 24 godzin": "within 24 hours",
  domenę: "domain",
  "domeny/domen": "domains",

  // AI: contact agent
  "Napisz zwięzłe podsumowanie tego pacjenta dla osoby z recepcji, która za chwilę z nim rozmawia.\n\nStruktura:\n**Kim jest** — 2–3 zdania.\n**Historia** — co się realnie wydarzyło (wizyty, wiadomości, wysyłki).\n**Na co uważać** — brakujące zgody, brakujące dane, sygnały ostrzegawcze.\n**Proponowany następny krok** — jeden, wynikający z faktów i możliwy w ramach zgód.\n\nJeśli danych jest mało, napisz to wprost zamiast rozbudowywać domysły.":
    "Write a concise summary of this patient for a receptionist who is about to talk to them. Answer in English.\n\nStructure:\n**Who they are** — 2–3 sentences.\n**History** — what actually happened (visits, messages, sends).\n**Watch out for** — missing consents, missing data, warning signs.\n**Suggested next step** — one, following from the facts and possible within the consents.\n\nIf there is little data, say so plainly instead of building on guesses.",
  "Brak klucza API dostawcy {providerId} — uzupełnij go w Integracje → Klucze i dane dostępowe albo zmień dostawcę w Ustawieniach → PRM_Agent.":
    "No API key for provider {providerId} — add it in Integrations → Keys and credentials or change the provider in Settings → PRM_Agent.",
  "Dzienny limit kosztów AI wyczerpany ({v0} / {v1} USD). Podnieś go w Ustawieniach → PRM_Agent.":
    "Daily AI cost limit reached ({v0} / {v1} USD). Raise it in Settings → PRM_Agent.",
  "Nie znaleziono pacjenta.": "Patient not found.",
  "PRM_Agent odpowiedział na karcie pacjenta.": "PRM_Agent answered on the patient card.",

  // AI: copilot
  "Policz kontakty w bazie, opcjonalnie filtrując po statusie, segmencie lub tagu. Zwraca też rozbicie po statusach i najczęstsze segmenty.":
    "Count contacts in the database, optionally filtered by status, segment or tag. Also returns a breakdown by status and the most common segments.",
  "Znajdź kontakty po imieniu, nazwisku, e-mailu, telefonie lub PRM ID. Zwraca podstawowe dane, status, segmenty i tagi.":
    "Find contacts by first name, last name, email, phone or PRM ID. Returns basic details, status, segments and tags.",
  "Historia jednego pacjenta: kroki silnika, wiadomości ze skrzynki i notatki. Podaj id kontaktu z find_contacts.":
    "One patient's history: engine steps, inbox messages and notes. Pass the contact id from find_contacts.",
  "Lista automatyzacji: nazwa, status, wyzwalacz i ilu kontaktów przez nie przeszło.":
    "List of automations: name, status, trigger and how many contacts went through them.",
  "Stan silnika i wyniki wysyłek z ostatnich 30 dni: przebiegi wg statusu, kolejka, wysłane e-maile, otwarcia, kliknięcia oraz nieobsłużone spostrzeżenia nadzorcy.":
    "Engine state and send results for the last 30 days: runs by status, queue, emails sent, opens, clicks and unhandled supervisor insights.",
  "Brak klucza API dostawcy {providerId} — uzupełnij go w Integracje → Klucze i dane dostępowe.":
    "No API key for provider {providerId} — add it in Integrations → Keys and credentials.",
  "AI Copilot: „{v0}”.": "AI Copilot: “{v0}”.",
  "AI Copilot: przekroczono limit rund narzędzi bez odpowiedzi.":
    "AI Copilot: tool round limit exceeded without an answer.",
  "Model nie doszedł do odpowiedzi w kilku krokach — spróbuj zapytać prościej.":
    "The model did not reach an answer in several steps — try asking more simply.",
  "AI Copilot: wywołanie zakończone błędem.": "AI Copilot: the call failed.",

  // AI: creative coder
  "Model nie zwrócił żadnych klocków.": "The model returned no blocks.",
  "Wskaż kadry do wycięcia z tego projektu mailingu.":
    "Identify the frames to cut from this email design.",
  "Studio kreacji: {kind} — {v1}.": "Creative studio: {kind} — {v1}.",
  "kodowanie z grafiki": "building from a design",

  // AI: flow builder
  "Dla type=delay: ile jednostek czekać.": "For type=delay: how many units to wait.",
  "Zwraca zaprojektowany scenariusz automatyzacji: wyzwalacz i listę kroków. Wywołaj dokładnie raz.":
    "Returns the designed automation workflow: the trigger and a list of steps. Call exactly once.",
  "Krótka nazwa automatyzacji po polsku.": "A short automation name in English.",
  "Jedno zdanie: co ten scenariusz robi.": "One sentence: what this workflow does.",
  "Kroki w kolejności wykonania.": "Steps in execution order.",
  "Pola kroku. Nazwy szablonów: {v0}.": "Step fields. Template names: {v0}.",
  "Pola kroku.": "Step fields.",
  "Dla type=ai_agent: cel decyzji agenta. Dla type=path/split: nazwa kroku.":
    "For type=ai_agent: the goal of the agent's decision. For type=path/split: the step name.",
  "Dla type=path: odnogi w kolejności sprawdzania. Kontakt schodzi PIERWSZĄ, której filtr spełnia. Ostatnia powinna być bez filtrów („Pozostali”).":
    "For type=path: branches in the order they are checked. A contact takes the FIRST one whose filter it matches. The last one should have no filters (“Everyone else”).",
  "Czy kontakt musi spełnić wszystkie warunki, czy dowolny.":
    "Whether the contact must meet all conditions or any.",
  "Warunki filtra tej odnogi. Puste = odnoga „pozostali”.":
    "Filter conditions for this branch. Empty = the “everyone else” branch.",
  "Dla type=split: warianty testu A/B. `weight` to procent kontaktów; wagi powinny sumować się do 100.":
    "For type=split: A/B test variants. `weight` is the percentage of contacts; weights should add up to 100.",
  "Gałąź „warunek spełniony”.": "The “condition met” branch.",
  "Gałąź „warunek niespełniony”.": "The “condition not met” branch.",
  "Dla type=ai_agent: ścieżki do wyboru przez agenta.":
    "For type=ai_agent: paths for the agent to choose from.",
  "Założenia i braki, po polsku.": "Assumptions and gaps, in English.",
  spełniony: "met",
  niespełniony: "not met",
  Pozostali: "Everyone else",
  "Generator scenariuszy: „{v0}”.": "Workflow generator: “{v0}”.",
  "Model nie zwrócił scenariusza. Odpowiedział: {v0}":
    "The model did not return a workflow. It answered: {v0}",
  "Model nie zwrócił scenariusza. Spróbuj opisać cel bardziej konkretnie.":
    "The model did not return a workflow. Try describing the goal more specifically.",
  "Model nie zaproponował żadnej wykonalnej akcji — doprecyzuj, co ma się wydarzyć.":
    "The model did not suggest any action that can run — clarify what should happen.",
  "Wywołanie modelu nie powiodło się: {v0}": "The model call failed: {v0}",

  // AI: inbox assist, providers, segment builder, supervisor
  "Nie znaleziono rozmowy.": "Conversation not found.",
  "Rozmowa nie ma jeszcze żadnej wiadomości.": "The conversation has no messages yet.",
  "Kanał: {channelName}.\n{profile}\n\nRozmowa:":
    "Channel: {channelName}.\n{profile}\n\nConversation:",
  "Sugestia odpowiedzi w skrzynce ({channel}).": "Inbox reply suggestion ({channel}).",
  "Model nie zwrócił treści — spróbuj ponownie.": "The model returned no text — try again.",
  "Claude Opus 5": "Claude Opus 5",
  "Claude Sonnet 5": "Claude Sonnet 5",
  "Claude Haiku 4.5": "Claude Haiku 4.5",
  "GPT-5.1": "GPT-5.1",
  "GPT-5 mini": "GPT-5 mini",
  "Gemini 3 Pro": "Gemini 3 Pro",
  "Gemini 2.5 Flash": "Gemini 2.5 Flash",
  "Proponuje definicję segmentu. Wywołuj dopiero wtedy, gdy masz wszystkie potrzebne wartości (adresy, tagi, nazwy). Nie zgaduj ich.":
    "Proposes a segment definition. Call it only when you have all the values you need (URLs, tags, names). Do not guess them.",
  "Krótka nazwa segmentu, np. „Zainteresowani implantem”.":
    "A short segment name, e.g. “Interested in implants”.",
  "Jedno zdanie: kogo obejmuje ten segment. Bez liczb.":
    "One sentence: whom this segment includes. No numbers.",
  "Jak łączą się grupy: all = wszystkie muszą pasować, any = wystarczy jedna.":
    "How groups combine: all = all must match, any = one is enough.",
  "Grupy warunków. Najczęściej wystarczy jedna.": "Condition groups. Usually one is enough.",
  "Wartość warunku. Dla zdarzeń: fragment adresu / nazwa usługi / kanał, albo puste = dowolne.":
    "Condition value. For events: part of a URL / service name / channel, or empty = any.",
  "Okno czasowe dla zdarzeń: 0 = kiedykolwiek, albo 7/30/90/365.":
    "Time window for events: 0 = ever, or 7/30/90/365.",
  "Asystent segmentów: „{v0}”.": "Segment assistant: “{v0}”.",
  "Zgłasza spostrzeżenia o stanie systemu. Wywołaj dokładnie raz. Jeśli nie widzisz nic wartego uwagi, zwróć pustą listę.":
    "Reports insights about the state of the system. Call exactly once. If you see nothing worth attention, return an empty list.",
  "Jedno zdanie, po polsku, konkretnie.": "One sentence, in English, specific.",
  "Na czym opierasz to spostrzeżenie.": "What you base this insight on.",
  "Co użytkownik może z tym zrobić.": "What the user can do about it.",
  "Brak klucza API dostawcy AI — pominięto analizę modelem.":
    "No AI provider API key — model analysis skipped.",
  "Dzienny limit kosztów AI wyczerpany (${v0} / ${v1}) — pominięto analizę modelem.":
    "Daily AI cost limit reached (${v0} / ${v1}) — model analysis skipped.",
  "Nadzorca PRM_Agent — analiza stanu systemu.": "PRM_Agent supervisor — system state analysis.",
  "Model nie zwrócił spostrzeżeń.": "The model returned no insights.",
  "Analiza modelem nie powiodła się: {v0}": "Model analysis failed: {v0}",

  // Auth
  "Konto z tym adresem e-mail już istnieje.": "An account with this email address already exists.",
  "Za dużo nieudanych prób logowania. Spróbuj ponownie za {minutes} min.":
    "Too many failed sign-in attempts. Try again in {minutes} min.",
  "Nieprawidłowy e-mail lub hasło.": "Incorrect email or password.",
  "BLOKADA LOGOWANIA: {email} — osiem nieudanych prób z jednego adresu.":
    "SIGN-IN LOCKOUT: {email} — eight failed attempts from one address.",
  "To konto wygasło.": "This account has expired.",
  "Konto nie istnieje.": "The account does not exist.",
  "Sesja weryfikacji wygasła. Zaloguj się jeszcze raz.":
    "The verification session has expired. Sign in again.",
  "Nie udało się wysłać kodu ({detail}).": "Could not send the code ({detail}).",
  "Musisz być zalogowany, żeby zmienić hasło.": "You must be signed in to change your password.",
  "Nie znaleziono konta.": "Account not found.",
  "Aktualne hasło jest nieprawidłowe.": "The current password is incorrect.",
  "Musisz być zalogowany, żeby zmienić nazwę.": "You must be signed in to change your name.",
  "Musisz być zalogowany, żeby zmienić numer telefonu.":
    "You must be signed in to change your phone number.",
  "Hasło jest nieprawidłowe.": "The password is incorrect.",
  "Numer wygląda nieprawidłowo. Podaj go z numerem kierunkowym, np. +48 600 100 200.":
    "The number looks invalid. Enter it with the country code, e.g. +44 7700 900123.",
  "Nie znaleziono użytkownika.": "User not found.",
  "Numer wygląda nieprawidłowo. Podaj go z kierunkowym, np. +48 600 100 200.":
    "The number looks invalid. Enter it with the country code, e.g. +44 7700 900123.",
  "Musisz być zalogowany.": "You must be signed in.",
  "Tylko administrator może wykonać tę operację.": "Only an administrator can do this.",
  "Numer telefonu jest wymagany — na niego idzie kod weryfikacyjny.":
    "A phone number is required — the verification code is sent to it.",
  "Wymagane zalogowanie.": "Sign-in required.",
  "Włączono aplikację uwierzytelniającą dla konta {email}.":
    "Authenticator app turned on for account {email}.",
  "Nieprawidłowe hasło.": "Incorrect password.",
  "WYŁĄCZONO aplikację uwierzytelniającą dla konta {email}.":
    "Authenticator app TURNED OFF for account {email}.",

  // API functions
  "Nie wskazano żadnej zmiany.": "No change specified.",
  "Przy nadawaniu zgody podaj podstawę — bez niej nie da się jej później wykazać.":
    "When granting consent, give the basis — without it the consent cannot be proven later.",
  "Ten pacjent już jest w bazie ({v0}) — {firstName} {lastName}.":
    "This patient is already in the database ({v0}) — {firstName} {lastName}.",
  "Tej wiadomości już nie ma.": "This message no longer exists.",
  "SMS-a nie da się przenieść — to zwykły tekst, nie bloki.":
    "An SMS cannot be moved — it is plain text, not blocks.",
  "Sesja wygasła — zaloguj się ponownie.": "Your session has expired — sign in again.",
  "Dzienny limit wydatków AI wyczerpany ({v0} z {limit} USD). Podnieś limit w Automation → Agent AI albo wróć jutro.":
    "Daily AI spending limit reached ({v0} of {limit} USD). Raise the limit in Settings → PRM_Agent or come back tomorrow.",
  "Nie znaleziono grafiki w bibliotece Media.": "Image not found in the Media library.",
  "Klucze i dane dostępowe może zmieniać tylko administrator.":
    "Only an administrator can change keys and credentials.",
  "Nowe kontakty ({WINDOW_DAYS} dni)": "New contacts ({WINDOW_DAYS} days)",
  "Stan bieżący — historia włączeń nie jest zapisywana.":
    "Current state — activation history is not recorded.",
  "Wysłane e-maile ({WINDOW_DAYS} dni)": "Emails sent ({WINDOW_DAYS} days)",
  "Wszystkie wysyłki z trackingiem — kampanie, odpowiedzi ze skrzynki i testy.":
    "All tracked sends — campaigns, inbox replies and tests.",
  "Wysłane SMS ({WINDOW_DAYS} dni)": "SMS sent ({WINDOW_DAYS} days)",
  "Kroki silnika oraz wiadomości wysłane ze skrzynki.":
    "Engine steps and messages sent from the inbox.",
  "Grafiki: {ok} lekarzy, {failed} błędów.": "Schedules: {ok} doctors, {failed} errors.",
  "Pacjenci: {refreshed}/{linked} odświeżonych · wizyt +{visitsAdded}/~{visitsUpdated} · scalonych {merged} · odwołanych {cancelled} · zdarzeń {events}.":
    "Patients: {refreshed}/{linked} refreshed · visits +{visitsAdded}/~{visitsUpdated} · merged {merged} · cancelled {cancelled} · events {events}.",
  "Wysłano e-mail: „{subject}”": "Email sent: “{subject}”",
  "Do: {toEmail}": "To: {toEmail}",
  "Otwarto wiadomość": "Message opened",
  "Kliknięcie w wiadomości": "Click in message",
  "Nie znaleziono arkusza w pliku.": "No sheet found in the file.",
  "Kontakt nie istnieje już w bazie.": "The contact no longer exists in the database.",
  "Pacjent nie ma numeru telefonu.": "The patient has no phone number.",
  "Brak skonfigurowanego nadawcy SMS — dodaj go w Integracje → SMS API.":
    "No SMS sender configured — add one in Integrations → SMS API.",
  "Pacjent nie ma adresu e-mail.": "The patient has no email address.",
  "Kontakt nie istnieje.": "The contact does not exist.",
  "Ten kontakt nie ma adresu e-mail.": "This contact has no email address.",
  "Ten kontakt nie ma numeru telefonu.": "This contact has no phone number.",
  "Brak sesji.": "No session.",
  "Brak App ID albo App Secret Mety — uzupełnij w Integracje → Klucze i dane dostępowe.":
    "The Meta App ID or App Secret is missing — add them in Integrations → Keys and credentials.",
  "Wysłano SMS na {toPhone}{v1}": "SMS sent to {toPhone}{v1}",
  "Udział pacjentów": "Share of patients",
  "{patients} z {length} kontaktów ma status Pacjent.":
    "{patients} of {length} contacts have the Patient status.",
  "Open rate ({WINDOW_DAYS} dni)": "Open rate ({WINDOW_DAYS} days)",
  "Unikalne otwarcia wobec wysyłek. Apple Mail zawyża ten wskaźnik u części odbiorców.":
    "Unique opens relative to sends. Apple Mail inflates this rate for some recipients.",
  "Click rate ({WINDOW_DAYS} dni)": "Click rate ({WINDOW_DAYS} days)",
  "Unikalne kliknięcia wobec wysyłek.": "Unique clicks relative to sends.",
  "To konto ma dostęp wyłącznie do podglądu.": "This account has preview-only access.",
  "Wizyta na stronie": "Website visit",

  // Authenticator, expiry, password reset, TOTP, two-factor
  "Aplikacja uwierzytelniająca jest już włączona. Najpierw ją wyłącz.":
    "The authenticator app is already on. Turn it off first.",
  "Nie rozpoczęto konfiguracji. Zacznij od nowa.": "Setup was not started. Start again.",
  "Aplikacja jest już włączona.": "The app is already on.",
  "Kod nie pasuje. Sprawdź, czy w telefonie jest ustawiony automatyczny czas.":
    "The code does not match. Check that automatic time is set on your phone.",
  "Aplikacja uwierzytelniająca nie jest włączona.": "The authenticator app is not on.",
  "Nieprawidłowy kod zapasowy.": "Invalid backup code.",
  "Ten kod zapasowy został już użyty.": "This backup code has already been used.",
  "Nieprawidłowy kod. Sprawdź aplikację i spróbuj ponownie.":
    "Invalid code. Check the app and try again.",
  "Ten kod został już użyty. Poczekaj na następny w aplikacji.":
    "This code has already been used. Wait for the next one in the app.",
  "Konto {email} ({role}) wygasło i zostało usunięte razem z sesjami.":
    "Account {email} ({role}) expired and was deleted together with its sessions.",
  "Prośba o reset hasła dla nieznanego adresu — nic nie wysłano.":
    "Password reset request for an unknown address — nothing sent.",
  "Prośba o reset hasła dla {email} pominięta — {MAX_NA_GODZINE} w ciągu godziny.":
    "Password reset request for {email} skipped — {MAX_NA_GODZINE} within an hour.",
  "Reset hasła: brak adresu nadawcy w Integracje → Email API — wiadomość nie wyszła.":
    "Password reset: no sender address in Integrations → Email API — the message was not sent.",
  "PRM Core — ustawienie nowego hasła": "PRM Core — set a new password",
  "Reset hasła: wysłano odnośnik do {email}.": "Password reset: link sent to {email}.",
  "Ten odnośnik jest nieprawidłowy albo został już użyty.":
    "This link is invalid or has already been used.",
  "Ten odnośnik wygasł.": "This link has expired.",
  "Hasło musi mieć co najmniej 8 znaków.": "The password must be at least 8 characters.",
  "Konto już nie istnieje.": "The account no longer exists.",
  "Hasło konta {email} zmienione przez odzyskiwanie. Wszystkie sesje zamknięte.":
    "Password of account {email} changed through recovery. All sessions closed.",
  "Klucz zawiera znak spoza alfabetu base32.":
    "The key contains a character outside the base32 alphabet.",
  "Kod weryfikacyjny: {code}": "Verification code: {code}",
  "Kod stracił ważność. Zaloguj się jeszcze raz.": "The code has expired. Sign in again.",
  "Za dużo nieudanych prób. Zaloguj się jeszcze raz.": "Too many failed attempts. Sign in again.",
  "Nieprawidłowy kod. Pozostało prób: {left}.": "Invalid code. Attempts left: {left}.",
  "Wysłano już maksymalną liczbę kodów. Zaloguj się jeszcze raz.":
    "The maximum number of codes has been sent. Sign in again.",
  "PRM Core — awaria bramki SMS, logowanie bez weryfikacji":
    "PRM Core — SMS gateway failure, sign-in without verification",
  "POWIADOMIENIE: awaria bramki SMS zgłoszona administratorom ({length}).":
    "NOTICE: SMS gateway failure reported to administrators ({length}).",

  // Campaigns
  "Wybrany segment nie istnieje.": "The selected segment does not exist.",
  "Brak opublikowanej treści szablonu „{templateName}”. Otwórz szablon i zapisz go ponownie.":
    "No published content for template “{templateName}”. Open the template and save it again.",
  "Szablon „{templateName}” nie ma jeszcze treści.":
    "Template “{templateName}” has no content yet.",
  "Zaplanowano wysyłkę „{templateName}” do segmentu „{name}” na {v2}.":
    "Scheduled send of “{templateName}” to segment “{name}” for {v2}.",
  "Zlecono natychmiastową wysyłkę „{templateName}” do segmentu „{name}”.":
    "Started an immediate send of “{templateName}” to segment “{name}”.",
  "Kampania nie istnieje.": "The campaign does not exist.",
  "Wstrzymać można tylko wysyłkę zaplanowaną albo trwającą.":
    "Only a scheduled or running send can be paused.",
  "Ta wysyłka nie jest wstrzymana.": "This send is not paused.",
  "Ta wysyłka jest już zakończona.": "This send has already finished.",
  "Wysyłka „{templateName}” przerwana: {v1}": "Send of “{templateName}” stopped: {v1}",
  "Zniknęła migawka treści szablonu.": "The template content snapshot is missing.",
  "Wysyłka „{templateName}” zakończona — {sentCount} wysłanych, {skippedCount} pominiętych, {failedCount} błędów.":
    "Send of “{templateName}” finished — {sentCount} sent, {skippedCount} skipped, {failedCount} errors.",
  "Brak skonfigurowanego nadawcy SMS — Integracje → SMS API.":
    "No SMS sender configured — Integrations → SMS API.",
  "Wysyłka „{templateName}” nie powiodła się: {message}":
    "Send of “{templateName}” failed: {message}",

  // Canva
  "Brak Client ID albo Client secret Canvy — uzupełnij w Integracje → Klucze i dane dostępowe.":
    "The Canva Client ID or Client secret is missing — add them in Integrations → Keys and credentials.",
  "Brak ważnego połączenia z Canvą — połącz konto ponownie w Integracjach.":
    "No valid connection to Canva — reconnect the account in Integrations.",
  "Canva odmówiła (HTTP {status}): {v1}": "Canva refused (HTTP {status}): {v1}",
  "(bez nazwy)": "(untitled)",
  "Eksport projektu nie powiódł się: {powod}": "Design export failed: {powod}",
  "Nie udało się pobrać wyeksportowanego pliku (HTTP {status}).":
    "Could not download the exported file (HTTP {status}).",
  "Canva odpowiedziała nieczytelnie (HTTP {status}): {v1}":
    "Canva returned an unreadable response (HTTP {status}): {v1}",
  "Canva odrzuciła wymianę tokenu: {powod}": "Canva rejected the token exchange: {powod}",

  // Treatment plans
  "Plan musi mieć nazwę.": "The plan must have a name.",
  "Nazwa nie może zawierać znaków % ani | — kolidują ze znacznikiem.":
    "The name cannot contain % or | — they clash with the tag.",
  "Ten plan już nie istnieje.": "This plan no longer exists.",

  // Consent
  "Pacjent ma status „nie kontaktować” — wysyłka zablokowana w każdym trybie.":
    "The patient has the “do not contact” status — sending is blocked in every mode.",
  "Brak zgody marketingowej na kanał {v0} — wysyłkę pominięto. Użyj trybu administracyjnego, jeśli to wiadomość niemarketingowa (np. przypomnienie o wizycie).":
    "No marketing consent for the {v0} channel — the send was skipped. Use administrative mode if this is a non-marketing message (e.g. a visit reminder).",
  "Zmiana zgód ({source}) — {v1}.{v2}": "Consent change ({source}) — {v1}.{v2}",
  "Regulamin i polityka prywatności": "Terms of service and privacy policy",
  "Akceptacja regulaminu i polityki prywatności":
    "Acceptance of the terms of service and privacy policy",
  "Zgoda na komunikację marketingową": "Consent to marketing communication",
  "Wiadomość e-mail": "Email",
  "Zgoda na marketing e-mail": "Consent to email marketing",
  "Wiadomość SMS": "SMS",
  "Zgoda na marketing SMS": "Consent to SMS marketing",
  "Zgoda na profilowanie i personalizację": "Consent to profiling and personalisation",
  "Podaj nazwę zgody.": "Enter the consent name.",
  "Treść zgody nie może być pusta.": "The consent text cannot be empty.",
  "Zgoda nie istnieje.": "The consent does not exist.",
  "Nazwa i treść zgody nie mogą być puste.": "The consent name and text cannot be empty.",
  "Zgody wbudowanej nie da się usunąć — steruje wysyłką.":
    "A built-in consent cannot be deleted — it controls sending.",
  "Zmiana zgód ({source}) — {v1}.": "Consent change ({source}) — {v1}.",

  // Contact import template hints
  "wymagane razem z nazwiskiem": "required together with the last name",
  Testowy: "Test",
  "wymagane razem z imieniem": "required together with the first name",
  "zamiennik dwóch powyższych — ostatni wyraz to nazwisko":
    "alternative to the two above — the last word is the last name",
  "kierunkowy dobierany przy imporcie": "country code chosen at import",
  "VIP;Kardiologia": "VIP;Cardiology",
  "wiele wartości po średniku": "several values separated by semicolons",
  "tak / nie": "tak / nie (yes / no)",
  "Zgoda papierowa 2026-03-14": "Paper consent 2026-03-14",
  "podstawa zgody — trafia na oś czasu pacjenta":
    "basis for consent — goes on the patient's timeline",
  "treść trafia do notatki pacjenta": "the text goes into a patient note",
  "dowolna kolumna „Notatka: …” dopisuje linię do tej samej notatki":
    "any “Notatka: …” column adds a line to the same note",
  "Podaj poprawny adres e-mail.": "Enter a valid email address.",
  "Adres {email} należy już do innego kontaktu.":
    "The address {email} already belongs to another contact.",

  // Demo content
  "Dbaj o swoje serce latem": "Look after your heart this summer",
  "Kilka porad kardiologicznych na nadchodzące miesiące — nawodnienie, aktywność fizyczna i regularne kontrole.":
    "A few cardiology tips for the coming months — hydration, physical activity and regular check-ups.",
  "Otwieramy nową poradnię!": "We are opening a new clinic!",
  "Witamy w Klinice ABC": "Welcome to ABC Clinic",
  "Dzień dobry, cieszymy się, że jest Pani/Pan z nami. Znajdziemy dla Państwa najlepszy termin i specjalistę — w razie pytań prosimy o kontakt z recepcją.":
    "Hello, we are glad to have you with us. We will find the best appointment and specialist for you — if you have any questions, please contact reception.",
  "Jak oceniają Państwo swoją wizytę?": "How would you rate your visit?",
  "Prosimy o jedną minutę — Państwa opinia realnie wpływa na to, jak organizujemy opiekę.":
    "Please give us one minute — your opinion really shapes how we organise care.",
  "Wypełnij krótką ankietę": "Fill in a short survey",
  "Materiały przygotowane dla Państwa": "Materials prepared for you",
  "Zebraliśmy najważniejsze informacje o profilaktyce kardiologicznej — badaniach kontrolnych, diecie i aktywności.":
    "We have gathered the key information on heart disease prevention — check-ups, diet and activity.",
  "Przeczytaj poradnik": "Read the guide",
  "Przypominamy o jutrzejszej wizycie": "A reminder about your visit tomorrow",
  "Dzień dobry, przypominamy o wizycie u kardiologa jutro o 10:00. W razie pytań prosimy o kontakt.":
    "Hello, this is a reminder of your cardiology appointment tomorrow at 10:00. If you have any questions, please get in touch.",
  "Zobacz szczegóły wizyty": "See visit details",
  "Zapisz się i odbierz 10% rabatu": "Sign up and get 10% off",
  "Dołącz do newslettera Klinika ABC i otrzymaj rabat na pierwszą wizytę.":
    "Join the ABC Clinic newsletter and get a discount on your first visit.",
  "Zapisz mnie": "Sign me up",

  // Credentials catalog
  "SendGrid → Settings → API Keys. Wystarczy uprawnienie „Mail Send”.":
    "SendGrid → Settings → API Keys. The “Mail Send” permission is enough.",
  "SG.…": "SG.…",
  "Account SID": "Account SID",
  "Twilio Console → Account Info. Zaczyna się od AC (nie od SK — to SID klucza API).":
    "Twilio Console → Account Info. Starts with AC (not SK — that is an API key SID).",
  "AC…": "AC…",
  "Auth Token": "Auth Token",
  "Twilio Console → Account Info. Tym samym tokenem Twilio podpisuje SMS-y przychodzące.":
    "Twilio Console → Account Info. Twilio signs incoming SMS with this same token.",
  "console.anthropic.com → API Keys.": "console.anthropic.com → API Keys.",
  "platform.openai.com → API keys.": "platform.openai.com → API keys.",
  "aistudio.google.com → Get API key.": "aistudio.google.com → Get API key.",
  "Identyfikator aplikacji (App ID)": "App ID",
  "developers.facebook.com → Twoja aplikacja → Ustawienia → Podstawowe.":
    "developers.facebook.com → Your app → Settings → Basic.",
  "Klucz tajny aplikacji (App Secret)": "App Secret",
  "To samo miejsce. Służy też do sprawdzania podpisu leadów przysyłanych przez Metę.":
    "Same place. It is also used to verify the signature of leads sent by Meta.",
  "Token weryfikacji webhooka": "Webhook verify token",
  "Dowolny ciąg, który wpisujesz tu i w ustawieniach webhooka aplikacji Meta — muszą być identyczne.":
    "Any string you enter here and in the Meta app's webhook settings — they must be identical.",
  "Client ID": "Client ID",
  "canva.com/developers → Your integrations → Configuration.":
    "canva.com/developers → Your integrations → Configuration.",
  "Client secret": "Client secret",
  "To samo miejsce — „Generate secret”. Canva pokazuje go tylko raz.":
    "Same place — “Generate secret”. Canva shows it only once.",
  "Token dostępu": "Access token",
  "Wygeneruj w panelu i wklej w konfiguracji klienta MCP. Pokazuje się tylko raz.":
    "Generate it in the panel and paste it into the MCP client configuration. It is shown only once.",
  "Pole {name} nie należy do żadnej integracji.":
    "Field {name} does not belong to any integration.",

  // Credential checks
  "{what} odrzucił dane (HTTP {status}) — klucz jest błędny, wycofany albo bez uprawnień.":
    "{what} rejected the credentials (HTTP {status}) — the key is wrong, revoked or lacks permissions.",
  "Brak danych: {what}. Uzupełnij je i zapisz przed sprawdzeniem.":
    "Missing: {what}. Fill them in and save before testing.",
  "SendGrid odpowiedział HTTP {status}.": "SendGrid responded with HTTP {status}.",
  "Klucz działa, ale nie ma uprawnienia „Mail Send” — wysyłka się nie uda.":
    "The key works but lacks the “Mail Send” permission — sending will fail.",
  "Klucz działa i ma uprawnienie do wysyłki.": "The key works and has permission to send.",
  "Twilio nie zna takiego Account SID.": "Twilio does not know this Account SID.",
  "Twilio odpowiedział HTTP {status}.": "Twilio responded with HTTP {status}.",
  "Konto Twilio ma stan „{status}” — wysyłka nie zadziała.":
    "The Twilio account is “{status}” — sending will not work.",
  "Połączono z kontem {v0}.": "Connected to account {v0}.",
};
