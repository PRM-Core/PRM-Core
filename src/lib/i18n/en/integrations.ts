/** Integrations page and cards. Also CSV header names that must stay as they are. */
export const integrations: Record<string, string> = {
  // Names the importer recognises — shown as-is on purpose.
  Google: "Google",
  "„Zgoda Marketing e-mail”, „Zgoda Marketing SMS”, „Zgoda profilowanie”":
    "„Zgoda Marketing e-mail”, „Zgoda Marketing SMS”, „Zgoda profilowanie”",
  " zgoda_zrodlo": " zgoda_zrodlo",
  telefon: "telefon",
  zgoda_zrodlo: "zgoda_zrodlo",

  "Integrations — PRM Core": "Integrations — PRM Core",
  Integracje: "Integrations",
  "Klucze dostępowe i ustawienia usług, z którymi PRM Core wymienia dane.":
    "Access keys and settings for the services PRM Core exchanges data with.",
  "Facebook: podłączono.": "Facebook: connected.",
  "Facebook: nie podłączono.": "Facebook: not connected.",
  "Skopiowano {label}": "Copied {label}",
  "Nie udało się skopiować {label}": "Could not copy {label}",
  "Nowy adres webhooka — zaktualizuj go w SendGrid Inbound Parse":
    "New webhook URL — update it in SendGrid Inbound Parse",
  "Nie udało się wygenerować nowego adresu": "Could not generate a new URL",
  "Wiadomości przychodzące": "Incoming messages",
  " Czeka na deployment": " Waiting for deployment",
  " Adresy publiczne": " Public URLs",
  "Odpowiedzi pacjentów wpadają do zakładki ": "Patient replies land in the ",
  " i wyzwalają automatyzacje („Wiadomość od pacjenta”). Formularze i ankiety z pop-upów działają od razu — poniższe dwa adresy dokładają SMS-y i e-maile.":
    " tab and trigger automations (“Message from patient”). Pop-up forms and surveys work right away — the two URLs below add SMS and email.",
  "Adres wskazuje na localhost, więc ani Twilio, ani SendGrid go nie dosięgną. Te dwa kanały zaczną przyjmować wiadomości dopiero po wdrożeniu aplikacji pod publicznym HTTPS.":
    "The URL points to localhost, so neither Twilio nor SendGrid can reach it. These two channels start receiving messages only once the app is deployed on public HTTPS.",
  "Twilio — SMS przychodzące": "Twilio — incoming SMS",
  "(numer → „A message comes in”, metoda POST)": "(number → “A message comes in”, method POST)",
  "Kopiuj URL": "Copy URL",
  "Bez sekretu w adresie — Twilio podpisuje każde wywołanie tokenem konta (Auth Token), a endpoint odrzuca wszystko, co się nie zgadza.":
    "No secret in the URL — Twilio signs every call with the account token (Auth Token), and the endpoint rejects anything that does not match.",
  "SendGrid — e-maile przychodzące": "SendGrid — incoming email",
  "(Inbound Parse, wymaga rekordu MX)": "(Inbound Parse, requires an MX record)",
  "Wygeneruj nowy adres": "Generate a new URL",
  "SendGrid nie podpisuje Inbound Parse, więc losowy fragment adresu jest tu jedynym zabezpieczeniem — traktuj cały URL jak hasło.":
    "SendGrid does not sign Inbound Parse, so the random part of the URL is the only protection here — treat the whole URL like a password.",
  "SendGrid — zdarzenia doręczenia": "SendGrid — delivery events",
  "(Event Webhook — bounce, spam, dostarczone)": "(Event Webhook — bounce, spam, delivered)",
  "Wklej w ": "Paste into ",
  "SendGrid → Settings → Mail Settings → Event Webhook":
    "SendGrid → Settings → Mail Settings → Event Webhook",
  " i zaznacz zdarzenia: Delivered, Bounced, Dropped, Spam Reports, Unsubscribed. Bez tego raporty nie mają skąd wziąć ":
    " and select the events: Delivered, Bounced, Dropped, Spam Reports, Unsubscribed. Without it the reports have nowhere to get the ",
  "bounce rate": "bounce rate",
  "Wygenerować nowy adres?": "Generate a new URL?",
  "Stary adres przestanie działać natychmiast. Jeśli masz już skonfigurowany Inbound Parse w SendGrid, przychodzące e-maile przestaną trafiać do skrzynki, dopóki nie wkleisz tam nowego adresu.":
    "The old URL stops working immediately. If Inbound Parse is already set up in SendGrid, incoming emails will stop reaching the inbox until you paste the new URL there.",
  "Zapisano ustawienia nadawcy": "Sender settings saved",
  " Połączono": " Connected",
  "Nie połączono": "Not connected",
  "Wysyłka maili przez SendGrid — realna, nie symulowana. Klucz API ustawia się w sekcji":
    "Email sending through SendGrid — real, not simulated. The API key is set in the section",
  "Brak klucza SendGrid — wysyłka zwróci błąd, dopóki nie uzupełnisz go w sekcji Klucze i dane dostępowe.":
    "No SendGrid key — sending will fail until you add it in the Keys and credentials section.",
  "Ustaw adres nadawcy poniżej, żeby wysyłka działała.":
    "Set the sender address below for sending to work.",
  " Konfiguruj": " Configure",
  "Konfiguracja Email API (SendGrid)": "Email API configuration (SendGrid)",
  "Adres i nazwa nadawcy używane przy każdej wysyłce — także testowej z Newslettera i Email. Klucz API ustawia się osobno, w sekcji Klucze i dane dostępowe na tej stronie.":
    "Sender address and name used for every send — including test sends from Newsletter and Email. The API key is set separately, in the Keys and credentials section on this page.",
  "Adres e-mail nadawcy *": "Sender email address *",
  "Musi być zweryfikowanym nadawcą/domeną w SendGrid.":
    "Must be a verified sender/domain in SendGrid.",
  "Nazwa nadawcy": "Sender name",
  "Klinika ABC": "ABC Clinic",
  "Adres dla odpowiedzi": "Reply-to address",
  "Tu trafią odpowiedzi pacjentów. Zostaw puste, żeby odpowiadali na adres nadawcy. Żeby odpowiedzi wpadały do Skrzynki, ten adres musi być wpięty w SendGrid Inbound Parse.":
    "Patient replies go here. Leave empty to have them reply to the sender address. For replies to reach the Inbox, this address must be connected to SendGrid Inbound Parse.",
  "Wysłano testowego SMS-a na {testTo}": "Test SMS sent to {testTo}",
  "Wysyłka SMS przez Twilio — realna, nie symulowana. Account SID i Auth Token ustawia się w sekcji":
    "SMS sending through Twilio — real, not simulated. The Account SID and Auth Token are set in the section",
  "Brak danych Twilio — wysyłka zwróci błąd, dopóki nie uzupełnisz ich w sekcji Klucze i dane dostępowe.":
    "No Twilio credentials — sending will fail until you add them in the Keys and credentials section.",
  "Dodaj co najmniej jednego nadawcę poniżej, żeby wysyłka działała.":
    "Add at least one sender below for sending to work.",
  "Skonfigurowanych nadawców: ": "Configured senders: ",
  " — w tym numer zdolny odbierać odpowiedzi.": " — including a number that can receive replies.",
  " — żaden nie odbierze odpowiedzi (same nazwy alfanumeryczne).":
    " — none can receive replies (alphanumeric names only).",
  " Nadawcy": " Senders",
  " Wyślij testowo": " Send a test",
  "Nadawcy SMS (Twilio)": "SMS senders (Twilio)",
  "Możesz mieć kilku nadawców równocześnie. Domyślny jest używany wszędzie tam, gdzie krok automatyzacji nie wskazuje innego. Dane uwierzytelniające ustawia się osobno, w sekcji Klucze i dane dostępowe na tej stronie.":
    "You can have several senders at once. The default one is used wherever an automation step does not name another. Credentials are set separately, in the Keys and credentials section on this page.",
  "Numer w formacie E.164, np. +48123456789.": "Number in E.164 format, e.g. +48123456789.",
  "Wiadomość testowa z PRM Core": "Test message from PRM Core",

  // Canva
  "Połączono z Canvą.": "Connected to Canva.",
  "Nie udało się połączyć z Canvą": "Could not connect to Canva",
  "Nie udało się rozpocząć logowania": "Could not start signing in",
  "Odłączono konto Canvy.": "Canva account disconnected.",
  Canva: "Canva",
  " Brak kluczy integracji": " Integration keys missing",
  "Uzupełnij Client ID i Client secret w sekcji":
    "Fill in the Client ID and Client secret in the section",
  "Klucze i dane dostępowe": "Keys and credentials",
  "na górze tej strony.": "at the top of this page.",
  Połączono: "Connected",
  " — konto {accountName}": " — account {accountName}",
  "Uprawnienia: ": "Permissions: ",
  ". Wyłącznie odczyt: projektów w Canvie nie da się stąd zmienić ani skasować.":
    ". Read-only: Canva designs cannot be changed or deleted from here.",
  "Ostatni błąd: ": "Last error: ",
  "Odłącz konto": "Disconnect account",
  "Klucze są na miejscu. Zaloguj się do Canvy, żeby móc wybierać projekty i przenosić je do Design Studia.":
    "The keys are in place. Sign in to Canva to choose designs and bring them into Design Studio.",
  " Połącz z Canvą": " Connect to Canva",

  // Contact webhook
  "Skopiowano {what}.": "Copied {what}.",
  " Webhook kontaktów i rezerwacji": " Contact and booking webhook",
  "Nowy kontakt / lead": "New contact / lead",
  "Kopiuj adres": "Copy URL",
  "Rezerwacja wizyty": "Visit booking",
  "Sekret — nagłówek ": "Secret — header ",
  "X-Webhook-Secret": "X-Webhook-Secret",
  Ukryj: "Hide",
  Pokaż: "Show",
  "Kopiuj sekret": "Copy secret",
  "Wygeneruj nowy sekret": "Generate a new secret",
  "Ten sam sekret obsługuje oba adresy. Traktuj go jak hasło — kto go ma, może zakładać kontakty w bazie placówki.":
    "The same secret serves both URLs. Treat it like a password — whoever has it can create contacts in the clinic's database.",
  "Wygenerować nowy sekret?": "Generate a new secret?",
  "Nie udało się wygenerować nowego sekretu.": "Could not generate a new secret.",
  "Wygeneruj nowy": "Generate new",

  // Credentials
  "Nie udało się wczytać stanu kluczy.": "Could not load the key status.",
  " Wczytywanie kluczy…": " Loading keys…",
  "Klucze i dane dostępowe integracji ustawia administrator.":
    "Integration keys and credentials are set by an administrator.",
  " Klucze i dane dostępowe": " Keys and credentials",
  "Zapisane tu wartości są szyfrowane w bazie i nigdy nie wracają do przeglądarki — widać tylko ich końcówkę. Mają pierwszeństwo przed plikiem ":
    "Values saved here are encrypted in the database and never sent back to the browser — only their last characters are shown. They take precedence over the ",
  ".env": ".env",
  " na serwerze. Każda zmiana trafia do dziennika zdarzeń (kto i kiedy, bez wartości).":
    " file on the server. Every change goes to the event log (who and when, without the value).",
  "Przeniesiono do panelu: {length}": "Moved to the panel: {length}",
  "Integracje działają dalej bez przerwy.": "Integrations keep working without interruption.",
  "Pominięto: {length} — zostają w pliku .env": "Skipped: {length} — they stay in the .env file",
  "Nie przeniesiono": "Not moved",
  " — działają na danych z pliku ": " — they run on data from the ",
  ". Nie trzeba ich łączyć od nowa.": " file. There is no need to reconnect them.",
  "Możesz przenieść te wartości do panelu jednym kliknięciem — bez przepisywania. Plik":
    "You can move these values to the panel with one click — no retyping. The",
  " zostaje nietknięty, a to, co już ustawiono w panelu, nie zostanie nadpisane.":
    " file stays untouched, and anything already set in the panel will not be overwritten.",
  "Przenieś z .env do panelu (": "Move from .env to the panel (",
  " Klucz szyfrujący jest ustawiony — zapis z panelu działa.":
    " The encryption key is set — saving from the panel works.",
  "Zapis z panelu jest wyłączony — brak klucza szyfrującego":
    "Saving from the panel is disabled — no encryption key",
  "Klucz szyfrujący ma zły format": "The encryption key has the wrong format",
  "Na serwerze dopisz do pliku ": "On the server, add to the ",
  " zmienną ": " file the variable ",
  PRM_SECRETS_KEY: "PRM_SECRETS_KEY",
  " — 64 znaki szesnastkowe (polecenie": " — 64 hexadecimal characters (command",
  ") — i odtwórz kontener poleceniem ": ") — and recreate the container with ",
  "docker compose up -d": "docker compose up -d",
  ". Do tego czasu integracje działają na kluczach z ":
    ". Until then integrations use the keys from ",
  ", a panel tylko pokazuje ich stan.": ", and the panel only shows their status.",
  "{name}: zapisano": "{name}: saved",
  "Nie zapisano": "Not saved",
  "{label}: usunięto z panelu": "{label}: removed from the panel",
  "Nie usunięto": "Not removed",
  "Nie wygenerowano": "Not generated",
  "Nowy token — skopiuj go teraz, później nie będzie widoczny.":
    "New token — copy it now, it will not be shown again.",
  Skopiowano: "Copied",
  "Nie udało się skopiować — zaznacz i skopiuj ręcznie.":
    "Could not copy — select and copy it manually.",
  "Najpierw zapisz zmiany — sprawdzane są zapisane dane.":
    "Save your changes first — the saved values are checked.",
  "Sprawdź połączenie": "Test connection",
  "Wygeneruj nowy token": "Generate a new token",
  "Wygeneruj token": "Generate token",
  "Usunąć „": "Remove “",
  "” z panelu?": "” from the panel?",
  "System wróci do wartości z pliku ": "The system will fall back to the value in the ",
  " na serwerze, a jeśli jej tam nie ma — integracja przestanie działać do czasu ponownego wpisania.":
    " file on the server, and if it is not there — the integration stops working until it is entered again.",
  " Do tego czasu używana jest wartość z .env.": " Until then the value from .env is used.",
  " Usuń z panelu": " Remove from panel",
  Włączone: "On",
  Wyłączone: "Off",
  "Wpisz wartość": "Enter a value",
  "Wpisz nową wartość, żeby zmienić": "Enter a new value to change it",

  // Booking system pause
  Wstrzymano: "Paused",
  Wznowiono: "Resumed",
  "Nie udało się przestawić": "Could not switch",
  "Przetworzono {przetworzone}, odrzucono {odrzucone}, błędów {bledy}.":
    "Processed {przetworzone}, rejected {odrzucone}, errors {bledy}.",
  "Przetwarzanie nie powiodło się": "Processing failed",
  "Odrzucono {odrzucone} zaległych rezerwacji.": "Rejected {odrzucone} queued bookings.",
  "Synchronizacja przez API": "API sync",
  "Pobieranie historii wizyt, statusów i danych pacjentów. Po wznowieniu dociągnie to, co się zmieniło — nic nie przepada.":
    "Fetching visit history, statuses and patient data. After resuming it catches up on what changed — nothing is lost.",
  "Webhook rezerwacji": "Booking webhook",
  "Przyjmowanie nowych rezerwacji. Po wyłączeniu zgłoszenia są":
    "Accepting new bookings. When turned off, requests are",
  "odkładane, nie odrzucane": "queued, not rejected",
  "Odłożonych rezerwacji: ": "Queued bookings: ",
  "Przetworzenie użyje aktualnych reguł i kolejności, w jakiej przyszły. Duplikaty rozpoznają się same, więc nic się nie zdublicuje.":
    "Processing uses the current rules and the order in which they arrived. Duplicates are recognised automatically, so nothing is doubled.",
  "Przetwórz zaległe (": "Process queued (",
  Odrzuć: "Reject",
  "Pamiętaj o włączeniu z powrotem — dopóki jest wstrzymane, karty pacjentów nie dostają statusów wizyt ani historii.":
    "Remember to turn it back on — while paused, patient cards get no visit statuses or history.",

  // Meta lead ads
  " nasłuchuje": " listening",
  " bez subskrypcji": " not subscribed",
  "Ostatni lead: ": "Last lead: ",
  "Odłącz stronę": "Disconnect page",
  "Strona odłączona.": "Page disconnected.",
  "Kontakty, które już weszły, zostają.": "Contacts that already came in stay.",
  "Tagi dla leadów z tej strony": "Tags for leads from this page",
  "np. meta-lead, kardiologia": "e.g. meta-lead, cardiology",
  Status: "Status",
  "lead / patient / puste": "lead / patient / empty",
  "Po przecinku. Zostaw puste, jeśli lead ma wejść bez tagu albo bez statusu — kontakt bez statusu nie trafi jednak do segmentu filtrującego po statusie.":
    "Comma-separated. Leave empty if the lead should come in without a tag or status — but a contact without a status will not be in a segment that filters by status.",
  "Zapisane.": "Saved.",
  " Facebook Lead Ads": " Facebook Lead Ads",
  "Leady z kampanii wpadają wprost do systemu — bez Zapiera i bez opłaty za zadanie.":
    "Leads from campaigns go straight into the system — no Zapier and no per-task fee.",
  "Nie udało się pobrać zaległych.": "Could not fetch missed leads.",
  "Pobrano {leads} leadów z {pages} stron.": "Fetched {leads} leads from {pages} pages.",
  " Pobierz zaległe": " Fetch missed leads",
  "Nie można rozpocząć": "Cannot start",
  " Podłącz stronę": " Connect page",
  "Brak App ID albo App Secret aplikacji Meta — uzupełnij je w sekcji":
    "The Meta app's App ID or App Secret is missing — fill them in in the section",
  ". Bez nich logowanie do Facebooka nie ruszy.": ". Without them Facebook sign-in will not start.",
  "Nie podłączono żadnej strony. Kliknij ": "No page connected. Click ",
  "Podłącz stronę": "Connect page",
  " — Facebook zapyta o zgodę, a my zapiszemy się na powiadomienia o leadach ze wszystkich stron, na których możesz reklamować.":
    " — Facebook will ask for permission, and we will subscribe to lead notifications from every page you can advertise on.",
};
