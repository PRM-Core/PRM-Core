/** PRM_Agent data boundary — mode, local model, pseudonymisation. */
export const agentBoundary: Record<string, string> = {
  "AI wyłączone (PRM_AI_MODE=off) — żadne zapytanie do modelu nie wychodzi.":
    "AI off (PRM_AI_MODE=off) — no request reaches any model.",
  "Adres {host} jest poza siecią placówki — wywołania są odrzucane. Użyj adresu lokalnego albo dopisz host do PRM_AI_EGRESS_ALLOW.":
    "{host} is outside the clinic's network — calls are refused. Use a local address or add the host to PRM_AI_EGRESS_ALLOW.",
  "Brak PRM_AI_LOCAL_URL albo PRM_AI_LOCAL_MODEL w .env — funkcje AI nie działają, reszta systemu tak.":
    "PRM_AI_LOCAL_URL or PRM_AI_LOCAL_MODEL is missing from .env — AI features are off, everything else works.",
  "Brak lokalnego modelu — ustaw PRM_AI_LOCAL_URL (adres serwera modelu) i PRM_AI_LOCAL_MODEL (nazwa modelu) w .env.":
    "No local model — set PRM_AI_LOCAL_URL (the model server's address) and PRM_AI_LOCAL_MODEL (the model name) in .env.",
  "Brak połączenia z {label}: {detail}": "No connection to {label}: {detail}",
  "E-mail: {v0}": "E-mail: {v0}",
  "Granica danych PRM_Agent": "PRM_Agent data boundary",
  "Identyfikator: {v0} (PRM ID {v1})": "Identifier: {v0} (PRM ID {v1})",
  "Kanały: e-mail {v0}, telefon {v1}": "Channels: e-mail {v0}, phone {v1}",
  "Model w sieci placówki (PRM_AI_MODE=local)":
    "Model inside the clinic's network (PRM_AI_MODE=local)",
  "Odmowa: {host} jest poza siecią placówki. W trybie local model musi działać lokalnie albo pod adresem z PRM_AI_EGRESS_ALLOW.":
    "Refused: {host} is outside the clinic's network. In local mode the model must run locally or at an address listed in PRM_AI_EGRESS_ALLOW.",
  "PRM_AI_LOCAL_URL wskazuje na {host} poza siecią placówki — wywołania są odrzucane":
    "PRM_AI_LOCAL_URL points at {host}, outside the clinic's network — calls are refused",
  "Serwer modelu: {host} ({klasa}), model: {model}. Dane pacjentów nie opuszczają sieci placówki; prompty i tak nie zawierają nazwisk, e-maili, telefonów ani numerów PESEL.":
    "Model server: {host} ({klasa}), model: {model}. Patient data stays inside the clinic's network; prompts carry no names, e-mails, phone numbers or national IDs anyway.",
  "Telefon: {v0}": "Phone: {v0}",
  jest: "present",
  "model lokalny: {host} ({klasa}); prompty bez nazwisk, adresów i numerów":
    "local model: {host} ({klasa}); prompts without names, addresses or numbers",
  "tryb local bez PRM_AI_LOCAL_URL / PRM_AI_LOCAL_MODEL — funkcje AI nie działają":
    "local mode without PRM_AI_LOCAL_URL / PRM_AI_LOCAL_MODEL — AI features are off",
  "{label} odrzucił zapytanie: {detail}": "{label} rejected the request: {detail}",
  "{label} zwrócił niepełną odpowiedź: {detail}": "{label} returned an incomplete answer: {detail}",
};
