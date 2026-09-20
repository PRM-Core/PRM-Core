/** Server messages, part 5: defaults, validation, security report. */
export const server5: Record<string, string> = {
  " · zamkniętych: {resolved}": " · closed: {resolved}",
  "(brak treści)": "(no content)",
  ", maks. {dayLimit}/dobę": ", max {dayLimit}/day",
  "<p>Wpisz treść wiadomości…</p>": "<p>Type the message text…</p>",
  "<p>Wpisz własny kod HTML…</p>": "<p>Type your own HTML…</p>",
  "Adres musi zaczynać się od https://.": "The URL must start with https://.",
  "App ID składa się z samych cyfr.": "The App ID consists of digits only.",
  "Bez niej kampanie SMS pomijają ten kontakt.": "Without it, SMS campaigns skip this contact.",
  "Bez niej kampanie e-mail pomijają ten kontakt.":
    "Without it, email campaigns skip this contact.",
  "Brak logów.": "No logs.",
  "Błędów serwera (5xx)": "Server errors (5xx)",
  "Cześć ": "Hi ",
  "Dostęp do wszystkiego poza dodawaniem użytkowników i zmianami technicznymi domeny.":
    "Access to everything except adding users and technical domain changes.",
  "Dziękujemy za wypełnienie ankiety!": "Thank you for completing the survey!",
  "Dziękujemy! Zapisaliśmy Twoje zgłoszenie.": "Thank you! We have saved your submission.",
  "Klucz Anthropic zaczyna się od „sk-ant-”.": "An Anthropic key starts with “sk-ant-”.",
  "Klucz SendGrid zaczyna się od „SG.”.": "A SendGrid key starts with “SG.”.",
  "Nazwa „{segment}” jest już zajęta przez segment z warunkami. Wybierz inną nazwę albo nie twórz segmentu.":
    "The name “{segment}” is already taken by a segment with conditions. Choose another name or do not create a segment.",
  "Nie blokuje wysyłki — zgoda na dobieranie treści pod pacjenta.":
    "Does not block sending — consent to tailoring content to the patient.",
  "Nie udało się usunąć dokumentu pacjenta — kontakt zostawiony bez zmian. {v0}":
    "Could not delete a patient document — the contact was left unchanged. {v0}",
  "Nie udało się utworzyć segmentu — pusta nazwa.": "Could not create the segment — empty name.",
  "OBRAZY: używaj WYŁĄCZNIE adresów z listy kadrów podanej w wiadomości. Nie masz żadnego innego adresu — jeśli na jakąś sekcję kadru brakuje, zakoduj ją samym tekstem i napisz o tym w rekomendacjach. NIGDY nie wymyślaj adresu ani nie powtarzaj tego samego pliku.":
    "IMAGES: use ONLY URLs from the list of frames given in the message. You have no other URL — if a section has no frame, build it from text only and mention it in the recommendations. NEVER invent a URL or repeat the same file.",
  "Odmów 404": "404 rejections",
  "Omówienie bez modelu. {v0}": "Overview without the model. {v0}",
  "Omówienie napisał PRM_Agent na podstawie policzonych liczb.":
    "The overview was written by PRM_Agent based on the calculated numbers.",
  "PUBLICZNY ADRES GRAFIKI (jedyny, jakiego wolno użyć w src): {imageUrl}":
    "PUBLIC IMAGE URL (the only one allowed in src): {imageUrl}",
  "Pełny dostęp — wszystkie funkcje, w tym zarządzanie użytkownikami i domenami.":
    "Full access — all features, including managing users and domains.",
  "Podgląd (reporter)": "Preview (reporter)",
  "Przejdź do panelu pacjenta": "Go to the patient portal",
  "Prób bez sesji na funkcjach serwerowych": "Attempts without a session on server functions",
  "Prób pod adresy MCP": "Attempts on MCP URLs",
  "Pusta notatka — pominięto.": "Empty note — skipped.",
  "Segment „{segment}” już istniał; przypisano do niego pacjenta.":
    "Segment “{segment}” already existed; the patient was assigned to it.",
  "Segment „{segment}” ma warunki — pacjent trafia do niego sam, gdy zacznie je spełniać. Nie da się do niego przypisać ręcznie i nie przypisano nic.":
    "Segment “{segment}” has conditions — a patient joins it by themselves once they meet them. It cannot be assigned manually, so nothing was assigned.",
  "Segment „{segment}” nie istnieje w module Segmenty. Dostępne: {v1}. Nie przypisano nic.":
    "Segment “{segment}” does not exist in the Segments module. Available: {v1}. Nothing was assigned.",
  "Split nie ma żadnego wariantu — przebieg zatrzymany.":
    "The split has no variants — run stopped.",
  "Ten numer jest już w bazie ({v0}) — {v1} {lastName}":
    "This number is already in the database ({v0}) — {v1} {lastName}",
  "Token musi mieć co najmniej 32 znaki — najlepiej wygeneruj go w panelu.":
    "The token must be at least 32 characters — ideally generate it in the panel.",
  "Tylko odczyt: kontakty, kampanie, raporty i segmenty. Bez edycji, bez eksportu, bez wysyłek i bez ustawień. Loguje się samym hasłem, bez kodu weryfikacyjnego.":
    "Read-only: contacts, campaigns, reports and segments. No editing, no export, no sending and no settings. Signs in with a password only, without a verification code.",
  "Usunięto tagi: {v0}": "Tags removed: {v0}",
  "UŻYTKOWNIK MA JUŻ ROZPOCZĘTĄ DEFINICJĘ:\n{v0}\nJeśli prosi o zmianę, zaproponuj pełną nową definicję uwzględniającą to, co już jest.":
    "THE USER HAS ALREADY STARTED A DEFINITION:\n{v0}\nIf they ask for a change, propose a complete new definition that takes into account what is already there.",
  "Wypełniony: {v0}": "Submitted: {v0}",
  "Wypisz się z tej listy": "Unsubscribe from this list",
  "Wyrażam zgodę na komunikację marketingową drogą elektroniczną (m.in. informacja o nowych specjalistach, newslettery z poradami kosmetologicznymi).":
    "I consent to electronic marketing communication (including information about new specialists and newsletters with advice).",
  "Wyrażam zgodę na kontakt w sprawie oferty i przetwarzanie moich danych osobowych.":
    "I agree to be contacted about the offer and to the processing of my personal data.",
  "Wyrażam zgodę na otrzymywanie informacji handlowych i marketingowych na podany adres e-mail. Zgodę mogę wycofać w każdej chwili, klikając link wypisania w dowolnej wiadomości.":
    "I consent to receiving commercial and marketing information at the email address provided. I can withdraw my consent at any time by clicking the unsubscribe link in any message.",
  "Wyrażam zgodę na otrzymywanie informacji handlowych i marketingowych w formie wiadomości SMS na podany numer telefonu. Zgodę mogę wycofać w każdej chwili.":
    "I consent to receiving commercial and marketing information by SMS at the phone number provided. I can withdraw my consent at any time.",
  "Wyrażam zgodę na przetwarzanie moich danych w celu dopasowania treści i ofert do moich potrzeb (profilowanie). Nie wpływa to na możliwość korzystania z usług placówki.":
    "I consent to the processing of my data to tailor content and offers to my needs (profiling). This does not affect my ability to use the clinic's services.",
  "Wysyłka zablokowana": "Sending blocked",
  "Znam i akceptuję Politykę Prywatności oraz Regulamin.":
    "I have read and accept the Privacy Policy and the Terms of Service.",
  błąd: "error",
  miarę: "measure",
  "napisał(a) — {channel}": "wrote — {channel}",
  "nieznany błąd odświeżania": "unknown refresh error",
  "placówki medycznej": "at a medical clinic",
  "placówki {org}": "at {org}",
  "ten sam e-mail oraz imię i nazwisko": "same email and full name",
  "ten sam numer telefonu (nazwiska nie przeczą sobie)":
    "same phone number (surnames do not contradict each other)",
  "ten sam numer telefonu oraz imię i nazwisko": "same phone number and full name",
  "usunięte tagi: {v0}": "removed tags: {v0}",
  "wiadomość ({v0})": "message ({v0})",
  "Źródło: {source}": "Source: {source}",
  "Żądań łącznie": "Total requests",
  "Brak treści HTML.": "No HTML content.",
  "Brak treści HTML w tym archiwum.": "No HTML content in this archive.",
  "jan.kowalski@example.com": "john.smith@example.com",
  "Podaj nazwę, aby otworzyć edytor drag&drop.": "Enter a name to open the drag & drop editor.",
  '"bariatria,newsletter"': '"bariatrics,newsletter"',
};
