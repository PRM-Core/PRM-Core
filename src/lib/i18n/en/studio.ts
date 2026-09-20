/** Design Studio: home, editor, Canva import, QA checks, sections, styles. */
export const studio: Record<string, string> = {
  "Design Studio — PRM Core": "Design Studio — PRM Core",
  Podstawowe: "Basic",
  Układy: "Layouts",
  "Treść i dane": "Content and data",
  "Zapisane w module {title}.": "Saved in the {title} module.",
  "Szablon zapisany.": "Template saved.",
  Beta: "Beta",
  "Wszystkie projekty — newslettery, e-maile i pop-upy w jednym miejscu.":
    "All designs — newsletters, emails and pop-ups in one place.",
  "Nie udało się wczytać wiadomości": "Could not load the messages",
  "Lista nie jest pusta — to serwer nie odpowiedział. Treść błędu:":
    "The list is not empty — the server did not respond. Error message:",
  "Nie ma czego otworzyć": "Nothing to open",
  "Przejdź do modułu ": "Go to the module ",
  "Wróć do listy projektów": "Back to the design list",
  "Brak wiadomości": "No messages",
  " Desktop": " Desktop",
  " Mobile": " Mobile",
  " Wyświetlanie": " Display",
  " Wyślij test": " Send test",
  "Zapisz w": "Save in",
  "Przenieś do {title}": "Move to {title}",
  " nie obsługuje": " does not support",
  ". Bloki zostaną w wiadomości, ale nie pojawią się w treści po przeniesieniu.":
    ". The blocks stay in the message but will not appear in the content after moving.",
  "Kliknij, aby dodać moduł pod zaznaczonym blokiem.":
    "Click to add a module below the selected block.",
  "Pusto. Przeciągnij blok z panelu po lewej albo kliknij go.":
    "Empty. Drag a block from the panel on the left or click it.",
  "Zaznacz blok na płótnie, aby zobaczyć jego ustawienia.":
    "Select a block on the canvas to see its settings.",
  "Projekt z Canvy przeniesiony do Studia.": "Canva design moved to Studio.",
  "Układ jest teraz klockami — poprawiaj go jak każdą inną wiadomość.":
    "The layout is now made of blocks — edit it like any other message.",

  // Home
  "Szukaj projektu…": "Search designs…",
  Wszystkie: "All",
  "Nie ma jeszcze żadnego projektu": "No designs yet",
  "Nic nie pasuje": "Nothing matches",
  "Projekty zakłada się w module kanału — Newsletter, E-mail albo Pop-Up.":
    "Designs are created in the channel module — Newsletter, Email or Pop-up.",
  "Zmień frazę albo filtr kanału.": "Change the search or the channel filter.",
  "wersja robocza": "draft",
  "archiwum ZIP": "ZIP archive",
  "własny HTML": "custom HTML",
  projekt: "design",
  projektów: "designs",

  // HTML editor
  "Z archiwum ZIP": "From a ZIP archive",
  " Kod": " Code",
  " Cofnij": " Undo",
  Zastosuj: "Apply",
  "Podgląd treści": "Content preview",
  "Ta treść nie ma bloków — to gotowy kod przygotowany poza narzędziem.":
    "This content has no blocks — it is ready-made code prepared outside the tool.",

  // Canva
  "Nie udało się pobrać projektów": "Could not fetch the designs",
  "Projekt trafił do Media. PRM_Agent układa z niego klocki.":
    "The design went to Media. PRM_Agent is building blocks from it.",
  "Nie udało się pobrać projektu": "Could not fetch the design",
  podłączona: "connected",
  niepodłączona: "not connected",
  "Pobieranie gotowych projektów (newslettery, e-maile, pop-upy). Grafiki trafiają do biblioteki Media, a treść zostaje edytowalna — nie jako jeden obrazek.":
    "Fetching ready-made designs (newsletters, emails, pop-ups). Images go to the Media library and the content stays editable — not as a single image.",
  "Instalacja nie ma jeszcze kluczy integracji. Brakuje:":
    "This installation has no integration keys yet. Missing:",
  "Klucze zakłada się w portalu deweloperskim Canvy i wpisuje w Integracje → Klucze i dane dostępowe.":
    "Keys are created in the Canva developer portal and entered in Integrations → Keys and credentials.",
  "Portal deweloperski Canvy ": "Canva developer portal ",
  "Klucze są na miejscu, ale konto Canvy nie jest jeszcze zalogowane.":
    "The keys are in place, but no Canva account is signed in yet.",
  "Połącz w Integracjach ": "Connect in Integrations ",
  Konto: "Account",
  " · kliknięcie w projekt pobiera go i przekazuje PRM_Agentowi.":
    " · clicking a design fetches it and passes it to PRM_Agent.",
  "Pobierz listę projektów od nowa": "Reload the design list",
  " Pobieram listę projektów…": " Fetching the design list…",
  "Na tym koncie nie ma jeszcze żadnego projektu.": "This account has no designs yet.",
  "Pobieram…": "Fetching…",
  "Pokazano ": "Showing ",
  " · w Canvie jest ich jeszcze więcej": " · there are more in Canva",
  " (to wszystko z Canvy)": " (that is everything in Canva)",
  "Pokaż więcej": "Show more",

  // QA
  "Waga: {v0}": "Size: {v0}",
  "Obrazy bez opisu: {length} z {length2}": "Images without alt text: {length} of {length2}",
  "Obrazy opisane: {length}": "Images with alt text: {length}",
  "Link wypisu obecny": "Unsubscribe link present",
  "Brak linku wypisu": "No unsubscribe link",
  "Przyciski bez adresu: {length}": "Buttons without a URL: {length}",
  "Przyciski mają adresy": "Buttons have URLs",
  "Kontrast tekstu: {v0}:1": "Text contrast: {v0}:1",
  "Kontrast przycisku: {v0}:1": "Button contrast: {v0}:1",
  "Dużo grafiki, mało tekstu": "Lots of images, little text",
  "Pusty blok załączników": "Empty attachments block",
  "Wybierz wiadomość, żeby ją sprawdzić.": "Choose a message to check it.",
  "Bez zastrzeżeń": "No issues",
  "{v0} do poprawy": "{v0} to fix",
  "Sprawdzenia liczone na miejscu, na gotowym HTML-u wiadomości.":
    "Checks run locally, on the message's final HTML.",
  " Eksportuj HTML": " Export HTML",
  rzecz: "item",
  rzeczy: "items",

  // Sections
  "Nagłówek z CTA": "Header with CTA",
  "Logo, tytuł, akapit i przycisk": "Logo, title, paragraph and button",
  "Umów wizytę": "Book a visit",
  "Trzy korzyści": "Three benefits",
  "Trzy kolumny z nagłówkiem i opisem": "Three columns with a heading and description",
  Specjalista: "Specialist",
  "Zdjęcie obok opisu, proporcja 1:2": "Photo next to a description, 1:2 ratio",
  "Zobacz terminy": "See available times",
  Promocja: "Promotion",
  "Wyróżniony nagłówek, warunki i przycisk": "Highlighted heading, terms and button",
  "Skorzystaj z promocji": "Take advantage of the offer",
  "Materiały do pobrania": "Downloads",
  "Nagłówek i blok załączników": "Heading and attachments block",
  "Do pobrania": "Downloads",
  "Stopka RODO": "GDPR footer",
  "Odstęp, linia i stopka z wypisem": "Spacer, line and footer with unsubscribe",
  "Sekcja wstawia kilka zwykłych bloków — każdy da się potem osobno zmienić lub usunąć.":
    "A section inserts several regular blocks — each can later be changed or removed separately.",

  // Styles
  Klinika: "Clinic",
  Granat: "Navy",
  "Bez ramki": "No border",
  "Wybierz wiadomość, żeby ustawić jej wygląd.": "Choose a message to set its look.",
  Zestawy: "Presets",
  Kolory: "Colours",
  "Tło wiadomości": "Message background",
  "Tło treści": "Content background",
  "Akcent (przyciski)": "Accent (buttons)",
  Typografia: "Typography",
  "Systemowy (Arial)": "System (Arial)",
  "Outlook i Gmail nie pobierają krojów Google — pokażą zamiennik systemowy. Apple Mail i klienty mobilne wyświetlą wybrany krój.":
    "Outlook and Gmail do not load Google fonts — they show a system fallback. Apple Mail and mobile clients show the chosen font.",
  Układ: "Layout",
  "Szerokość treści": "Content width",
  Zaokrąglenie: "Corner radius",
  "Powyżej 640 px wiadomość zaczyna się przewijać w bok w wąskim oknie podglądu Outlooka.":
    "Above 640 px the message starts scrolling sideways in Outlook's narrow preview pane.",
};
