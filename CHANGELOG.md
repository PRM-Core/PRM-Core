# Changelog

Format oparty na [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
wersjonowanie wg [SemVer](https://semver.org/lang/pl/).

**Zasada nadrzędna dla każdego wydania:** aktualizacja nigdy nie kasuje
kontaktów, ich historii ani automatyzacji. Migracje są wyłącznie dodające, a te,
które usuwają kolumnę, najpierw przenoszą z niej dane. Wydanie, które
wymagałoby wyczyszczenia bazy, dostaje numer główny i osobną instrukcję.

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
