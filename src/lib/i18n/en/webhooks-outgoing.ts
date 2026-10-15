/** Outgoing webhooks — destinations, the step, delivery. */
export const webhooksOutgoing: Record<string, string> = {
  Adres: "Address",
  "Adres nie może zawierać loginu ani hasła — do tego służy sekret podpisu.":
    "The address must not contain a login or password — the signing secret is for that.",
  "Adres poza siecią placówki musi zaczynać się od https:// — dane pacjenta nie mogą iść otwartym tekstem.":
    "An address outside the clinic's network must start with https:// — patient data must not travel in the clear.",
  "Brak odbiorców — administrator dodaje ich w Automatyzacje → PRM Engine → Webhooki wychodzące.":
    "No destinations — an administrator adds them in Automations → PRM Engine → Outgoing webhooks.",
  "Brak odbiorców.": "No destinations.",
  "Dodaj odbiorcę": "Add destination",
  "Dokąd krok „Wyślij do webhooka” może przekazać pacjenta — n8n, Make, Zapier albo własny system. Zawsze idzie numer PRM, pozostałe pola tylko zaznaczone tutaj; PESEL i pola własne nigdy. Odbiorca przetwarza dane pacjentów w imieniu placówki — potrzebna jest umowa powierzenia.":
    "Where the “Send to a webhook” step may pass a patient — n8n, Make, Zapier or your own system. The PRM number always goes, other fields only when ticked here; a PESEL and custom fields never. The receiver processes patient data on the clinic's behalf — a data processing agreement is needed.",
  "Krok pominięty — nie wybrano odbiorcy webhooka.":
    "Step skipped — no webhook destination chosen.",
  "Nazwa, np. n8n — rejestracja": "Name, e.g. n8n — front desk",
  "Nie ma takiego odbiorcy.": "No such destination.",
  "Nie wybrano odbiorcy webhooka — krok zostanie pominięty.":
    "No webhook destination chosen — the step will be skipped.",
  "Nowy odbiorca": "New destination",
  "Nowy sekret": "New secret",
  Odbiorca: "Destination",
  "Odbiorca sprawdza nagłówek X-PRM-Signature: HMAC-SHA256 z „X-PRM-Timestamp.treść” tym sekretem — opis w docs/WEBHOOK-OUTGOING.md.":
    "The receiver checks the X-PRM-Signature header: HMAC-SHA256 of “X-PRM-Timestamp.body” with this secret — see docs/WEBHOOK-OUTGOING.md.",
  "Odbiorca webhooka nie istnieje — krok zakończy się błędem.":
    "The webhook destination does not exist — the step will fail.",
  "Odbiorca webhooka nie istnieje — wybierz go ponownie w kroku.":
    "The webhook destination does not exist — choose it again in the step.",
  "Odbiorców i to, jakie pola mogą do nich wyjść, ustawia administrator w PRM Engine → Webhooki wychodzące — zawsze idzie numer PRM, reszta tylko za jego zgodą; PESEL i pola własne nigdy. Zapytanie jest podpisane (X-PRM-Signature). Gdy odbiorca nie odpowie albo odrzuci zapytanie, przebieg zatrzymuje się z powodem w dzienniku.":
    "Destinations, and which fields may go to them, are set by an administrator in PRM Engine → Outgoing webhooks — the PRM number always goes, the rest only with their approval; a PESEL and custom fields never. The request is signed (X-PRM-Signature). When the destination does not answer or refuses, the run stops with the reason in the log.",
  "Odbiorców webhooków ustawia administrator.": "An administrator sets up webhook destinations.",
  "Podaj adres odbiorcy.": "Enter the destination's address.",
  "Podaj nazwę odbiorcy.": "Enter the destination's name.",
  "Pola: numer PRM{fields}.": "Fields: PRM number{fields}.",
  "Przekazuje pacjenta do n8n, Make, Zapiera albo własnego systemu":
    "Passes the patient to n8n, Make, Zapier or your own system",
  "Sekret podpisu dla „{name}” — skopiuj go teraz, nie zostanie pokazany ponownie:":
    "Signing secret for “{name}” — copy it now, it will not be shown again:",
  "Sekret zapisany": "Secret saved",
  "To nie jest poprawny adres http(s).": "This is not a valid http(s) address.",
  "Wczytywanie odbiorców…": "Loading destinations…",
  "Webhooki wychodzące": "Outgoing webhooks",
  "Webhooki wychodzące wymagają klucza PRM_SECRETS_KEY w .env — adres i sekret są przechowywane zaszyfrowane.":
    "Outgoing webhooks need PRM_SECRETS_KEY in .env — the address and the secret are stored encrypted.",
  "Wysłano do „{name}” ({host}): numer PRM{fields}.":
    "Sent to “{name}” ({host}): PRM number{fields}.",
  "Wysłałby do „{name}” ({host}): numer PRM{fields}.":
    "Would send to “{name}” ({host}): PRM number{fields}.",
  "Wyślij do webhooka": "Send to a webhook",
  "data dodania": "date added",
  "e-mail": "e-mail",
  imię: "first name",
  kampania: "campaign",
  nazwisko: "last name",
  "numer telefonu": "phone number",
  segmenty: "segments",
  tagi: "tags",
  "{host} nie odpowiedział: {detail}": "{host} did not answer: {detail}",
  "{host} odrzucił zapytanie ({status}).": "{host} refused the request ({status}).",
  "{host} przekierował zapytanie ({status}) — przekierowań nie wykonujemy.":
    "{host} redirected the request ({status}) — redirects are not followed.",
  źródło: "source",
  dodany: "added",
  zmieniony: "changed",
  "— nowy sekret": "— new secret",
  "{who}: odbiorca webhooka „{name}” ({host}) usunięty.":
    "{who}: webhook destination “{name}” ({host}) deleted.",
  "{who}: odbiorca webhooka „{name}” ({host}) {what}; pola: numer PRM{fields}.":
    "{who}: webhook destination “{name}” ({host}) {what}; fields: PRM number{fields}.",
};
