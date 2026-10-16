/** Demo mode — the banner, the demo outbox, the simulator and the nightly reset. */
export const demo: Record<string, string> = {
  "Demo: dane przywrócone do stanu początkowego ({n} kontaktów, {v} wizyt).":
    "Demo: data reset to the starting state ({n} contacts, {v} visits).",
  "Demo: krok symulatora nie powiódł się: {err}": "Demo: a simulator step failed: {err}",
  "Do:": "To:",
  "Od:": "From:",
  "Jeszcze nic — pierwsze wiadomości pojawią się, gdy automatyzacje zareagują na nowych pacjentów z symulatora.":
    "Nothing yet — the first messages appear once the automations react to new patients from the simulator.",
  "Nie udało się wczytać podglądu: {error}": "Could not load the preview: {error}",
  "Pacjenci są fikcyjni, a wiadomości nie wychodzą do nikogo. Dane wracają do stanu początkowego codziennie o {hour}:00.":
    "The patients are fictional and no message goes to anyone. The data returns to its starting state every day at {hour}:00.",
  "Podgląd wiadomości": "Message preview",
  "Reset demo odmówiony: w bazie są kontakty, które nie wyglądają na dane przykładowe ({n}). Tryb demo (PRM_DEMO) uruchamia się na pustej bazie.":
    "Demo reset refused: the database holds contacts that do not look like sample data ({n}). Demo mode (PRM_DEMO) is started on an empty database.",
  "Ta instalacja nie działa w trybie demonstracyjnym — wiadomości wychodzą naprawdę, a ich historia jest w Raportach wysyłek.":
    "This installation is not running in demo mode — messages really go out, and their history is in the send reports.",
  "To, co PRM Core wysłałby pacjentom i do systemów zewnętrznych. W wersji demonstracyjnej nic nie wychodzi: e-maile, SMS-y i webhooki trafiają tutaj. Ostatnie 100, odświeżane co 10 sekund.":
    "What PRM Core would have sent to patients and to outside systems. In the demo nothing goes out: e-mails, text messages and webhooks land here. The last 100, refreshed every 10 seconds.",
  Webhook: "Webhook",
  "Wersja demonstracyjna — dane symulowane": "Demo — simulated data",
  "Wiadomości, które system wysłałby, gdyby to nie była wersja demonstracyjna.":
    "Messages the system would have sent, were this not a demo.",
  "Wysłane w demo": "Sent in the demo",
  "Wysłane w demo — PRM Core": "Sent in the demo — PRM Core",
  "Zobacz, co system by wysłał": "See what the system would have sent",
};
