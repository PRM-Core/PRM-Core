# System rezerwacji → PRM Core — jeden webhook

Dokument dla deweloperów systemu rezerwacji (albo formularza rezerwacji na
stronie placówki). Wszystko sprowadza się do **jednego żądania POST**
wysyłanego w chwili, gdy pacjent umówi, zmieni albo odwoła wizytę.

> In English: `POST /api/webhooks/booking` with the `X-Webhook-Secret` header
> and a JSON body. Field names are accepted in Polish and English (see the
> table below); `"test": true` validates a payload without saving anything.

## Adres i uwierzytelnienie

```
POST https://crm.przyklad.pl/api/webhooks/booking
Content-Type: application/json
X-Webhook-Secret: <sekret z panelu: Integracje → Webhooki>
```

## Najmniejsze działające żądanie

```json
{
  "imie": "Anna",
  "nazwisko": "Kowalska",
  "telefon": "600100200",
  "usluga": "Konsultacja laryngologiczna",
  "data_wizyty": "2026-09-16",
  "godzina_wizyty": "16:40"
}
```

Wymagane są trzy rzeczy: **e-mail albo telefon**, **nazwa usługi** i **termin**.
Reszta jest opcjonalna.

## Dwa pola, które warto dodać — i dlaczego akurat te

```json
{
  "idx_osoby": 123456,
  "idx_terminu": 998877
}
```

**`idx_osoby`** to identyfikator pacjenta po Waszej stronie. Bez niego PRM Core
musi **zgadywać**, której kartoteki w systemie rezerwacji dotyczy rezerwacja
(gdy system jest podłączony przez API — `src/lib/booking-system/providers/`):
pobiera rezerwacje lekarza z dnia wizyty i szuka pacjenta po kluczu `IMIĘ N`
(imię plus inicjał nazwiska, bo tyle podaje część systemów). Gdy tego dnia u tego lekarza
pasuje więcej niż jedna osoba, powiązanie jest **pomijane** — wpięcie cudzej
kartoteki pokazałoby cudzą historię leczenia, więc wolimy jej nie mieć wcale.
Skutek dla placówki: pacjent bez historii wizyt, bez PESEL-u i bez statusów.

Jedna liczba w żądaniu zdejmuje to całe zgadywanie.

**`idx_terminu`** służy za klucz odróżniania powtórek. Jeden termin u Was to
jeden wpis u nas — także gdy wyślecie żądanie drugi raz po nieudanej próbie albo
gdy zmienią się dane pacjenta.

## Wszystkie pola

| pole | zamiennie | uwagi |
|---|---|---|
| `imie` | `firstName`, `first_name` | |
| `nazwisko` | `lastName`, `last_name` | |
| `telefon` | `phone` | dowolny format, normalizujemy |
| `email` | | wymagany, jeśli nie ma telefonu |
| `pesel` | `PESEL` | uzupełnia puste pole, nie nadpisuje |
| `idx_osoby` | `idOsoby`, `patientId`, `idPacjenta` | **zalecane** |
| `idx_terminu` | `idTerminu`, `visitId`, `idWizyty` | **zalecane** |
| `usluga` | `title`, `service` | wymagane |
| `lekarz` | `doctor` | |
| `specjalizacja` | `specialization` | buduje segmenty — warto |
| `data_wizyty` + `godzina_wizyty` | `visitAt`, `termin` | data `RRRR-MM-DD`, godzina `GG:MM` (czas warszawski) albo gotowy ISO 8601 |
| `cena` | `price` | `"300,00 zł"` i `300` czytamy tak samo |
| `tagi` | `tags`, `tag` | tablica `["kardiologia","VIP"]` albo tekst `"kardiologia, VIP"` |
| `status` | | np. `pacjent`, `lead` — ustawiany tylko przy zakładaniu kontaktu |
| `zgoda_email` | `consentEmail`, `consent_email` | bramkuje wysyłkę e-mail |
| `zgoda_sms` | `consentSms`, `consent_sms` | bramkuje wysyłkę SMS |
| `zgoda_profilowanie` | `consentProfiling`, `consent_profiling` | dobieranie treści pod pacjenta |
| `zgoda_regulamin` | `regulamin`, `akceptacjaRegulaminu` | „Znam i akceptuję Politykę Prywatności oraz Regulamin" |
| `zgoda_marketingowa` | `marketingConsent`, `zgodaMarketing` | **nieobowiązkowa** — realny wybór pacjenta |

Nieznane pola są ignorowane — możecie wysłać cały swój obiekt.

**Nazwy pól dopasowujemy z tolerancją**: wielkość liter, polskie znaki, spacje
i podkreślenia nie mają znaczenia — `Tagi`, `tagi`, `TAGS` i `tag_list` trafiają
w to samo miejsce.

**Tagi się sumują.** Pacjent, który ma już „kardiologia" z wcześniejszej wizyty,
po rezerwacji u laryngologa ma oba — tag opisuje historię pacjenta, a nie
bieżącą wizytę. Powtórzony tag nie dubluje się.

### Zgody

Wartości `true`, `"1"`, `"true"`, `"tak"`, `"on"`, `"yes"` znaczą zgodę;
wszystko inne jej brak.

**Cztery zgody są obowiązkowe przy rezerwacji, jedna nie.**

| Zgoda | Charakter | Co wysyłać |
| --- | --- | --- |
| `zgoda_email` | obowiązkowa | `true` |
| `zgoda_sms` | obowiązkowa | `true` |
| `zgoda_profilowanie` | obowiązkowa | `true` |
| `zgoda_regulamin` | obowiązkowa | `true` |
| `zgoda_marketingowa` | **nieobowiązkowa** | `true` albo `false` — to, co pacjent wybrał |

**Pole marketingowe wysyłajcie zawsze**, także gdy pacjent odmówił. Pominięcie
go znaczy „nie pytaliśmy", a to przy zgodach coś innego niż „odmówił" — i tylko
wy wiecie, który z tych dwóch stanów jest prawdziwy.

**Czterech obowiązkowych możecie nie wysyłać** — rezerwację rozpoznaną jako
pochodzącą z systemu rezerwacji (po `idx_osoby` albo `idx_terminu`) przyjmujemy
z kompletem tych zgód, bo bez nich rezerwacja u was nie powstaje. Zapis dostaje
wtedy adnotację „warunek rezerwacji" zamiast „pacjent zaznaczył". **Lepiej
jednak wysyłać je jawnie** — wtedy w kartotece stoi to, co pacjent faktycznie
zaakceptował, a nie nasze domniemanie.

**Uwaga na komplet.** Jeśli przyślecie choć jedną z trzech zgód
(`zgoda_email`, `zgoda_sms`, `zgoda_profilowanie`), przyjmujemy, że znacie
wszystkie trzy — brak pozostałych czytamy wtedy jako brak zgody, nie jako
domniemanie. Albo wysyłajcie wszystkie trzy, albo żadnej.

**Zgoda marketingowa nie otwiera wysyłki.** Zapisuje treść oświadczenia, pod
którym pacjent się podpisał. Wysyłkę bramkują `zgoda_email` i `zgoda_sms` —
to osobne decyzje i od 1.61.0 nie są ze sobą sprzężone.

**Status ustawiamy tylko przy zakładaniu kontaktu.** Przy kolejnych rezerwacjach
zostaje ten, który jest — inaczej automat cofałby poprawkę zrobioną ręcznie
przez recepcję.

## Tryb próbny

Dodajcie `"test": true`. Żądanie **niczego nie zapisze**, a odpowiedź powie, co
zrozumieliśmy i czego brakuje:

```bash
curl -X POST https://crm.przyklad.pl/api/webhooks/booking \
  -H "X-Webhook-Secret: SEKRET" \
  -H "Content-Type: application/json" \
  -d '{"test":true,"imie":"Anna","nazwisko":"Kowalska","telefon":"600100200","idx_osoby":123456,"idx_terminu":998877,"usluga":"Konsultacja laryngologiczna","lekarz":"dr Jan Kowalski","specjalizacja":"Otolaryngolog","data_wizyty":"2026-09-16","godzina_wizyty":"16:40","cena":"300,00 zł"}'
```

```json
{
  "ok": true,
  "tryb": "testowy — nic nie zapisano",
  "braki": [],
  "zrozumiano": {
    "pacjent": "Anna Kowalska",
    "telefon": "600100200",
    "idOsoby": 123456,
    "idTerminu": 998877,
    "usluga": "Konsultacja laryngologiczna",
    "termin": "2026-09-16T14:40:00.000Z",
    "cena": 300,
    "tagi": ["kardiologia", "VIP"],
    "kluczPowtorzen": "booking-998877"
  }
}
```

Prefiks klucza powtórek to identyfikator podłączonego dostawcy systemu
rezerwacji (`<id>-998877`), a bez dostawcy `booking-998877` — dzięki temu
wizyta z webhooka i ta sama wizyta pobrana z API systemu scalają się w jedną.

Gdy czegoś brakuje, `braki` wymienia to po polsku, a odpowiedź ma kod **400**.

## Odpowiedzi

| kod | znaczenie |
|---|---|
| 200 | przyjęte; `powiazanieKartoteki` mówi, czy przyszło `idx_osoby` |
| 400 | brakuje wymaganego pola — treść wymienia które i jakie pola przyszły |
| 401 | zły albo brakujący `X-Webhook-Secret` |

Przy powtórzeniu tego samego `idx_terminu` odpowiedź ma `"duplicate": true`
i **nie** tworzy drugiej wizyty. Możecie ponawiać bez obaw.

## Czego NIE trzeba robić

- **Nie trzeba podpisywać** żądań — wystarczy sekret w nagłówku.
- **Nie trzeba pilnować kolejności** — powtórki i spóźnione żądania są bezpieczne.
- **Nie trzeba zakładać kontaktu osobno** — jedno żądanie robi kartotekę,
  wizytę i zdarzenie dla automatyzacji.
- **Nie trzeba wysyłać czterech zgód obowiązkowych** — przyjmiemy je z trybu
  rezerwacji. Ale zgodę marketingową wysyłajcie zawsze, w obie strony:
  tylko wy wiecie, czy pacjent odmówił, czy nikt go nie pytał.
