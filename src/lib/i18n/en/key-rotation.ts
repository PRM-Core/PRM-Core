/** Rotating the master key and the incoming webhook secret. */
export const keyRotation: Record<string, string> = {
  "Nowy sekret gotowy — stary działa jeszcze 24 godziny. Zaktualizuj go w systemach, które go używają.":
    "New secret ready — the old one works for 24 more hours. Update it in the systems that use it.",
  "Odbiorca zapisany innym kluczem — podaj adres ponownie.":
    "The destination was saved with another key — enter its address again.",
  "Planowa wymiana (stary 24 h)": "Planned rotation (old one for 24 h)",
  "Planowa wymiana: stary sekret działa jeszcze 24 godziny, żeby zdążyć wpisać nowy w systemie rezerwacji i w źródłach leadów. Wyciek: stary przestaje działać od razu — każdy system, który go używa, dostaje odmowę, dopóki nie wpiszecie nowego.":
    "Planned rotation: the old secret keeps working for 24 hours, to give you time to enter the new one in the booking system and the lead sources. Leak: the old one stops at once — every system that uses it is refused until you enter the new one.",
  "Webhook przyjęty ze starym sekretem — zaktualizuj nadawcę przed {until}, potem stary sekret przestanie działać.":
    "Webhook accepted with the old secret — update the sender before {until}; after that the old secret stops working.",
  "Wyciek — unieważnij od razu": "Leak — revoke at once",
};
