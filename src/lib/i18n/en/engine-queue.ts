/** PRM Engine — the queue view and the retry. */
export const engineQueue: Record<string, string> = {
  " (przerwany — ponowienie potwierdzone)": " (cut off — retry confirmed)",
  "Automatyzacja jest wyłączona — włącz ją, zanim ponowisz krok.":
    "The automation is off — switch it on before retrying the step.",
  "Co silnik ma przed sobą i co poszło nie tak — z powodem. Nieudany krok można ponowić: wraca do kolejki i przechodzi przez te same zgody, limity i godziny wysyłki.":
    "What the engine has ahead and what went wrong — with the reason. A failed step can be retried: it goes back to the queue and passes the same consent, limits and sending hours.",
  "Do zatwierdzenia": "Awaiting approval",
  "Kolejka kroków": "Step queue",
  "Krok przerwany mógł już wysłać wiadomość — potwierdź, że ponowienie jest bezpieczne.":
    "A cut-off step may already have sent its message — confirm the retry is safe.",
  "Krok wrócił do kolejki — silnik wykona go przy najbliższym takcie.":
    "The step is back in the queue — the engine runs it at its next tick.",
  Nieudane: "Failed",
  Odłożone: "Deferred",
  "Pacjent jest już w innym trwającym przebiegu tej automatyzacji.":
    "The patient is already in another live run of this automation.",
  "Pokazano {n} z {all}.": "Showing {n} of {all}.",
  "Ponowić można tylko krok nieudany albo przerwany.":
    "Only a failed or cut-off step can be retried.",
  "Ponowienie kroku „{step}” — {who}{stuck}.": "Step “{step}” retried — {who}{stuck}.",
  Ponów: "Retry",
  "Potwierdź — mogła już wyjść wiadomość": "Confirm — a message may already have gone",
  "Przebieg tego kroku już nie istnieje.": "The run of this step no longer exists.",
  Przerwane: "Cut off",
  "Tego kroku nie ma już w kolejce.": "This step is no longer in the queue.",
  "Tego kroku nie ma już w scenariuszu.": "This step is no longer in the workflow.",
  Zaplanowane: "Scheduled",
  "czeka na zatwierdzenie w PRM_Agent → Drafty": "awaiting approval in PRM_Agent → Drafts",
  "dzienny limit wiadomości": "the daily message limit",
  "limit wiadomości na godzinę": "the hourly message limit",
  "poza godzinami wysyłki": "outside the sending hours",
  "przerwany w trakcie — mógł zdążyć wysłać wiadomość, dlatego nie jest ponawiany sam":
    "cut off mid-step — it may have sent its message, so it is not retried on its own",
  "próby: {n}": "attempts: {n}",
  użytkownik: "a user",
};
