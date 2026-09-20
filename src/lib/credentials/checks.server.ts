import type { IntegrationId } from "./catalog";
import { getCredentials } from "./store.server";
import { t } from "@/lib/i18n";
import { docplannerHost, docplannerTokenUrl } from "../docplanner/config";

/** Odczyt kluczy — podmienialny w testach, żeby nie potrzebowały bazy. */
type Reader = typeof getCredentials;

/** Zależności od bazy — podmienialne w testach. */
export interface CheckDeps {
  /** Stan podłączonego konta Canva; `null` — nie podłączono. */
  canvaAccount: () => Promise<{ ok: boolean; accountName: string } | null>;
}

const defaultDeps: CheckDeps = {
  canvaAccount: async () => (await import("../canva/oauth.server")).checkCanvaAccount(),
};

/**
 * „Sprawdź połączenie" w panelu kluczy.
 *
 * **Każde sprawdzenie to odczyt, który niczego nie wysyła i nie zmienia po
 * drugiej stronie**: lista uprawnień klucza, dane konta, lista modeli. Żadnego
 * e-maila, SMS-a ani zapytania do modelu, które kosztuje.
 *
 * Klucze idą wyłącznie w nagłówkach — nigdy w adresie, bo adresy lądują
 * w logach pośredników.
 */

export interface CheckResult {
  ok: boolean;
  message: string;
}

const TIMEOUT_MS = 10_000;

async function get(url: string, headers: Record<string, string>): Promise<Response> {
  return fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function authFailure(status: number, what: string): CheckResult | null {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      message: t(
        "{what} odrzucił dane (HTTP {status}) — klucz jest błędny, wycofany albo bez uprawnień.",
        { what: what, status: status },
      ),
    };
  }
  return null;
}

const missing = (what: string): CheckResult => ({
  ok: false,
  message: t("Brak danych: {what}. Uzupełnij je i zapisz przed sprawdzeniem.", { what: what }),
});

async function sendgrid(read: Reader): Promise<CheckResult> {
  const { SENDGRID_API_KEY: key } = await read("SENDGRID_API_KEY");
  if (!key) return missing("klucz API");
  const res = await get("https://api.sendgrid.com/v3/scopes", { Authorization: `Bearer ${key}` });
  const denied = authFailure(res.status, "SendGrid");
  if (denied) return denied;
  if (!res.ok)
    return {
      ok: false,
      message: t("SendGrid odpowiedział HTTP {status}.", { status: res.status }),
    };
  const body = (await res.json().catch(() => null)) as { scopes?: string[] } | null;
  if (!body?.scopes?.includes("mail.send")) {
    return {
      ok: false,
      message: t("Klucz działa, ale nie ma uprawnienia „Mail Send” — wysyłka się nie uda."),
    };
  }
  return { ok: true, message: t("Klucz działa i ma uprawnienie do wysyłki.") };
}

async function twilio(read: Reader): Promise<CheckResult> {
  const c = await read("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN");
  if (!c.TWILIO_ACCOUNT_SID || !c.TWILIO_AUTH_TOKEN) return missing(t("Account SID i Auth Token"));
  const basic = Buffer.from(`${c.TWILIO_ACCOUNT_SID}:${c.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await get(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.TWILIO_ACCOUNT_SID)}.json`,
    { Authorization: `Basic ${basic}` },
  );
  const denied = authFailure(res.status, "Twilio");
  if (denied) return denied;
  if (res.status === 404) return { ok: false, message: t("Twilio nie zna takiego Account SID.") };
  if (!res.ok)
    return { ok: false, message: t("Twilio odpowiedział HTTP {status}.", { status: res.status }) };
  const body = (await res.json().catch(() => null)) as {
    status?: string;
    friendly_name?: string;
  } | null;
  if (body?.status && body.status !== "active") {
    return {
      ok: false,
      message: t("Konto Twilio ma stan „{status}” — wysyłka nie zadziała.", {
        status: body.status,
      }),
    };
  }
  return {
    ok: true,
    message: t("Połączono z kontem {v0}.", {
      v0: body?.friendly_name ? `„${body.friendly_name}”` : t("Twilio"),
    }),
  };
}

async function anthropic(read: Reader): Promise<CheckResult> {
  const { ANTHROPIC_API_KEY: key } = await read("ANTHROPIC_API_KEY");
  if (!key) return missing("klucz API");
  const res = await get("https://api.anthropic.com/v1/models?limit=1", {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  });
  return modelsResult(res, "Anthropic");
}

async function openai(read: Reader): Promise<CheckResult> {
  const { OPENAI_API_KEY: key } = await read("OPENAI_API_KEY");
  if (!key) return missing("klucz API");
  const res = await get("https://api.openai.com/v1/models", { Authorization: `Bearer ${key}` });
  return modelsResult(res, "OpenAI");
}

async function google(read: Reader): Promise<CheckResult> {
  const { GOOGLE_API_KEY: key } = await read("GOOGLE_API_KEY");
  if (!key) return missing("klucz API");
  const res = await get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
    "x-goog-api-key": key,
  });
  // Google zwraca 400 „API key not valid" zamiast 401.
  if (res.status === 400)
    return { ok: false, message: t("Google odrzucił klucz (HTTP 400) — klucz jest błędny.") };
  return modelsResult(res, "Google");
}

function modelsResult(res: Response, what: string): CheckResult {
  const denied = authFailure(res.status, what);
  if (denied) return denied;
  if (!res.ok)
    return {
      ok: false,
      message: t("{what} odpowiedział HTTP {status}.", { what: what, status: res.status }),
    };
  return { ok: true, message: t("Klucz {what} działa.", { what: what }) };
}

async function meta(read: Reader): Promise<CheckResult> {
  const c = await read("META_APP_ID", "META_APP_SECRET");
  if (!c.META_APP_ID || !c.META_APP_SECRET) return missing(t("App ID i App Secret"));
  // Token aplikacji to „id|secret"; Graph przyjmuje go w nagłówku.
  const res = await get(
    `https://graph.facebook.com/v25.0/${encodeURIComponent(c.META_APP_ID)}?fields=name`,
    {
      Authorization: `OAuth ${c.META_APP_ID}|${c.META_APP_SECRET}`,
    },
  );
  const body = (await res.json().catch(() => null)) as {
    name?: string;
    error?: { message?: string };
  } | null;
  if (!res.ok) {
    return {
      ok: false,
      message: t("Meta odrzuciła dane aplikacji: {v0}.", {
        v0: body?.error?.message ?? `HTTP ${res.status}`,
      }),
    };
  }
  return {
    ok: true,
    message: t("Połączono z aplikacją {v0}.", { v0: body?.name ? `„${body.name}”` : t("Meta") }),
  };
}

/**
 * Canva: przy podłączonym koncie — nazwa konta (pełne potwierdzenie). Bez
 * konta Canva nie ma zapytania „czy te klucze są dobre”, więc wysyłamy do
 * punktu tokenów kod, który na pewno nie istnieje: złe Client ID / secret
 * kończy się `invalid_client` (401), dobre — odrzuceniem samego kodu.
 */
async function canva(read: Reader, deps: CheckDeps): Promise<CheckResult> {
  const c = await read("CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET");
  if (!c.CANVA_CLIENT_ID || !c.CANVA_CLIENT_SECRET) return missing(t("Client ID i Client secret"));

  const account = await deps.canvaAccount();
  if (account) {
    return account.ok
      ? {
          ok: true,
          message: t("Połączono z kontem Canva{v0}.", {
            v0: account.accountName ? ` „${account.accountName}”` : "",
          }),
        }
      : {
          ok: false,
          message: t(
            "Konto Canva jest podłączone, ale token nie działa — kliknij „Połącz konto” ponownie.",
          ),
        };
  }

  const { TOKEN_URL } = await import("../canva/oauth.server");
  const basic = Buffer.from(`${c.CANVA_CLIENT_ID}:${c.CANVA_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: "prm-sprawdzenie-polaczenia",
      code_verifier: "prm-sprawdzenie-polaczenia-".padEnd(60, "0"),
      redirect_uri: "https://localhost/prm-sprawdzenie",
    }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    error_description?: string;
  } | null;
  const error = body?.error ?? "";
  if (res.status === 401 || error === "invalid_client" || error === "unauthorized_client") {
    return { ok: false, message: t("Canva odrzuciła Client ID albo Client secret.") };
  }
  if (res.status >= 500 || !body) {
    return {
      ok: false,
      message: t("Canva odpowiedziała HTTP {status} — spróbuj za chwilę.", { status: res.status }),
    };
  }
  return {
    ok: true,
    message: t(
      "Canva przyjęła Client ID i Client secret. Konto nie jest jeszcze podłączone — zrób to przyciskiem „Połącz konto” w karcie Canva.",
    ),
  };
}

/**
 * Docplanner: a token request with the client credentials. It creates nothing
 * on their side — the token expires on its own — and it is the only call that
 * tells a wrong secret from a wrong service domain.
 */
async function docplanner(read: Reader): Promise<CheckResult> {
  const c = await read("DOCPLANNER_DOMAIN", "DOCPLANNER_CLIENT_ID", "DOCPLANNER_CLIENT_SECRET");
  if (!c.DOCPLANNER_CLIENT_ID || !c.DOCPLANNER_CLIENT_SECRET) {
    return missing(t("Client ID i Client secret"));
  }
  const host = docplannerHost(c.DOCPLANNER_DOMAIN);
  if (!host) return { ok: false, message: t("Niepoprawna domena serwisu.") };
  const auth = Buffer.from(`${c.DOCPLANNER_CLIENT_ID}:${c.DOCPLANNER_CLIENT_SECRET}`).toString(
    "base64",
  );
  const res = await fetch(docplannerTokenUrl(host), {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=integration",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { access_token?: string };
    return body.access_token
      ? {
          ok: true,
          message: t("Połączono z {host} — Client ID i Client secret przyjęte.", { host }),
        }
      : {
          ok: false,
          message: t("{host} odpowiedział bez tokenu — sprawdź domenę serwisu.", { host }),
        };
  }
  if (res.status === 400 || res.status === 401) {
    return {
      ok: false,
      message: t("{host} odrzucił Client ID albo Client secret (HTTP {status}).", {
        host,
        status: res.status,
      }),
    };
  }
  return {
    ok: false,
    message: t("{host} zwrócił HTTP {status} — sprawdź domenę serwisu.", {
      host,
      status: res.status,
    }),
  };
}

const CHECKS: Partial<
  Record<IntegrationId, (read: Reader, deps: CheckDeps) => Promise<CheckResult>>
> = {
  sendgrid,
  twilio,
  anthropic,
  openai,
  google,
  meta,
  canva,
  docplanner,
};

export async function checkIntegration(
  id: IntegrationId,
  read: Reader = getCredentials,
  deps: CheckDeps = defaultDeps,
): Promise<CheckResult> {
  const check = CHECKS[id];
  if (!check) {
    // A booking system provider brings its own test for its integration.
    const { bookingSystems } = await import("../booking-system/provider");
    const provider = bookingSystems().find((p) => (p.integrationId ?? p.id) === id);
    if (provider?.checkConnection) {
      try {
        return await provider.checkConnection();
      } catch (err) {
        return { ok: false, message: t("Nie udało się połączyć: {v0}.", { v0: String(err) }) };
      }
    }
    return { ok: false, message: t("Dla tej integracji nie ma sprawdzenia połączenia.") };
  }
  try {
    return await check(read, deps);
  } catch (err) {
    const timeout = err instanceof Error && err.name === "TimeoutError";
    return {
      ok: false,
      message: timeout
        ? t("Brak odpowiedzi w 10 s — sprawdź, czy serwer ma dostęp do internetu.")
        : t("Nie udało się połączyć: {v0}.", {
            v0: err instanceof Error ? err.message : String(err),
          }),
    };
  }
}
