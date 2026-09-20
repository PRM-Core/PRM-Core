/** Contacts list, contact card, bulk consent, phone contacts. */
export const contacts: Record<string, string> = {
  // List
  "Kontakty — PRM Core": "Contacts — PRM Core",
  "Usunięto kontakt: {v0}": "Contact deleted: {v0}",
  "Usunięto {length} kontaktów.": "Deleted {length} contacts.",
  "Nie udało się usunąć — spróbuj ponownie.": "Could not delete — please try again.",
  "Podaj imię i nazwisko.": "Enter the first and last name.",
  "Podaj e-mail albo numer telefonu — bez żadnego z nich nie ma jak się skontaktować.":
    "Enter an email or a phone number — without either there is no way to get in touch.",
  "Nie udało się dodać kontaktu.": "Could not add the contact.",
  "Otwórz istniejący": "Open existing",
  "Dodano kontakt: {firstName} {lastName}": "Contact added: {firstName} {lastName}",
  "Nie znaleziono poprawnych kontaktów w pliku.": "No valid contacts found in the file.",
  "Nie udało się odczytać pliku CSV.": "Could not read the CSV file.",
  "Import przerwany po {inserted} kontaktach. Wgraj ten sam plik ponownie — to, co już weszło, zostanie pominięte jako duplikaty.":
    "Import stopped after {inserted} contacts. Upload the same file again — what is already in will be skipped as duplicates.",
  "Zaimportowano {inserted}, pominięto {skipped} jako duplikaty.":
    "Imported {inserted}, skipped {skipped} as duplicates.",
  "Zaimportowano {inserted} kontaktów": "Imported {inserted} contacts",
  "Nie ma czego wyeksportować — lista jest pusta.": "Nothing to export — the list is empty.",
  "Wyeksportowano {length} kontaktów.": "Exported {length} contacts.",
  "Szablon pobrany — {length} kolumn wbudowanych i {length2} pól własnych.":
    "Template downloaded — {length} built-in columns and {length2} custom fields.",
  "Szablon pobrany — {length} kolumn.": "Template downloaded — {length} columns.",
  " Import CSV": " Import CSV",
  "Eksport CSV ({length})": "Export CSV ({length})",
  "Eksport CSV{v0}": "Export CSV{v0}",
  " Zgody (": " Consent (",
  " Usuń (": " Delete (",
  "Nowy kontakt": "New contact",
  "Uzupełnij dane, aby dodać kontakt do bazy PRM Core.":
    "Fill in the details to add a contact to PRM Core.",
  Kowalski: "Smith",
  "Wystarczy e-mail albo telefon — jedno z dwóch.":
    "An email or a phone number is enough — either one.",
  Lead: "Lead",
  Aktywny: "Active",
  Pacjent: "Patient",
  "VIP; Kardiologia": "VIP; Cardiology",
  Tagi: "Tags",
  "newsletter; nowy": "newsletter; new",
  Źródło: "Source",
  Kampania: "Campaign",
  "Dodaj kontakt": "Add contact",
  "Import kontaktów z CSV": "Import contacts from CSV",
  "Obsługiwane kolumny: ": "Supported columns: ",
  "oraz pola własne: ": "and custom fields: ",
  ". Wielokrotne wartości (segmenty/tagi) oddziel średnikiem. Najprościej zacząć od „Pobierz szablon” — ma wszystkie kolumny z przykładem.":
    ". Separate multiple values (segments/tags) with a semicolon. The easiest start is “Download template” — it has every column with an example.",
  "Kliknij, aby wybrać plik CSV": "Click to choose a CSV file",
  "lub przeciągnij plik": "or drag a file here",
  " kontaktów gotowych do importu": " contacts ready to import",
  " wierszy pominiętych": " rows skipped",
  "wiersz ma": "row has",
  "wierszy ma": "rows have",
  " więcej kolumn niż nagłówek — nadmiarowe wartości ":
    " more columns than the header — the extra values ",
  przepadną: "will be lost",
  ". Zwykle to nierozdzielony przecinek w komórce, najczęściej w tagach. Wpisz je po średniku (":
    ". Usually it is an unquoted comma in a cell, most often in tags. Separate them with a semicolon (",
  "bariatria;newsletter": "bariatrics;newsletter",
  ") albo ujmij komórkę w cudzysłów (": ") or put the cell in quotes (",
  "Nierozpoznany status: ": "Unrecognised status: ",
  " — te wiersze wejdą jako ": " — these rows will be imported as ",
  ". Dozwolone wartości:": ". Allowed values:",
  "Kierunkowy dla numerów bez niego": "Country code for numbers without one",
  "dopisany do {added} z {withPhone} numerów": "added to {added} of {withPhone} numbers",
  "wszystkie numery mają już kierunkowy": "all numbers already have a country code",
  "w pliku nie ma numerów": "the file has no phone numbers",
  "Numery zapisane już międzynarodowo (np. +49…) zostają bez zmian — mieszana baza nie zamieni się w polską.":
    "Numbers already in international format (e.g. +49…) stay unchanged — a mixed list will not all get the same country code.",
  "Nie uruchamiaj automatyzacji dla tych kontaktów": "Do not start automations for these contacts",
  " — zalecane przy zaciąganiu istniejącej bazy.":
    " — recommended when bringing in an existing database.",
  "Odznaczenie sprawi, że każdy zaimportowany wiersz zostanie zgłoszony jako nowy kontakt i uruchomi aktywne automatyzacje z wyzwalaczem „Nowy kontakt” albo „Dodanie tagu” — przy ":
    "If unchecked, every imported row is reported as a new contact and starts active automations triggered by “New contact” or “Tag added” — with ",
  " wierszach to": " rows that is",
  " przebiegów i tyle samo wysyłek.": " runs and as many sends.",
  "Imię i nazwisko": "Full name",
  "Tagi / segmenty": "Tags / segments",
  "Pobierz szablon": "Download template",
  "Importuję… {v0} z {v1}": "Importing… {v0} of {v1}",
  "Importuj {v0}": "Import {v0}",
  "Usunąć kontakt {firstName} {lastName}?": "Delete contact {firstName} {lastName}?",
  "Usunąć {v0} kontaktów?": "Delete {v0} contacts?",
  " i obejmuje całą historię pacjenta: notatki, wiadomości, wizyty, zgody, wgrane dokumenty i przebiegi automatyzacji.":
    " and covers the patient's whole history: notes, messages, visits, consents, uploaded documents and automation runs.",
  "Historyczne statystyki mogą się o te osoby zmniejszyć — dziennik ich kroków też znika, bo dane pacjenta usuwamy naprawdę, a nie oznaczamy jako usunięte.":
    "Historical statistics may drop by these people — their step log is removed too, because patient data is really deleted, not just marked as deleted.",
  " więcej.": " more.",
  "Szukaj po imieniu, e-mailu, telefonie, PRM ID…": "Search by name, email, phone, PRM ID…",
  "Wszystkie statusy": "All statuses",
  " Filtry": " Filters",
  "Dostępne filtry: ": "Available filters: ",
  segment: "segment",
  " (poniżej) oraz ": " (below) and ",
  status: "status",
  " (osobne pola obok). Wybierz kilka segmentów naraz, aby zawęzić listę do kontaktów należących do dowolnego z nich.":
    " (separate fields next to it). Pick several segments to narrow the list to contacts in any of them.",
  "Brak segmentów w bazie.": "No segments in the database.",
  " Wyczyść filtry segmentów": " Clear segment filters",
  " Tagi": " Tags",
  "Dostępne tagi w bazie kontaktów. Kliknij tag, aby zobaczyć tylko kontakty, które go mają.":
    "Tags used in your contacts. Click a tag to see only the contacts that have it.",
  "Brak tagów w bazie.": "No tags in the database.",
  "Aktywne filtry:": "Active filters:",
  "Tag: ": "Tag: ",
  "Zaznacz wszystkie widoczne": "Select all visible",
  "Zaznacz {firstName} {lastName}": "Select {firstName} {lastName}",

  // Contact card
  "Kontakt — PRM Core": "Contact — PRM Core",
  "Kontakt nie został znaleziony.": "Contact not found.",
  "PRM_Agent nie odpowiedział": "PRM_Agent did not respond",
  "Nie udało się odczytać pliku.": "Could not read the file.",
  "Nie udało się wgrać dokumentu": "Could not upload the document",
  "Dokument wgrany.": "Document uploaded.",
  "Nie udało się usunąć": "Could not delete",
  "Dokument usunięty.": "Document deleted.",
  "Wiadomość od pacjenta — {v0}": "Message from the patient — {v0}",
  "Wysłano — {v0}{v1}": "Sent — {v0}{v1}",
  "Nie udało się usunąć pacjenta.": "Could not delete the patient.",
  "Nie udało się usunąć pacjenta — spróbuj ponownie.":
    "Could not delete the patient — please try again.",
  "Nie udało się zapisać zmian.": "Could not save the changes.",
  "Zapisano zmiany ({length} {v1}).": "Changes saved ({length} {v1}).",
  "Brak zmian do zapisania.": "No changes to save.",
  "Nie udało się otworzyć rozmowy.": "Could not open the conversation.",
  "Usunąć pacjenta ": "Delete patient ",
  "Usunięcie jest ": "Deletion is ",
  nieodwracalne: "irreversible",
  " i obejmuje całą kartotekę: notatki, wiadomości, wizyty, zgody, wgrane dokumenty i przebiegi automatyzacji tej osoby.":
    " and covers the whole record: this person's notes, messages, visits, consents, uploaded documents and automation runs.",
  "Historyczne statystyki mogą się o tę osobę zmniejszyć — jej dziennik też znika, bo dane pacjenta usuwamy naprawdę, a nie oznaczamy jako usunięte.":
    "Historical statistics may drop by this person — their log is removed too, because patient data is really deleted, not just marked as deleted.",
  "Usuń bezpowrotnie": "Delete permanently",
  " Kontakty": " Contacts",
  SMS: "SMS",
  " Wizyta": " Visit",
  "Adres e-mail skopiowany.": "Email address copied.",
  " Kopiuj e-mail": " Copy email",
  "PRM ID skopiowane.": "PRM ID copied.",
  " Kopiuj PRM ID": " Copy PRM ID",
  " Treści zgód": " Consent texts",
  " Usuń pacjenta": " Delete patient",
  " Overview": " Overview",
  " Messages": " Messages",
  " Notes": " Notes",
  " Statistics": " Statistics",
  " Dokumenty": " Documents",
  " PRM_Agent": " PRM_Agent",
  " Automation": " Automation",
  "Dane kontaktowe": "Contact details",
  "Niezapisane zmiany": "Unsaved changes",
  "Tryb edycji": "Edit mode",
  Aktywności: "Activities",
  "Wszystkie ": "All ",
  "Brak zarejestrowanych aktywności — wysyłki, wizyty na stronie i kroki PRM Engine pojawią się tutaj automatycznie.":
    "No activity recorded — sends, website visits and PRM Engine steps will appear here automatically.",
  "Pokaż starsze (": "Show older (",
  " w kategorii „{activityCategory}”": " in the “{activityCategory}” category",
  Wiadomości: "Messages",
  "Wszystko, co poszło do pacjenta i co przyszło od niego — rozmowy ze skrzynki, wysyłki e-mail i SMS-y, w jednej osi czasu.":
    "Everything sent to the patient and received from them — inbox conversations, emails and text messages, on one timeline.",
  "Brak wiadomości. Pojawią się tu formularze i ankiety wypełnione przez pacjenta, jego odpowiedzi e-mailem i SMS-em oraz wszystko, co do niego wysłaliście.":
    "No messages. Forms and surveys the patient filled in, their email and SMS replies, and everything you sent them will appear here.",
  Odebrane: "Received",
  " Notatki": " Notes",
  "Dodaj notatkę o pacjencie...": "Add a note about the patient...",
  " Dodaj notatkę": " Add note",
  "Brak notatek. Dodaj pierwszą powyżej — pojawią się tu również odpowiedzi z ankiet i dodatkowe pola z formularzy.":
    "No notes. Add the first one above — survey answers and extra form fields will appear here too.",
  Formularz: "Form",
  "Wysłane e-maile": "Emails sent",
  "Kampanie, odpowiedzi ze skrzynki i testy — wszystko z trackingiem.":
    "Campaigns, inbox replies and tests — everything with tracking.",
  Otwarcia: "Opens",
  "Nie da się zmierzyć: piksel wskazuje na localhost. Zadziała po wdrożeniu.":
    "Cannot be measured: the pixel points to localhost. It will work once deployed.",
  "Unikalne wiadomości, nie liczba pobrań piksela.":
    "Unique messages, not the number of pixel loads.",
  "Kliknięcia w wiadomościach": "Clicks in messages",
  "Unikalne wiadomości, w które pacjent kliknął.": "Unique messages the patient clicked in.",
  "Rezerwacje wizyt": "Visit bookings",
  "Tylko rezerwacje online — te z telefonu tu nie trafiają.":
    "Online bookings only — phone bookings do not show up here.",
  "Wejścia na stronę": "Website visits",
  "Rozpoznane po tokenie z linku w wiadomości; ruch anonimowy nie liczy się tutaj.":
    "Recognised by the token in a message link; anonymous traffic does not count here.",
  "Ile razy ten pacjent wszedł do jakiegokolwiek scenariusza.":
    "How many times this patient entered any automation.",
  "Liczby obejmują całą historię kontaktu. Szczegóły — co i kiedy — są na zakładce Overview w „Aktywnościach”.":
    "The numbers cover the contact's whole history. Details — what and when — are under “Activities” on the Overview tab.",
  Dokumenty: "Documents",
  "Skierowania, wyniki, podpisane zgody. Pliki leżą na serwerze obok bazy, więc obejmuje je ta sama kopia zapasowa.":
    "Referrals, test results, signed consent forms. Files are stored on the server next to the database, so the same backup covers them.",
  "Wgraj dokument": "Upload document",
  "Brak dokumentów. Przyjmowane są PDF-y, zdjęcia, pliki Office, CSV i tekst — do 20 MB.":
    "No documents. PDFs, images, Office files, CSV and text files up to 20 MB are accepted.",
  " · wgrał(a) {uploadedBy}": " · uploaded by {uploadedBy}",
  "Pobierz {fileName}": "Download {fileName}",
  "Usuń {fileName}": "Delete {fileName}",
  "Dokumentacja medyczna: pobranie wymaga zalogowania, a każdy plik zapisuje, kto go wgrał i kiedy. Usunięcie jest nieodwracalne — plik znika z dysku.":
    "Medical records: downloading requires signing in, and every file records who uploaded it and when. Deletion is irreversible — the file is removed from disk.",
  "Podsumowanie i pytania o tego pacjenta. Agent widzi wyłącznie dane z jego karty — wizyty, notatki, wiadomości, wysyłki, zgody i automatyzacje.":
    "A summary of and questions about this patient. The agent sees only this patient's record — visits, notes, messages, sends, consents and automations.",
  "Wygeneruj podsumowanie": "Generate summary",
  "Podsumuj ponownie": "Summarise again",
  Ty: "You",
  "Czytam kartę pacjenta…": "Reading the patient record…",
  "np. Kiedy ostatnio był u nas i na co czeka?":
    "e.g. When were they last here, and what are they waiting for?",
  Zapytaj: "Ask",
  "Ostatnie wywołanie: ": "Last call: ",
  " USD. Koszty i dzienny limit ustawiasz w Ustawieniach → PRM_Agent.":
    " USD. Costs and the daily limit are set in Settings → PRM_Agent.",
  " Automatyzacje tego pacjenta": " This patient's automations",
  "Przebiegi bieżące i zakończone. Silnik jest zdarzeniowy — pacjent wchodzi do automatyzacji przez wyzwalacz, nie przez dopisanie z karty.":
    "Current and finished runs. The engine is event-driven — a patient enters an automation through its trigger, not by being added from the card.",
  "Ten pacjent nie przeszedł jeszcze przez żadną automatyzację.":
    "This patient has not been through any automation yet.",
  " · start ": " · started ",
  " · koniec {endedAt}": " · ended {endedAt}",
  "Błąd: ": "Error: ",
  "Dane przykładowe.": "Sample data.",
  Zgody: "Consent",
  "Brak zdefiniowanych zgód.": "No consents defined.",
  "Źródło: ": "Source: ",
  " · zmiana {v0}": " · changed {v0}",
  " — pacjent wypisał się sam.": " — the patient unsubscribed themselves.",
  "Wpisz tag i naciśnij Enter…": "Type a tag and press Enter…",
  Tak: "Yes",
  Nie: "No",
  "Wpisz wartość i naciśnij Enter…": "Type a value and press Enter…",
  "Lejek pacjenta": "Patient funnel",
  "Pacjent nie jest przypisany do żadnego lejka": "The patient is not in any funnel",
  "Etap ": "Stage ",
  "% ścieżki": "% of the path",
  "Ten lejek nie ma jeszcze etapów": "This funnel has no stages yet",
  "Bez lejka": "No funnel",
  " Zarządzaj lejkami": " Manage funnels",
  "Wybierz lejek powyżej, żeby poprowadzić tego pacjenta ścieżką — albo zostaw bez lejka i przypisz go automatyzacją (akcja „Przypisz do lejka”, np. po dodaniu tagu lub wejściu do segmentu).":
    "Pick a funnel above to guide this patient along a path — or leave it empty and assign it with an automation (the “Assign to funnel” action, e.g. after a tag is added or the patient enters a segment).",
  "Dodaj etapy do tego lejka w module": "Add stages to this funnel in the",
  ", żeby zobaczyć tu ścieżkę pacjenta.": " module to see the patient's path here.",
  "Cofnij etap": "Previous stage",
  "Następny etap": "Next stage",

  // Bulk consent
  "Marketing e-mail": "Email marketing",
  "newslettery i kampanie e-mailowe": "newsletters and email campaigns",
  "Marketing SMS": "SMS marketing",
  "kampanie SMS": "SMS campaigns",
  Profilowanie: "Profiling",
  "dobór treści na podstawie zachowania": "content chosen based on behaviour",
  "Bez zmian": "No change",
  Nadaj: "Grant",
  Wycofaj: "Withdraw",
  "Nie zmieniono zgód": "Consents not changed",
  "Zmieniono zgody: {changed} kontaktów.": "Consents changed: {changed} contacts.",
  "Nic się nie zmieniło.": "Nothing changed.",
  "{untouched} kontaktów miało już takie ustawienia — ich kartoteki zostały nietknięte.":
    "{untouched} contacts already had these settings — their records were left untouched.",
  "Każda zmiana trafiła na oś czasu pacjenta.": "Every change was added to the patient's timeline.",
  " Zgody — ": " Consent — ",
  kontaktów: "contacts",
  "Podstawa zgody ": "Basis for consent ",
  "np. Zgody papierowe zebrane w rejestracji, marzec 2026":
    "e.g. Paper consent forms collected at reception, March 2026",
  "Wymagana przy nadawaniu — to jedyny ślad, czym zgodę wykazać przy kontroli.":
    "Required when granting — it is the only record of how to prove consent during an audit.",
  "Opcjonalna przy wycofywaniu. Warto zapisać, skąd wzięła się decyzja.":
    "Optional when withdrawing. It is worth noting where the decision came from.",
  "Nadajesz zgodę ": "You are granting consent to ",
  " osobom naraz. Zrób to tylko wtedy, gdy naprawdę jej udzieliły — sam fakt, że ktoś jest w bazie, zgodą nie jest.":
    " people at once. Only do this if they really gave it — being in the database is not consent.",
  "Wycofanie zadziała od razu: te osoby przestaną dostawać kampanie na wskazanych kanałach.":
    "Withdrawal takes effect immediately: these people will stop receiving campaigns on the selected channels.",
  "Zapisz zgody": "Save consents",

  // Columns, cells, filters, pagination
  Kolumny: "Columns",
  "Kolumny i kolejność": "Columns and order",
  Domyślne: "Default",
  "W górę": "Up",
  "W dół": "Down",
  "Układ zapamiętywany w tej przeglądarce, osobno dla każdej listy.":
    "The layout is remembered in this browser, separately for each list.",
  nieuzupełnione: "not filled in",
  "PESEL ": "Personal ID ",
  brak: "none",
  "Szukaj — {v0}…": "Search — {v0}…",
  "Brak wartości.": "No values.",
  " / stronę": " / page",
  "Brak wyników": "No results",
  Poprzednia: "Previous",
  Następna: "Next",

  // Phone contacts
  "Kontakty telefoniczne — PRM Core": "Phone contacts — PRM Core",
  "Podaj numer telefonu — bez niego to nie jest kontakt telefoniczny.":
    "Enter a phone number — without it this is not a phone contact.",
  "Dodano kontakt telefoniczny.": "Phone contact added.",
  "Zaimportowano {inserted} numerów.": "Imported {inserted} numbers.",
  "Pominięto {skipped} — już były w bazie.": "Skipped {skipped} — already in the database.",
  "Żaden numer się nie powtórzył.": "No duplicate numbers.",
  " numerów": " numbers",
  " Import listy": " Import list",
  " Nowy numer": " New number",
  "Pacjenci znani na razie tylko z numeru — z rejestracji telefonicznej albo z importu. Karta, oś czasu, notatki i zgody są takie same jak w Kontaktach.":
    "Patients known so far only by their number — from phone bookings or an import. The card, timeline, notes and consents are the same as in Contacts.",
  "Gdy uzupełnisz imię i nazwisko, kontakt przechodzi do Kontaktów":
    "Once you fill in the first and last name, the contact moves to Contacts",
  " i znika z tej listy.": " and disappears from this list.",
  "Szukaj po numerze, imieniu, PRM ID…": "Search by number, name, PRM ID…",
  "Brak kontaktów telefonicznych. Zaimportuj listę numerów albo dodaj pierwszy ręcznie.":
    "No phone contacts. Import a list of numbers or add the first one manually.",
  "Nic nie pasuje do wyszukiwania.": "Nothing matches the search.",
  "Nowy kontakt telefoniczny": "New phone contact",
  "Wymagany jest tylko numer. Resztę można uzupełnić później na karcie.":
    "Only the number is required. The rest can be filled in later on the card.",
  "Numer telefonu *": "Phone number *",
  "Podanie imienia i nazwiska od razu przenosi kontakt do Kontaktów.":
    "Entering the first and last name moves the contact straight to Contacts.",
  "Rejestracja telefoniczna": "Phone booking",
  "RDS, protezy": "e.g. implants, dentures",
  "Zgody udzielone podczas rozmowy": "Consent given during the call",
  "Zaznacz tylko to, na co pacjent naprawdę się zgodził. Zmiana trafi na oś czasu kontaktu razem ze źródłem — to jest ślad audytowy.":
    "Tick only what the patient really agreed to. The change goes on the contact's timeline together with its source — this is the audit trail.",
  "Import listy numerów": "Import a list of numbers",
  "Plik CSV. Wystarczy kolumna z numerem — nagłówek jest opcjonalny. Rozpoznawane nagłówki: telefon, imie, nazwisko, notatka, źródło, kampania, tagi oraz zgody —":
    "A CSV file. A column with the number is enough — the header is optional. Recognised headers (Polish names): telefon, imie, nazwisko, notatka, źródło, kampania, tagi, and consents —",
  "(albo krócej: zgoda_email, zgoda_sms, zgoda_profilowanie) i":
    "(or shorter: zgoda_email, zgoda_sms, zgoda_profilowanie) and",
  " do zaimportowania": " to import",
  " pominięto (brak numeru)": " skipped (no number)",
  "Numery zapisane już międzynarodowo (np. +49…) zostają bez zmian. Podgląd niżej pokazuje numery po doklejeniu.":
    "Numbers already in international format (e.g. +49…) stay unchanged. The preview below shows the numbers after the code is added.",
  "Numery, które już są w bazie, zostaną pominięte — import nie zakłada drugiej kartoteki temu samemu pacjentowi.":
    "Numbers already in the database will be skipped — the import does not create a second record for the same patient.",
  "Zgody nadawane są wyłącznie z kolumn w pliku":
    "Consent is granted only from the columns in the file",
  " („tak”, „1” albo „x”). Pusta kolumna znaczy brak zgody — plik sam w sobie nie jest dowodem, że pacjent się zgodził. W ":
    " (“tak”, “1” or “x”). An empty column means no consent — the file itself is not proof that the patient agreed. In ",
  " wpisz, skąd ta zgoda pochodzi (np. „formularz rejestracji 2026-03”); trafi na oś czasu pacjenta jako ślad audytowy.":
    " enter where the consent comes from (e.g. “registration form 2026-03”); it goes on the patient's timeline as an audit trail.",
  PESEL: "Personal ID",
  "ten sam PESEL": "same Personal ID",
  opcjonalny: "optional",
  "e-mail ALBO telefon musi być": "email OR phone is required",
};
