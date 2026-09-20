/** Interface texts that lived in constants, validators and label maps. */
export const ui2: Record<string, string> = {
  // Activity categories on the contact card (keys stay Polish, see contacts.$id.tsx)
  Rejestracja: "Registration",
  "Aktywność on-line": "Online activity",
  Komunikacja: "Communication",
  Inne: "Other",

  " Na wykresie są przygaszone.": " They are dimmed on the chart.",
  " · kończy się na …{hint}": " · ends with …{hint}",
  " · to największy dostępny zakres": " · this is the largest available range",
  " · {v0} czeka na uzupełnienie nazwiska": " · {v0} waiting for a last name",
  " · {v0} osób": " · {v0} people",
  " — przekroczono limit, odznacz część plików.": " — limit exceeded, deselect some files.",
  "<p>Promocja obejmuje morfologię, lipidogram i TSH. Obowiązuje przy rezerwacji online, do wyczerpania miejsc.</p>":
    "<p>The offer covers a blood count, lipid panel and TSH. Valid for online bookings while places last.</p>",
  "<p>Prowadzi Cię ten sam specjalista od początku do końca.</p>":
    "<p>The same specialist looks after you from start to finish.</p>",
  "<p>Specjalizacja i krótki opis doświadczenia. Przyjmuje w poniedziałki i środy.</p>":
    "<p>Specialty and a short description of experience. Sees patients on Mondays and Wednesdays.</p>",
  "<p>Zapraszamy na konsultację w dogodnym terminie. Wystarczy jedno kliknięcie — resztą zajmiemy się my.</p>":
    "<p>Book a consultation at a time that suits you. One click is enough — we will take care of the rest.</p>",
  "Aktywnych kontaktów": "Active contacts",
  "Biały napis czytelny na kolorze akcentu.": "White text is readable on the accent colour.",
  "Biały napis na tym akcencie jest nieczytelny — przyciemnij kolor.":
    "White text on this accent is not readable — darken the colour.",
  "Błędy automatyzacji": "Automation errors",
  "Coś poszło nie tak — spróbuj ponownie.": "Something went wrong — try again.",
  "Dziś pacjenci": "Patients today",
  "Gmail przycina wiadomości powyżej 102 kB — końcówka, w tym stopka, zniknie.":
    "Gmail clips messages above 102 kB — the end, including the footer, will disappear.",
  "Ilu mamy kontaktów i jak dzielą się na statusy oraz segmenty?":
    "How many contacts do we have, and how do they split by status and segment?",
  Import: "Import",
  "Jeśli nie pasuje": "If not matched",
  "Jeśli pasuje": "If matched",
  "Kartoteka i widok 360° każdego pacjenta w jednym miejscu":
    "A 360° record of every patient in one place",
  "Każdy obraz ma tekst zastępczy.": "Every image has alt text.",
  "Każdy prowadzi pod konkretny adres.": "Each one points to a specific URL.",
  Kliknięcia: "Clicks",
  "Kliknięty adres": "Clicked URL",
  "Krótki opis oferty…": "Short description of the offer…",
  "Kto kliknął w ostatni newsletter w ciągu 30 dni":
    "Who clicked in the last newsletter within 30 days",
  "Lista lekarzy placówki wraz z liczbą pacjentów zapisanych do każdego z nich.":
    "The clinic's doctors with the number of patients booked with each.",
  "Musisz zaakceptować regulamin": "You must accept the terms of service",
  "Nazwa alfanumeryczna może mieć maksymalnie {ALPHANUMERIC_MAX} znaków (ma {length}).":
    "An alphanumeric name can have at most {ALPHANUMERIC_MAX} characters (it has {length}).",
  "Nazwa alfanumeryczna może zawierać tylko litery bez polskich znaków, cyfry i spacje.":
    "An alphanumeric name can contain only unaccented letters, digits and spaces.",
  "Nazwa alfanumeryczna musi zawierać co najmniej jedną literę — sam ciąg cyfr operator potraktuje jako numer.":
    "An alphanumeric name must contain at least one letter — carriers treat a string of digits as a number.",
  "Nie udało się sprawdzić odnośnika.": "Could not check the link.",
  "Nie wybrano plików z biblioteki Media — blok nie pokaże się w wiadomości.":
    "No files chosen from the Media library — the block will not appear in the message.",
  "Nieprawidłowy adres e-mail": "Invalid email address",
  "Notatka wpisana ręcznie": "Note entered manually",
  "Nowoczesna platforma PRM Core dla branży healthcare — kontakty, automatyzacje, raporty i integracje w jednym miejscu.":
    "PRM Core, a modern platform for healthcare — contacts, automations, reports and integrations in one place.",
  "Nowych kontaktów": "New contacts",
  "Numer musi być w formacie E.164: znak „+”, numer kierunkowy kraju i numer, np. +48221234567.":
    "The number must be in E.164 format: a “+”, the country code and the number, e.g. +48221234567.",
  "Odpowiedzi z ankiety": "Survey answers",
  "Pacjenci, którzy byli na stronie rejestracji, ale nie umówili wizyty":
    "Patients who visited the booking page but did not book a visit",
  "Po wizycie kardiologicznej — ankieta NPS i materiały edukacyjne":
    "After a cardiology visit — NPS survey and educational materials",
  "Podaj hasło": "Enter your password",
  "Podaj imię": "Enter your first name",
  "Podaj nazwę placówki": "Enter the clinic name",
  "Podaj nazwę, aby rozpocząć budowanie scenariusza.":
    "Enter a name to start building the workflow.",
  "Podsumuj stan PRM Engine i wyniki wysyłek z ostatnich 30 dni. Czy coś wymaga uwagi?":
    "Summarise the state of PRM Engine and send results from the last 30 days. Does anything need attention?",
  "Poniżej WCAG AA (4,5:1) na tle {bgForText}. Rozjaśnij tło treści.":
    "Below WCAG AA (4.5:1) on the {bgForText} background. Lighten the content background.",
  "Poniżej progu przycinania w Gmailu (102 kB).": "Below Gmail's clipping threshold (102 kB).",
  "Powitanie nowych pacjentów + przypomnienie po 7 dniach":
    "Welcome new patients + a reminder after 7 days",
  "Przegląd kontaktów, kampanii i automatyzacji w PRM Core.":
    "Overview of contacts, campaigns and automations in PRM Core.",
  "Ręczne dodanie": "Added manually",
  "Spełnia WCAG AA (wymagane 4,5:1).": "Meets WCAG AA (4.5:1 required).",
  "Sprawdzenie nie powiodło się.": "The check failed.",
  "Sprawdź, czy rekord CNAME wskazuje na ": "Check that the CNAME record points to ",
  "Stwórz automatyzację": "Create an automation",
  "To konto nie ma dostępu do dokumentacji.": "This account has no access to documents.",
  "Twórz i zarządzaj lejkami ścieżki pacjenta wykorzystywanymi w karcie kontaktu.":
    "Create and manage patient path funnels used on the contact card.",
  "Twórz segmenty pacjentów na bazie atrybutów, zgód i realnych zdarzeń.":
    "Build patient segments from attributes, consents and real events.",
  "Tytuł pop-upu": "Pop-up title",
  "Ustaw VITE_PLATFORM_CNAME_TARGET, aby poznać docelowy rekord CNAME.":
    "Set VITE_PLATFORM_CNAME_TARGET to see the target CNAME record.",
  "Usunięto pacjenta: {v0}": "Patient deleted: {v0}",
  "W obu tygodniach nie było danych do porównania.": "There was no data to compare in either week.",
  "Wiadomość marketingowa musi dać się wypisać. Wstaw sekcję „Stopka RODO” albo pole „Link wypisania z listy”.":
    "A marketing message must allow unsubscribing. Insert the “GDPR footer” section or the “Unsubscribe link” field.",
  "Wiele wartości": "Multiple values",
  "Win-back: nieaktywni 30+ dni, email + SMS jeśli nie otworzy":
    "Win-back: inactive for 30+ days, email + SMS if it is not opened",
  "Wpis z panelu jest nieczytelny: brak klucza szyfrującego na serwerze.":
    "The panel entry cannot be read: no encryption key on the server.",
  "Wpis z panelu jest uszkodzony — wpisz wartość ponownie.":
    "The panel entry is damaged — enter the value again.",
  "Wpis z panelu zapisano innym kluczem szyfrującym — wpisz wartość ponownie.":
    "The panel entry was saved with a different encryption key — enter the value again.",
  "Wypełniony formularz": "Completed form",
  "Wypisz automatyzacje: które są aktywne, na co reagują i ilu kontaktów przez nie przeszło. Wskaż te, które wyglądają na zepsute.":
    "List the automations: which are active, what they react to and how many contacts went through them. Point out any that look broken.",
  "Wysyłka podmieni go na adres jednorazowy.": "Sending replaces it with a one-time URL.",
  Właściwości: "Properties",
  "Z importu CSV": "From a CSV import",
  "Z pliku .env na serwerze{tail}{flag} — zapisanie tutaj zastąpi tę wartość":
    "From the .env file on the server{tail}{flag} — saving here will replace this value",
  "Zadbaj o siebie jeszcze w tym miesiącu": "Look after yourself this month",
  "Zakoduj {kindLabel} z załączonej grafiki.": "Build a {kindLabel} from the attached design.",
  "Zaloguj się do PRM Core — automatyzacja komunikacji z pacjentem.":
    "Sign in to PRM Core — patient communication automation.",
  "Zanim odbiorca kliknie „pokaż obrazy”, w ich miejscu widać tylko opis. Czytniki ekranu też czytają wyłącznie opis.":
    "Until the recipient clicks “show images”, only the description is visible in their place. Screen readers read only the description too.",
  "Zarządzaj kontaktami pacjentów: segmenty, tagi, źródła, kampanie.":
    "Manage patient contacts: segments, tags, sources, campaigns.",
  Zatrzymana: "Stopped",
  "Załóż konto w PRM Core — automatyzacja komunikacji z pacjentem.":
    "Create a PRM Core account — patient communication automation.",
  "Zdjęcie specjalisty": "Specialist photo",
  "Zdrowie w dobrych rękach": "Your health in good hands",
  "Zgody pacjenta i RODO Center wbudowane w platformę":
    "Patient consent and a GDPR centre built into the platform",
  "Znajdź kontakt Anna Kowalska i streść, co się z nią dotąd działo.":
    "Find the contact Anna Smith and summarise what has happened with her so far.",
  "Zostało domyślne „https://” — kliknięcie nic nie zrobi.":
    "The default “https://” is still there — clicking will do nothing.",
  "cały serwis": "whole website",
  "dr n. med. Imię Nazwisko": "Dr First Last, MD",
  "jeszcze nic nie przyszło": "nothing has arrived yet",
  kliknięcia: "clicks",
  "krok usunięty ze scenariusza": "step removed from the workflow",
  "około {v0} h": "about {v0} h",
  osób: "people",
  "przed chwilą": "just now",
  "tydzień od {label}": "week of {label}",
  "w chwili wysyłki": "at the time of sending",
  wysłana: "sent",
  wysłano: "sent",
  wyłączone: "off",
  włączone: "on",
  "{h} h po wysyłce": "{h} h after sending",
  "{label} (niepełny)": "{label} (incomplete)",
  "{perDayLimit}/dobę": "{perDayLimit}/day",
  "{textChars} znaków tekstu przy {length} obrazach. Z zablokowanymi obrazami zostanie prawie pusta strona.":
    "{textChars} characters of text with {length} images. With images blocked the page will be almost empty.",
  "{v0} odrzuceń": "{v0} rejections",
  "{v0} zł": "{v0} PLN",
  "{v0} — tydzień wcześniej": "{v0} — a week earlier",
  "{what} jest tyle samo co tydzień wcześniej ({v1}).":
    "{what}: the same as a week earlier ({v1}).",
  "{what} przybywa: {v1} tydzień do tygodnia.": "{what} are growing: {v1} week over week.",
  "{what} przybyło — tydzień wcześniej nie było żadnych.":
    "{what} appeared — there were none a week earlier.",
  "{what} ubywa: {v1} tydzień do tygodnia.": "{what} are falling: {v1} week over week.",
  "−15% na pakiet badań do końca miesiąca": "−15% on a test package until the end of the month",
};
