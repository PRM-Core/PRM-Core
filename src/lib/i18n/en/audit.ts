/** The audit trail of administrative actions. */
export const audit: Record<string, string> = {
  "Dziennik działań administracyjnych": "Administrative actions log",
  "Dziennik działań administracyjnych widzi administrator.":
    "Only an administrator sees the administrative actions log.",
  "Kto i kiedy dodał lub usunął konto, zresetował hasło, wyeksportował kontakty, otworzył dokument pacjenta, zmienił klucze integracji albo webhook. Wpisy są przechowywane {days} dni (PRM_AUDIT_RETENTION_DAYS), potem usuwane.":
    "Who added or removed an account, reset a password, exported contacts, opened a patient's document, or changed integration keys or a webhook — and when. Entries are kept for {days} days (PRM_AUDIT_RETENTION_DAYS), then removed.",
  "Pokazano 200 najnowszych": "Showing the 200 most recent",
  "dodanie dokumentu pacjenta": "patient document added",
  "dodanie konta": "account added",
  "eksport kontaktów": "contacts exported",
  "import kluczy z .env": "keys imported from .env",
  "nowy token MCP": "new MCP token",
  "pobranie dokumentu pacjenta": "patient document downloaded",
  "reset hasła": "password reset",
  system: "system",
  "usunięcie dokumentu pacjenta": "patient document removed",
  "usunięcie klucza integracji": "integration key removed",
  "usunięcie konta": "account deleted",
  "usunięcie odbiorcy webhooka": "webhook destination deleted",
  "wymiana sekretu webhooka": "webhook secret rotated",
  "zapis kluczy integracji": "integration keys saved",
  "zapis odbiorcy webhooka": "webhook destination saved",
  "zmiana numeru do kodów": "code phone number changed",
};
