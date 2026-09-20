/** Segments, funnels, doctors, treatment plans. */
export const segments: Record<string, string> = {
  "Segmenty — PRM Core": "Segments — PRM Core",
  "{length} {v1} · liczba osób przeliczana na bieżąco z bazy":
    "{length} {v1} · people counted live from the database",
  " Nowy segment": " New segment",
  "Nazwa segmentu": "Segment name",
  Warunki: "Conditions",
  "Osób teraz": "People now",
  Zmodyfikowano: "Modified",
  Przez: "By",
  "Nie ma jeszcze żadnego segmentu. „Nowy segment” otwiera builder — warunki liczą się z realnej bazy.":
    "There are no segments yet. “New segment” opens the builder — conditions are evaluated against the real database.",
  "Żaden segment nie pasuje do wyszukiwania.": "No segment matches the search.",
  "Gotowy do użycia": "Ready to use",
  " stały": " permanent",
  "Segment doraźny — zniknie sam, chyba że oznaczysz go jako stały.":
    "Temporary segment — it disappears by itself unless you mark it as permanent.",
  "Usuń segment": "Delete segment",
  "Segment dynamiczny nie jest listą osób, tylko zestawem warunków.":
    "A dynamic segment is not a list of people but a set of conditions.",
  "Przynależność liczy się przy każdym odczycie, więc pacjent, który wczoraj dostał tag, jest w segmencie dziś, bez żadnego odświeżania. Dlatego nie ma tu przycisku „przelicz” — nie ma czego przeliczać na zapas.":
    "Membership is evaluated on every read, so a patient who got a tag yesterday is in the segment today without any refresh. That is why there is no “recalculate” button — there is nothing to precompute.",
  "Segmenty nadawane ręcznie też są tutaj.": "Manually assigned segments are here too.",
  " Przypisanie na karcie kontaktu, akcja „Zmień segment” i PRM_Agent zakładają segment o definicji „ma tę etykietę”, więc wszystko, czego używa placówka, jest widoczne na tej liście. Na karcie kontaktu można wybrać wyłącznie segment, który już tu istnieje — nazwy nie wpisuje się z ręki, bo „VIP” i „vip ” to dla automatyzacji dwie różne rzeczy.":
    " Assigning on the contact card, the “Change segment” action and PRM_Agent create a segment defined as “has this label”, so everything the clinic uses is visible in this list. On the contact card you can only choose a segment that already exists here — names are not typed by hand, because “VIP” and “vip ” are two different things to an automation.",
  "Usunąć segment „": "Delete segment “",
  "Znika definicja, nie kontakty — nikt nie wypada z bazy. Jeśli jakaś automatyzacja używa tej nazwy w warunku „W segmencie”, zacznie ją traktować jako etykietę.":
    "The definition goes, not the contacts — nobody is removed from the database. If an automation uses this name in an “In segment” condition, it will treat it as a label from now on.",
  "Ten segment pochodzi z etykiety nadanej na kartach kontaktów.":
    "This segment comes from a label assigned on contact cards.",
  "kontakt straci": "contact will lose",
  "kontaktów straci": "contacts will lose",
  "etykietę „": "the label “",
  "”. Bez tego segment wróciłby na listę przy najbliższym odświeżeniu.":
    "”. Otherwise the segment would come back to the list on the next refresh.",
  "Segment usunięty.": "Segment deleted.",
  "Etykietę zdjęto z {unlabelled} kontaktów — inaczej segment wróciłby na listę.":
    "The label was removed from {unlabelled} contacts — otherwise the segment would come back to the list.",
  "Nie udało się zapisać segmentu.": "Could not save the segment.",
  "Segment zapisany.": "Segment saved.",
  "„{name}” jest na liście segmentów.": "“{name}” is in the segment list.",
  " liczę…": " counting…",
  "Cofnij do roboczej": "Back to draft",
  "Oznacz jako gotowy": "Mark as ready",
  "Segment stały — zostaje na liście, dopóki go nie usuniesz.":
    "Permanent segment — it stays in the list until you delete it.",
  "Segment doraźny — zniknie 48 godzin po ostatniej zmianie.":
    "Temporary segment — it disappears 48 hours after the last change.",
  Stały: "Permanent",
  "Doraźny (48 h)": "Temporary (48 h)",
  "Opis (opcjonalny)": "Description (optional)",
  "Po co jest ten segment i kogo ma obejmować":
    "What this segment is for and whom it should include",
  "Dodaj pierwszy warunek z panelu po prawej.":
    "Add the first condition from the panel on the right.",
  "Segment bez warunków nie obejmuje nikogo": "A segment without conditions includes nobody",
  " — pusty zestaw reguł to segment nieskończony, a nie segment na całą bazę.":
    " — an empty rule set is an unfinished segment, not a segment of the whole database.",
  "Kliknij, aby przełączyć sposób łączenia grup": "Click to switch how groups are combined",
  "Grupa ": "Group ",
  "dopasuj WSZYSTKIE warunki": "match ALL conditions",
  "dopasuj DOWOLNY warunek": "match ANY condition",
  "Usuń grupę": "Delete group",
  "Pusta grupa — dodaj warunek z panelu po prawej.":
    "Empty group — add a condition from the panel on the right.",
  " Dodaj grupę": " Add group",
  " Asystent AI": " AI assistant",
  "Propozycja wstawiona — sprawdź warunki i zapisz.":
    "Suggestion inserted — check the conditions and save.",
  "Nie udało się wczytać kontaktów.": "Could not load the contacts.",
  "Kontakty w segmencie": "Contacts in the segment",
  "Brak warunków — segment jest pusty.": "No conditions — the segment is empty.",
  "Żaden kontakt nie spełnia tych warunków.": "No contact meets these conditions.",
  "Doładuj kolejne (zostało {v0})": "Load more ({v0} left)",
  "Pokaż wszystkie kontakty ({count})": "Show all contacts ({count})",
  ". Klik w kontakt otwiera jego kartę.": ". Clicking a contact opens its card.",
  "Tagi i etykiety": "Tags and labels",
  "Szukaj warunku": "Search conditions",
  "dowolna wiadomość": "any message",
  "(wiadomość niedostępna w tej przeglądarce: ": "(message not available in this browser: ",
  "— wybierz —": "— choose —",
  wartość: "value",
  kiedykolwiek: "ever",
  "ostatnie 7 dni": "last 7 days",
  "ostatnie 30 dni": "last 30 days",
  "ostatnie 90 dni": "last 90 days",
  "ostatni rok": "last year",
  "Usuń warunek": "Delete condition",
  "Bez wartości ten warunek nie jest liczony.": "Without a value this condition is not evaluated.",
  "Ten segment wskazuje wiadomość, której nie ma w tej przeglądarce — treści żyją lokalnie. Warunek liczy się poprawnie na serwerze, ale nazwy nie da się tu pokazać.":
    "This segment points to a message that is not in this browser — content is stored locally. The condition is evaluated correctly on the server, but its name cannot be shown here.",
  "Asystent nie odpowiedział.": "The assistant did not respond.",
  "Opisz, kogo chcesz objąć segmentem — zwykłym zdaniem. Asystent zna wszystkie dostępne warunki i ":
    "Describe whom the segment should include — in a plain sentence. The assistant knows all available conditions and ",
  "powie wprost, jeśli czegoś nie da się sprawdzić":
    "will say plainly if something cannot be checked",
  ", proponując najbliższy sensowny odpowiednik.": ", suggesting the closest sensible equivalent.",
  Propozycja: "Suggestion",
  "Nikt nie pasuje — sprawdź, czy adresy i nazwy są takie jak w bazie.":
    "Nobody matches — check that addresses and names are the same as in the database.",
  "Wstaw do buildera": "Insert into the builder",
  " myślę…": " thinking…",
  "Kogo chcesz objąć segmentem?": "Whom should the segment include?",
  "Każda odpowiedź to wywołanie modelu — liczy się do dziennego limitu kosztów.":
    "Every answer is a model call — it counts towards the daily cost limit.",
  "Brak przypisanych segmentów": "No segments assigned",
  "Ta etykieta nie ma odpowiednika w module Segmenty — można ją tylko usunąć.":
    "This label has no counterpart in the Segments module — it can only be removed.",
  "Usuń segment {name}": "Remove segment {name}",
  "Wczytywanie segmentów…": "Loading segments…",
  "Wybierz segment": "Choose a segment",
  "Szukaj segmentu…": "Search segments…",
  "Nie ma takiego segmentu. Segmenty tworzy się w module":
    "No such segment. Segments are created in the",
  "Segment z warunkami — przynależność liczy się automatycznie z danych pacjenta, nie nadaje się jej ręcznie.":
    "A segment with conditions — membership is computed automatically from patient data and is not assigned by hand.",
  automatyczny: "automatic",
  szkic: "draft",
  "Można wybrać wyłącznie segmenty istniejące w module":
    "You can only choose segments that exist in the",
  ". Segmenty oznaczone „automatyczny” mają warunki — pacjent wchodzi do nich sam, gdy zacznie je spełniać.":
    " module. Segments marked “automatic” have conditions — a patient joins them by themselves once they meet them.",

  // Funnels
  "Lejki — PRM Core": "Funnels — PRM Core",
  Kwalifikacja: "Qualification",
  lejków: "funnels",
  " · ścieżki wykorzystywane w karcie kontaktu (zakładka Overview)":
    " · paths used on the contact card (Overview tab)",
  " Nowy lejek": " New funnel",
  " etapów": " stages",
  "Brak etapów — dodaj je w edycji.": "No stages — add them when editing.",
  Duplikuj: "Duplicate",
  "Usunąć lejek „": "Delete funnel “",
  "Kontakty przypisane obecnie do tego lejka wrócą do pierwszego dostępnego lejka przy następnej wizycie na ich karcie. Tej operacji nie można cofnąć.":
    "Contacts currently in this funnel will move to the first available funnel the next time their card is opened. This cannot be undone.",
  "Usuń lejek": "Delete funnel",
  "Etap {v0}": "Stage {v0}",
  " Zapisz lejek": " Save funnel",
  "Dodaj pierwszy etap poniżej.": "Add the first stage below.",
  "Nazwa etapu": "Stage name",
  "Krótki opis etapu (widoczny na karcie kontaktu)":
    "Short stage description (shown on the contact card)",
  " Dodaj etap": " Add stage",

  // Doctors
  "Lekarze i specjaliści — PRM Core": "Doctors and specialists — PRM Core",
  "Nie udało się zapisać zmiany.": "Could not save the change.",
  "Lekarze i specjaliści": "Doctors and specialists",
  "{length} z {length2} · {length22} specjalizacji · {v3} zapisanych pacjentów{slotsInfo}":
    "{length} of {length2} · {length22} specialties · {v3} booked patients{slotsInfo}",
  "Szukaj po nazwisku, specjalizacji, usłudze lub ID…": "Search by name, specialty, service or ID…",
  "Wszystkie specjalizacje": "All specialties",
  "Tylko przyjmujący": "Accepting patients only",
  Lekarz: "Doctor",
  Specjalizacja: "Specialty",
  Usługi: "Services",
  Pacjentów: "Patients",
  Wizyt: "Visits",
  Nadchodzących: "Upcoming",
  "Wolne sloty": "Free slots",
  Obłożenie: "Occupancy",
  Przyjmuje: "Accepting",
  "Nikt nie pasuje do wyszukiwania.": "Nobody matches the search.",
  "{name} (IDX {id})": "{name} (IDX {id})",
  "{slotsBooked} z {slotsCapacity} zajętych": "{slotsBooked} of {slotsCapacity} booked",
  "{slotsBooked} wizyt przy {slotsCapacity} wyliczonych slotach — grafik równoległy albo nadkomplet":
    "{slotsBooked} visits with {slotsCapacity} calculated slots — parallel schedule or overbooking",
  "Liczby idą z wizyt zapisanych w PRM Core": "The numbers come from visits saved in PRM Core",
  "— identyfikatory lekarzy z arkusza są już na miejscu.":
    "— the doctor IDs from the sheet are already in place.",
  "Sloty są wyliczane, nie przysyłane.": "Slots are calculated, not received.",
  " Pojemność liczę z grafiku pracy: (godzina zamknięcia − otwarcia) ÷ czas badania. Lekarz przyjmujący równolegle w dwóch gabinetach albo przyjęty nadkomplet dają więcej wizyt niż wyliczonych slotów — wtedy zamiast procentu widać „nadkomplet”, bo liczba nie miałaby znaczenia. Kreska oznacza brak grafiku w tym miesiącu, nie zero wolnych miejsc.":
    " Capacity is calculated from the work schedule: (closing − opening time) ÷ appointment length. A doctor seeing patients in two rooms at once, or overbooking, gives more visits than calculated slots — then you see “overbooked” instead of a percentage, because the number would be meaningless. A dash means no schedule this month, not zero free places.",

  // Treatment plans
  "Plany leczenia — PRM Core": "Treatment plans — PRM Core",
  "Plan zapisany.": "Plan saved.",
  "Plan utworzony.": "Plan created.",
  "Plan „{name}” usunięty.": "Plan “{name}” deleted.",
  "Skopiowano znacznik.": "Tag copied.",
  "Nie udało się skopiować.": "Could not copy.",
  "Gotowe materiały dla pacjentów — plan dietetyczny po bariatrii, zalecenia pozabiegowe, przygotowanie do badania. Plan przypisuje się pacjentowi w jego kartotece, a do wiadomości wstawia znacznikiem.":
    "Ready-made materials for patients — a diet plan after bariatric surgery, post-procedure advice, preparation for a test. A plan is assigned to a patient on their record and inserted into messages with a tag.",
  " Nowy plan": " New plan",
  "Nie ma jeszcze żadnego planu. Pierwszy zwykle jest ten, który dziś krąży w Wordzie.":
    "There are no plans yet. The first one is usually the one circulating as a Word document today.",
  "Utwórz plan": "Create plan",
  wyłączony: "disabled",
  " pacjentów": " patients",
  "Kopiuj znacznik do wiadomości": "Copy tag for messages",
  Edytuj: "Edit",
  "Plan nie ma jeszcze treści — w wiadomości podstawi się pustka.":
    "The plan has no content yet — the message will get nothing in its place.",
  "%%PLAN:": "%%PLAN:",
  "Jak wstawić plan do wiadomości": "How to insert a plan into a message",
  " — wstawia": " — inserts the",
  "plan przypisany temu pacjentowi": "plan assigned to that patient",
  ". Jeden newsletter idzie do całego segmentu, a każdy dostaje w nim swój plan.":
    ". One newsletter goes to the whole segment, and everyone gets their own plan in it.",
  "%%PLAN:nazwa%%": "%%PLAN:name%%",
  " — wstawia konkretny plan, ten sam dla wszystkich odbiorców.":
    " — inserts a specific plan, the same for all recipients.",
  "Znacznik wpisuje się w treść newslettera albo e-maila i rozwija dopiero przy wysyłce. Jeśli pacjent nie ma przypisanego planu, znacznik znika z wiadomości, a informacja o tym trafia do dziennika kampanii — pacjent nigdy nie zobaczy surowego kodu.":
    "The tag goes into the newsletter or email text and is expanded only at send time. If the patient has no assigned plan, the tag is removed from the message and this is recorded in the campaign log — the patient never sees raw code.",
  "Edytuj plan": "Edit plan",
  "Nowy plan leczenia": "New treatment plan",
  "Treść planu trafi do wiadomości w miejsce znacznika. Pisz ją tak, jakby była fragmentem maila — bo nim będzie.":
    "The plan's content replaces the tag in the message. Write it as if it were part of an email — because it will be.",
  "np. Plan dietetyczny — Bariatria": "e.g. Diet plan — Bariatrics",
  "Nazwa jest kluczem znacznika. Zmiana nazwy zerwie znaczniki":
    "The name is the tag's key. Renaming will break tags",
  "%%PLAN:stara nazwa%%": "%%PLAN:old name%%",
  "już wstawione w treściach.": "already inserted in content.",
  Kategoria: "Category",
  "np. Bariatria": "e.g. Bariatrics",
  "Opis dla zespołu": "Description for the team",
  "Kiedy stosować ten plan. Nie trafia do pacjenta.":
    "When to use this plan. Not shown to the patient.",
  "Treść planu": "Plan content",
  "Plan aktywny": "Plan active",
  "Wyłączony nie podpowiada się przy przypisywaniu, ale pacjenci, którzy go już mają, dostają go dalej.":
    "A disabled plan is not suggested when assigning, but patients who already have it keep getting it.",
  "Usunąć plan „": "Delete plan “",
  "Zniknie też historia przypisań — ": "The assignment history will be deleted too — ",
  " pacjentów straci ślad, że ten plan dostało. Wiadomości ze znacznikiem":
    " patients will lose the record that they got this plan. Messages with the tag",
  "zaczną wychodzić bez tej treści. Jeśli chodzi tylko o to, żeby plan przestał się podpowiadać — wyłącz go zamiast usuwać.":
    "will start going out without this content. If you only want the plan to stop being suggested — disable it instead of deleting it.",
  Zostaw: "Keep",
  "Usuń plan": "Delete plan",
  "Nie przypisano": "Not assigned",
  "Plan przypisany pacjentowi.": "Plan assigned to the patient.",
  "Usunięto przypisanie planu „{planName}”.": "Removed the assignment of plan “{planName}”.",
  " Plany leczenia": " Treatment plans",
  "Materiały przypisane temu pacjentowi. Znacznik": "Materials assigned to this patient. The tag",
  "%%PLAN%%": "%%PLAN%%",
  " w newsletterze albo e-mailu wstawi": " in a newsletter or email inserts the",
  "ostatni z tej listy": "most recent one on this list",
  " Przypisz plan": " Assign plan",
  "Pacjent nie ma jeszcze przypisanego planu.": "The patient has no assigned plan yet.",
  bieżący: "current",
  "Usuń przypisanie": "Remove assignment",
  "Przypisz plan leczenia": "Assign a treatment plan",
  "Przypisanie nic nie wysyła — decyduje tylko o tym, co podstawi się pod":
    "Assigning sends nothing — it only decides what will replace",
  " w następnej wiadomości do tego pacjenta.": " in the next message to this patient.",
  "Nie ma jeszcze żadnego aktywnego planu.": "There are no active plans yet.",
  "Pacjent ma już przypisane wszystkie aktywne plany.":
    "The patient already has all active plans assigned.",
  "Przejdź do planów leczenia": "Go to treatment plans",
  Notatka: "Note",
  "np. start od 1 września, kontrola po 4 tygodniach":
    "e.g. starts 1 September, check-up after 4 weeks",
  Przypisz: "Assign",
};
