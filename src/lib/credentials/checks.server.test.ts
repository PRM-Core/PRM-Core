/**
 * „Sprawdź połączenie" — bez sieci: `fetch` podmieniony, żaden test nie
 * dotyka prawdziwego SendGrida, Twilio ani dostawców AI.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { IntegrationId } from "./catalog";
import { checkIntegration as sprawdz } from "./checks.server";
import { registerBookingSystem } from "../booking-system/provider";
import "../booking-system/test-system";

const odczyt: Record<string, string> = {};
const czytaj = (async (...names: string[]) =>
  Object.fromEntries(names.map((n) => [n, odczyt[n] ?? ""]))) as Parameters<typeof sprawdz>[1];
let kontoCanva: { ok: boolean; accountName: string } | null = null;
const checkIntegration = (id: IntegrationId) =>
  sprawdz(id, czytaj, { canvaAccount: async () => kontoCanva });

type Wywolanie = { url: string; init: RequestInit };
let wywolania: Wywolanie[] = [];
const oryginalnyFetch = globalThis.fetch;

function odpowiedz(status: number, body: unknown) {
  globalThis.fetch = (async (url: string | URL, init: RequestInit) => {
    wywolania.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

beforeEach(() => {
  wywolania = [];
  for (const k of Object.keys(odczyt)) delete odczyt[k];
  kontoCanva = null;
});
afterEach(() => {
  globalThis.fetch = oryginalnyFetch;
});
afterAll(() => {
  globalThis.fetch = oryginalnyFetch;
});

describe("sprawdzenie połączenia", () => {
  test("bez danych nie wychodzi żadne zapytanie", async () => {
    odpowiedz(200, {});
    const r = await checkIntegration("sendgrid");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Brak danych/);
    expect(wywolania).toHaveLength(0);
  });

  test("SendGrid: tylko odczyt, klucz w nagłówku, wymagane Mail Send", async () => {
    odczyt.SENDGRID_API_KEY = "SG.klucz-testowy";
    odpowiedz(200, { scopes: ["mail.send", "user.profile.read"] });
    expect((await checkIntegration("sendgrid")).ok).toBe(true);
    expect(wywolania[0].init.method).toBe("GET");
    expect(wywolania[0].url.includes("klucz-testowy")).toBe(false);
    expect((wywolania[0].init.headers as Record<string, string>).Authorization).toBe(
      "Bearer SG.klucz-testowy",
    );

    odpowiedz(200, { scopes: ["user.profile.read"] });
    const bez = await checkIntegration("sendgrid");
    expect(bez.ok).toBe(false);
    expect(bez.message).toMatch(/Mail Send/);
  });

  test("odrzucony klucz", async () => {
    odczyt.OPENAI_API_KEY = "sk-zly";
    odpowiedz(401, {});
    const r = await checkIntegration("openai");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/odrzucił/);
  });

  test("Twilio: konto zawieszone to błąd", async () => {
    odczyt.TWILIO_ACCOUNT_SID = `AC${"0".repeat(32)}`;
    odczyt.TWILIO_AUTH_TOKEN = "token";
    odpowiedz(200, { status: "suspended" });
    expect((await checkIntegration("twilio")).message).toMatch(/suspended/);
    odpowiedz(200, { status: "active", friendly_name: "Placówka" });
    expect(await checkIntegration("twilio")).toEqual({
      ok: true,
      message: "Połączono z kontem „Placówka”.",
    });
  });

  test("Meta i Google: sekret nie trafia do adresu", async () => {
    odczyt.META_APP_ID = "123";
    odczyt.META_APP_SECRET = "tajny-sekret";
    odpowiedz(200, { name: "Aplikacja" });
    expect((await checkIntegration("meta")).ok).toBe(true);
    odczyt.GOOGLE_API_KEY = "AIza-tajny";
    odpowiedz(400, {});
    expect((await checkIntegration("google")).ok).toBe(false);
    for (const w of wywolania) {
      expect(w.url.includes("tajny")).toBe(false);
      expect(w.init.method).toBe("GET");
    }
  });

  test("brak sieci nie wywraca panelu", async () => {
    odczyt.ANTHROPIC_API_KEY = "sk-ant-x";
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const r = await checkIntegration("anthropic");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Nie udało się połączyć/);
  });

  test("integracja bez sprawdzenia", async () => {
    expect((await checkIntegration("mcp")).ok).toBe(false);
  });
});

describe("Docplanner", () => {
  const ustaw = () => {
    odczyt.DOCPLANNER_CLIENT_ID = "klient-testowy";
    odczyt.DOCPLANNER_CLIENT_SECRET = "sekret-testowy";
  };

  test("prosi o token w serwisie polskim, gdy domena pusta; sekret tylko w nagłówku", async () => {
    ustaw();
    odpowiedz(200, { access_token: "t", expires_in: 3600 });
    const r = await checkIntegration("docplanner");
    expect(r.ok).toBe(true);
    expect(wywolania[0].url).toBe("https://www.znanylekarz.pl/oauth/v2/token");
    expect(String(wywolania[0].init.body)).toBe("grant_type=client_credentials&scope=integration");
    expect(String(wywolania[0].init.body).includes("sekret")).toBe(false);
  });

  test("inna domena kraju; odrzucone klucze; brak tokenu", async () => {
    ustaw();
    odczyt.DOCPLANNER_DOMAIN = "www.doctoralia.es";
    odpowiedz(401, { error: "invalid_client" });
    const r = await checkIntegration("docplanner");
    expect(wywolania[0].url).toBe("https://www.doctoralia.es/oauth/v2/token");
    expect(r.message).toMatch(/odrzucił/);
    odpowiedz(200, {});
    expect((await checkIntegration("docplanner")).ok).toBe(false);
  });

  test("bez kluczy albo z adresem zamiast domeny — bez zapytania", async () => {
    expect((await checkIntegration("docplanner")).ok).toBe(false);
    ustaw();
    odczyt.DOCPLANNER_DOMAIN = "https://zly.example/sciezka";
    odpowiedz(200, { access_token: "t" });
    expect((await checkIntegration("docplanner")).ok).toBe(false);
    expect(wywolania).toHaveLength(0);
  });
});

describe("system rezerwacji", () => {
  test("sprawdzenie przekazane dostawcy, bez sieci po naszej stronie", async () => {
    registerBookingSystem({
      id: "testsys",
      name: "Test booking system",
      configured: async () => true,
      getPatient: async () => null,
      patientVisits: async () => [],
      historyIsComplete: true,
      doctorDayBookings: async () => [],
      doctorMonthLoad: async () => ({ capacity: 0, booked: 0 }),
      checkConnection: async () => ({ ok: true, message: "Połączono z systemem testowym." }),
    });
    const r = await checkIntegration("testsys");
    expect(r).toEqual({ ok: true, message: "Połączono z systemem testowym." });
    expect(wywolania).toHaveLength(0);
  });

  test("nieznana integracja — brak sprawdzenia", async () => {
    expect((await checkIntegration("nieznany-system")).ok).toBe(false);
  });
});

describe("Canva", () => {
  test("podłączone konto — nazwa konta, bez zapytania do punktu tokenów", async () => {
    odczyt.CANVA_CLIENT_ID = "OC-test";
    odczyt.CANVA_CLIENT_SECRET = "sekret";
    kontoCanva = { ok: true, accountName: "Placówka" };
    odpowiedz(200, {});
    expect((await checkIntegration("canva")).message).toMatch(/„Placówka”/);
    expect(wywolania).toHaveLength(0);
  });

  test("bez konta: invalid_client — złe klucze; odrzucony kod — klucze przyjęte", async () => {
    odczyt.CANVA_CLIENT_ID = "OC-test";
    odczyt.CANVA_CLIENT_SECRET = "sekret";
    odpowiedz(401, { error: "invalid_client" });
    expect((await checkIntegration("canva")).ok).toBe(false);
    odpowiedz(400, { error: "invalid_grant" });
    const r = await checkIntegration("canva");
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/Połącz konto/);
    expect(wywolania.every((w) => !w.url.includes("sekret"))).toBe(true);
  });
});
