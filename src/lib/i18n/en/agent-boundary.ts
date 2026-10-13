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
  "Dostawca zewnętrzny (PRM_AI_MODE=hosted)": "Hosted provider (PRM_AI_MODE=hosted)",
  "E-mail: {v0}": "E-mail: {v0}",
  "Granica danych PRM_Agent": "PRM_Agent data boundary",
  "Identyfikator: {v0} (PRM ID {v1})": "Identifier: {v0} (PRM ID {v1})",
  "Kanały: e-mail {v0}, telefon {v1}": "Channels: e-mail {v0}, phone {v1}",
  "Model lokalny nie kosztuje nic za token, więc limit dotyczy tylko dostawców zewnętrznych. Zostaje na wypadek przełączenia trybu.":
    "A local model costs nothing per token, so the limit applies only to hosted providers. It stays in case the mode is switched.",
  "Model w sieci placówki (PRM_AI_MODE=local)":
    "Model inside the clinic's network (PRM_AI_MODE=local)",
  "Odmowa: {host} jest poza siecią placówki. W trybie local model musi działać lokalnie albo pod adresem z PRM_AI_EGRESS_ALLOW.":
    "Refused: {host} is outside the clinic's network. In local mode the model must run locally or at an address listed in PRM_AI_EGRESS_ALLOW.",
  "PRM_AI_LOCAL_URL wskazuje na {host} poza siecią placówki — wywołania są odrzucane":
    "PRM_AI_LOCAL_URL points at {host}, outside the clinic's network — calls are refused",
  "PRM_Agent jest wyłączony (PRM_AI_MODE=off)": "PRM_Agent is off (PRM_AI_MODE=off)",
  "PRM_Agent jest wyłączony (PRM_AI_MODE=off). Ustaw PRM_AI_MODE=local z modelem w sieci placówki albo PRM_AI_MODE=hosted, żeby włączyć funkcje AI.":
    "PRM_Agent is off (PRM_AI_MODE=off). Set PRM_AI_MODE=local with a model inside the clinic's network, or PRM_AI_MODE=hosted, to enable AI features.",
  "Prompty wychodzą do wybranego dostawcy. Przed wysłaniem system zamienia nazwiska, e-maile, telefony i numery PESEL na symbole zastępcze — model nie wie, o kim pisze. Jeśli dane mają w ogóle nie opuszczać serwera, przełącz na PRM_AI_MODE=local.":
    "Prompts go to the chosen provider. Before sending, the system replaces names, e-mails, phone numbers and national IDs with placeholders — the model does not know who it is writing about. If data must not leave the server at all, switch to PRM_AI_MODE=local.",
  "Serwer modelu: {host} ({klasa}), model: {model}. Dane pacjentów nie opuszczają sieci placówki; prompty i tak nie zawierają nazwisk, e-maili, telefonów ani numerów PESEL.":
    "Model server: {host} ({klasa}), model: {model}. Patient data stays inside the clinic's network; prompts carry no names, e-mails, phone numbers or national IDs anyway.",
  "Telefon: {v0}": "Phone: {v0}",
  jest: "present",
  "model lokalny: {host} ({klasa}); prompty bez nazwisk, adresów i numerów":
    "local model: {host} ({klasa}); prompts without names, addresses or numbers",
  "tryb hosted: prompty wychodzą do zewnętrznego dostawcy — bez nazwisk, e-maili, telefonów i PESEL":
    "hosted mode: prompts go to an external provider — without names, e-mails, phone numbers or national IDs",
  "tryb local bez PRM_AI_LOCAL_URL / PRM_AI_LOCAL_MODEL — funkcje AI nie działają":
    "local mode without PRM_AI_LOCAL_URL / PRM_AI_LOCAL_MODEL — AI features are off",
  "tryb local, a na serwerze leży klucz zewnętrznego dostawcy AI — usuń go, nic go nie używa":
    "local mode, yet a hosted AI provider key is on the server — remove it, nothing uses it",
  "{label} odrzucił zapytanie: {detail}": "{label} rejected the request: {detail}",
  "Żadne zapytanie do modelu nie wychodzi z serwera. Automatyzacje, segmenty i wysyłki działają bez zmian. Aby włączyć AI, ustaw w .env PRM_AI_MODE=local z modelem w sieci placówki (PRM_AI_LOCAL_URL, PRM_AI_LOCAL_MODEL) albo PRM_AI_MODE=hosted.":
    "No request to a model leaves the server. Automations, segments and sends work unchanged. To enable AI, set PRM_AI_MODE=local in .env with a model inside the clinic's network (PRM_AI_LOCAL_URL, PRM_AI_LOCAL_MODEL), or PRM_AI_MODE=hosted.",
};
