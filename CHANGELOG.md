# Changelog

Format oparty na [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
wersjonowanie wg [SemVer](https://semver.org/lang/pl/).

**Zasada nadrzędna dla każdego wydania:** aktualizacja nigdy nie kasuje
kontaktów, ich historii ani automatyzacji. Migracje są wyłącznie dodające, a te,
które usuwają kolumnę, najpierw przenoszą z niej dane. Wydanie, które
wymagałoby wyczyszczenia bazy, dostaje numer główny i osobną instrukcję.

## [2.28.0] — Każda funkcja AI na modelu lokalnym

Wszystko, co kiedyś działało na modelu w chmurze, działa teraz na modelu
w sieci placówki — także na Bieliku 11B, który nie obsługuje narzędzi ani
obrazów. Opis: `docs/AGENT.md`, sekcja 7.1.

- **Narzędzia w prompcie.** Copilot, kreator automatyzacji i segmentów, węzeł
  Agent AI, nadzorca i raport bezpieczeństwa wołają narzędzia. Gdy serwer
  odpowiada, że model ich nie obsługuje, adapter lokalny opisuje narzędzia
  w prompcie, a odpowiedź modelu trzyma schematem JSON (`response_format`,
  które rozumieją Ollama, vLLM i llama.cpp): albo poprawne wywołanie, albo
  odpowiedź — bez prozy wokół wywołania i bez wymyślonego wyniku narzędzia.
  Funkcje, które działają tylko na wywołaniu, nie dostają w ogóle opcji
  „odpowiedź”. `PRM_AI_LOCAL_TOOLS`: `auto` (domyślnie), `native`, `prompt`.
- **Model bez obrazów.** Studio kreacji z modelem tekstowym koduje wiadomość
  z opisu i mówi to wprost w rekomendacjach, zamiast kończyć się błędem;
  odpowiedź studia jest trzymana schematem, więc 11B nie zostawia
  niedomkniętego JSON-a.
- **Daty wizyt nie są już brane za numer telefonu.** Maskowanie
  identyfikatorów brało „2026-10-23 05:08” (dziesięć cyfr) za telefon
  i wysyłało modelowi `{{phone}}:08` — przy każdym dostawcy. Model nie
  widział więc, kiedy są wizyty. Daty są teraz odkładane na bok przed wzorcem
  telefonu; telefon tuż po dacie nadal jest maskowany.
- **Karta pacjenta i węzeł Agent AI mówią modelowi, jaki jest dziś dzień.**
  Karta dzieli wizyty na zaplanowane i minione (ze stanem), obie dostają
  trzy zdania policzone przez system. Bielik odpowiadał „brak umówionej
  wizyty” przy wizycie za tydzień.
- **Pusta zmienna z `.env.example` to „nie ustawiono”, nie zero.**
  `PRM_SECURITY_REPORT_LIMIT_USD=` dawało limit 0 USD i raport
  bezpieczeństwa nigdy nie korzystał z modelu; `PRM_SECURITY_REPORT_HOUR=`
  i `PRM_DEMO_RESET_HOUR=` dawały północ.
- Z odpowiedzi modelu lokalnego znikają tokeny szablonu (`<|im_sep|>`) oraz
  zabłąkane ukośniki i znaki powrotu karetki na końcach linii.

## [2.27.0] — Tryb demonstracyjny i symulator pacjentów

Publiczne demo, w którym cały system pracuje na pacjentach, którzy nie
istnieją: przychodzą leady, umawiane są wizyty, wizyty się kończą albo
pacjent nie przychodzi, automatyzacje wysyłają, PRM_Agent wskazuje, kim się
zająć, a raporty się ruszają. Nic z tego nie wychodzi poza serwer. Opis:
`docs/DEMO.md`.

- **`PRM_DEMO=1` — nic nie jest wysyłane.** Transport e-mail i SMS oraz
  webhooki wychodzące zapisują to, co by wysłały, zamiast wołać SendGrida,
  Twilio czy odbiorcę. Przełącznik siedzi w samych transportach, więc obejmuje
  każdą drogę: automatyzacje, kampanie, odpowiedzi ze skrzynki, agenta i kody
  logowania. Brak nadawcy nadal jest błędem — demo pokazuje te same
  komunikaty, które dostałaby placówka.
- **Pasek „Wersja demonstracyjna — dane symulowane”** nad każdą stroną
  i ekran **„Wysłane w demo”** (`/demo`): ostatnie 100 wiadomości — e-maile
  tak, jak zobaczyłby je pacjent, SMS-y, treść webhooków. Podgląd usuwa piksel
  śledzący i kieruje odnośniki wprost do celu, więc oglądanie wiadomości nie
  liczy się jako otwarcie ani kliknięcie.
- **Symulator na zegarze silnika** (krok co `PRM_DEMO_TICK_SECONDS`, domyślnie
  30 s): nowe leady przez wejście webhooka leadów, rezerwacje przez wejście
  webhooka rezerwacji (usługi, lekarze, filie), wizyty zakończone albo
  nieobecności i odwołania tak, jak zgłasza je system rezerwacji, otwarcia
  i kliknięcia tego, co silnik naprawdę „wysłał”, odpowiedzi pacjentów
  w skrzynce. Symulator nie zapisuje niczego za automatyzację — reagują silnik,
  automatyzacje i PRM_Agent, jak w placówce.
- **Nocny powrót do stanu początkowego** (`PRM_DEMO_RESET_HOUR`, domyślnie
  3:00) i od razu na pustej bazie. Konta, sesje, ustawienia i sekrety
  instalacji oraz dziennik działań administracyjnych zostają; reszta jest
  czyszczona i zasiewana od nowa. **Reset odmawia pracy na bazie
  z kontaktami, które nie wyglądają na dane przykładowe** — gdyby `PRM_DEMO`
  trafiło na serwer placówki.
- **Zasiew, na którym każdy ekran ma co pokazać**: ok. 190 pacjentów i leadów,
  ponad 300 rozstrzygniętych wizyt (model nieobecności uczy się naprawdę),
  więcej nieobecności i mniej otwarć w ostatnich 30 dniach, pacjenci do
  recallu, po jednej wizycie, dryfujący, po wizycie bez odpowiedzi,
  z ryzykiem nieobecności i bez telefonu — każda lista PRM_Agenta jest
  niepusta, są rekomendacje i brief. Do tego skrzynka, baza wiedzy z lukami,
  segmenty i sześć automatyzacji.
- **Każda tożsamość jest syntetyczna z konstrukcji**: nazwiska z fikcyjnej
  listy, adresy w domenie `example.test`, numery `+48 000 …`, PESEL-e
  z celowo błędną cyfrą kontrolną. Testy sprawdzają to na dziesięciu
  tysiącach wygenerowanych osób i na każdym kontakcie po godzinach symulacji.
- `bun run demo -- --reset | --steps N | --loop` — reset na żądanie i godzina
  ruchu od razu, tylko przy `PRM_DEMO=1`.
- Przy okazji: logika webhooka leadów (`lead-intake.server.ts`) oraz
  zapis otwarć i kliknięć (`tracking-events.server.ts`) wydzielone z tras, żeby
  symulator szedł dokładnie tą samą drogą; zachowanie tras bez zmian.
- Tabela podglądu (`demo_outbox`) powstaje dopiero w trybie demo — zwykła
  instalacja jej nie ma i ta wersja nie dodaje migracji.

## [2.26.0] — Dostrojony model: adapter LoRA tej instalacji

„Uczenie się z decyzji zespołu” wkłada zatwierdzone teksty do promptu, ale
wag modelu nie zmienia. Teraz instalacja, która zebrała dość decyzji, może
wytrenować na nich adapter LoRA dla lokalnego modelu (Bielik 11B) — poza
aplikacją, w sieci placówki — i przełączyć się na niego dopiero wtedy, gdy
w sprawdzianie wypada nie gorzej niż model bazowy. Produkt nie pobiera
modelu ani narzędzi i niczego nie trenuje sam.

- **`bun run agent:export-training -- --out <katalog>`** zapisuje zbiór
  uczący z `agent_examples`: zatwierdzone teksty draftów (sparowane z ich
  draftem — cel, odbiorcy, szablon reguły) i poprawione przez rejestrację
  oceny wiadomości, jako linie czatu w kształcie, który produkt naprawdę
  wysyła (prompt systemowy, prompt użytkownika, odpowiedź zespołu).
  Pliki `train.jsonl`, `valid.jsonl` (~10%, stały podział) i
  `manifest.json` (tylko liczby), z prawami `0600`. Odmawia zapisu
  wewnątrz katalogu aplikacji; `--dry-run` tylko liczy.
- **Pseudonimizacja sprawdzana jeszcze raz przy eksporcie.** Linia, w której
  to, co napisał człowiek, wciąż zawiera e-mail, telefon, PESEL,
  pseudonim kontaktu (`#a1b2c3`), numer `PRM-…` albo nazwisko któregokolwiek
  kontaktu instalacji (także odmienione), jest odrzucana — nie
  poprawiana. Odrzucane są też teksty, które nie przeszłyby dzisiejszych
  reguł draftu (dawka, link, liczba). Liczba odrzuceń według powodu trafia
  do wyniku i do manifestu.
- **Minimum 200 przykładów** (`--min`): poniżej nic nie jest zapisywane
  (kod wyjścia 1) — adapter z tak małego zbioru uczy się przypadku, nie
  stylu placówki.
- **Nowy kierunek PRM_Agent „Dostrojony model”.** Proponowany, gdy na
  serwerze modelu w sieci placówki zarejestrowano drugi model z adapterem
  (`PRM_AI_LOCAL_ADAPTER_MODEL`). Karta w PRM_Agent → Kierunki pokazuje
  wyniki obu modeli obok siebie; „Porównaj modele” (albo
  `bun run agent:eval -- --compare`) uruchamia sprawdzian na bazowym i na
  dostrojonym. Włączenie jest odrzucane, jeśli oba nie przeszły tych
  samych przypadków albo dostrojony zdał ich mniej; oba wyniki zapisują się
  przy decyzji i w dzienniku. Po włączeniu wszystkie funkcje językowe
  używają modelu dostrojonego.
- **Jedno kliknięcie wraca do modelu bazowego** („Wróć do modelu
  bazowego”). Agent wraca też sam, gdy nowszy sprawdzian pokaże model
  dostrojony gorszym — powrót jest zawsze dozwolony, włączenie czeka na
  człowieka. Usunięcie zmiennej z `.env` też przywraca model bazowy.
- **Adapter zostaje w instalacji.** Powstaje z pseudonimizowanych tekstów
  związanych z pacjentami tej placówki, więc jest traktowany jak baza: nie
  jest wysyłany do repozytorium modeli ani udostępniany innym placówkom.
  Mówią to ekran, dokumentacja i manifest zbioru.
- **Przepis w `docs/AGENT.md`, sekcja 12**: MLX (QLoRA) na Apple Silicon
  i PEFT na karcie NVIDIA, szacowana pamięć i czas dla modelu 11B, lista
  plików do pobrania z rozmiarami oraz rejestracja modelu na serwerze.
  Uwaga: obecny serwer Ollama odrzuca `ADAPTER` w Modelfile („LoRA adapters
  are no longer supported”), więc przepis dla Ollamy scala adapter z modelem
  (`mlx_lm.fuse` → GGUF → `llama-quantize` → `FROM`); vLLM
  (`--lora-modules`) i serwer llama.cpp (`--lora`) ładują adapter bez
  scalania.
- `draftUserPrompt` pomija linię szablonu, gdy szablonu nie ma (nowy draft
  zawsze go ma; linia ucząca z nadpisanym szablonem — nie).
- Migracji brak: kierunek to nowa wartość w istniejącej tabeli.
- Sprawdzone: typy, lint, testy eksportu na syntetycznych przykładach
  (w tym odmowa linii z nazwiskiem, telefonem, e-mailem i pseudonimem,
  próg minimum, prawa plików, odmowa zapisu w katalogu aplikacji) i testy
  bramki (gorszy wynik, różne zestawy przypadków, zapis obu wyników,
  powrót do modelu bazowego). Prawdziwego treningu nie uruchamiano.

## [2.25.1] — Poprawki bezpieczeństwa zależności

Pierwszy przebieg `bun audit` znalazł w zależnościach 47 podatności,
w tym 6 krytycznych. Najpoważniejsze dotyczyły każdej działającej
instalacji: odbity XSS w odpowiedziach funkcji serwerowych TanStack Start
oraz błąd deserializacji w `seroval`, który dekoduje dane funkcji
serwerowych. Po aktualizacji zostały 2 (średnia i niska, w starym
`esbuild` używanym tylko przy budowaniu) — poniżej progu CI.

- **Zaktualizowane w obecnych zakresach wersji** (`bun update`, plik
  `bun.lock` przebudowany, więc także zależności pośrednie).
- **TanStack Start przypięty na 1.168.61** (z `react-router` 1.170.42
  i `router-plugin` 1.168.43): to ostatnie wydanie dla Vite 7, już
  z poprawkami bezpieczeństwa. Wersja 1.169 wymaga Vite 8 — przejście na
  nie to osobna zmiana wersji głównej. Dependabot zaproponuje ją jako pull
  request, a CI pokaże, czy przechodzi.
- `@modelcontextprotocol/sdk` wymuszony na 1.32.1 (`overrides`):
  `@lovable.dev/mcp-js` przypinał podatną 1.28.0.
- Nowa wersja routera: typ kontekstu trasy głównej (zalogowany
  użytkownik) wymagał jawnego typu parametru w `beforeLoad`; komponent
  błędu dostaje błąd jako `unknown`. Kod sformatowany nową wersją
  Prettiera.
- Sprawdzone: typy, lint, 493 testy, oba buildy, build produkcyjny
  w przeglądarce z egzekwowaną polityką CSP (nonce na każdym skrypcie,
  zero naruszeń na kilkunastu ekranach).

## [2.25.0] — Przegląd zależności w CI i czasy odpowiedzi na zgłoszenia

- **CI → „Dependency review”**: `bun audit` sprawdza każdą zainstalowaną
  paczkę w bazie ostrzeżeń npm i zatrzymuje build przy podatności wysokiej
  albo krytycznej; w pull requeście przegląd zależności GitHuba blokuje
  nowo dodaną zależność ze znaną podatnością.
- **Dependabot** (`.github/dependabot.yml`): co tydzień aktualizacje paczek
  (drobne zebrane w jeden pull request) i akcji GitHuba.
- **`SECURITY.md`**: potwierdzenie zgłoszenia w 3 dni robocze, ocena i plan
  w 10, poprawki krytyczne i wysokie wydawane od razu po przygotowaniu (cel:
  14 dni od oceny), po polsku i po angielsku.
- Lista bezpieczeństwa z roadmapy jest zrealizowana w całości.

## [2.24.0] — Dziennik działań administracyjnych

Kto dodał konto, zresetował hasło, wyeksportował kontakty albo otworzył
dokument pacjenta — część tych śladów była w dzienniku silnika, wśród
tysięcy kroków automatyzacji, część nigdzie.

- **Ustawienia → Bezpieczeństwo → Dziennik działań administracyjnych**
  (tylko administrator): kto, kiedy, co i na czym, z filtrem po rodzaju
  działania.
- **Zapisywane**: dodanie i usunięcie konta (z rolą), reset hasła przez
  administratora, zmiana numeru do kodów, **eksport kontaktów** (ile
  i z jakim filtrem), **pobranie, dodanie i usunięcie dokumentu pacjenta**,
  zapis, usunięcie i import kluczy integracji (same nazwy, nigdy
  wartości), nowy token MCP, wymiana sekretu webhooka (planowa czy po
  wycieku), odbiorcy webhooków wychodzących.
- **Retencja**: `PRM_AUDIT_RETENTION_DAYS` (domyślnie 365, najmniej 30);
  starsze wpisy silnik usuwa raz na dobę.
- Zapis do dziennika nigdy nie zatrzymuje samego działania.
- Rola konta jest nadawana przy jego tworzeniu i nie ma osobnej funkcji jej
  zmiany — dziennik zapisuje ją przy „dodaniu konta”.
- **Poprawka bezpieczeństwa**: hasła tymczasowe (nowe konto, reset przez
  administratora) były losowane `Math.random`, które nie jest generatorem
  kryptograficznym. Teraz `crypto.randomInt`.
- Migracja 0087: tabela `audit_log`.

## [2.23.0] — Wymiana kluczy i sekretów bez przestoju

Zmiana `PRM_SECRETS_KEY` czyniła dotąd wszystkie zapisane klucze integracji
nieczytelnymi, a nic nie umiało ich przeszyfrować. Wymiana sekretu webhooka
odcinała od razu system rezerwacji i źródła leadów.

- **`PRM_SECRETS_KEY_PREVIOUS`**: na czas wymiany aplikacja odczytuje wpisy
  zapisane poprzednim kluczem, a nowe zapisuje nowym — nic nie przestaje
  działać.
- **`bun run secrets:rotate`** przenosi wszystkie zapisane wartości (klucze
  integracji, adresy i sekrety webhooków wychodzących) na bieżący klucz,
  podczas pracy aplikacji. Najpierw próba (nic nie zapisuje), potem
  `--apply`. Każda wartość jest odszyfrowana i sprawdzona przed zapisem;
  gdy którakolwiek nie należy do żadnego z kluczy, nic nie jest zapisane.
- **Sekret webhooka kontaktów i rezerwacji**: dwa wybory przy wymianie —
  „planowa” (stary działa jeszcze 24 h, każde jego użycie trafia do
  dziennika) albo „wyciek” (stary przestaje działać od razu). Porównanie
  sekretu w stałym czasie.
- Poprawka: zapis odbiorcy webhooka wychodzącego bez zmiany adresu
  oznaczał wiersz bieżącym kluczem, choć wartości mogły być zaszyfrowane
  poprzednim — w trakcie wymiany wiersz stałby się nieczytelny. Teraz
  zapis przenosi je na bieżący klucz.
- **Instrukcja krok po kroku: `docs/KEY-ROTATION.md`.**
- Migracja 0086: kolumny `previous_secret`, `previous_until`
  w `lead_webhook_settings`.

## [2.22.0] — Content-Security-Policy egzekwowana, z nonce na każde żądanie

Polityka treści była dotąd w Caddyfile w trybie „tylko zgłaszaj”
i z `'unsafe-inline'` dla skryptów — czyli nie chroniła przed niczym.

- **Aplikacja sama wysyła `Content-Security-Policy`** z każdą stroną HTML,
  z nonce losowanym dla każdego żądania. Wykonać mogą się tylko skrypty
  aplikacji i te, które router oznaczył tym nonce (stan strony). Wstrzyknięty
  `<script>` w nazwisku pacjenta albo w wiadomości jest martwym tekstem.
  Style inline zostają dozwolone — ustawia je biblioteka interfejsu, a styl
  nie odczyta strony ani nie wyśle danych tak jak skrypt.
- Sprawdzone na buildzie produkcyjnym w przeglądarce: kilkanaście ekranów
  (pulpit, kontakty, raporty, PRM_Agent, skrzynka, ustawienia, wysyłki,
  studio, e-mail, automatyzacje) — zero naruszeń polityki, interfejs działa
  po hydracji.
- Strona błędu: przycisk „Try again” z `onclick` (który polityka by
  zablokowała) zamieniony na zwykły odnośnik.
- **`PRM_CSP`** w `.env`: `enforce` (domyślnie w produkcji), `report`
  (tylko zgłasza — do diagnozy), `off`. W trybie deweloperskim nagłówka nie
  ma, bo Vite wstrzykuje własne skrypty bez nonce.
- `Caddyfile.example` nie ustawia już CSP — nie zna nonce, a dwa nagłówki
  zawęziłyby politykę do części wspólnej. **Instalacje z własnym Caddyfile:
  usuńcie linię `Content-Security-Policy-Report-Only`.**

## [2.21.0] — Uwierzytelnianie z konstrukcji: kontrola w CI

Każda funkcja serwerowa to publiczny adres, którego identyfikator jest
w kodzie strony jeszcze przed zalogowaniem. To, że każda ma zamek, było
dotąd konwencją plus sondą uruchamianą ręcznie przeciw działającej
instalacji.

- **Test w CI** (`src/lib/api/auth-by-construction.test.ts`) czyta kod
  źródłowy i zatrzymuje build, gdy jakakolwiek funkcja serwerowa nie ma
  `requireUser` albo `allowReporter` i nie stoi na liście publicznych.
  Zatrzymuje go też, gdy lista ma wpis nieaktualny.
- **Lista publicznych z powodami** (`src/lib/api/public-server-fns.ts`):
  logowanie, drugi składnik, wylogowanie, „kto jest zalogowany”, reset
  hasła, rejestracja pierwszego administratora, język na ekranie logowania.
  Dopisanie funkcji do tej listy jest decyzją o bezpieczeństwie i wymaga
  podania powodu.
- Osiem funkcji kont, które sprawdzały sesję ręcznie wewnątrz (zmiana
  hasła, nazwy i telefonu, lista użytkowników, funkcje administratora),
  dostało zamek w middleware — sprawdzenia administratora wewnątrz
  zostały.

## [2.20.0] — Kolejka kroków: co czeka, co poszło nie tak, bezpieczne ponowienie

Nieudany krok było widać tylko w dzienniku, wśród setek innych wpisów,
a jedynym sposobem, żeby go ponowić, była ręczna zmiana w bazie.

- **PRM Engine → Kolejka kroków**: nieudane (z powodem), przerwane
  w trakcie, czekające na zatwierdzenie, odłożone przez godziny wysyłki
  albo limit, zaplanowane — z automatyzacją, pacjentem, krokiem i czasem.
  Odświeża się co 15 s.
- **„Ponów”** dla kroku nieudanego: ten sam krok, dla tego samego
  przebiegu, przy najbliższym takcie silnika — przez te same zgody, limity
  i godziny wysyłki. Odmowa, gdy automatyzacja jest wyłączona, kroku nie ma
  już w scenariuszu albo pacjent jest w innym trwającym przebiegu tej
  automatyzacji.
- **Krok przerwany** (serwer zatrzymany w środku kroku) mógł już wysłać
  wiadomość, więc silnik nie ponawia go sam — ponowienie wymaga drugiego
  kliknięcia z ostrzeżeniem.
- Każde ponowienie trafia do dziennika z tym, kto je zlecił. Rola
  „raporty” widzi kolejkę, ale nie ponawia.
- Plan silnika z roadmapy jest zrealizowany w całości.

## [2.19.0] — Zasady ponownego wejścia do automatyzacji

Dotąd pacjent mógł wejść do tej samej automatyzacji znowu, gdy tylko
skończył się jego poprzedni przebieg. Dobre dla przypomnienia o każdej
wizycie, złe dla serii powitalnej czy ankiety, która nie powinna wracać co
tydzień.

- **„Ponowne wejście”** (pasek w edytorze): **zawsze** — jak dotąd,
  domyślnie, więc aktualizacja nic nie zmienia; **tylko raz**; albo **po N
  dniach** od poprzedniego wejścia.
- Zdarzenie, które nie może uruchomić przebiegu, jest pominięte z powodem
  w dzienniku („pacjent już przeszedł tę automatyzację”, „ponowne wejście
  możliwe od …”).
- Zasada „jeden trwający przebieg na pacjenta” obowiązuje jak dotąd
  w każdym ustawieniu i jest sprawdzana najpierw.
- Migracja 0085: kolumny `reentry`, `reentry_days` w `automations`
  (istniejące: „zawsze”).

## [2.18.0] — „E-mail, a gdy nieotwarty — SMS” jako jeden krok

Zapasowy kanał trzeba było budować ręcznie: wysyłka, czekanie, rozgałęzienie,
druga wysyłka — i pilnować, żeby czekanie dotyczyło właśnie tego e-maila.

- **Nowy krok** (Dodaj krok → Akcja, na górze listy): szablon e-maila,
  szablon SMS, po ilu godzinach bez otwarcia ma pójść SMS, tryb wysyłki,
  nadawca SMS.
- Liczy się **otwarcie albo kliknięcie tego e-maila** (rozpoznawanego po
  jego znaczniku), nie dowolnego. Gdy e-mail w ogóle nie wyjdzie — brak
  adresu, brak zgody, limit marketingu — **SMS idzie od razu**.
- Obie wiadomości przechodzą przez te same reguły co zwykłe kroki: zgody,
  tygodniowy limit marketingu, okres próbny (każda połowa do zatwierdzenia
  osobno), godziny i tempo wysyłki. Logika wokół wysyłki jest teraz jedną
  funkcją silnika, wspólną dla kroku „Akcja” i obu połówek tego kroku.
- Krok może kończyć ścieżkę i liczy się jako akcja automatyzacji; edytor
  wymaga obu szablonów. Test na kontakcie pokazuje obie połówki.

## [2.17.0] — Krok „Wyślij do webhooka”: n8n, Make, Zapier w drugą stronę

PRM Core przyjmował dane z n8n, Make i Zapiera (webhook leadów), ale nie
umiał nic im przekazać. Nowy krok automatyzacji wysyła pacjenta do
wskazanego systemu — i jest to jedyny krok, który wyprowadza dane pacjenta
poza instalację, więc granice ustawia administrator, nie automatyzacja.

- **Odbiorcy** (Automatyzacje → PRM Engine → Webhooki wychodzące, tylko
  administrator): nazwa, adres, pola, które mogą wyjść. Krok w
  automatyzacji tylko wybiera odbiorcę z listy — nie da się w nim wpisać
  dowolnego adresu.
- **Pola:** numer PRM zawsze; imię, nazwisko, e-mail, telefon, status,
  tagi, segmenty, źródło, kampania, data dodania — tylko zaznaczone przez
  administratora. **PESEL i pola własne nigdy** — pola własne mogą zawierać
  cokolwiek, także dane medyczne.
- **Adres:** HTTPS; zwykłe HTTP tylko w sieci placówki (n8n często stoi
  lokalnie); bez loginu i hasła w adresie. Adres i sekret są
  przechowywane **zaszyfrowane** kluczem `PRM_SECRETS_KEY` — adres haka
  Zapiera czy Make sam jest sekretem; ekran pokazuje tylko host.
- **Podpis:** `X-PRM-Signature` = HMAC-SHA256 z „znacznik czasu.treść”;
  sekret pokazany raz przy dodaniu, „Nowy sekret” go wymienia. Opis
  weryfikacji dla odbiorcy (Node.js, n8n): `docs/WEBHOOK-OUTGOING.md`.
- **Dostarczenie:** jedna próba, 10 s; przekierowanie nie jest
  wykonywane (mogłoby wysłać dane tam, gdzie administrator się nie
  zgodził); błąd zatrzymuje przebieg z powodem w dzienniku. Test na
  kontakcie mówi tylko, dokąd i jakie pola by poszły — nic nie wysyła.
- **Ślad:** dodanie, zmiana, nowy sekret i usunięcie odbiorcy trafiają do
  dziennika silnika — kto, jaki host, jakie pola; nigdy adres ani sekret.
- Migracja 0084: tabela `webhook_endpoints`.

## [2.16.0] — Cele i konwersja, także dla wariantów A/B

Automatyzacja wysyłała wiadomości, ale nie było wiadomo, czy coś z tego
wynika: umówiona wizyta, wypełniony formularz. Split A/B dzielił pacjentów,
ale wyniku wariantów nie było nigdzie widać.

- **Cel automatyzacji** (pasek „Cel” w edytorze): zdarzenie pacjenta —
  z tej samej listy co wyzwalacze, z ich filtrami, np. „wizyta
  zarezerwowana, usługa zawiera kardio” — w ciągu N dni od wejścia.
- **Konwersja** w pasku i w Statystykach: ilu pacjentów osiągnęło cel,
  z ilu; przebiegi, którym okno jeszcze trwa, są „w trakcie”, nie liczą się
  jako porażka. Liczona z przebiegów i zdarzeń, które system już zapisuje
  — cel ustawiony dziś od razu pokazuje ostatnie 90 dni.
- **Warianty splitu A/B**: konwersja każdego wariantu i test dwóch
  proporcji — dopiero przy co najmniej 30 przebiegach na wariant; wcześniej
  wprost „za mało przebiegów”, zamiast liczby udającej dowód.
- **„Zakończ przebieg po osiągnięciu celu”**: pacjent, który już umówił
  wizytę, przestaje dostawać zachęty do umówienia; jego zaplanowane kroki
  i oczekiwania zostają zamknięte, dziennik mówi dlaczego.
- Migracja 0083: kolumna `goal` w `automations`.

## [2.15.0] — Limit marketingu na pacjenta, ze wszystkich automatyzacji razem

Każda automatyzacja z osobna jest rozsądna; pięć naraz plus newsletter już
nie — i pacjent wypisuje się ze wszystkiego.

- **„Marketing na pacjenta / 7 dni”** (PRM Engine → Godziny wysyłki
  automatyzacji, ustawia administrator): ile wiadomości marketingowych
  jeden pacjent może dostać w ciągu 7 dni — ze wszystkich automatyzacji
  i kampanii razem, e-mailem i SMS-em. Domyślnie bez limitu.
- Krok marketingowy automatyzacji ponad limit jest **pomijany, nie
  odkładany** (zaległości wyszłyby potem zrywem), z powodem w dzienniku;
  przebieg idzie dalej. Sprawdzane przed okresem próbnym — nikt nie
  zatwierdza wiadomości, która i tak nie wyjdzie — i jeszcze raz przy
  wysyłce zatwierdzonej.
- **Wiadomości administracyjne** (przypomnienie o wizycie, wynik gotowy)
  nie liczą się nigdy i nigdy nie są wstrzymywane.
- **Kampanie liczą się**, bo pacjent je dostał, ale nie są wstrzymywane:
  odbiorców wybrał człowiek, a ciche pominięcie części z nich byłoby
  gorsze.
- Test na kontakcie mówi, gdy limit pominąłby wiadomość.
- Liczone z nowego rejestru `marketing_touches`, zapisywanego po udanej
  wysyłce — tabele wysyłek nie mówią, czy wiadomość była marketingowa.
- Poprawka: SMS z automatyzacji zapisywał w historii identyfikator kroku
  zamiast automatyzacji.
- Migracja 0082: tabela `marketing_touches`, kolumna `marketing_per_week`
  w `engine_settings`.

## [2.14.0] — Czekaj na zdarzenie, z limitem czasu

Dotąd były tylko stałe opóźnienia, więc każda gałąź musiała zgadywać, ile
czekać: „po 48 godzinach sprawdź, czy pacjent odpisał” wysyłało
przypomnienie także temu, kto odpisał po godzinie, i dopiero po dwóch
dobach reagowało na odpowiedź.

- **Nowy krok „Czekaj na zdarzenie”** (w dodawaniu kroku, zakładka
  Opóźnienie). Czeka, aż pacjent coś zrobi — odpisze, umówi wizytę, otworzy
  e-mail, wypełni formularz — najdłużej ustawiony czas. Dwie ścieżki:
  „zdarzenie” (od razu, gdy nastąpi) i „czas minął”. Na co czekać wybiera
  się z tych samych wyzwalaczy, z ich filtrami: „wizyta zarezerwowana,
  usługa zawiera kardio” działa i tutaj.
- Liczy się tylko zdarzenie tego pacjenta, które nastąpi po wejściu
  w krok — nie to, które uruchomiło automatyzację. Zdarzenie i termin
  w tej samej chwili zamykają oczekiwanie dokładnie raz.
- Wyłączenie automatyzacji w trakcie czekania zatrzymuje przebieg przy
  najbliższym zdarzeniu albo terminie. Test na kontakcie idzie ścieżką
  „czas minął” i mówi, że zdarzenie poprowadziłoby inaczej.
- Edytor nie aktywuje automatyzacji z krokiem bez wybranego zdarzenia ani
  z niepodłączoną którąś z dwóch ścieżek.
- Tytuły kroków z czasem („Poczekaj 2 dni”) są tłumaczone — po angielsku
  pokazywały polskie jednostki.
- Migracja 0081: tabela `engine_waits`.

## [2.13.0] — Wyzwalacze czasowe: N miesięcy od ostatniej wizyty, urodziny

Każdy wyzwalacz reagował dotąd na zdarzenie, które właśnie zaszło. Opieka
cykliczna takiego zdarzenia nie ma — nikt nie rezerwuje „roku od ostatniej
kontroli” — więc nie dało się jej zautomatyzować wcale.

- **„Minęło N miesięcy od ostatniej wizyty”** — kontrola, przypomnienie
  o profilaktyce, powrót po roku. Liczy od ostatniej odbytej wizyty
  (opcjonalnie z daną usługą: „kardio” liczy od ostatniej wizyty
  kardiologicznej), jeden przebieg na wizytę. Domyślnie tylko gdy pacjent
  nic nie ma umówionego i tylko pacjenci, którym termin minął w ostatnim
  tygodniu — włączenie automatyzacji nie wyśle do wszystkich, których
  ostatnia wizyta była lata temu. „Także pacjenci po terminie” obejmuje
  i ich, w tempie limitów wysyłki z 2.12.0.
- **„Urodziny pacjenta”** — data urodzenia z numeru PESEL, z poprawną cyfrą
  kontrolną (literówka w numerze nie wyśle życzeń w zły dzień); raz w roku,
  w sam dzień; urodzeni 29 lutego w zwykłym roku 28 lutego.
- Jak to działa: silnik co kilka minut sprawdza aktywne automatyzacje
  z takim wyzwalaczem, zapisuje każde wyzwolenie (`engine_time_fires`:
  jedno na wizytę, jedno na rok — także po restarcie) i wpisuje zwykłe
  zdarzenie. Dalej przebieg startuje jak każdy inny: ta sama zasada
  „jeden trwający przebieg na pacjenta”, ten sam dziennik, te same godziny
  wysyłki.
- Panel ustawień wyzwalacza pokazuje teraz jego opis działania — dotąd
  widoczny był tylko przy akcjach, więc opisy wyzwalaczy (np. „Wizyta się
  odbyła”) nie docierały do nikogo.
- Migracja 0080: tabela `engine_time_fires`.

## [2.12.0] — Godziny wysyłki i tempo dla automatyzacji

Kampanie od dawna miały okno wysyłki i limity na godzinę i dobę;
automatyzacje je omijały. Wizyta zarezerwowana o 23:40 dostawała
potwierdzenie o 23:40, a dziesięć rozsądnych osobno automatyzacji mogło
razem wysłać zryw, który operator SMS bierze za spam.

- **Okno wysyłki dla wiadomości automatyzacji** (PRM Engine → Godziny
  wysyłki automatyzacji, ustawia administrator). Krok z wiadomością poza
  oknem czeka do jego otwarcia — wraca do kolejki z późniejszym terminem,
  bez liczenia jako próba — i mówi o tym raz w dzienniku silnika.
- **Limity na godzinę i na dobę** dla wszystkich automatyzacji razem,
  e-mail i SMS, z tą samą arytmetyką co kampanie: limit godzinowy rozkłada
  wiadomości równo w czasie, zamiast wysłać je zrywem. Liczy się tylko
  wiadomość, która naprawdę wyszła — krok pominięty z braku zgody nie
  zużywa limitu.
- **Wyjątek per automatyzacja** (w edytorze, przy automatyzacjach
  z wiadomościami): „o każdej porze” dla wiadomości, która później traci
  sens, np. przypomnienia godzinę przed wczesną wizytą. Limity obowiązują
  zawsze.
- **Nowa instalacja startuje z oknem 08:00–20:00.** Instalacja
  aktualizowana zachowuje dotychczasowe zachowanie (wysyłka o każdej
  porze), dopóki administrator nie ustawi okna — aktualizacja nie zmienia
  po cichu, kiedy pacjenci dostają wiadomości.
- Migracja 0079: kolumny okna, limitów i liczników w `engine_settings`,
  `quiet_hours` w `automations` (istniejące: `respect`).

## [2.11.0] — Trzy modele lokalne przez sprawdzian: Bielik, Qwen, Gemma

Ten sam sprawdzian 18 przypadków, ten sam kod i te same prompty, trzy
modele na Ollamie (Apple M2, 16 GB, jeden model w pamięci naraz):

| Model           | Polski | Angielski | Czas PL / EN  |
| --------------- | ------ | --------- | ------------- |
| Bielik 11B v2.3 | 17/18  | 17/18     | 7,7 / 3,9 min |
| Qwen 2.5 14B    | 18/18  | 18/18     | 5,0 / 4,0 min |
| Gemma 3 12B     | 18/18  | 18/18     | 7,4 / 3,9 min |

Wszystkie trzy nadają się do pracy. Oba błędy Bielika złapał kod: draft
z wymyśloną liczbą (odmowa, nic nie wysłano) i wstęp briefu z procentami
spoza danych (pominięty, brief zostaje z liczbami z kodu). Szczegóły
i konfiguracja w docs/AGENT.md, sekcja 7.

- **Niepełna odpowiedź modelu to „model niedostępny”, nie błąd.** Serwer
  pod presją pamięci potrafi zerwać połączenie w połowie odpowiedzi albo
  nie wysłać nic. Wcześniej kończyło się to błędem składni JSON, którego
  triaż i agent nie traktowały jak niedostępności modelu; teraz wracają do
  reguł, jak przy każdej innej awarii modelu.
- **Jeden model w pamięci naraz** na serwerze 16 GB
  (`OLLAMA_MAX_LOADED_MODELS=1`): dwa modele tej wielkości razem
  wypełniają pamięć — pierwszy przebieg Gemmy, uruchomiony, gdy Qwen był
  jeszcze załadowany, trwał 3,4 godziny zamiast 7 minut.

## [2.10.0] — Prawdziwy model lokalny przez sprawdzian: Bielik 11B

Pierwszy przebieg 18 przypadków sprawdzianu na prawdziwym modelu w sieci
placówki — Bielik 11B v2.3 (Q4_K_M) na Ollamie, Apple M2 z 16 GB RAM, bez
GPU w chmurze. Na start: **8/18**. Po poprawkach według raportu:
**PL 17/18, EN 18/18**. Jedyny błąd po polsku to dwa wymyślone adresy
stron w odpowiedzi — złapane przez sprawdzenie faktów, więc w produkcie
sugestia zostałaby oznaczona, nie wysłana. Raport ujawnił trzy błędy produktu i kilka
miejsc, w których mały model potrzebuje reguły w kodzie, a nie prośby
w prompcie.

**Błędy naprawione**

- **Limit długości odpowiedzi nie działał na serwerach lokalnych.** Adapter
  wysyłał tylko pole `max_completion_tokens`, które Ollama pomija — model
  pisał, ile chciał, a jedno rozgadane zapytanie blokowało kolejne na
  minuty. Teraz idzie też `max_tokens`, które czytają Ollama, llama.cpp
  i LM Studio (sprawdzone: limit 8 → 8 tokenów zamiast 208).
- **Węzeł agenta wysyłał `{{firstName}}` dosłownie.** Model nie zna imienia
  (widzi pseudonim), pisze więc znacznik — a ten nie był podstawiany przed
  wysyłką. Teraz imię trafia do treści w ostatniej chwili, jak w każdym
  szablonie.
- **Pseudonim i numer PRM w odpowiedziach.** Model witał pacjenta
  „Panie #a1b2c3 (PRM-00001)”. Profil w promptcie skrzynki nie zawiera już
  pseudonimu ani numeru; tekst z identyfikatorem wewnętrznym jest
  odrzucany (agent) albo oznaczany (sugestia w skrzynce).

**Reguły w kodzie zamiast próśb w promptcie**

- **Porada medyczna** sprawdzana w kodzie dla pacjenta (dawki, leki,
  „może Pani przyjąć”, „co 8 godzin”) i dla personelu (zalecenia, nie
  wzmianki). Węzeł agenta jej nie wyśle; sugestia w skrzynce ją oznaczy.
- **Triaż:** właściciel wynika z tematu (wyniki i recepty → lekarz, skarga
  → kierownik, rozliczenia → płatności, reszta → rejestracja); model
  wybiera go tylko przy temacie „inne”. Pilność „bez pośpiechu” tylko dla
  wiadomości bez sprawy do załatwienia. Odpowiedź modelu w lekko
  zepsutym JSON-ie jest czytana pole po polu.
- **Brief:** model pisze 2–4 zdania wstępu, liczby zostają z kodu; wstęp
  z liczbą spoza danych jest odrzucany, a brief zostaje bez wstępu.
- **Drafty:** jedno ponowienie z powodem odrzucenia (za długi, porada,
  identyfikator), potem odmowa — tak samo w produkcie i w sprawdzianie.
- **„BRAK W BAZIE” w środku linii** jest rozpoznawany: tekst przed znacznikiem
  zostaje, pytanie trafia na listę braków, reszta linii nie idzie do
  pacjenta.
- **Odpowiedź w skrzynce:** bez telefonów, e-maili i adresów spoza bazy
  wiedzy; ani nie potwierdza, ani nie zaprzecza temu, czego baza nie mówi
  (przykład w promptcie).

Sprawdzian uruchamiany po polsku i po angielsku (`PRM_LOCALE=pl|en bun run
agent:eval`); wyniki i konfiguracja w docs/AGENT.md, sekcja 7.

## [2.9.0] — Limity modelu: uruchomienia na dobę, dla instalacji i per automatyzacja

Model w sieci placówki nie kosztuje nic za token, więc limit w dolarach
nigdy się nie uruchamiał. Realnym zasobem jest **czas modelu** — jedna
automatyzacja z węzłem agenta na tysiące pacjentów zabrałaby go skrzynce,
triażowi i pozostałym automatyzacjom. Limity liczą teraz **uruchomienia
modelu na dobę**.

- **Limit instalacji** (Ustawienia → PRM_Agent, domyślnie 2000, ustawia
  administrator) z paskiem dzisiejszego zużycia. Po przekroczeniu kroki
  z modelem są pomijane do północy, z powodem podanym tam, gdzie krok się
  nie wykonał; deterministyczna część silnika działa dalej.
- **Limit per automatyzacja** (w edytorze, przy automatyzacjach z węzłem
  agenta: 0 / 20 / 50 / 100 / 200 / 500 / 1000, domyślnie 100; 0 = węzły
  agenta nie pytają modelu). Po przekroczeniu węzły agenta tej
  automatyzacji idą pierwszą ścieżką do północy, przebieg trwa; jeden wpis
  w dzienniku na dobę.
- Uruchomienia liczone z rzeczywistych rund modelu (nie z tokenów, których
  serwer lokalny może nie raportować). Supervisor ostrzega przy 80%
  limitu instalacji i alarmuje po przekroczeniu. Copilot pokazuje
  uruchomienia zamiast dolarów.
- Migracja 0078: kolumny `daily_call_limit` w `ai_settings`,
  `ai_calls_per_day` w `automations` (istniejące automatyzacje dostają
  100).

## [2.8.0] — Pacjent w trzech zdaniach, przed telefonem

- **Trzy zdania o pacjencie** dla osoby, która zaraz zadzwoni albo
  odpisze: wizyty (od kiedy, ile odbytych, ostatnia z lekarzem,
  nieobecności), co przed pacjentem (umówiona wizyta, a przy ryzyku
  nieobecności od 30% — „warto przypomnieć”), gdzie stoi korespondencja
  (wiadomość czekająca na odpowiedź z oceną pilności i tematem, albo
  ostatnia wiadomość od placówki i czy ją otwarto). Wyłącznie z wizyt
  i korespondencji, bez notatek i bez modelu — każde słowo da się sprawdzić
  w kartotece.
- **Gdzie:** w listach dla rejestracji przycisk „Przed telefonem” przy
  każdym pacjencie; w skrzynce pod nazwiskiem w nagłówku rozmowy; na
  karcie pacjenta → PRM_Agent („W trzech zdaniach”).
- Sformułowania neutralne co do rodzaju („Ostatnia wiadomość od
  pacjenta”, „Wizyta umówiona na…”).

## [2.7.0] — Baza wiedzy jako jedyne źródło faktów — sprawdzane w kodzie

Prośba w prompcie „używaj tylko bazy wiedzy” jest teraz regułą w kodzie.

- **Każdy sprawdzalny fakt w tekście modelu** — cena, godzina, data,
  telefon, czas trwania, procent, link, adres e-mail — musi mieć pokrycie
  w tym, co model dostał: w bazie wiedzy (w całości, nie tylko w skrócie
  z promptu), w rozmowie z pacjentem albo w jego danych. Polska pisownia
  się nie liczy („250 zł” = „250 PLN”, „8:00” = „8.00” = „8–18”, „20.10”
  = „20 października” = „2026-10-20”).
- **Węzeł Agent AI w automatyzacji nie wyśle** wiadomości z faktem bez
  pokrycia — dostaje odmowę z powodem i może napisać ponownie; wpis
  w dzienniku.
- **Sugestia odpowiedzi w skrzynce** pokazuje nad polem odpowiedzi fakty
  bez pokrycia („Bez pokrycia w bazie wiedzy: 14:00”) — do sprawdzenia
  przed wysłaniem.
- **Pytania, na które baza nie odpowiada.** Model dopisuje osobną linię
  „BRAK W BAZIE: …”, której pacjent nigdy nie dostaje. Pytanie trafia na
  listę w Ustawienia → PRM_Agent → Baza wiedzy (z licznikiem powtórzeń):
  „Dopisz odpowiedź” otwiera wpis z pytaniem jako tytułem i zamyka pytanie
  po zapisie; „Pomiń” — na stałe. Przy co najmniej 3 otwartych pytaniach
  agent rekomenduje uzupełnienie bazy.
- **Sprawdzian modelu**: 3 nowe przypadki odpowiedzi (cena z bazy, godziny
  spoza bazy, pułapka z dawką leku) — razem 18.
- Migracja 0077: tabela `knowledge_gaps`.

## [2.6.0] — Raporty dla każdej roli: finanse i marketing

Raporty mają dwie nowe zakładki, z tych samych tabel, z których czyta
PRM_Agent. Nic nie jest szacowane: nieustawiona cena to „brak danych”,
nie zero.

- **Finanse** (ostatnie 30 dni wobec poprzednich 30): wolumeny per kanał
  i źródło (e-mail z kampanii / z automatyzacji, skrzynki, testów; SMS
  z automatyzacji / kampanii), **części SMS** liczone jak u operatora —
  jedna polska litera przełącza wiadomość na części po 70 znaków zamiast
  160, raport mówi, jaki odsetek SMS-ów to dotyczy; **koszt** z cen
  jednostkowych z faktury (administrator ustawia: część SMS, 1000 e-maili);
  **przychód z odbytych wizyt** i **utracone na nieobecnościach** z cen
  wizyt; koszt komunikacji na odbytą wizytę; koszt modelu językowego
  (lokalnie 0 zł). Wizyty bez ceny są policzone osobno.
- **Marketing**: per kampania (90 dni) — wysłano, otwarcia, kliknięcia,
  wypisy, **odbiorcy, którzy umówili wizytę w ciągu 14 dni** (z wyraźnym
  zastrzeżeniem, że to zbieżność w czasie, nie przypisanie). **Testy A/B
  z kroku „Split”**: per wariant — pacjenci, odsetek umówionych wizyt,
  otwarcia e-maili wysłanych dalej w przebiegu; porównanie z pierwszym
  wariantem testem dwóch proporcji; poniżej 30 pacjentów na wariant
  zwycięzca nie jest ogłaszany.
- Odczyt dla roli podglądu; ceny ustawia administrator.

## [2.5.0] — PRM_Agent: dlaczego — dziennik decyzji czytelny dla człowieka

- **Dziennik** (PRM_Agent → Dziennik): wszystkie decyzje wokół agenta,
  najnowsze na górze, z tym, **kto działał** — osoba (z nazwiskiem), agent
  według swoich reguł albo model w sieci placówki — i odnośnikiem, gdzie
  szukać dalej: pacjent, automatyzacja, draft, kierunek, rozmowa. Filtry:
  wszystko / decyzje ludzi / agent / model.
- **„Dlaczego” przy każdym wierszu list** dla rejestracji (także w CSV):
  „Ostatnia wizyta 01.09.2025 — ponad rok temu; nic umówionego”, „Ryzyko
  nieobecności 34% na wizycie 22.10.2026: wcześniejsze nieobecności,
  wczesna pora” itd.
- **Karta pacjenta → PRM_Agent: „Co agent wie o tym pacjencie — i dlaczego”**:
  listy, na których jest dziś, z powodem; ryzyko nieobecności z czynnikami;
  wiadomości i drafty, które go dotyczą, z decyzją; ocena jego rozmów;
  ostatnie wpisy agenta. Z liczb instalacji, bez modelu.
- Odrzucenie rekomendacji i korekta triażu zapisują się w dzienniku jako
  decyzje osoby.

## [2.4.0] — Nowa automatyzacja na okresie próbnym

„Nic nowego nie wychodzi bez Ciebie” obejmuje teraz także automatyzacje.

- **Pierwsze wiadomości nowej automatyzacji czekają na zatwierdzenie.**
  Domyślnie 5 (w edytorze automatyzacji: „Zatwierdzaj pierwsze” 0 / 3 / 5 /
  10 / 20). Krok wysyłki (e-mail, newsletter, SMS) zostaje wstrzymany,
  a w PRM_Agent → Drafty pojawia się wiadomość z dokładną treścią, jaką
  dostałby pacjent, pogrupowana per automatyzacja.
- **Zatwierdzona** wychodzi przy najbliższym przebiegu silnika zwykłym kodem
  wysyłki — ze sprawdzeniem zgód i wpisem w historii. **Odrzucona** — krok
  jest pomijany, przebieg idzie dalej. „Zatwierdź wszystkie” dla jednej
  automatyzacji naraz.
- Po N zatwierdzeniach automatyzacja wysyła sama (wpis w dzienniku).
  Wiadomość, która i tak by nie wyszła (brak zgody, adresu, szablonu), nie
  jest wstrzymywana — krok loguje powód jak dotąd.
- Wstrzymane zadanie nie jest liczone jako zawieszone (przebieg ma status
  „oczekuje”). Wyłączenie automatyzacji zatrzymuje przebiegi jak dotąd.
- **Istniejące automatyzacje** (sprzed 2.4.0) nie mają okresu próbnego
  i wysyłają bez zmian; kopia automatyzacji dostaje okres próbny jak nowa.
- Migracja 0076: kolumny `review_first`, `reviewed` w `automations`,
  `review` w `engine_jobs`; nowy stan zadania `held`.

## [2.3.0] — PRM_Agent uczy się z decyzji zespołu

Kierunek „Uczenie się z zatwierdzonych draftów” obejmuje teraz wszystkie
decyzje zespołu i nazywa się **„Uczenie się z decyzji zespołu”**. Działa
tylko po włączeniu przez administratora (PRM_Agent → Kierunki).

- **Korekta triażu w skrzynce.** Przy ocenie rozmowy „Popraw ocenę”:
  pilność, temat, właściciel. Ocena rejestracji zostaje na rozmowie do
  następnej wiadomości pacjenta (silnik jej nie nadpisuje), a wiadomość —
  **spseudonimizowana przed zapisem** — z werdyktem staje się przykładem
  „tak sortujemy”, który model widzi przy kolejnych ocenach.
- **Odrzucona rekomendacja podnosi próg.** Przycisk „Odrzuć” przy
  rekomendacji na ekranie PRM_Agent (i każde odrzucenie rekomendacji agenta
  w panelu Supervisora) zapamiętuje liczby, przy których odrzucono. Ta sama
  rekomendacja wraca dopiero, gdy liczba pacjentów lub wysyłek wzrośnie
  o połowę albo wskaźnik o kolejne 5 pp — i wtedy jako nowa, z wpisem
  w dzienniku. Do tego czasu nie powstaje też draft. Bez włączonego
  kierunku odrzucenie działa jak dotąd (ostateczne, chyba że sprawa stanie
  się krytyczna).
- **Agent liczy te decyzje** jako podstawę do zaproponowania kierunku
  (nie tylko zatwierdzone drafty); brief podaje „decyzji zespołu
  zapamiętanych do nauki”.
- Migracja 0075: kolumna `label` w `agent_examples`.

## [2.2.0] — PRM_Agent: placówka jako wymiar

- **Wizyta ma placówkę** (`contact_visits.location`): webhook rezerwacji
  przyjmuje `placowka` / `location` / `lokalizacja` / `branch`; wartość
  widać na osi pacjenta i w zdarzeniu `visit.scheduled` (pole `location`,
  do użycia w automatyzacjach).
- **Wskaźnik nieobecności per placówka** obok per lekarz i per
  specjalizacja (od 10 rozstrzygniętych wizyt); rekomendacja „Nieobecności
  wzrosły: {placówka} — …” z tej samej reguły; w briefie „największy wzrost
  nieobecności” wybiera spośród lekarzy i placówek razem.
- Migracja 0074: kolumna `location`. Dokumentacja webhooka uzupełniona.

## [2.1.0] — PRM_Agent: sprawdzian modelu

Zanim administrator włączy kierunek z modelem, może sprawdzić, jak model
sobie radzi — nie na oko, tylko na stałych przypadkach ocenianych kodem.

- **Harness ewaluacyjny** (`src/lib/agent/eval/`): 15 stałych przypadków
  z promptami, które produkt naprawdę wysyła — drafty (recall, zaproszenie,
  reaktywacja), brief (spokojny tydzień, zły tydzień), triaż (krwawienie,
  odwołanie, wyniki, faktura, skarga, podziękowanie, po angielsku) — oraz
  pułapki: szablon proszący o zalecenia lekowe, szablon proszący o link
  i telefon, pacjent pytający o dawkę leku. Ocena kodem: reguły draftu
  plus zakaz porad medycznych (dawki, leki, zalecenia), zachowane liczby
  briefu i jego ostatnie zdanie, triaż w słownikach i zgodny z oczekiwaną
  etykietą. Odpowiedzi idą przez tę samą granicę, co produkcja.
- **Na ekranie** PRM_Agent → Kierunki: karta „Sprawdzian modelu” z wynikiem
  ostatniego przebiegu (łącznie i per funkcja), listą nieudanych przypadków
  z powodem i fragmentem odpowiedzi; przycisk „Uruchom sprawdzian” dla
  administratora. Wynik jest dowodem przy każdym kierunku z modelem
  („sprawdzian: 14/15” albo „nie uruchomiono — uruchom przed włączeniem”)
  i linią w briefie.
- **Z linii poleceń** `bun run agent:eval` — przed zmianą promptu albo
  modelu; kod wyjścia 1 przy dowolnym nieudanym przypadku (CI).
- Migracja 0073: tabela `agent_evaluations`.

## [2.0.0] — PRM_Agent nie wychodzi: bez dostawców zewnętrznych; agent rozwija się sam, administrator wyznacza kierunki

**Zmiana główna.** Produkt nie ma już adapterów Anthropic, OpenAI ani Google.
Warstwa językowa agenta działa wyłącznie na modelu w sieci placówki
(`PRM_AI_LOCAL_URL`) albo wcale. Instalacja, która miała
`PRM_AI_MODE=hosted`: po aktualizacji tryb jest czytany jako `off`, a ekran
Ustawienia → PRM_Agent i raport bezpieczeństwa wskazują pozostałe wpisy
(`PRM_AI_MODE=hosted`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GOOGLE_API_KEY`) do usunięcia z `.env`. Żadna migracja nie dotyka danych;
wiersz ustawień z dawnym dostawcą jest ignorowany.

- **Usunięte**: adaptery dostawców hostowanych, wybór dostawcy i modelu
  w ustawieniach, wpisy Anthropic / OpenAI / Google w katalogu integracji
  i ich sprawdzenia, zależność `@anthropic-ai/sdk`. `PRM_AI_MODE` ma dwie
  wartości: `off` i `local`; każde inne słowo to `off`.
- **Agent rozwija się sam.** Co noc uczy model nieobecności na historii
  placówki i zapisuje jego trafność względem częstości bazowej jako sygnał
  z wartością z wczoraj (`model.no_show_skill`). Tekst każdego
  zatwierdzonego draftu zostaje jako przykład (`agent_examples`).
- **Kierunki rozwoju — administrator decyduje.** Agent proponuje kierunek,
  gdy ma podstawy, z dowodem i opisem, co się zmieni: _treść draftów pisana
  przez model_, _brief wygładzany przez model_, _triaż przez model_ (gdy
  serwer modelu w sieci placówki odpowiada), _uczenie się z zatwierdzonych
  draftów_ (po pierwszym zatwierdzeniu), _uzupełnianie brakujących
  telefonów_ (gdy co najmniej jedna piąta kontaktów nie ma numeru).
  Nowa zakładka **PRM_Agent → Kierunki**: Włącz / Odrzuć / Wyłącz, decyzja
  z nazwiskiem i datą w dzienniku. **Żadna zdolność modelu nie rusza sama** —
  do decyzji administratora warstwa językowa mówi, na co czeka. Przy
  włączonym „uzupełnianiu telefonów” pacjenci bez numeru są listą dla
  rejestracji i rekomendacją.
- **Brief** ma sekcję „Jak rozwija się agent”: trafność modelu wobec
  wczoraj, liczba przykładów, kierunki czekające na decyzję. Pulpit
  pokazuje, ile kierunków czeka.
- Migracja 0072: tabele `agent_directions`, `agent_examples`.
- **Dla instalacji z modelem lokalnym z 1.70.0/1.71.0:** po aktualizacji
  drafty, brief i triaż przez model **zatrzymują się do czasu włączenia
  kierunków** — agent zaproponuje je pierwszej nocy (albo po „Przelicz
  teraz”), administrator włącza jednym kliknięciem.

## [1.71.0] — PRM_Agent: triaż wiadomości od pacjentów

Rejestracja widzi od razu, która rozmowa wymaga człowieka najpierw, czego
dotyczy i kto powinien ją przejąć.

- **Triaż każdej przychodzącej wiadomości** w ciągu minuty od jej przyjścia
  (na zegarze silnika, bez dotykania webhooków): **pilność** (pilne /
  zwykłe / bez pośpiechu), **temat** (umówienie, odwołanie, wyniki, recepta,
  skarga, płatności, inne) i **właściciel** (rejestracja, lekarz,
  rozliczenia, kierownik) z jednym zdaniem uzasadnienia. Ponowna ocena,
  gdy pacjent napisze znowu.
- **Reguły zawsze odpowiadają** — po rdzeniach słów, bez względu na
  odmianę, wielkość liter i polskie znaki (po polsku i angielsku): krwawienie
  czy omdlenie to pilne od razu, dwa słabsze sygnały („pilne”, „dziś”,
  „boli”) razem też; krótkie podziękowanie to „bez pośpiechu”; skarga
  wygrywa z wizytą, o której wspomina.
- **Model w sieci placówki, gdy jest** — dostaje treść przez warstwę
  pseudonimizacji (imię, nazwisko, e-mail, telefon pacjenta to symbole),
  odpowiada jednym JSON-em; odpowiedź liczy się tylko w trzech słownikach
  powyżej, inaczej zostają reguły. Bez porad medycznych, bez odpowiedzi do
  pacjenta. Koszt w dzienniku jak każde wywołanie AI.
- **Skrzynka**: pilne rozmowy na górze listy, filtr „Pilne”, chipy pilność /
  temat przy rozmowie, pełna ocena z uzasadnieniem i właścicielem
  w nagłówku, przycisk ponownej oceny (ikona agenta).
- Migracja 0071: kolumny `triage_*` w `inbox_threads`.

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
