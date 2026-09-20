/**
 * Booking system (the clinic's practice management system) — neutral texts
 * that replaced the ones naming one specific system.
 */
export const booking: Record<string, string> = {
  "Zasilane rezerwacjami online ze strony placówki **oraz** synchronizacją z systemem rezerwacji, więc obejmuje też wizyty umówione telefonicznie.":
    "Fed by online bookings from the clinic's website **and** by the booking system sync, so it also covers visits booked by phone.",
  "Wyzwala się, gdy system rezerwacji oznaczy wizytę jako zakończoną. Sam fakt, że termin minął, nie wystarcza — wizyta sprzed miesięcy potrafi nadal figurować jako umówiona. To jest właściwy moment na ankietę po konsultacji.":
    "Fires when the booking system marks the visit as completed. The date having passed is not enough — a visit from months ago can still show as booked. This is the right moment for a post-visit survey.",
  "Wizyta nadal figuruje jako umówiona, a od jej godziny minęły ponad 2 godziny — pacjent nie dotarł i nie odwołał. Odwołana wizyta ma własny wyzwalacz, więc tu trafiają wyłącznie nieobecności. Dobre miejsce na propozycję nowego terminu.":
    "The visit still shows as booked and more than 2 hours have passed since its start — the patient neither came nor cancelled. A cancelled visit has its own trigger, so only no-shows land here. A good place to offer a new date.",
  "Termin odwołany w systemie rezerwacji": "The booking was cancelled in the booking system",
  "Wyzwala się, gdy system rezerwacji oznaczy wizytę jako odwołaną albo gdy wizyta, którą mieliśmy zapisaną, przestaje wracać z jego API (część systemów po prostu kasuje termin). Uwaga: przełożenie wygląda wtedy tak samo (stary termin znika, pojawia się nowy), więc scenariusz pisz tak, żeby był sensowny w obu przypadkach.":
    "Fires when the booking system marks the visit as cancelled, or when a visit we had stops coming back from its API (some systems simply delete the booking). Note: a reschedule then looks the same (the old date disappears, a new one appears), so write the scenario so that it makes sense in both cases.",
  "ID w systemie rezerwacji": "Booking system ID",
  ", nie z systemu rezerwacji na żywo — zapytanie o każdego lekarza przy każdym otwarciu listy dawałoby liczbę chwilową i wolną. Bez podłączonego systemu do bazy trafiają tylko rezerwacje online (webhook), więc wizyty umówione telefonicznie się nie liczą.":
    ", not live from the booking system — a query per doctor on every opening of the list would give a momentary and slow number. Without a connected system only online bookings (webhook) reach the database, so visits booked by phone are not counted.",
  "Synchronizacja z systemem rezerwacji domyka ten licznik":
    "The booking system sync closes that gap",
  "— pod warunkiem, że lekarze mają wpisany identyfikator z tego systemu.":
    "— provided the doctors have their ID from that system filled in.",
  "Dopasowanie wizyty do lekarza idzie po nazwisku, bo webhook rezerwacji nie przysyła identyfikatora lekarza z systemu rezerwacji. To dopasowanie słabsze niż po ID i przy dwóch lekarzach o tym samym nazwisku może się pomylić.":
    "Visits are matched to doctors by name, because the booking webhook does not send the doctor's booking system ID. This is weaker than matching by ID and can go wrong for two doctors with the same last name.",
  "System rezerwacji — wstrzymanie wymiany": "Booking system — pause the exchange",
  " — system rezerwacji dostaje potwierdzenie, więc nie ponawia, a Ty decydujesz później, co z nimi zrobić.":
    " — the booking system gets a confirmation, so it does not retry, and you decide later what to do with them.",
  "Adresy dla systemu rezerwacji i innych systemów, które mają zakładać kontakty oraz zapisywać wizyty. Oba przyjmują JSON metodą POST i wymagają sekretu w nagłówku.":
    "Addresses for the booking system and other systems that should create contacts and record visits. Both accept JSON via POST and require the secret in a header.",
  "Stary przestanie działać natychmiast. Każdy system, który go używa — w tym system rezerwacji — zacznie dostawać odmowę, dopóki nie wpiszecie tam nowego. Rób to wtedy, gdy sekret wyciekł.":
    "The old one stops working immediately. Every system that uses it — including the booking system — will be refused until you enter the new one there. Do this when the secret has leaked.",
  "Nowy sekret gotowy — zaktualizuj go w systemach, które go używają.":
    "New secret ready — update it in the systems that use it.",
  "Zaakceptowane przy rezerwacji w systemie rezerwacji.":
    "Accepted when booking in the booking system.",
  "Komunikacja marketingowa (system rezerwacji)": "Marketing communication (booking system)",
  "Treść zgody podpisanej przez pacjenta w systemie rezerwacji. Wysyłkę bramkują zgody na wiadomości e-mail i SMS.":
    "The consent text the patient signed in the booking system. Sending is gated by the e-mail and SMS consents.",
  "Wizyty zapisuje system rezerwacji placówki — tu nie ma gdzie zapisać terminu.":
    "Visits are booked in the clinic's booking system — there is nowhere to record one here.",
  "Grafiki lekarzy zsynchronizowane ({month}).": "Doctors' schedules synchronised ({month}).",
  "Kontakt nie ma powiązania z systemem rezerwacji.":
    "The contact is not linked to the booking system.",
  "Nie podłączono systemu rezerwacji — synchronizacja pacjentów, statusów wizyt i grafików lekarzy nie chodzi i nic nie jest odpytywane. Jak podłączyć system: src/lib/booking-system/providers/README.md.":
    "No booking system connected — patient, visit status and doctor schedule sync is idle and nothing is queried. How to connect one: src/lib/booking-system/providers/README.md.",
  "Nie podłączono systemu rezerwacji.": "No booking system connected.",
  "Powiązywanie pacjentów z systemem rezerwacji.": "Linking patients with the booking system.",
  "Rezerwacja w systemie rezerwacji placówki. Zgody wynikają z warunków rezerwacji — rejestracja nie przysłała pól ze zgodami.":
    "Booked in the clinic's booking system. Consents follow from the booking terms — the registration sent no consent fields.",
  "Status w systemie rezerwacji": "Booking system status",
  "Synchronizacja pacjentów z systemu rezerwacji.": "Patient sync from the booking system.",
  "Synchronizacja z systemem rezerwacji WSTRZYMANA z panelu.":
    "Booking system sync PAUSED from the panel.",
  "Synchronizacja z systemem rezerwacji wznowiona z panelu.":
    "Booking system sync resumed from the panel.",
  "System rezerwacji": "Booking system",
  "System rezerwacji nie zna pacjenta {patientId}.":
    "The booking system does not know patient {patientId}.",
  "System rezerwacji nie zna tego pacjenta.": "The booking system does not know this patient.",
  niepodłączony: "not connected",
  "synchronizuje…": "syncing…",
  "„Brak wizyty pacjenta” to wizyta, która nadal figuruje jako umówiona, a jej termin minął ponad 2 godziny temu — pacjent się nie zjawił. Odwołana wizyta nie wpada do żadnego z tych stanów.":
    "“Patient no-show” is a visit that still shows as booked more than 2 hours after its start — the patient did not come. A cancelled visit falls into none of these states.",
  Skonfigurowane: "Configured",
  Niekompletne: "Incomplete",
  "Nie skonfigurowano": "Not configured",
  "Wymaga uwagi": "Needs attention",
};
