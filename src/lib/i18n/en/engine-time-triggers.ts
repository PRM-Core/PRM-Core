/** PRM Engine — time-based triggers: months since the last visit, birthday. */
export const engineTimeTriggers: Record<string, string> = {
  "Błąd wyzwalaczy czasowych: {v0}": "Time-based triggers failed: {v0}",
  "Data urodzenia pochodzi z numeru PESEL (z poprawną cyfrą kontrolną); pacjent bez PESEL nie dostanie tej wiadomości. Wyzwala się raz w roku, w sam dzień — urodzeni 29 lutego w zwykłym roku 28 lutego. Wiadomość i tak czeka na godziny wysyłki, a jej treść podlega zgodom marketingowym.":
    "The date of birth comes from the PESEL number (with a valid check digit); a patient without a PESEL does not get this message. It fires once a year, on the day itself — those born on 29 February on 28 February in a common year. The message still waits for the sending hours, and its content is subject to marketing consent.",
  "Kontrola, przypomnienie o profilaktyce, powrót po roku":
    "A check-up, a preventive-care reminder, coming back after a year",
  "Liczy od ostatniej odbytej wizyty (z tą usługą, jeśli ją podasz): jeden przebieg na wizytę, sprawdzane co kilka minut. Domyślnie tylko gdy pacjent nic nie ma umówionego i tylko pacjenci, którym termin minął w ostatnim tygodniu — włączenie automatyzacji nie wyśle do wszystkich, których ostatnia wizyta była lata temu. „Także pacjenci po terminie” obejmuje i ich, w tempie limitów wysyłki.":
    "Counts from the last visit that took place (with this service, if you name one): one journey per visit, checked every few minutes. By default only when the patient has nothing booked, and only patients whose date came within the last week — turning the automation on does not message everyone whose last visit was years ago. “Also overdue patients” includes them too, at the pace of the sending limits.",
  "Miesięcy od ostatniej wizyty": "Months since the last visit",
  "Minęło N miesięcy od ostatniej wizyty": "N months since the last visit",
  "Także pacjenci po terminie": "Also overdue patients",
  "Tylko gdy nic nie jest umówione": "Only when nothing is booked",
  "Urodziny pacjenta": "Patient's birthday",
  "W dniu urodzin, raz w roku": "On the birthday, once a year",
};
