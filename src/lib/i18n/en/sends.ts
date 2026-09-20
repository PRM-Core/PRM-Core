/** Sending to segments, send list, SMS senders, Media library, feeds. */
export const sends: Record<string, string> = {
  px: "px",
  "Kliknij tutaj": "Click here",
  "SMS — PRM Core": "SMS — PRM Core",
  "Nadawcy SMS": "SMS senders",
  "Możesz mieć kilku nadawców naraz — np. nazwę marki do kampanii i numer do rozmów z pacjentami. Domyślny jest używany wszędzie tam, gdzie krok nie wskazuje innego. Dane logowania Twilio ustawia się osobno, w Integracje → Klucze i dane dostępowe.":
    "You can have several senders at once — e.g. a brand name for campaigns and a number for conversations with patients. The default one is used wherever a step does not name another. Twilio credentials are set separately, in Integrations → Keys and credentials.",

  // Send to segment
  "Wysyłka do segmentu — PRM Core": "Send to segment — PRM Core",
  "Nie udało się zlecić wysyłki": "Could not start the send",
  "Wysyłka zaplanowana.": "Send scheduled.",
  "Wysyłka zlecona — ruszy w ciągu kilku sekund.":
    "Send started — it will begin within a few seconds.",
  "Wysyłka tylko {sendFrom}–{sendTo}{v2}. Poza tymi godzinami stoi. Postęp w zakładce Wysyłki.":
    "Sending only {sendFrom}–{sendTo}{v2}. Outside these hours it waits. Progress is in the Sends tab.",
  "Tempo: {hourLimit}/h{v1}. Postęp zobaczysz w zakładce Wysyłki.":
    "Pace: {hourLimit}/h{v1}. You will see the progress in the Sends tab.",
  "Odbiorcy zostaną przeliczeni minutę przed wysyłką.":
    "Recipients will be recalculated a minute before sending.",
  "Odbiorców w segmencie: {v0}.": "Recipients in the segment: {v0}.",
  "Wyślij do segmentu": "Send to segment",
  "Szablon: ": "Template: ",
  "Nie wskazano szablonu": "No template selected",
  "Nie ma szablonu „": "There is no template “",
  "” w module ": "” in the ",
  ". Sprawdź nazwę — być może został przemianowany albo usunięty.":
    " module. Check the name — it may have been renamed or deleted.",
  "Segment odbiorców *": "Recipient segment *",
  "Nie ma jeszcze żadnego segmentu. Utwórz go w zakładce Segments.":
    "There are no segments yet. Create one in the Segments tab.",
  "Wybierz segment…": "Choose a segment…",
  "przeliczam…": "recalculating…",
  " z {total} kontaktów w bazie": " of {total} contacts in the database",
  "Przelicz ponownie": "Recalculate",
  " przelicz": " recalculate",
  "Tytuł wiadomości *": "Message subject *",
  "np. Zaproszenie na bezpłatne badanie słuchu": "e.g. Invitation to a free hearing test",
  "To trafia w temat e-maila — pierwsza rzecz, którą pacjent zobaczy w skrzynce.":
    "This becomes the email subject — the first thing the patient sees in their inbox.",
  "Tagi dla odbiorców": "Tags for recipients",
  "np. kampania-sluch-2026, wrzesien": "e.g. hearing-campaign-2026, september",
  "Doklejane każdemu, kto dostanie wiadomość. Po wysyłce da się z nich zbudować segment — na przykład żeby nie wysłać tego samego drugi raz.":
    "Added to everyone who receives the message. After the send you can build a segment from them — for example, to avoid sending the same thing twice.",
  "Czas wysyłki": "Send time",
  Teraz: "Now",
  " Zaplanuj": " Schedule",
  "Ten termin już minął — wybierz przyszły albo wyślij teraz.":
    "This time has already passed — choose a future one or send now.",
  "Treść zostanie zamrożona teraz, a": "The content is frozen now, and the",
  "odbiorcy przeliczeni minutę przed wysyłką":
    "recipients are recalculated a minute before sending",
  ". Kto do tego czasu wypisze się ze zgód, nie dostanie wiadomości; kto wejdzie do segmentu — dostanie.":
    ". Anyone who withdraws consent before then will not get the message; anyone who joins the segment will.",
  " Godziny wysyłki": " Sending hours",
  "Cała doba": "All day",
  "Tylko w wybranych godzinach": "Only during selected hours",
  "Wiadomości mogą wyjść o dowolnej porze — także w nocy. Przy SMS-ach to zwykle nie jest to, czego chcesz.":
    "Messages may go out at any time — including at night. With SMS that is usually not what you want.",
  "Podaj obie godziny i niech się różnią — inaczej okno nic nie ogranicza.":
    "Enter both times, and make them different — otherwise the window does not limit anything.",
  "Wysyłka pójdzie wyłącznie między ": "Sending only between ",
  " czasu polskiego. Cisza obowiązuje od": " server time. Quiet hours run from",
  " do ": " to ",
  " — kampania nie kończy się wtedy, tylko czeka i wznawia się rano sama.":
    " — the campaign does not end then; it waits and resumes by itself in the morning.",
  "To okno przechodzi przez północ, więc wiadomości pójdą w nocy (":
    "This window crosses midnight, so messages will go out at night (",
  "). Jeśli chodziło o ciszę nocną, zamień godziny miejscami.":
    "). If you meant quiet hours at night, swap the times.",
  " Tempo wysyłki": " Sending pace",
  "Bez ograniczeń": "No limit",
  "Ogranicz liczbę wiadomości": "Limit the number of messages",
  "Wiadomości pójdą tak szybko, jak zdąży silnik — partiami po 25. Przy dużym segmencie warto ustawić limit: nagły skok wysyłki bywa czytany przez operatora SMS i filtry pocztowe jako spam.":
    "Messages go out as fast as the engine can manage — in batches of 25. With a large segment it is worth setting a limit: a sudden spike in sending can be read as spam by SMS carriers and mail filters.",
  "Maksymalnie na godzinę": "Maximum per hour",
  "np. 100": "e.g. 100",
  "Maksymalnie na dobę": "Maximum per day",
  "np. 600": "e.g. 600",
  "Limit musi być liczbą całkowitą nie mniejszą niż 1. Zostaw pole puste, jeśli ten limit ma nie obowiązywać.":
    "The limit must be a whole number of at least 1. Leave the field empty if this limit should not apply.",
  "Oba pola puste — wysyłka pójdzie bez ograniczeń.":
    "Both fields empty — the send will have no limit.",
  "Bez limitu godzinowego wysyłka pójdzie pełną parą aż do wyczerpania limitu dobowego.":
    "Without an hourly limit the send runs at full speed until the daily limit is used up.",
  "Limit dobowy jest niższy niż godzinowy — zadziała ten dobowy, a wysyłka wznowi się o północy. To poprawne, ale zwykle znaczy, że któraś liczba jest pomyłką.":
    "The daily limit is lower than the hourly one — the daily limit applies and the send resumes at midnight. This is valid, but usually means one of the numbers is a mistake.",
  " odbiorców w tym tempie zajmie": " recipients at this pace will take",
  ". Wysyłkę można w każdej chwili zatrzymać w zakładce Wysyłki.":
    ". You can stop the send at any time in the Sends tab.",
  "Do wiadomości pójdzie": "The message will include",
  załącznik: "attachment",
  załączników: "attachments",
  "z modułu Media — te same pliki, co przy wysyłce testowej.":
    "from the Media module — the same files as in the test send.",
  "Ten segment jest w tej chwili pusty. Wysyłka zostanie zlecona, ale nikt jej nie dostanie, dopóki ktoś nie spełni warunków segmentu.":
    "This segment is empty right now. The send will be started, but nobody will get it until someone meets the segment's conditions.",
  "Wiadomość dostaną wyłącznie kontakty ze zgodą marketingową na ten kanał. Reszta jest pomijana i policzona osobno.":
    "Only contacts with marketing consent for this channel get the message. The rest are skipped and counted separately.",
  "Zaplanuj wysyłkę": "Schedule send",
  "Wyślij teraz": "Send now",

  // Media
  "Media — PRM Core": "Media — PRM Core",
  "Plik w bibliotece.": "File added to the library.",
  "{length} plików w bibliotece (folder {v1}).":
    "{length} files added to the library ({v1} folder).",
  "Nie udało się wgrać pliku.": "Could not upload the file.",
  "Grafiki dla e-maili, newsletterów i pop-upów. Studio kreacji bierze pliki stąd.":
    "Images for emails, newsletters and pop-ups. The creative studio takes files from here.",
  "Wgraj pliki": "Upload files",
  " plików": " files",
  "Folder {v0} jest pusty.": "The {v0} folder is empty.",
  "Biblioteka jest pusta — wgraj pierwszą grafikę.":
    "The library is empty — upload your first image.",
  "Kopiuj ścieżkę": "Copy path",
  "Usunięto.": "Deleted.",
  "Pliki są serwowane publicznie pod ": "Files are served publicly under ",
  "/media-file/…": "/media-file/…",
  " — tego wymagają klienty pocztowe pacjentów. Nie wgrywaj tu dokumentów ani niczego prywatnego; od tego są Dokumenty na karcie kontaktu.":
    " — patients' email clients need that. Do not upload documents or anything private here; that is what Documents on the contact card are for.",

  // Feeds
  "Feedy — PRM Core": "Feeds — PRM Core",
  "Nie znaleziono danych w pliku — sprawdź, czy pierwszy wiersz to nagłówek.":
    "No data found in the file — check that the first row is the header.",
  "Nie udało się wgrać.": "Could not upload.",
  "Arkusze z danymi (CSV, XLSX), które wstawiasz w newsletterach i e-mailach jako pola dynamiczne — np. link do opinii przypisany do lekarza.":
    "Data sheets (CSV, XLSX) you insert into newsletters and emails as dynamic fields — e.g. a review link assigned to a doctor.",
  "Wgraj plik": "Upload file",
  "Co odczytałem z pliku ": "What I read from the file ",
  Arkusz: "Sheet",
  " wierszy)": " rows)",
  "Nazwa feedu": "Feed name",
  "Pod tą nazwą wstawisz pola w treści. Wgranie pliku pod istniejącą nazwą podmienia zawartość.":
    "You insert fields into content under this name. Uploading a file under an existing name replaces its content.",
  "Kolumna dopasowania": "Match column",
  "Bez dopasowania": "No matching",
  "Po tej kolumnie system znajdzie wiersz dla konkretnego pacjenta — np. nazwisko lekarza. Zostaw puste, gdy feed jest ten sam dla wszystkich.":
    "The system uses this column to find the row for a specific patient — e.g. the doctor's name. Leave empty when the feed is the same for everyone.",
  "Podgląd pierwszych trzech wierszy z ": "Preview of the first three rows of ",
  ". Sprawdź, czy nagłówki się zgadzają — przesunięty nagłówek daje bezsensowne nazwy pól.":
    ". Check that the headers are right — a shifted header gives meaningless field names.",
  "Wgraj ": "Upload ",
  " wierszy": " rows",
  "Nie ma jeszcze żadnego feedu. Wgraj plik CSV albo XLSX — kolumny mogą być dowolne.":
    "There are no feeds yet. Upload a CSV or XLSX file — any columns will do.",
  " kolumn": " columns",
  "bez dopasowania": "no matching",
  "Zmieniono kolumnę dopasowania.": "Match column changed.",
  "Feed usunięty.": "Feed deleted.",
  "Pierwsze ": "First ",
  " wierszy · plik źródłowy:": " rows · source file:",
  " Jak użyć feedu w wiadomości": " How to use a feed in a message",
  "W edytorze treści (Newsletter, Email) wstaw pole dynamiczne z listy — system złoży znacznik postaci":
    "In the content editor (Newsletter, Email) insert a dynamic field from the list — the system builds a tag like",
  "%%FEED:nazwa|pole_kontaktu|kolumna%%": "%%FEED:name|contact_field|column%%",
  ". Przy wysyłce zostanie zastąpiony wartością z wiersza pasującego do tego pacjenta.":
    ". At send time it is replaced with the value from the row matching that patient.",
  "Gdy dla kogoś nie ma pasującego wiersza, pole zostaje puste, a informacja o tym trafia do dziennika kampanii — nie znika po cichu.":
    "When there is no matching row for someone, the field stays empty and this is recorded in the campaign log — it does not disappear silently.",

  // Send list
  "Wysyłki — PRM Core": "Sends — PRM Core",
  Zaplanowana: "Scheduled",
  Wstrzymana: "Paused",
  Zakończona: "Finished",
  Odwołana: "Cancelled",
  "Nie udało się wznowić": "Could not resume",
  "Wysyłka wznowiona.": "Send resumed.",
  "Ruszy od miejsca, w którym stanęła — nikt nie dostanie wiadomości drugi raz.":
    "It continues from where it stopped — nobody will get the message twice.",
  "Nie udało się anulować": "Could not cancel",
  "Wysyłka anulowana.": "Send cancelled.",
  "Tego już nie da się cofnąć. Wiadomości, które wyszły, zostają.":
    "This cannot be undone. Messages already sent remain sent.",
  "Nie udało się zatrzymać": "Could not pause",
  "Wysyłka wstrzymana.": "Send paused.",
  "Wiadomości, które wyszły, zostają. Możesz ją wznowić albo anulować na dobre.":
    "Messages already sent remain sent. You can resume it or cancel it for good.",
  "Kampanie do segmentów — zaplanowane, trwające i zakończone. Wysyłka z ustawionym limitem tempa rozkłada się na godziny albo dni; tutaj widać, na czym stoi.":
    "Campaigns to segments — scheduled, running and finished. A send with a pace limit spreads over hours or days; this is where you see how far it has got.",
  "Wczytywanie…": "Loading…",
  "W toku": "In progress",
  Zakończone: "Finished",
  "segment „": "segment “",
  " · start {v0}": " · start {v0}",
  Zatrzymaj: "Pause",
  Wznów: "Resume",
  " Anuluj": " Cancel",
  " Raport": " Report",
  " wysłanych": " sent",
  " pominiętych (brak zgody)": " skipped (no consent)",
  " błędów": " errors",
  " odbiorców": " recipients",
  " wysyłka ": " sending ",
  " limit ": " limit ",
  "w tej godzinie: ": "this hour: ",
  "dziś: ": "today: ",
  "Poza godzinami wysyłki — kampania wznowi się": "Outside sending hours — the campaign resumes",
  ". To nie jest błąd: czeka na otwarcie okna ":
    ". This is not an error: it is waiting for the window ",
  "Limit wyczerpany — wysyłka wznowi się ": "Limit reached — the send resumes ",
  ". To nie jest błąd: kampania czeka na wolne miejsce w limicie.":
    ". This is not an error: the campaign is waiting for room in the limit.",
};
