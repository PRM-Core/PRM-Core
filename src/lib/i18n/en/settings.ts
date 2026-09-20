/** Settings: roles, fields, domains, tracking, users, PRM_Agent, senders, 2FA. */
export const settings: Record<string, string> = {
  "Settings — PRM Core": "Settings — PRM Core",
  Role: "Roles",
  "Tabele / Dane": "Tables / Data",
  Branding: "Branding",
  Domeny: "Domains",
  Tracking: "Tracking",
  Powiadomienia: "Notifications",
  Ustawienia: "Settings",
  "Konfiguracja workspace PRM Core.": "PRM Core workspace configuration.",
  "Role i uprawnienia": "Roles and permissions",
  "Rola decyduje o tym, co użytkownik może zrobić w workspace.":
    "The role decides what a user can do in the workspace.",
  "Dodawanie i zarządzanie użytkownikami": "Adding and managing users",
  "Konfiguracja i weryfikacja domen (Settings → Domeny)":
    "Configuring and verifying domains (Settings → Domains)",
  "Wszystkie moduły Workspace, Engage i System": "All Workspace, Engage and System modules",
  "Pełny dostęp do kontaktów, automatyzacji i treści":
    "Full access to contacts, automations and content",
  "Brak dostępu: dodawanie użytkowników": "No access: adding users",
  "Brak dostępu: zmiany techniczne domeny": "No access: technical domain changes",
  "Nazwa workspace": "Workspace name",
  "Kolor akcentu": "Accent colour",
  "Konfiguracja SMTP": "SMTP configuration",
  Host: "Host",
  Port: "Port",
  Użytkownik: "User",
  "PRM Core ": "PRM Core ",
  "Integracje mają własny ekran — z konfiguracją SendGrida, Twilio, Mety, Canvy i webhooków.":
    "Integrations have their own screen — with SendGrid, Twilio, Meta, Canva and webhook configuration.",
  " Otwórz Integracje": " Open Integrations",

  // PRM_Agent
  "Zapisano ustawienia PRM_Agent": "PRM_Agent settings saved",
  "Nie udało się zapisać ustawień": "Could not save the settings",
  PRM_Agent: "PRM_Agent",
  "Model, na którym działa węzeł Agent AI w automatyzacjach.":
    "The model used by the AI agent step in automations.",
  Dostawca: "Provider",
  Model: "Model",
  " za MTok": " per MTok",
  " Klucz skonfigurowany": " Key configured",
  " Brak klucza": " No key",
  "Klucz jest ustawiony. Zmienia się go w Integracje → Klucze i dane dostępowe.":
    "The key is set. It is changed in Integrations → Keys and credentials.",
  "Uzupełnij klucz w Integracje → Klucze i dane dostępowe. Bez klucza silnik działa dalej — pomija tylko węzły Agent AI.":
    "Add the key in Integrations → Keys and credentials. Without a key the engine keeps working — it only skips AI agent steps.",
  "Dzienny limit kosztów (USD)": "Daily cost limit (USD)",
  "Wydano dzisiaj": "Spent today",
  "Po przekroczeniu limitu węzły Agent AI są pomijane (przebieg idzie pierwszą ścieżką i zapisuje to w dzienniku), a deterministyczna część silnika — maile, SMS-y, tagi, lejki — działa dalej bez zmian.":
    "Once the limit is exceeded, AI agent steps are skipped (the run takes the first path and logs it), while the deterministic part of the engine — emails, SMS, tags, funnels — keeps working unchanged.",

  // Authenticator
  "Nie udało się rozpocząć konfiguracji.": "Could not start the setup.",
  "Kod nie pasuje.": "The code does not match.",
  "Aplikacja uwierzytelniająca włączona.": "Authenticator app turned on.",
  "Nie udało się wyłączyć.": "Could not turn it off.",
  "Aplikacja uwierzytelniająca wyłączona.": "Authenticator app turned off.",
  " Aplikacja uwierzytelniająca": " Authenticator app",
  "Kody logowania z Google Authenticator, Authy, 1Password lub Microsoft Authenticator. Działają bez zasięgu i nie kosztują nic — w odróżnieniu od SMS-a.":
    "Sign-in codes from Google Authenticator, Authy, 1Password or Microsoft Authenticator. They work without signal and cost nothing — unlike SMS.",
  " Włączona": " On",
  " Wyłączona": " Off",
  " Zapisz kody zapasowe — zobaczysz je tylko teraz":
    " Save your backup codes — you will only see them now",
  "Każdy działa raz i pozwala wejść, gdy nie masz telefonu. Wydrukuj je albo zapisz w menedżerze haseł. Po zamknięciu tego okna nie da się ich odtworzyć — także nam.":
    "Each works once and lets you in when you do not have your phone. Print them or save them in a password manager. After this window closes they cannot be recovered — not even by us.",
  "Kopiuj wszystkie": "Copy all",
  "Zapisałem je": "I have saved them",
  "Kod QR do zeskanowania w aplikacji uwierzytelniającej":
    "QR code to scan in the authenticator app",
  "1. Zeskanuj kod w aplikacji": "1. Scan the code in the app",
  "Nie możesz zeskanować? Wpisz klucz ręcznie:": "Cannot scan? Enter the key manually:",
  "2. Przepisz kod, który pokazała aplikacja": "2. Enter the code the app shows",
  Włącz: "Turn on",
  "Kod zmienia się co 30 sekund. Jeśli nie pasuje, sprawdź w telefonie automatyczne ustawianie czasu — to najczęstsza przyczyna.":
    "The code changes every 30 seconds. If it does not match, check automatic time on your phone — that is the most common cause.",
  " Skonfiguruj aplikację": " Set up the app",
  "Przy logowaniu podajesz kod z aplikacji zamiast SMS-a. Kodów zapasowych zostało":
    "When signing in you enter a code from the app instead of an SMS. Backup codes left:",
  "Zostało ich mało — wyłącz i włącz aplikację, żeby wygenerować nowe.":
    "Only a few left — turn the app off and on again to generate new ones.",
  Wyłącz: "Turn off",
  "Wyłącz aplikację": "Turn off the app",

  // Data fields
  "Nie udało się zapisać pola.": "Could not save the field.",
  "Zapisano nazwę pola.": "Field name saved.",
  "Nie udało się zmienić widoczności.": "Could not change the visibility.",
  "Nie udało się dodać pola.": "Could not add the field.",
  "Pole dodane — pojawi się na karcie kontaktu.":
    "Field added — it will appear on the contact card.",
  "Nie udało się usunąć pola.": "Could not delete the field.",
  "Pole i zapisane w nim wartości zostały usunięte.":
    "The field and the values saved in it have been deleted.",
  " Kontakty — pola karty": " Contacts — card fields",
  "Wszystkie dane, jakie system trzyma o kontakcie. ":
    "All the data the system keeps about a contact. ",
  "Zmiana nazwy": "Renaming",
  " dotyczy etykiety widocznej w interfejsie — kolumna w bazie zostaje ta sama, bo pod jej nazwą pisane są eksporty CSV, personalizacja w wiadomościach i narzędzia MCP. ":
    " changes the label shown in the interface — the database column stays the same, because CSV exports, message personalisation and MCP tools use its name. ",
  "Nowe pole": "A new field",
  " nie ma własnej kolumny: jego wartość zapisuje się przy kontakcie i pojawia się na karcie w sekcji „Pola dodatkowe”.":
    " has no column of its own: its value is stored with the contact and shown on the card under “Additional fields”.",
  " Dodaj pole": " Add field",
  " wymagane": " required",
  "tylko odczyt": "read-only",
  "pole własne": "custom field",
  " · {used} kontaktów": " · {used} contacts",
  "Pokazuj przy statusach": "Show for statuses",
  "Nic nie zaznaczono — pole pokaże się przy każdym statusie.":
    "Nothing selected — the field shows for every status.",
  "Pole pokaże się tylko przy: {v0}. Wypełnione wartości pozostają widoczne zawsze.":
    "The field shows only for: {v0}. Filled-in values always stay visible.",
  "Tego pola nie da się ukryć — karta kontaktu bez niego nie działa":
    "This field cannot be hidden — the contact card does not work without it",
  "Ukryj na karcie kontaktu": "Hide on the contact card",
  "Pokaż na karcie kontaktu": "Show on the contact card",
  "Usuń pole": "Delete field",
  "Podpowiedź pod polem": "Hint under the field",
  "Co wpisywać w to pole": "What to enter in this field",
  "Opcje (po przecinku)": "Options (comma-separated)",
  "Tak, Nie, Nie wiem": "Yes, No, Don't know",
  "Pole systemowe — typu i listy wartości nie da się tu zmienić, bo pisze do konkretnej kolumny w bazie.":
    "System field — its type and list of values cannot be changed here, because it writes to a specific database column.",
  "Gdzie to widać.": "Where this shows.",
  " Kolejność i nazwy z tej listy obowiązują w sekcji „Dane kontaktowe” na karcie kontaktu. Ukryte pole znika z karty, ale jego wartość zostaje w bazie — to nie jest kasowanie danych.":
    " The order and names in this list apply to the “Contact details” section of the contact card. A hidden field disappears from the card, but its value stays in the database — this is not deleting data.",
  "Czego pola własne jeszcze nie potrafią.": "What custom fields cannot do yet.",
  " Zapisują się i wyzwalają automatyzację „Zmiana pola kontaktu” (klucz pola = nazwa techniczna obok etykiety), ale nie da się po nich filtrować listy kontaktów ani wstawiać ich jako personalizacji w wiadomościach.":
    " They are saved and trigger the “Contact field changed” automation (field key = the technical name next to the label), but you cannot filter the contact list by them or insert them as personalisation in messages.",
  "Zdefiniowanych pól własnych: {customCount}.": "Custom fields defined: {customCount}.",
  "Nowe pole kontaktu": "New contact field",
  "Pojawi się na karcie każdego kontaktu w sekcji „Pola dodatkowe”.":
    "It appears on every contact card under “Additional fields”.",
  "Nazwa pola *": "Field name *",
  "np. Lekarz prowadzący": "e.g. Attending doctor",
  Typ: "Type",
  "Opcje (po przecinku) *": "Options (comma-separated) *",
  "Dr Kowalski, Dr Nowak": "Dr Smith, Dr Jones",
  Podpowiedź: "Hint",
  "Dodaj pole": "Add field",
  "Usunąć pole „": "Delete field “",
  "Razem z definicją znikną wartości zapisane u":
    "Together with the definition, the values saved for",
  " kontaktów. Dane osobowe w polu, którego nikt już nie widzi, nie powinny zostawać w bazie — dlatego kasujemy je razem z polem. Tej operacji nie da się cofnąć.":
    " contacts will be deleted. Personal data in a field nobody can see any more should not stay in the database — that is why we delete it together with the field. This cannot be undone.",
  "Usuń pole i wartości": "Delete field and values",

  // Domains
  " Zweryfikowana": " Verified",
  " Błąd weryfikacji": " Verification failed",
  " Oczekuje na DNS": " Waiting for DNS",
  "Brak VITE_PLATFORM_CNAME_TARGET w konfiguracji instalacji.":
    "VITE_PLATFORM_CNAME_TARGET is missing from the installation configuration.",
  "Skopiowano rekord CNAME": "CNAME record copied",
  "Dodano domenę {trimmed}": "Domain {trimmed} added",
  "Dodaj rekord CNAME i kliknij „Sprawdź teraz”, żeby ją zweryfikować.":
    "Add the CNAME record and click “Check now” to verify it.",
  "Domena {domain} zweryfikowana": "Domain {domain} verified",
  "SSL zostanie wystawiony automatycznie w ciągu kilku minut.":
    "An SSL certificate will be issued automatically within a few minutes.",
  "Nie udało się zweryfikować {domain}": "Could not verify {domain}",
  "{domain} ustawiona jako domena domyślna": "{domain} set as the default domain",
  "Nowe linki trackingowe i strony docelowe będą używać tego adresu.":
    "New tracking links and landing pages will use this address.",
  "Domena trackingowa": "Tracking domain",
  "Zamiast domyślnego adresu PRM Core możesz podpiąć własną domenę pod linki trackingowe, piksel śledzący i strony docelowe.":
    "Instead of the default PRM Core address you can connect your own domain for tracking links, the tracking pixel and landing pages.",
  "Linki w e-mailach wyglądają jak": "Links in emails look like",
  "twojadomena.pl/l/…": "yourdomain.com/l/…",
  ", nie jak domena PRM Core — lepsza wiarygodność i mniejsze ryzyko trafienia do spamu.":
    ", not like the PRM Core domain — more trustworthy and less likely to end up in spam.",
  "Weryfikacja odbywa się przez rekord ": "Verification uses a ",
  CNAME: "CNAME",
  " w DNS — bez niego domena zostaje w stanie „Oczekuje”. Propagacja DNS może potrwać do 24–48h.":
    " record in DNS — without it the domain stays “Pending”. DNS propagation can take up to 24–48 h.",
  "Po weryfikacji certyfikat SSL wystawiany jest automatycznie — nie trzeba wgrywać własnego.":
    "After verification an SSL certificate is issued automatically — you do not need to upload your own.",
  "Aktywna domena": "Active domain",
  "Używana teraz we wszystkich nowych linkach śledzących i na stronach docelowych.":
    "Now used in all new tracking links and on landing pages.",
  "Twoje domeny": "Your domains",
  " Dodaj domenę": " Add domain",
  " Zmiany domeny wymagają roli Administrator": " Domain changes require the Administrator role",
  " Domyślna": " Default",
  " · dodano ": " · added ",
  "Sprawdź ponownie": "Check again",
  "Sprawdź teraz": "Check now",
  " Ustaw jako domyślną": " Set as default",
  "Dodaj domenę": "Add domain",
  "Podaj (pod)domenę, którą chcesz podpiąć, np.": "Enter the (sub)domain you want to connect, e.g.",
  "send.twojaklinika.pl": "send.yourclinic.com",
  ". Po dodaniu zobaczysz rekord CNAME do wpisania w DNS.":
    ". After adding it you will see the CNAME record to enter in DNS.",
  Domena: "Domain",
  Przeznaczenie: "Purpose",
  "Usunąć domenę „": "Delete domain “",
  "Linki wygenerowane wcześniej z tą domeną przestaną działać. Nowe linki będą używać domeny domyślnej.":
    "Links generated earlier with this domain will stop working. New links will use the default domain.",
  "Usuń domenę": "Delete domain",

  // Email senders
  "Nie dodano nadawcy": "Sender not added",
  " Nazwy nadawcy": " Sender names",
  "Jeden adres, kilka podpisów. W skrzynce pacjenta widoczna jest nazwa, więc to ona decyduje, czy wiadomość wygląda na tę samą rozmowę co poprzednia.":
    "One address, several signatures. The name is what the patient sees in their inbox, so it decides whether a message looks like part of the same conversation as the previous one.",
  " Dodaj nazwę": " Add name",
  "Nazwa, np. Klinika ABC": "Name, e.g. ABC Clinic",
  "Adres (pusty = ten z SMTP)": "Address (empty = the SMTP one)",
  "Do czego służy — np. zaproszenia na badania": "What it is for — e.g. invitations to check-ups",
  "Adres zostaw pusty, jeśli ma iść z tego samego, co dotąd. Własny adres musi być zweryfikowany w SendGridzie — inaczej wysyłka odbije się w całości.":
    "Leave the address empty to keep sending from the same one as before. A custom address must be verified in SendGrid — otherwise the whole send will bounce.",
  Dodaj: "Add",
  "Nie ma jeszcze żadnej nazwy — wiadomości podpisują się tym, co ustawiono w SMTP.":
    "There are no names yet — messages are signed with what is set in SMTP.",
  " domyślna": " default",
  "Ustaw domyślną": "Set as default",

  // Knowledge base
  "Zaktualizowano wpis": "Entry updated",
  "Dodano wpis do bazy wiedzy": "Entry added to the knowledge base",
  "Nie udało się zapisać": "Could not save",
  "Wpis usunięty": "Entry deleted",
  "Baza wiedzy": "Knowledge base",
  "Materiały, na których agent opiera treść wiadomości do pacjentów.":
    "Material the agent bases its messages to patients on.",
  " Dodaj wpis": " Add entry",
  "Baza jest pusta. Dodaj cennik, opisy zabiegów, godziny otwarcia albo standardowe odpowiedzi — agent użyje wyłącznie tego, co tu zapiszesz.":
    "The knowledge base is empty. Add a price list, treatment descriptions, opening hours or standard answers — the agent will use only what you save here.",
  "Edytuj wpis": "Edit entry",
  "Nowy wpis": "New entry",
  "Pisz konkretnie i faktograficznie. Agent traktuje ten tekst jako prawdę o placówce.":
    "Be specific and factual. The agent treats this text as the truth about the clinic.",
  "np. Cennik — implanty słuchowe": "e.g. Price list — hearing implants",
  "np. Konsultacja kwalifikacyjna: 250 zł. Badanie audiometryczne: 150 zł…":
    "e.g. Qualifying consultation: 250 PLN. Audiometry test: 150 PLN…",
  "Agent przestanie korzystać z tego materiału przy pisaniu wiadomości. Tej operacji nie można cofnąć.":
    "The agent will stop using this material when writing messages. This cannot be undone.",

  // SMS senders
  "Nie udało się dodać nadawcy.": "Could not add the sender.",
  "Dodano nadawcę.": "Sender added.",
  "Ustawiono jako domyślnego.": "Set as default.",
  "Usunięto nadawcę.": "Sender deleted.",
  "Brak nadawców — bez co najmniej jednego SMS-y nie wyjdą.":
    "No senders — without at least one, no SMS will go out.",
  domyślny: "default",
  "tylko wychodzący": "outgoing only",
  "Ustaw jako domyślnego": "Set as default",
  "Wszyscy nadawcy są alfanumeryczni, czyli ": "All senders are alphanumeric, i.e. ",
  jednokierunkowi: "one-way",
  " — pacjent nie ma na co odpisać, a skrzynka omnichannel nie odbierze SMS-ów. Do rozmów potrzebny jest kupiony numer Twilio.":
    " — the patient has nothing to reply to, and the omnichannel inbox will not receive SMS. Conversations need a purchased Twilio number.",
  "Nadawca *": "Sender *",
  "+48221234567 albo KlinikaABC": "+48221234567 or ABCClinic",
  Opis: "Description",
  "np. Kampanie / Recepcja": "e.g. Campaigns / Reception",
  "Wygląda poprawnie — zostanie dodany jako": "Looks correct — it will be added as a",
  "numer (dwukierunkowy)": "number (two-way)",
  "nazwa (tylko wychodząca)": "name (outgoing only)",
  "Wymagania operatorów": "Carrier requirements",
  "Nazwa alfanumeryczna": "Alphanumeric name",
  " (np. „KlinikaABC”):": " (e.g. “ABCClinic”):",
  "maksymalnie ": "at most ",
  " znaków": " characters",
  "tylko litery bez polskich znaków, cyfry i spacje; co najmniej jedna litera":
    "only unaccented letters, digits and spaces; at least one letter",
  jednokierunkowa: "one-way",
  " — pacjent nie odpisze, skrzynka nic nie odbierze":
    " — the patient cannot reply, the inbox receives nothing",
  "w Polsce wymaga wcześniejszej rejestracji u operatorów przez Twilio":
    "in some countries (e.g. Poland) it must be registered with carriers through Twilio first",
  Numer: "Number",
  " (np. +48221234567):": " (e.g. +48221234567):",
  "format ": "format ",
  ": „+”, kod kraju, numer — bez spacji i nawiasów":
    ": “+”, country code, number — no spaces or brackets",
  "musi być kupiony lub zweryfikowany na Waszym koncie Twilio":
    "must be purchased or verified on your Twilio account",
  dwukierunkowy: "two-way",
  " — tylko taki nadawca pozwala pacjentowi odpisać":
    " — only this kind of sender lets the patient reply",
  "numer polski wymaga uzupełnienia danych regulacyjnych (adres w PL)":
    "a number in some countries (e.g. Poland) requires regulatory details (a local address)",
  "Osobno pamiętaj o długości ": "Separately, remember the length of the ",
  treści: "text",
  ": 160 znaków na jeden SMS, a przy polskich znakach diakrytycznych tylko 70 — licznik pokazuje to w edytorze SMS.":
    ": 160 characters per SMS, but only 70 with accented characters — the counter in the SMS editor shows this.",
  "Dodaj nadawcę": "Add sender",
  "Nie udało się usunąć.": "Could not delete.",

  // Statuses
  "Statusy kontaktu": "Contact statuses",
  "Etapy, na których bywa pacjent. Do statusów przypisujesz pola karty — inne dla leada, inne dla pacjenta.":
    "The stages a patient goes through. You assign card fields to statuses — different ones for a lead and for a patient.",
  " Dodaj status": " Add status",
  "Nazwa, np. Lekarze": "Name, e.g. Doctors",
  "Kolor {c}": "Colour {c}",
  " wbudowany": " built-in",
  "Klucz w nawiasie jest niezmienny — siedzi w kartotekach i w definicjach segmentów, więc jego zmiana osierociłaby jedno i drugie. Zmienia się nazwę, klucz zostaje.":
    "The key in brackets cannot be changed — it is stored in contact records and segment definitions, so changing it would orphan both. You change the name; the key stays.",

  // Tracking
  "Skopiowano kod": "Code copied",
  Kopiuj: "Copy",
  "Nie udało się sprawdzić strony": "Could not check the website",
  "spoza listy": "not on the list",
  "sygnał na żywo": "live signal",
  "ostatni sygnał ": "last signal ",
  "brak sygnału": "no signal",
  " wizyt w ciągu doby": " visits in the last 24 hours",
  "opis (opcjonalnie) — np. strona główna kliniki":
    "description (optional) — e.g. clinic home page",
  Sprawdź: "Check",
  "Usuń {domain}": "Remove {domain}",
  "Kod wysyła dane na: ": "The code sends data to: ",
  "Ta domena jest już na liście.": "This domain is already on the list.",
  "Zapisano {saved} {v1}.": "Saved {saved} {v1}.",
  "Śledzenie stron": "Website tracking",
  "Stan liczony z sygnałów, które naprawdę dotarły — nie z tego, co zadeklarowano.":
    "Status based on signals that actually arrived — not on what was declared.",
  " Wszystkie wizyty": " All visits",
  " Przypisane do kontaktu": " Linked to a contact",
  " Domeny bez sygnału": " Domains without a signal",
  "Czego śledzenie nie pokaże:": "What tracking will not show:",
  " zwykła wizyta jest anonimowa i nie trafia na kartę żadnego pacjenta. Wizyta wiąże się z kontaktem dopiero wtedy, gdy przeglądarka niesie token z linku klikniętego w wiadomości z PRM Core. Własne wejście na stronę zobaczysz poniżej jako sygnał, ale nie w aktywnościach swojego kontaktu — i tak ma być.":
    " a regular visit is anonymous and does not go on any patient's card. A visit is linked to a contact only when the browser carries the token from a link clicked in a PRM Core message. You will see your own visit below as a signal, but not in your contact's activity — and that is intended.",
  "Śledzone domeny": "Tracked domains",
  "Wypisz strony, na których kod ma działać. Czerwona kropka znaczy, że stamtąd nic do nas nie dociera.":
    "List the websites where the code should run. A red dot means nothing reaches us from there.",
  "Nie ma jeszcze żadnej domeny. Dodaj tę, na której wkleiłeś kod.":
    "There are no domains yet. Add the one where you pasted the code.",
  "Masz niezapisane zmiany — kliknij „Zapisz”.": "You have unsaved changes — click “Save”.",
  "Kod do wklejenia": "Code to paste",
  "Przed ": "Before ",
  " na każdej śledzonej stronie — albo jako tag własny HTML w menedżerze tagów.":
    " on every tracked page — or as a custom HTML tag in a tag manager.",
  "Nie wklejaj tego kodu na produkcyjną stronę.": "Do not paste this code on a production website.",
  " Adres odbiorczy to": " The receiving address is",
  ", czyli komputer, na którym to uruchomiono — u odwiedzającego taki kod nie wyśle niczego. Skopiuj kod z produkcyjnego PRM Core.":
    ", i.e. the computer this is running on — for a visitor this code will send nothing. Copy the code from your production PRM Core.",
  "Dane trafiają na ": "Data goes to ",
  ". Ten adres jest wpisany w kod na stałe, więc": ". This address is hard-coded, so",
  "kod skopiowany z innego środowiska nie zadziała":
    "code copied from another environment will not work",
  " — zawsze bierz go z tego ekranu.": " — always take it from this screen.",
  "Instalacja przez Google Tag Managera — trzy kroki:":
    "Installing through Google Tag Manager — three steps:",
  "Usuń wszystkie stare tagi": "Delete all old tags",
  " z kodem PRM i zostaw dokładnie jeden, z kodem skopiowanym z tego ekranu (typ „Niestandardowy kod HTML”, reguła „All Pages”).":
    " with PRM code and keep exactly one, with the code copied from this screen (type “Custom HTML”, trigger “All Pages”).",
  "Opublikuj kontener": "Publish the container",
  " — przycisk „Prześlij” w prawym górnym rogu GTM. Samo „Zapisz” zapisuje wersję roboczą, której odwiedzający nie widzą; to najczęstszy powód, dla którego „kod jest dodany, a nie działa”.":
    " — the “Submit” button in the top right of GTM. “Save” alone saves a draft that visitors do not see; that is the most common reason why “the code is added but does not work”.",
  "Wejdź na stronę z dopiskiem": "Open the website with",
  "?prm_debug=1": "?prm_debug=1",
  " — w rogu pojawi się plakietka ze stanem: skąd załadował się skrypt, dokąd wysyła dane i czy serwer odebrał. Potem wróć tutaj — sygnał powinien być na liście.":
    " appended — a badge in the corner shows the status: where the script loaded from, where it sends data and whether the server received it. Then come back here — the signal should be on the list.",
  "Kod v2 jest odporny na wpadkę z dwoma tagami: skrypt, który nie zdołał się załadować (np. ze starego, martwego adresu), nie blokuje już tego właściwego, a dane zawsze wracają na serwer, z którego skrypt przyszedł.":
    "Code v2 is resistant to the two-tag mistake: a script that failed to load (e.g. from an old, dead address) no longer blocks the right one, and data always goes back to the server the script came from.",
  "Ostatnie sygnały": "Recent signals",
  " Odśwież": " Refresh",
  "Nic jeszcze nie dotarło. Wejdź na śledzoną stronę i odśwież — sygnał powinien pojawić się w kilka sekund.":
    "Nothing has arrived yet. Open a tracked page and refresh — the signal should appear within a few seconds.",
  "przypisany do kontaktu": "linked to a contact",

  // Users
  Użytkownicy: "Users",
  " w workspace": " in the workspace",
  " Dodaj użytkownika": " Add user",
  " Tylko administrator może dodawać użytkowników": " Only an administrator can add users",
  "Bez numeru telefonu weryfikacja SMS nie obowiązuje tego konta.":
    "Without a phone number, SMS verification does not apply to this account.",
  "bez weryfikacji SMS": "no SMS verification",
  wygasa: "expires",
  "Zmień numer": "Change number",
  "Dodaj numer": "Add number",
  " Resetuj hasło": " Reset password",
  "Numer zapisany. Kody weryfikacyjne pójdą na niego.":
    "Number saved. Verification codes will go to it.",
  "Numer usunięty — to konto chroni już tylko hasło.":
    "Number removed — this account is now protected only by its password.",
  "Puste pole wyłącza weryfikację SMS dla tego konta. Zapamiętane urządzenia tej osoby będą musiały przejść weryfikację ponownie.":
    "An empty field turns off SMS verification for this account. This person's remembered devices will have to be verified again.",
  "Nie udało się zresetować hasła": "Could not reset the password",
  "Reset hasła": "Password reset",
  "Nowe hasło tymczasowe": "New temporary password",
  "Zapisz je teraz — po zamknięciu okna nie da się go odczytać ponownie, bo w bazie leży wyłącznie skrót. Przekaż je inną drogą niż e-mail na to samo konto. Osoba ta została wylogowana ze wszystkich urządzeń.":
    "Save it now — after closing this window it cannot be shown again, because only a hash is stored in the database. Pass it on by some other route than email to the same account. This person has been signed out of all devices.",
  "Hasło zostanie zastąpione losowym, pokazanym raz. Wszystkie sesje tej osoby zostaną zakończone — reset zwykle znaczy, że konto mogło trafić w cudze ręce.":
    "The password will be replaced with a random one, shown once. All of this person's sessions will be ended — a reset usually means the account may have fallen into the wrong hands.",
  "Resetuj hasło": "Reset password",
  "Nie udało się dodać użytkownika": "Could not add the user",
  "Skopiowano hasło": "Password copied",
  "Dodaj użytkownika": "Add user",
  "Konto zostanie utworzone od razu, z tymczasowym hasłem do przekazania nowemu użytkownikowi.":
    "The account is created right away, with a temporary password to give to the new user.",
  "Nazwisko *": "Last name *",
  "Numer telefonu ": "Phone number ",
  "Konto podglądu loguje się samym hasłem, więc numer nie jest do niczego potrzebny.":
    "A preview account signs in with a password only, so the number is not needed.",
  "Rola / dostęp *": "Role / access *",
  "Konto wygasa *": "Account expires *",
  "Po tym terminie konto ": "After this date the account ",
  "zniknie samo": "disappears by itself",
  " — razem z sesjami, więc otwarte okno przestanie działać natychmiast. Nie trzeba o nim pamiętać.":
    " — together with its sessions, so an open window stops working immediately. There is no need to remember it.",
  "Konto utworzone": "Account created",
  "Przekaż poniższe tymczasowe hasło użytkownikowi ":
    "Give the temporary password below to the user ",
  " — powinien je zmienić po pierwszym logowaniu (Menu konta → Zmień hasło).":
    " — they should change it after signing in for the first time (Account menu → Change password).",
};
