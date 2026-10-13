# Changelog

Format oparty na [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
wersjonowanie wg [SemVer](https://semver.org/lang/pl/).

**Zasada nadrzędna dla każdego wydania:** aktualizacja nigdy nie kasuje
kontaktów, ich historii ani automatyzacji. Migracje są wyłącznie dodające, a te,
które usuwają kolumnę, najpierw przenoszą z niej dane. Wydanie, które
wymagałoby wyczyszczenia bazy, dostaje numer główny i osobną instrukcję.

## [1.70.0] — PRM_Agent: warstwa językowa, model w sieci placówki

Pierwszy krok fazy „język na wierzchu”: model (lokalny albo, za jawną
decyzją, hostowany) pisze lepiej to, co reguły już ustaliły. Fakty zostają
w szablonie, więc ekran jest poprawny także przy `PRM_AI_MODE=off`.

- **Brief wygładzony przez model.** Co noc, po policzeniu sygnałów, brief
  z szablonu jest zapisywany (tabela `agent_briefs`), a gdy model jest
  w zasięgu — także jego wersja w pełnych zdaniach. Wersja modelu jest
  przyjmowana tylko wtedy, gdy zachowała **każdą liczbę** szablonu i nie
  dodała żadnej (daty 13.10.2026 i 2026-10-13 to te same liczby);
  w przeciwnym razie zostaje szablon, a dziennik mówi, które liczby
  zniknęły lub się pojawiły. Na ekranie przełącznik „wersja modelu / z
  szablonu” i przycisk „Wygładź modelem”.
- **Treść draftu napisana przez model.** Nowy draft dostaje tekst z faktów
  (cel, kanał, ilu pacjentów, co ich łączy) — do modelu nie idzie żaden
  pacjent. Tekst jest przyjmowany, gdy zaczyna się od `{{firstName}}`, nie
  używa innych pól, nie wymyśla linku, numeru ani daty, nie ma HTML
  i mieści się w kanale (SMS 320 znaków). Szablon jest zawsze zachowany
  (`template_message`) — „Wróć do szablonu” jednym kliknięciem;
  „Napisz modelem” dla draftu, który tekstu z modelu jeszcze nie ma.
- Każde wywołanie przechodzi przez ten sam tor co reszta PRM_Agenta:
  `PRM_AI_MODE`, strażnik wyjścia, pseudonimizacja, dzienny limit kosztów
  (wpisy `ai` w dzienniku silnika). Przy `off`, bez konfiguracji serwera
  modelu albo po wyczerpaniu limitu nic nie jest wywoływane, a ekran mówi
  dlaczego.
- Migracja 0070: tabela `agent_briefs`, kolumny `template_message`
  i `text_source` w `agent_drafts`.
- **Poprawka (1.69.0):** co 15 minut przegląd Supervisora zamykał
  rekomendacje PRM_Agenta jako „rozwiązane”, bo nie były jego ustaleniami.
  Teraz przegląd nie dotyka sygnatur `agent:`; nocne liczenie samo zamyka
  rekomendację, której liczby już nie potwierdzają, a ustalenie (także
  Supervisora), które wraca po rozwiązaniu, jest znów nowe. Odrzucone
  zostaje odrzucone.

## [1.69.0] — PRM_Agent: rekomendacje, drafty do zatwierdzenia, listy i brief

Druga warstwa agenta — nadal bez modelu językowego. Agent analizuje, wyciąga
wnioski i przygotowuje; decyzja należy do człowieka, a żadna wiadomość nie
wychodzi bez zatwierdzenia.

- **Rekomendacje** z reguł nad nocnymi sygnałami: nieobecności w górę o 5 pp
  (ogółem, u lekarza lub w specjalizacji, przy co najmniej 10 wizytach;
  od 10 pp — pilne), spadek otwarć e-maili o 10 pp, recall dla 10 i więcej
  pacjentów, pierwsza wizyta bez kolejnej (od 5), pacjenci dryfujący
  (od 20), ktoś po wizycie bez odpowiedzi, wizyty z ryzykiem nieobecności
  ≥ 30%. Każda z dowodem (liczby, które obejrzała) i jedną proponowaną
  akcją. To wpisy w tej samej tabeli i na tym samym panelu co ustalenia
  Supervisora (sygnatura `agent:`), więc dzwonek i dedupe są wspólne.
- **Drafty kampanii do zatwierdzenia** — dla recallu, zaproszenia po
  pierwszej wizycie i reaktywacji agent proponuje kanał, treść z polami
  (`{{firstName}}`) i audytorium z sygnału. Jeden otwarty draft na
  audytorium, uzupełniany co noc; odrzucony nie wraca przez 14 dni.
  Zatwierdzenie tworzy segment-etykietę „PRM_Agent · … · data” z odbiorcami,
  a z wybranym opublikowanym szablonem **przekazuje kampanię do Wysyłek** —
  kodem Wysyłek, z ich limitami, godzinami i bramką zgód. Bez szablonu
  powstaje tylko segment. Każda decyzja jest w dzienniku silnika (kto, kiedy).
- **Listy dla rejestracji** — kto wymaga uwagi jako gotowe listy do
  obdzwonienia (recall, pierwsza wizyta bez kolejnej, po wizycie bez
  odpowiedzi, dryfujący, wizyty zagrożone nieobecnością z czynnikami), z
  telefonem, e-mailem, ostatnią i następną wizytą, eksportem CSV i linkiem do
  karty. Liczniki na karcie pulpitu prowadzą do tych list.
- **Brief dla zarządu** z szablonu: co się zmieniło, kto wymaga uwagi, co
  proponuje agent, co przed nami, nota o modelu — do skopiowania.
- Nowy ekran **PRM_Agent** w menu (Rekomendacje · Drafty · Listy · Brief).
  Odczyt dla roli podglądu, decyzje dla ról z prawem do zmian.
- Migracja 0069: tabela `agent_drafts`.

## [1.68.0] — PRM_Agent: sygnały i ryzyko nieobecności, bez modelu

Pierwsza warstwa agenta, która nie potrzebuje żadnego modelu językowego —
działa także przy `PRM_AI_MODE=off`.

- **Nocne liczenie sygnałów** (po 2:00, na zegarze silnika; także
  „Przelicz teraz” na pulpicie): wizyty odbyte, nieobecności i odwołania
  z ostatnich 30 dni wobec poprzednich 30; **wskaźnik nieobecności** ogółem,
  per lekarz i per specjalizacja (gdy jest co najmniej 10 rozstrzygniętych
  wizyt); otwarcia i kliknięcia e-maili; odpowiedzi w skrzynce; **recall do
  zrobienia** (ostatnia wizyta ponad rok temu, nic umówionego); **pierwsza
  wizyta bez kolejnej**; **po wizycie bez odpowiedzi** (7 dni); **pacjenci
  dryfujący** (pół roku bez śladu). Liczby i listy kontaktów za nimi są tym
  samym wierszem w bazie.
- **Ryzyko nieobecności dla każdej nadchodzącej wizyty** (30 dni naprzód)
  z trzema czynnikami, które je podniosły lub obniżyły: wyprzedzenie
  rezerwacji, pora, dzień tygodnia, wcześniejsze nieobecności, pierwsza
  wizyta, rezerwacja online, brak telefonu lub zgody SMS, świeży kontakt.
  Mały model (regresja logistyczna) uczony co noc na historii instalacji;
  przy mniej niż 40 rozstrzygniętych wizytach uczciwie podaje częstość
  bazową i mówi, że to za mało historii.
- **Karta „PRM_Agent — sygnały” na pulpicie**: wskaźniki z trendem, kto
  wymaga uwagi, wizyty najbardziej zagrożone nieobecnością z uzasadnieniem.
- Migracja 0068: tabele `agent_signals`, `agent_models`, `agent_scores`.
  Nowy rodzaj wpisu w dzienniku silnika: `agent`.

## [1.67.0] — PRM_Agent: dane pacjentów zostają na serwerze

**Aktualizacja u klienta z włączonym AI: ustaw `PRM_AI_MODE=hosted` w `.env`
przed wdrożeniem.** Bez tego PRM_Agent po aktualizacji jest **wyłączony**
(tryb `off`) — to świadomy wybór: dostawca zewnętrzny wymaga od teraz jawnej
decyzji. Silnik, automatyzacje, segmenty i wysyłki działają niezależnie od
trybu.

- **Granica danych `PRM_AI_MODE`** — `off` / `local` / `hosted`. W trybie
  `local` wywołania idą wyłącznie do serwera modelu w sieci placówki
  (adres pętli zwrotnej, sieć prywatna albo host z `PRM_AI_EGRESS_ALLOW`);
  adres publiczny jest odrzucany w kodzie, nie konwencją. `hosted` nigdy nie
  jest domyślny.
- **Model lokalny** — adapter dla każdego serwera zgodnego z OpenAI Chat
  Completions (Ollama, vLLM, LM Studio, llama.cpp): `PRM_AI_LOCAL_URL`,
  `PRM_AI_LOCAL_MODEL`, opcjonalnie `PRM_AI_LOCAL_KEY`. Zero kosztów za token.
- **Pseudonimizacja przed każdym promptem, w każdym trybie.** Nazwiska,
  e-maile, telefony i numery PESEL zamieniane są na symbole zastępcze
  (`{{firstName}}`, `{{email}}`…) w prompcie systemowym, wiadomościach
  i wynikach narzędzi; pacjent występuje jako pseudonim i PRM ID. Dotąd węzeł
  Agent AI, podpowiedzi w skrzynce, Copilot i wyszukiwarka kontaktów
  Copilota przekazywały modelowi imię, nazwisko, e-mail i telefon. Odmiana
  polskich nazwisk (Kowalskiej, Kowalską) też jest rozpoznawana.
- **Raport bezpieczeństwa** ma kontrolę „Granica danych PRM_Agent”: tryb,
  klasa hosta modelu i — w trybie `local` — brak kluczy dostawców
  zewnętrznych.
- **Ustawienia → PRM_Agent** pokazują tryb i jego znaczenie; wybór dostawcy
  i modelu dotyczy tylko trybu `hosted`.
- Testy: klasyfikacja hostów, odmowa dla adresu publicznego bez jednego
  żądania, pseudonimizacja (kształt, znane identyfikatory, odmiana,
  idempotencja), tryb `off` bez wywołań. Projekt: `docs/AGENT.md`.

- Poprawka: Ustawienia → PRM_Agent nie ładowały się (błąd 500) — obiekty
  z przetłumaczonymi tekstami nie przechodziły przez transport funkcji
  serwerowych. Dotyczy każdego takiego obiektu zwracanego do przeglądarki.

Bez migracji bazy.

## [1.66.2] — raport bezpieczeństwa nie dobija się do zepsutej bramki

- **Nieudana wysyłka dobowego raportu wstrzymuje kolejną próbę na godzinę.**
  Znacznik „wysłano” powstaje dopiero po udanej wysyłce, więc przy bramce, która
  odrzuca wszystko (u jednej placówki: wyczerpany limit planu SendGrid), pętla
  silnika ponawiała raport co 4 sekundy — z wywołaniem modelu za każdym razem,
  aż do dobowego budżetu 5 USD. Teraz nieudana próba zostawia wpis w dzienniku,
  a ponowienie idzie bez modelu: liczby są te same, interpretacja już była.
- **Odmowa bramki pocztowej to ostrzeżenie krytyczne w panelu** (nadzorca
  silnika). Cisza w poczcie — kampanie, przypomnienia, ankiety, kody logowania,
  raport bezpieczeństwa — wychodziła na jaw dopiero po kilku dniach, po tym,
  że nie przyszedł poranny raport.

Bez migracji i bez zmian w `.env`.

## [1.66.1] — odczyt arkuszy: łatka bezpieczeństwa i polskie znaki w CSV

- **`xlsx` (SheetJS) z dystrybucji producenta, wersja 0.20.3.** Wydania w npm
  (0.18.5) są porzucone i mają dwie podatności na **czytaniu** plików
  (prototype pollution, ReDoS) — a arkusz wgrany do feedów jest właśnie
  czytany. Instalacja pobiera paczkę z `cdn.sheetjs.com`, zgodnie z zaleceniem
  autorów.
- **CSV w UTF-8 nie rozjeżdża już polskich znaków.** Plik szedł do biblioteki
  jako surowe bajty, a ta zgadywała stronę kodową: nagłówek „Imię" stawał się
  „ImiÄ™", czyli nazwa kolumny, którą wskazuje się w wiadomości. Teraz CSV jest
  odczytywany jako UTF-8 (z BOM-em albo bez), a gdy bajty nie są poprawnym
  UTF-8 — jako Windows-1250, czyli tak, jak zapisuje polski Excel.
- Odczyt arkuszy ma wreszcie testy (nagłówki, wiele arkuszy, puste kolumny,
  oba kodowania CSV).

## [1.66.0] — pierwsze wydanie publiczne

PRM Core Community Edition: CRM pacjentów i automatyzacja komunikacji dla
placówek medycznych.

- **Kontakty i pacjenci** — kartoteka, import CSV/XLSX, pola własne, statusy,
  tagi, scalanie duplikatów, zgody (e-mail, SMS, profilowanie i własne
  definicje), oś aktywności.
- **Segmenty, lejki, raporty** — segmenty doraźne i stałe, raporty własne
  z wykresami i eksportem, pulpit aktywności pacjentów.
- **Automatyzacje i silnik** — wyzwalacze (nowy kontakt, wizyta umówiona,
  odbyta, nieobecność, odwołanie, zmiany tagów i segmentów), wysyłki e-mail
  i SMS, kolejka i dziennik silnika, PRM_Agent (AI) z budżetem.
- **Treści** — Design Studio (newslettery, e-maile, pop-upy), biblioteka
  mediów, feedy danych w wiadomościach, skrypt śledzący dla strony placówki.
- **Integracje** — SendGrid, Twilio, Anthropic / OpenAI / Google, Meta Lead
  Ads, Canva, webhook leadów, webhook rezerwacji, MCP (tylko odczyt), klucze
  w panelu zaszyfrowane w bazie.
- **System rezerwacji jako dostawca** — mechanika (powiązania pacjentów,
  import wizyt ze stanami, nieobecności, odwołania, scalanie z webhookiem,
  grafiki lekarzy, wstrzymanie wymiany) działa z każdym systemem z API;
  system podłącza się plikami w `src/lib/booking-system/providers/`.
- **Docplanner – Integration** (ZnanyLekarz, Doctoralia) — klucze
  i sprawdzenie połączenia; synchronizacja wizyt w przygotowaniu.
- **Bezpieczeństwo** — logowanie z drugim składnikiem (SMS, aplikacja),
  role z kontem tylko do podglądu, ogranicznik prób, sesje 30 min, dobowy
  raport bezpieczeństwa, kontrola `sprawdz-bezpieczenstwo.sh`.
- **Język** — interfejs po polsku i po angielsku, wybór na koncie
  użytkownika; `PRM_LOCALE` ustala język domyślny instalacji.
- **Czcionki z plików instalacji** — interfejs i Design Studio (43 kroje,
  także w wysyłanych newsletterach) bez Google Fonts.
- **Szablon dostawcy** z testami (`providers/_template/`) i formularz
  zgłoszenia „Medical system connector” — punkt startu dla integracji
  z systemami medycznymi.
- **Informacje o aktualizacjach** — administratorzy widzą baner o nowej
  wersji i komunikaty właściciela produktu z publicznego `updates.json`
  (pobieranie raz na 12 h, bez wysyłania czegokolwiek; `PRM_UPDATE_CHECK=0`
  wyłącza).
- **Licencja** — Community Edition na MIT; PRM Core Enterprise na licencji
  komercyjnej (README → „License and editions”).

### Aktualizacja instalacji sprzed 1.66.0

- Ustaw `PRM_LOCALE=pl` w `.env`, jeśli interfejs i wiadomości do pacjentów
  mają domyślnie zostać po polsku (domyślny jest angielski).
- Integracja z systemem rezerwacji nie jest już wbudowana: dołóż pliki
  dostawcy do `src/lib/booking-system/providers/` razem z aktualizacją.
  Migracja 0067 zapisuje stany wizyt neutralnie.
