/** Server messages, part 2: checks, documents, fields, funnels, sync, webhooks, segments. */
export const server2: Record<string, string> = {
  Twilio: "Twilio",
  Meta: "Meta",
  "Google odrzucił klucz (HTTP 400) — klucz jest błędny.":
    "Google rejected the key (HTTP 400) — the key is wrong.",
  "{what} odpowiedział HTTP {status}.": "{what} responded with HTTP {status}.",
  "Klucz {what} działa.": "The {what} key works.",
  "Meta odrzuciła dane aplikacji: {v0}.": "Meta rejected the app credentials: {v0}.",
  "Połączono z aplikacją {v0}.": "Connected to app {v0}.",
  "Połączono z kontem Canva{v0}.": "Connected to Canva account{v0}.",
  "Konto Canva jest podłączone, ale token nie działa — kliknij „Połącz konto” ponownie.":
    "The Canva account is connected, but the token does not work — click “Connect account” again.",
  "Canva odrzuciła Client ID albo Client secret.": "Canva rejected the Client ID or Client secret.",
  "Canva odpowiedziała HTTP {status} — spróbuj za chwilę.":
    "Canva responded with HTTP {status} — try again in a moment.",
  "Canva przyjęła Client ID i Client secret. Konto nie jest jeszcze podłączone — zrób to przyciskiem „Połącz konto” w karcie Canva.":
    "Canva accepted the Client ID and Client secret. No account is connected yet — do it with the “Connect account” button on the Canva card.",
  "Dla tej integracji nie ma sprawdzenia połączenia.":
    "There is no connection test for this integration.",
  "Brak odpowiedzi w 10 s — sprawdź, czy serwer ma dostęp do internetu.":
    "No response within 10 s — check that the server has internet access.",
  "Nie udało się połączyć: {v0}.": "Could not connect: {v0}.",
  "Usunięto z panelu dane dostępowe: {v0}.": "Credentials removed from the panel: {v0}.",
  "dayLocator: granic musi być o jedną więcej niż dni.":
    "dayLocator: there must be one more boundary than days.",

  // Documents, senders
  "Plik jest pusty.": "The file is empty.",
  "Plik jest za duży (limit {v0} MB).": "The file is too large (limit {v0} MB).",
  "Ten typ pliku nie jest przyjmowany ({v0}). Dozwolone: PDF, zdjęcia, dokumenty Office, CSV i pliki tekstowe.":
    "This file type is not accepted ({v0}). Allowed: PDF, images, Office documents, CSV and text files.",
  "Dokument nie istnieje.": "The document does not exist.",
  "Nie udało się usunąć pliku z dysku.": "Could not delete the file from disk.",
  "Nadawca musi mieć nazwę.": "The sender must have a name.",
  "Ten nadawca już nie istnieje.": "This sender no longer exists.",
  "To jedyny nadawca — wiadomości muszą mieć czym się podpisać.":
    "This is the only sender — messages must have something to be signed with.",

  // Contact fields, statuses
  "PRM ID": "PRM ID",
  "Identyfikator kontaktu w eksportach i korespondencji — nadawany automatycznie.":
    "The contact's identifier in exports and correspondence — assigned automatically.",
  "Klucz łączący wysyłki, otwarcia i odpowiedzi z pacjentem — musi być unikalny.":
    "The key linking sends, opens and replies to the patient — must be unique.",
  "Celowo pominięty w personalizacji wiadomości.":
    "Deliberately left out of message personalisation.",
  "Wartości są zaszyte w kodzie (lead / active / patient / inactive) — można zmienić nazwę pola, nie listę.":
    "The values are fixed in code (lead / active / patient / inactive) — you can rename the field, not the list.",
  "Tag „nie-kontaktowac” blokuje każdą wysyłkę do tego kontaktu.":
    "The “nie-kontaktowac” tag blocks every send to this contact.",
  "Źródło pozyskania": "Acquisition source",
  "Medium pozyskania": "Acquisition medium",
  "Kampania pozyskania": "Acquisition campaign",
  "Data dodania": "Date added",
  "Podaj nazwę pola.": "Enter the field name.",
  "Pole typu „lista wyboru” potrzebuje przynajmniej jednej opcji.":
    "A “dropdown” field needs at least one option.",
  "Nazwa pola nie może być pusta.": "The field name cannot be empty.",
  "Pole nie istnieje.": "The field does not exist.",
  "Pola systemowego nie da się usunąć — można je ukryć.":
    "A system field cannot be deleted — it can be hidden.",
  "Podaj nazwę statusu.": "Enter the status name.",
  "Nazwa musi zawierać litery lub cyfry.": "The name must contain letters or digits.",
  "Nie znaleziono statusu.": "Status not found.",
  "Statusu wbudowanego nie można usunąć — można zmienić jego nazwę.":
    "A built-in status cannot be deleted — it can be renamed.",
  "Status ma {n} {v1}. Przenieś je najpierw na inny status.":
    "The status has {n} {v1}. Move them to another status first.",

  // Sample funnels
  "Nowe zapytanie ws. konsultacji ENT": "New ENT consultation enquiry",
  "Recepcja wykonała telefon": "Reception made a call",
  Konsultacja: "Consultation",
  "Pierwsza wizyta u laryngologa": "First visit to the ENT specialist",
  Diagnostyka: "Diagnostics",
  "Audiometria / badania": "Audiometry / tests",
  Leczenie: "Treatment",
  "Plan leczenia w toku": "Treatment plan in progress",
  "Zapytanie z reklamy / formularza": "Enquiry from an ad / form",
  "Wizyta wstępna i wycena": "Initial visit and quote",
  Zabieg: "Procedure",
  "Pierwszy zabieg wykonany": "First procedure done",
  Kontrola: "Check-up",
  "Wizyta kontrolna po zabiegu": "Check-up visit after the procedure",
  "Stały klient": "Regular client",
  "Powracający na kolejne zabiegi": "Returning for further procedures",
  "Wstępne zainteresowanie implantem": "Initial interest in an implant",
  "Wywiad i wstępna ocena": "Interview and initial assessment",
  "Pełne badania słuchu": "Full hearing tests",
  Decyzja: "Decision",
  "Konsultacja chirurgiczna": "Surgical consultation",
  Wszczepienie: "Implantation",
  "Pacjent zakwalifikowany / po zabiegu": "Patient qualified / after surgery",

  // Booking system
  "Webhook rezerwacji WSTRZYMANY — przychodzące rezerwacje są odkładane, nie odrzucane.":
    "Booking webhook PAUSED — incoming bookings are queued, not rejected.",
  "Webhook rezerwacji wznowiony.": "Booking webhook resumed.",
  "Zaległe rezerwacje przetworzone: {przetworzone} przyjętych, {odrzucone} odrzuconych, {bledy} błędów.":
    "Queued bookings processed: {przetworzone} accepted, {odrzucone} rejected, {bledy} errors.",
  "Zaległe rezerwacje odrzucone ręcznie: {ile}.": "Queued bookings rejected manually: {ile}.",
  "Wizyta (usługa {idxWariantu})": "Visit (service {idxWariantu})",
  Wizyta: "Visit",
  "Nie rozpoznano żadnego pola identyfikującego (imię, nazwisko, telefon, e-mail). Sprawdź nazwy pól formularza.":
    "No identifying field recognised (first name, last name, phone, email). Check the form's field names.",

  // MCP (already English)
  "not found": "not found",
  "Get contact": "Get contact",
  "Get a single PRM Core contact by id or PRM ID, including their recent activity timeline.":
    "Get a single PRM Core contact by id or PRM ID, including their recent activity timeline.",
  "No contact found for id: {id}": "No contact found for id: {id}",
  "List automations": "List automations",
  "List PRM Core marketing/care automations with status, trigger, and how many contacts have entered them.":
    "List PRM Core marketing/care automations with status, trigger, and how many contacts have entered them.",
  "List contacts": "List contacts",
  "List PRM Core contacts (patients and leads). Optionally filter by status or free-text search across name, email, phone, and PRM ID.":
    "List PRM Core contacts (patients and leads). Optionally filter by status or free-text search across name, email, phone, and PRM ID.",

  // Media
  "Nieobsługiwany format: {mimeType}. Grafiki: PNG, JPG, GIF, WebP. Dokumenty: PDF, DOC(X), XLS(X), TXT.":
    "Unsupported format: {mimeType}. Images: PNG, JPG, GIF, WebP. Documents: PDF, DOC(X), XLS(X), TXT.",
  "Pusty plik.": "Empty file.",
  "Grafika ma {v0} MB — limit to 8 MB. Do e-maila i tak potrzebna jest wersja zoptymalizowana.":
    "The image is {v0} MB — the limit is 8 MB. An email needs an optimised version anyway.",
  "Dokument ma {v0} MB — limit to 20 MB, bo tyle wynosi sufit załączników w wysyłce.":
    "The document is {v0} MB — the limit is 20 MB, the ceiling for attachments in a send.",
  "Nie znaleziono grafiki źródłowej w bibliotece Media.":
    "Source image not found in the Media library.",
  "Nie udało się odczytać wymiarów grafiki.": "Could not read the image dimensions.",
  "kadr po przeliczeniu ma {width}×{height} px (minimum {MIN_PX})":
    "the frame is {width}×{height} px after scaling (minimum {MIN_PX})",

  // Meta leads
  "Meta: lead ze strony {pageId}, która nie jest podłączona w Integracjach.":
    "Meta: lead from page {pageId}, which is not connected in Integrations.",
  "Meta: nie pobrano leada {leadgenId} — {message}":
    "Meta: lead {leadgenId} not fetched — {message}",
  "Meta: dopytanie zaległości dla strony {v0} nie powiodło się — {message}":
    "Meta: fetching missed leads for page {v0} failed — {message}",
  "Meta: dopytanie zaległości — {leads} leadów z {pages} stron.":
    "Meta: fetched missed leads — {leads} leads from {pages} pages.",
  "Meta: dopytanie zaległości padło — {v0}": "Meta: fetching missed leads crashed — {v0}",

  // Countries
  Polska: "Poland",
  Niemcy: "Germany",
  "Wielka Brytania": "United Kingdom",
  Ukraina: "Ukraine",
  Czechy: "Czechia",
  Słowacja: "Slovakia",
  Litwa: "Lithuania",
  Holandia: "Netherlands",
  Irlandia: "Ireland",
  "USA / Kanada": "USA / Canada",

  // Daily security report
  "Zgłasza omówienie stanu bezpieczeństwa z ostatniej doby. Wywołaj dokładnie raz.":
    "Reports a review of the security state over the last 24 hours. Call exactly once.",
  "Jedno zdanie do tematu wiadomości, do 120 znaków.":
    "One sentence for the email subject, up to 120 characters.",
  "2-5 zdań: co się działo i co to znaczy.": "2–5 sentences: what happened and what it means.",
  "Konkretne kroki. Pusta tablica, gdy nic nie trzeba robić.":
    "Specific steps. An empty array when nothing needs doing.",
  "PRM_Agent — {ZNACZNIK} (dobowa analiza).": "PRM_Agent — {ZNACZNIK} (daily analysis).",
  "Model nie wywołał narzędzia.": "The model did not call the tool.",
  "{ZNACZNIK}: brak PRM_SECURITY_REPORT_TO w .env — raport za {dzis} nie wyszedł.":
    "{ZNACZNIK}: PRM_SECURITY_REPORT_TO missing in .env — the report for {dzis} was not sent.",
  "{ZNACZNIK}: brak adresu nadawcy — raport za {dzis} nie wyszedł.":
    "{ZNACZNIK}: no sender address — the report for {dzis} was not sent.",
  "{ZNACZNIK}: wysłany za {dzis} do {adresat} (werdykt: {werdykt}).":
    "{ZNACZNIK}: sent for {dzis} to {adresat} (verdict: {werdykt}).",

  // Segment definition
  Anna: "Anna",
  Kowalska: "Smith",
  "Porównanie bez rozróżniania wielkości liter.": "Case-insensitive comparison.",
  "Segment (etykieta)": "Segment (label)",
  "Segment nadany wprost: ręcznie na karcie kontaktu, akcją „Zmień segment” albo przez PRM_Agent. Każdy taki segment ma własną pozycję na liście segmentów.":
    "A directly assigned segment: by hand on the contact card, with the “Change segment” action or by PRM_Agent. Each such segment has its own entry in the segment list.",
  "Zgoda — marketing e-mail": "Consent — email marketing",
  "Zgoda — marketing SMS": "Consent — SMS marketing",
  "Zgoda — profilowanie": "Consent — profiling",
  "Wejście na stronę": "Website visit",
  "Liczone z kodu śledzącego. Widoczne są tylko wizyty rozpoznanego pacjenta (wejście z linku w e-mailu) — ruch anonimowy nie ma do kogo się przypiąć.":
    "Counted from the tracking code. Only visits by a recognised patient (arriving from an email link) are visible — anonymous traffic cannot be linked to anyone.",
  "Otwarcie wiadomości": "Message opened",
  "Wybierz konkretną wiadomość z Newslettera albo Emaila, albo zostaw „dowolna”. Uwaga: dopóki adres aplikacji to localhost, otwarcia nie są w ogóle rejestrowane — ten warunek będzie pusty niezależnie od wyboru.":
    "Choose a specific message from Newsletter or Email, or leave “any”. Note: while the app's address is localhost, opens are not recorded at all — this condition will be empty whatever you choose.",
  "Wybierz konkretną wiadomość z Newslettera albo Emaila, albo zostaw „dowolna”.":
    "Choose a specific message from Newsletter or Email, or leave “any”.",
  "Rezerwacja wizyty — usługa": "Visit booking — service",
  "konsultacja — puste = dowolna usługa": "consultation — empty = any service",
  "Dopasowanie po nazwie usługi, tak jak widział ją pacjent. Rezerwacje online — wizyty umówione telefonicznie tu nie trafiają.":
    "Matched by the service name as the patient saw it. Online bookings — visits booked by phone do not show up here.",
  "Rezerwacja wizyty — specjalizacja": "Visit booking — specialty",
  "otolaryngolog — puste = dowolna specjalizacja": "otolaryngologist — empty = any specialty",
  "Stabilniejsze niż nazwa usługi: nazwa usługi bywa dopisywana ręcznie i zmienia się między terminami, specjalizacja nie.":
    "More stable than the service name: the service name is sometimes typed by hand and changes between appointments, the specialty does not.",
  "Rezerwacja wizyty — lekarz": "Visit booking — doctor",
  "Kowalski — puste = dowolny lekarz": "Smith — empty = any doctor",
  "Fragment nazwiska wystarczy — dopasowanie szuka go w całym opisie lekarza.":
    "Part of the surname is enough — the match looks for it in the whole doctor description.",
  "Wizyta — stan": "Visit — state",
  "Odbyła się (zakończona)": "Took place (completed)",
  "Umówiona, jeszcze przed terminem": "Booked, not yet due",
  "email / sms / form / survey — puste = dowolny kanał":
    "email / sms / form / survey — empty = any channel",
  "Segment nadawany jako etykieta na karcie kontaktu.":
    "A segment assigned as a label on the contact card.",
  "Segment przejęty z etykiet nadanych na kartach kontaktów.":
    "A segment taken over from labels assigned on contact cards.",
  "Segment musi mieć nazwę.": "The segment must have a name.",
  "Segment o nazwie „{name}” już istnieje.": "A segment named “{name}” already exists.",
  "Segment nie istnieje.": "The segment does not exist.",

  // SMS senders, table columns, tracking, visits
  "Podaj nadawcę.": "Enter the sender.",
  "Nadawca „{value}” jest już na liście.": "Sender “{value}” is already on the list.",
  "Kontakt (e-mail + telefon)": "Contact (email + phone)",
  "Pusta domena.": "Empty domain.",
  "Strona odpowiedziała kodem {status}.": "The website responded with code {status}.",
  "Nie udało się pobrać strony: {v0}": "Could not fetch the website: {v0}",
  "Odrzucono rezerwację — {error} Otrzymane pola: {v1}.":
    "Booking rejected — {error} Fields received: {v1}.",
  "Rezerwacja bez e-maila i bez telefonu — nie ma czym zidentyfikować pacjenta.":
    "A booking without email and phone — nothing to identify the patient by.",
  "Pole „title” (nazwa usługi) jest wymagane.": "The “title” field (service name) is required.",

  // Public endpoints and webhooks
  "Canva: powrót z logowania ({v0}).": "Canva: return from sign-in ({v0}).",
  "bez parametrów": "no parameters",
  "Canva: powrót z logowania z nieznanym `state` — odrzucony.":
    "Canva: return from sign-in with an unknown `state` — rejected.",
  "Canva połączona{v0}. Zakresy: {scopes}.": "Canva connected{v0}. Scopes: {scopes}.",
  "Canva: połączenie nie powiodło się — {powod}": "Canva: connection failed — {powod}",
  "Body musi być poprawnym JSON-em.": "The body must be valid JSON.",
  "Pole „email” jest wymagane.": "The “email” field is required.",
  "Formularz z pop-upu — dodatkowe pola:\n{v0}": "Pop-up form — additional fields:\n{v0}",
  "Formularz na stronie": "Website form",
  "Meta: powrót z logowania ({v0}).": "Meta: return from sign-in ({v0}).",
  "Meta: powrót z logowania z nieznanym `state` — odrzucony.":
    "Meta: return from sign-in with an unknown `state` — rejected.",
  "Meta: podłączanie nie powiodło się — {message}": "Meta: connecting failed — {message}",
  "Brak queueId.": "Missing queueId.",
  "Pop-up „{name}” wyświetlony pacjentowi na stronie.":
    "Pop-up “{name}” shown to the patient on the website.",
  "Brak odpowiedzi do zapisania.": "No answers to save.",
  "Nie rozpoznano pacjenta — ankieta wymaga pola e-mail.":
    "Patient not recognised — the survey requires an email field.",
  "Odpowiedzi z ankiety (pop-up):\n{body}": "Survey answers (pop-up):\n{body}",
  "Odrzucono wywołanie webhooka rezerwacji — nieprawidłowy lub brakujący sekret.":
    "Booking webhook call rejected — invalid or missing secret.",
  "Nieprawidłowy lub brakujący X-Webhook-Secret.": "Invalid or missing X-Webhook-Secret.",
  "Odbiór rezerwacji jest chwilowo wstrzymany. Zgłoszenie zostało odłożone i zostanie przetworzone po wznowieniu — nie wysyłaj go ponownie.":
    "Receiving bookings is temporarily paused. The request has been queued and will be processed after resuming — do not send it again.",
  "Odrzucono wywołanie webhooka testu słuchu — nieprawidłowy lub brakujący sekret.":
    "Hearing test webhook call rejected — invalid or missing secret.",
  "Odrzucono zgłoszenie z testu słuchu — {error}": "Hearing test submission rejected — {error}",
  "Odrzucono wywołanie webhooka poczty przychodzącej — niepoprawny sekret.":
    "Inbound email webhook call rejected — invalid secret.",
  "E-mail od nieznanego adresu {from} — brak kontaktu w bazie, wiadomość nie została przypisana.":
    "Email from an unknown address {from} — no contact in the database, the message was not assigned.",
  "(bez tematu)": "(no subject)",
  "Odrzucono wywołanie webhooka SMS — niepoprawny podpis Twilio (nadawca {v0}).":
    "SMS webhook call rejected — invalid Twilio signature (sender {v0}).",
  "SMS od nieznanego numeru {from} — brak kontaktu w bazie, wiadomość nie została przypisana.":
    "SMS from an unknown number {from} — no contact in the database, the message was not assigned.",
  "Odrzucono wywołanie webhooka leadów — nieprawidłowy lub brakujący sekret.":
    "Lead webhook call rejected — invalid or missing secret.",
  "Wymagany jest „email” albo „phone” — przyszedł payload bez obu.":
    "“email” or “phone” is required — the payload had neither.",
  "Meta: nieudany uścisk dłoni webhooka — sprawdź token weryfikacji w Integracje → Klucze i dane dostępowe.":
    "Meta: webhook handshake failed — check the verify token in Integrations → Keys and credentials.",
  "Meta: powiadomienie z błędnym podpisem — odrzucone.":
    "Meta: notification with an invalid signature — rejected.",
  "Event Webhook SendGrid: żądanie z błędnym sekretem — odrzucone.":
    "SendGrid Event Webhook: request with a wrong secret — rejected.",
  "Event Webhook SendGrid: {unmatched} zdarzeń bez dopasowania do wysyłki. Sprawdź, czy wiadomości wychodzą z tej instalacji.":
    "SendGrid Event Webhook: {unmatched} events not matched to a send. Check that the messages are sent from this installation.",

  // Plural words passed as variables
  szablonów: "templates",
  " (PRM_Agent)": " (PRM_Agent)",
  segmentów: "segments",
  "h3 swallowed SSR error: {body}": "h3 swallowed SSR error: {body}",
};
