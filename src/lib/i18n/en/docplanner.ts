/** Docplanner (ZnanyLekarz, Doctoralia) integration. */
export const docplanner: Record<string, string> = {
  "Integrations API serwisów Docplanner (ZnanyLekarz, Doctoralia): lekarze, terminy i rezerwacje z kalendarza placówki.":
    "Docplanner Integrations API (ZnanyLekarz, Doctoralia): doctors, slots and bookings from the clinic's calendar.",
  Serwis: "Service",
  "Domena serwisu w kraju placówki, bez https:// — np. www.znanylekarz.pl albo www.doctoralia.es. Puste = www.znanylekarz.pl.":
    "The service domain in the clinic's country, without https:// — e.g. www.znanylekarz.pl or www.doctoralia.es. Empty = www.znanylekarz.pl.",
  "Wydaje Docplanner po przyjęciu do programu integracji (Integrations API).":
    "Issued by Docplanner once you are accepted into the integration programme (Integrations API).",
  "Przekazywany razem z Client ID. Wklej dokładnie tak, jak go otrzymałeś.":
    "Provided together with the Client ID. Paste it exactly as you received it.",
  "Wpisz samą domenę serwisu, np. www.znanylekarz.pl — bez https:// i bez ścieżki.":
    "Enter only the service domain, e.g. www.znanylekarz.pl — without https:// and without a path.",
  "Niepoprawna domena serwisu.": "Invalid service domain.",
  "Połączono z {host} — Client ID i Client secret przyjęte.":
    "Connected to {host} — Client ID and Client secret accepted.",
  "{host} odpowiedział bez tokenu — sprawdź domenę serwisu.":
    "{host} answered without a token — check the service domain.",
  "{host} odrzucił Client ID albo Client secret (HTTP {status}).":
    "{host} rejected the Client ID or Client secret (HTTP {status}).",
  "{host} zwrócił HTTP {status} — sprawdź domenę serwisu.":
    "{host} returned HTTP {status} — check the service domain.",
  "Rezerwacje z ZnanyLekarz i Doctoralia: lekarze, wolne terminy i wizyty umówione przez pacjentów w serwisie.":
    "Bookings from ZnanyLekarz and Doctoralia: doctors, free slots and visits booked by patients on the service.",
  "Klucze zapisane — serwis {host}.": "Keys saved — service {host}.",
  "Brak kluczy integracji": "Integration keys missing",
  "Client ID i Client secret wydaje Docplanner. Wpisz je w sekcji":
    "The Client ID and Client secret are issued by Docplanner. Enter them in the",
  " — tam jest też „Sprawdź połączenie”.": " section — “Test connection” is there too.",
  "Synchronizacja wizyt: w przygotowaniu. Ruszy po otrzymaniu od Docplanner dostępu do API i środowiska testowego.":
    "Visit sync: in preparation. It starts once Docplanner grants API access and a test environment.",
};
