/** Automations on trial — their first messages wait for a person in PRM_Agent → Drafts. */
export const automationTrial: Record<string, string> = {
  "Automatyzacja „{name}” przeszła okres próbny ({n} zatwierdzonych wiadomości) — kolejne wysyła sama.":
    "The automation “{name}” has finished its trial ({n} approved messages) — it sends the next ones on its own.",
  "Automatyzacja „{name}” w okresie próbnym": "The automation “{name}” on trial",
  "Bez okresu próbnego — wiadomości tej automatyzacji wychodzą od razu.":
    "No trial — this automation's messages go out straight away.",
  "Krok pominięty — {who}": "Step skipped — {who}",
  "Odrzucone — automatyzacja pominie ten krok i pójdzie dalej.":
    "Rejected — the automation skips this step and moves on.",
  "Okres próbny zakończony: zatwierdzono {n} wiadomości, kolejne wychodzą same.":
    "Trial finished: {n} messages approved, the next ones go out on their own.",
  "Okres próbny: zatwierdzono {done} z {all} pierwszych wiadomości — kolejne czekają w PRM_Agent → Drafty.":
    "On trial: {done} of the first {all} messages approved — the next ones wait in PRM_Agent → Drafts.",
  "Ta wiadomość nie czeka już na decyzję.": "This message is no longer waiting for a decision.",
  "Wiadomość automatyzacji „{name}” odrzucona ({who}) — krok zostanie pominięty.":
    "Message of the automation “{name}” rejected ({who}) — the step will be skipped.",
  "Wiadomość automatyzacji „{name}” zatwierdzona ({who}) — wychodzi przy najbliższym przebiegu silnika.":
    "Message of the automation “{name}” approved ({who}) — it goes out on the engine's next pass.",
  "Wiadomość czeka na zatwierdzenie — automatyzacja w okresie próbnym ({done} z {all} zatwierdzonych).":
    "The message waits for approval — the automation is on trial ({done} of {all} approved).",
  "Wiadomość odrzucona przy zatwierdzaniu — krok pominięty, przebieg idzie dalej.":
    "Message rejected at approval — step skipped, the run moves on.",
  "Wysłane przez automatyzację — {who}": "Sent by the automation — {who}",
  "Zatwierdzaj pierwsze": "Approve the first",
  "Zatwierdzone — wiadomość wyjdzie przy najbliższym przebiegu silnika.":
    "Approved — the message goes out on the engine's next pass.",
  "Zatwierdzono {n} wiadomości.": "{n} messages approved.",
  "Zatwierdź wszystkie ({n})": "Approve all ({n})",
  "nie zatwierdzaj": "don't review",
  "{n} wiadomości czeka. Zatwierdzona wychodzi zwykłą drogą — ze sprawdzeniem zgód; odrzucona jest pomijana, a przebieg idzie dalej.":
    "{n} messages waiting. An approved one goes out the ordinary way — consent checked; a rejected one is skipped and the run moves on.",
};
