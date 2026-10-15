/** PRM Engine — when automation messages may go out: the window, the limits. */
export const engineSendWindow: Record<string, string> = {
  "Dzienny limit wiadomości automatyzacji wyczerpany — wiadomość wyjdzie {at}.":
    "The daily limit for automation messages is spent — the message goes out {at}.",
  "Dziś wysłano: {n}.": "Sent today: {n}.",
  "Godziny wysyłki automatyzacji": "Automation sending hours",
  "Godziny wysyłki automatyzacji ustawia administrator.":
    "An administrator sets the automation sending hours.",
  "Godziny wysyłki zapisane.": "Sending hours saved.",
  "Limit wiadomości automatyzacji na godzinę — wiadomość wyjdzie {at}.":
    "The hourly limit for automation messages — the message goes out {at}.",
  "Limity liczą wiadomości wszystkich automatyzacji razem, e-mail i SMS; tempo: {pace}. Kampanie mają własne limity w Wysyłkach.":
    "The limits count the messages of all automations together, e-mail and SMS; pace: {pace}. Campaigns have their own limits under Sends.",
  "Na dobę": "Per day",
  "Na godzinę": "Per hour",
  "Nie udało się zapisać godzin wysyłki": "Could not save the sending hours",
  "Okno nie jest ustawione — wiadomości automatyzacji wychodzą o każdej porze, także w nocy.":
    "No window is set — automation messages go out at any hour, at night too.",
  "Okno wysyłki nie jest ustawione — wiadomości wychodzą o każdej porze. Ustaw je w panelu PRM Engine.":
    "No sending window is set — messages go out at any hour. Set one in the PRM Engine panel.",
  "Poza godzinami wysyłki ({hours}) — wiadomość wyjdzie {at}.":
    "Outside the sending hours ({hours}) — the message goes out {at}.",
  "Tylko w godzinach": "Only within hours",
  "Wiadomości automatyzacji wychodzą {hours}. Krok poza tymi godzinami czeka do otwarcia okna; automatyzacja może to wyłączyć dla siebie w edytorze.":
    "Automation messages go out {hours}. A step outside these hours waits for the window to open; an automation can opt out in the editor.",
  "Wiadomości tej automatyzacji wychodzą o każdej porze — także w nocy. Limity na godzinę i dobę obowiązują.":
    "This automation's messages go out at any hour — at night too. The hourly and daily limits apply.",
  "Wiadomości wychodzą {hours}; krok poza tymi godzinami czeka do otwarcia okna.":
    "Messages go out {hours}; a step outside these hours waits for the window to open.",
  "bez limitu": "no limit",
  "bez ograniczenia tempa": "no pace limit",
  do: "to",
  "o każdej porze": "at any hour",
  od: "from",
  "w godzinach wysyłki": "within sending hours",
};
