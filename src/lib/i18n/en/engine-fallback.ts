/** PRM Engine — the e-mail-then-SMS (channel fallback) step. */
export const engineFallback: Record<string, string> = {
  "E-mail nie wyszedł — od razu SMS.": "The e-mail did not go — SMS at once.",
  "E-mail otwarty — SMS nie jest potrzebny.": "E-mail opened — no SMS needed.",
  "E-mail wysłany — jeśli nie zostanie otwarty do {at}, pójdzie SMS.":
    "E-mail sent — if it is not opened by {at}, an SMS goes.",
  "E-mail „{email}”, po {amount} {unit} bez otwarcia SMS „{sms}”":
    "E-mail “{email}”, SMS “{sms}” after {amount} {unit} unopened",
  "E-mail → SMS": "E-mail → SMS",
  "E-mail, a gdy nieotwarty — SMS": "E-mail, then SMS if unopened",
  "E-mail: {email} Jeśli nie zostanie otwarty w {amount} {unit} — SMS: {sms}":
    "E-mail: {email} If not opened within {amount} {unit} — SMS: {sms}",
  "Krok „E-mail, a gdy nieotwarty — SMS” potrzebuje obu szablonów.":
    "The “E-mail, then SMS if unopened” step needs both templates.",
  "Liczy się otwarcie albo kliknięcie właśnie tego e-maila. Gdy e-mail w ogóle nie wyjdzie (brak adresu, brak zgody, limit marketingu), SMS idzie od razu. Obie wiadomości przechodzą przez te same zgody, limity, okres próbny i godziny wysyłki co zwykłe kroki. Otwarcia bywają niewidoczne (blokowane obrazki), więc część osób dostanie SMS mimo przeczytania e-maila.":
    "An open or a click of this very e-mail counts. When the e-mail does not go at all (no address, no consent, the marketing cap), the SMS goes at once. Both messages go through the same consent, limits, trial and sending hours as ordinary steps. Opens can be invisible (images blocked), so some people get the SMS even though they read the e-mail.",
  "Nadawca SMS": "SMS sender",
  "SMS, jeśli brak otwarcia po": "SMS if not opened after",
  "Szablon SMS": "SMS template",
  "Szablon e-maila": "E-mail template",
  "Temat (opcjonalnie)": "Subject (optional)",
  "Wysyła e-mail; jeśli nie zostanie otwarty w ustalonym czasie, wysyła SMS":
    "Sends an e-mail; if it is not opened in the set time, sends an SMS",
};
