/** App frame, sign-in, password reset, dashboard. */
export const shell: Record<string, string> = {
  // Account menu
  "Menu konta": "Account menu",
  " Zmień nazwę": " Change name",
  "Zmień numer do weryfikacji": "Change verification number",
  "Dodaj numer do weryfikacji": "Add verification number",
  " Zmień hasło": " Change password",
  " Wyloguj się": " Sign out",
  "Numer zapisany. Kody weryfikacyjne będą przychodzić na niego.":
    "Number saved. Verification codes will be sent to it.",
  "Numer usunięty — weryfikacja SMS przestanie obowiązywać dla tego konta.":
    "Number removed — SMS verification no longer applies to this account.",
  "Nie udało się zapisać numeru": "Could not save the number",
  "Spróbuj ponownie.": "Please try again.",
  "Numer do weryfikacji": "Verification number",
  "Na ten numer przychodzi kod przy logowaniu z nowego urządzenia. Bez numeru konto jest chronione wyłącznie hasłem.":
    "A code is sent to this number when you sign in from a new device. Without a number the account is protected by the password only.",
  "Numer telefonu": "Phone number",
  "Potwierdź hasłem": "Confirm with your password",
  "Zmiana numeru zmienia drugi składnik logowania, dlatego wymaga hasła. Wszystkie urządzenia zapamiętane do tej pory będą musiały przejść weryfikację ponownie.":
    "Changing the number changes your second sign-in factor, so it requires your password. All devices remembered so far will have to be verified again.",
  Anuluj: "Cancel",
  Zapisz: "Save",
  "Nazwa konta została zaktualizowana": "Account name updated",
  "Nie udało się zmienić nazwy": "Could not change the name",
  "Zmień nazwę": "Change name",
  "Zaktualizuj imię i nazwisko wyświetlane w koncie.":
    "Update the first and last name shown on your account.",
  Imię: "First name",
  Nazwisko: "Last name",
  "Hasło zostało zmienione": "Password changed",
  "Nie udało się zmienić hasła": "Could not change the password",
  "Zmień hasło": "Change password",
  "Podaj aktualne hasło oraz nowe hasło (min. 8 znaków).":
    "Enter your current password and a new password (at least 8 characters).",
  "Aktualne hasło": "Current password",
  "Ukryj hasła": "Hide passwords",
  "Pokaż hasła": "Show passwords",
  "Nowe hasło": "New password",
  "Powtórz nowe hasło": "Repeat new password",
  "Hasła nie są identyczne": "Passwords do not match",
  "Hasło musi mieć min. 8 znaków": "Password must be at least 8 characters",

  // Sidebar
  Dashboard: "Dashboard",
  Kontakty: "Contacts",
  "Kontakty telefoniczne": "Phone contacts",
  Segmenty: "Segments",
  Lekarze: "Doctors",
  Lejki: "Funnels",
  Automation: "Automation",
  Newsletter: "Newsletter",
  Email: "Email",
  "Pop-Up": "Pop-up",
  "Design Studio": "Design Studio",
  Wysyłki: "Sends",
  Reports: "Reports",
  "Plany leczenia": "Treatment plans",
  "Omnichannel Inbox": "Omnichannel Inbox",
  "AI Copilot": "AI Copilot",
  "Consent & RODO": "Consent & GDPR",
  Integrations: "Integrations",
  Media: "Media",
  Feedy: "Feeds",
  Settings: "Settings",
  "Healthcare CRM": "Healthcare CRM",
  "Wyloguj się": "Sign out",

  // Auth layout
  "Dotrzyj do każdego pacjenta z właściwą wiadomością, we właściwym momencie":
    "Reach every patient with the right message at the right moment",
  "Automatyzuj komunikację z pacjentami — przypomnienia, follow-upy i kampanie edukacyjne — w jednym, w pełni otwartym systemie.":
    "Automate patient communication — reminders, follow-ups and educational campaigns — in one fully open system.",
  " PRM Core": " PRM Core",
  "PRM Core": "PRM Core",
  PRM: "PRM",
  Core: "Core",

  // Top bar
  "Szukaj kontaktów — imię, e-mail, telefon, PRM ID…":
    "Search contacts — name, email, phone, PRM ID…",
  " Nowy kontakt": " New contact",
  "Tryb podglądu": "Preview mode",
  Pomoc: "Help",
  "Gdzie czego szukać": "Where to find what",
  "Nie ma osobnej dokumentacji — każdy ekran opisuje, co robi, w nagłówku sekcji.":
    "There is no separate manual — every screen explains what it does in its section header.",
  "Integracje — klucze, webhooki, kanały przychodzące":
    "Integrations — keys, webhooks, inbound channels",
  "Ustawienia — użytkownicy, pola kontaktu, PRM_Agent":
    "Settings — users, contact fields, PRM_Agent",
  "Zgody — treści zgód i statystyki": "Consent — consent texts and statistics",
  "AI Copilot — pytania o dane w bazie": "AI Copilot — questions about your data",
  "{v0} nadzorcy — kliknij, aby otworzyć": "Supervisor: {v0} — click to open",
  "Brak spostrzeżeń wymagających uwagi": "No insights need your attention",
  spostrzeżenie: "insight",
  spostrzeżeń: "insights",

  // Root: 404 and error pages
  "Strona nie znaleziona": "Page not found",
  "Nie znaleźliśmy tej strony. Wróć do panelu PRM Core.":
    "We could not find this page. Go back to the PRM Core panel.",
  "Wróć do Dashboardu": "Back to the dashboard",
  "Coś poszło nie tak": "Something went wrong",
  "Spróbuj ponownie lub wróć na stronę główną.": "Try again or go back to the home page.",
  "Spróbuj ponownie": "Try again",
  "Strona główna": "Home page",
  "PRM Core — Healthcare Patient Relationship Management":
    "PRM Core — Healthcare Patient Relationship Management",

  // Sign-in
  "Logowanie — PRM Core": "Sign in — PRM Core",
  "Jeśli konto istnieje, odnośnik jest już w drodze.":
    "If the account exists, the link is on its way.",
  "Sprawdź skrzynkę. Odnośnik działa przez godzinę i tylko raz.":
    "Check your inbox. The link works for one hour and only once.",
  "Nie udało się wysłać odnośnika. Spróbuj ponownie za chwilę.":
    "Could not send the link. Try again in a moment.",
  "Zalogowano bez weryfikacji SMS": "Signed in without SMS verification",
  "Bramka SMS nie odpowiedziała, więc kod nie został wysłany. Administratorzy zostali powiadomieni.":
    "The SMS gateway did not respond, so no code was sent. Administrators have been notified.",
  "Zalogowano pomyślnie": "Signed in",
  "Witaj ponownie, {firstName}": "Welcome back, {firstName}",
  "Nie udało się zalogować": "Could not sign in",
  "Weryfikacja nieudana": "Verification failed",
  "Nie wysłano kodu": "Code not sent",
  "Wysłano nowy kod.": "A new code has been sent.",
  "Potwierdź logowanie": "Confirm sign-in",
  "Przepisz sześciocyfrowy kod z aplikacji uwierzytelniającej. Możesz też użyć kodu zapasowego.":
    "Enter the six-digit code from your authenticator app. You can also use a backup code.",
  "Wysłaliśmy sześciocyfrowy kod e-mailem na adres {maskedPhone}.":
    "We emailed a six-digit code to {maskedPhone}.",
  "Wysłaliśmy sześciocyfrowy kod SMS-em na numer {maskedPhone}.":
    "We sent a six-digit code by SMS to {maskedPhone}.",
  "Kod weryfikacyjny": "Verification code",
  "123456 lub ABCDE-FGHIJ": "123456 or ABCDE-FGHIJ",
  "Kod zmienia się co 30 sekund. Nikomu go nie podawaj — pracownicy przychodni nigdy o niego nie proszą.":
    "The code changes every 30 seconds. Never share it — clinic staff will never ask for it.",
  "Kod jest ważny 5 minut. Nikomu go nie podawaj — pracownicy przychodni nigdy o niego nie proszą.":
    "The code is valid for 5 minutes. Never share it — clinic staff will never ask for it.",
  Potwierdź: "Confirm",
  Wróć: "Back",
  "Nie masz telefonu? Użyj kodu zapasowego.": "No phone with you? Use a backup code.",
  "Wyślij kod ponownie": "Resend code",
  "Zaloguj się": "Sign in",
  "Wprowadź dane, aby zarządzać komunikacją z pacjentami.":
    "Enter your details to manage patient communication.",
  "Adres e-mail": "Email address",
  Hasło: "Password",
  "Nie pamiętasz hasła?": "Forgot your password?",
  "Ukryj hasło": "Hide password",
  "Pokaż hasło": "Show password",
  "Zapamiętaj mnie": "Remember me",
  "Nie masz jeszcze konta?": "Don't have an account yet?",
  "Zarejestruj się": "Sign up",
  "Konto zakłada administrator placówki.": "Accounts are created by the clinic administrator.",
  "Podaj adres konta. Wyślemy odnośnik do ustawienia nowego hasła — działa przez godzinę i tylko raz.":
    "Enter your account email. We will send a link to set a new password — it works for one hour and only once.",
  " Wyślij odnośnik": " Send link",

  // Registration
  "Rejestracja — PRM Core": "Sign up — PRM Core",
  "Witaj, {firstName}! Jesteś teraz zalogowany.": "Welcome, {firstName}! You are now signed in.",
  "Nie udało się utworzyć konta": "Could not create the account",
  "Załóż konto": "Create an account",
  "Utwórz darmowe konto i zacznij automatyzować komunikację z pacjentami.":
    "Create a free account and start automating patient communication.",
  "Nazwa placówki": "Clinic name",
  "Przychodnia Kardio Sp. z o.o.": "Example Cardiology Clinic Ltd.",
  "Powtórz hasło": "Repeat password",
  "Akceptuję regulamin oraz politykę prywatności":
    "I accept the terms of service and the privacy policy",
  "Utwórz konto": "Create account",
  "Masz już konto?": "Already have an account?",

  // Password reset
  "Nowe hasło — PRM Core": "New password — PRM Core",
  "Hasła się różnią.": "The passwords differ.",
  "Nie udało się ustawić hasła.": "Could not set the password.",
  "Hasło ustawione.": "Password set.",
  "Zaloguj się nowym hasłem. Pozostałe sesje zostały zamknięte.":
    "Sign in with your new password. Your other sessions have been closed.",
  "Ustaw nowe hasło": "Set a new password",
  "Odnośnik z wiadomości działa przez godzinę i tylko raz.":
    "The link in the email works for one hour and only once.",
  " Sprawdzam odnośnik…": " Checking the link…",
  "Odnośnik działa przez godzinę i tylko raz. Poproś o nowy na ekranie logowania.":
    "The link works for one hour and only once. Request a new one on the sign-in screen.",
  "Wróć do logowania": "Back to sign-in",
  "Konto ": "Account ",
  "co najmniej 8 znaków": "at least 8 characters",
  " Ustaw hasło": " Set password",
  "Po zmianie wszystkie zalogowane sesje tego konta zostaną zamknięte — także na innych urządzeniach.":
    "After the change, all signed-in sessions of this account will be closed — on other devices too.",

  // Dashboard
  "Dashboard — PRM Core": "Dashboard — PRM Core",
  "Zaplanuj kampanię": "Schedule a campaign",
  "Nowa treść e-mail": "New email content",
  "Zarządzaj segmentami": "Manage segments",
  "Raporty wysyłek": "Send reports",
  "Witaj z powrotem. Oto co dzieje się dziś w PRM Core.":
    "Welcome back. Here is what is happening in PRM Core today.",
  "% vs poprzedni okres": "% vs previous period",
  "pierwsze w tym okresie": "first in this period",
  "brak danych porównawczych": "no comparison data",
  "Szybkie akcje": "Quick actions",
  "Ostatnie zdarzenia": "Recent events",
  "Zobacz dziennik": "View log",
  "Nic się jeszcze nie wydarzyło. Zdarzenia pojawią się tu, gdy silnik wykona krok albo pacjent napisze.":
    "Nothing has happened yet. Events appear here when the engine runs a step or a patient writes.",
  "Wysyłki automatyzacji": "Automation sends",
  "Ostatnie ": "Last ",
  " dni": " days",
  "Żadna automatyzacja nie wysłała jeszcze e-maila w tym okresie.":
    "No automation has sent an email in this period yet.",
  "Otwarcia ": "Opens ",
  "Kliknięcia ": "Clicks ",
  "Ostatnie 7 dni": "Last 7 days",
  "Ostatnie 14 dni": "Last 14 days",
  "Ostatnie 30 dni": "Last 30 days",
  "Ostatnie 90 dni": "Last 90 days",
  "Własny zakres": "Custom range",
  "Nie udało się pobrać danych.": "Could not load the data.",
  "Aktywność pacjentów": "Patient activity",
  "Nowe kontakty w rozbiciu na status i kontakty, z którymi coś się działo. Status to stan bieżący kontaktu.":
    "New contacts by status, and contacts with any activity. Status is the contact's current status.",
  Zakres: "Range",
  "Wszystkie kontakty": "All contacts",
  "Wczytywanie statusów…": "Loading statuses…",
  "Tydzień do tygodnia": "Week over week",
  "w całej bazie": "across the whole database",
  Wczytywanie: "Loading",
  " wobec": " vs",
  "Co porównywać": "What to compare",
  "Ten tydzień": "This week",
  "Tydzień wcześniej": "Previous week",
  Zmiana: "Change",
  " dzień po dniu wobec tego samego dnia tydzień wcześniej":
    " day by day vs the same day a week earlier",
  Dzień: "Day",
  dzień: "day",
  " · nowych kontaktów:": " · new contacts:",
  " · aktywnych osób: ": " · active people: ",
  "Nowe kontakty": "New contacts",
  Aktywni: "Active",
  // Language switch
  Język: "Language",
  "Nie udało się zmienić języka.": "Could not change the language.",
  "Nie zalogowano": "Not signed in",
};
