import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { appSettings, emailEvents, emailSends } from "../db/schema";

/**
 * Zdarzenia doręczenia od SendGrida.
 *
 * **Po co to istnieje.** Otwarcia i kliknięcia liczymy sami — pikselem
 * i przepisanymi odnośnikami. O tym, czy wiadomość w ogóle **dotarła**, czy
 * odbiła się od serwera odbiorcy albo trafiła do spamu, wie wyłącznie serwer
 * pocztowy. Bez tego webhooka bounce rate nie jest „nieznany" — on po prostu
 * nie istnieje, a raport pokazujący tu jakąkolwiek liczbę zmyślałby ją.
 *
 * **Powiązanie idzie po `prm_token`**, który dokładamy do wysyłki jako
 * `custom_args` i który SendGrid odsyła w każdym zdarzeniu. Adres odbiorcy nie
 * wystarcza: ten sam pacjent bywa w kilku wysyłkach tego samego dnia.
 *
 * Sekret w adresie na wzór Inbound Parse (`api.webhooks.inbound-email.$secret`)
 * — Event Webhook potrafi też podpisywać żądania, ale podpis jest opcjonalny
 * po stronie SendGrida, więc nieodgadywalna ścieżka jest tym, co działa
 * zawsze i daje się obrócić w jednej chwili.
 */

const SECRET_KEY = "sendgrid_event_secret";

/** Rodzaje, które przyjmujemy. Reszta (processed, deferred) nic nie wnosi do raportu. */
const ACCEPTED = new Set([
  "delivered",
  "bounce",
  "dropped",
  "spamreport",
  "unsubscribe",
  "open",
  "click",
]);

export async function getEventWebhookSecret(): Promise<string> {
  const db = getDb();
  const row = await db.select().from(appSettings).where(eq(appSettings.key, SECRET_KEY)).get();
  if (row) return row.value;
  const secret = randomUUID().replace(/-/g, "");
  await db.insert(appSettings).values({ key: SECRET_KEY, value: secret });
  return secret;
}

export async function rotateEventWebhookSecret(): Promise<string> {
  const db = getDb();
  const secret = randomUUID().replace(/-/g, "");
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, SECRET_KEY)).get();
  if (existing) {
    await db.update(appSettings).set({ value: secret }).where(eq(appSettings.key, SECRET_KEY));
  } else {
    await db.insert(appSettings).values({ key: SECRET_KEY, value: secret });
  }
  return secret;
}

/** Jedno zdarzenie w postaci, w jakiej przysyła je SendGrid. */
export interface SendGridEvent {
  event?: string;
  email?: string;
  timestamp?: number;
  reason?: string;
  url?: string;
  prm_token?: string;
  [key: string]: unknown;
}

export interface IngestResult {
  accepted: number;
  /** Zdarzenia bez dopasowania do naszej wysyłki — liczone, nie przemilczane. */
  unmatched: number;
  ignored: number;
}

/**
 * Zapis paczki zdarzeń.
 *
 * SendGrid wysyła je **partiami i z powtórzeniami** (ponawia całą paczkę, gdy
 * nie dostanie 2xx), więc zapis musi być odporny na duplikaty. Rozpoznajemy je
 * po trójce token + rodzaj + sekunda: to samo zdarzenie w ponowionej paczce ma
 * identyczny znacznik czasu, a dwa różne otwarcia w tej samej sekundzie i tak
 * nie niosą osobnej informacji.
 */
export async function ingestSendGridEvents(events: SendGridEvent[]): Promise<IngestResult> {
  const db = getDb();
  let accepted = 0;
  let unmatched = 0;
  let ignored = 0;

  for (const ev of events) {
    const kind = String(ev.event ?? "").toLowerCase();
    if (!ACCEPTED.has(kind)) {
      ignored++;
      continue;
    }

    const token = typeof ev.prm_token === "string" ? ev.prm_token : "";
    if (!token) {
      unmatched++;
      continue;
    }

    // Zdarzenie dla wysyłki, której nie znamy (skasowana albo z innej
    // instalacji na tym samym kluczu SendGrid) — nie zapisujemy, bo klucz obcy
    // i tak by je odrzucił, a cichy wyjątek psułby całą paczkę.
    const send = await db.select().from(emailSends).where(eq(emailSends.token, token)).get();
    if (!send) {
      unmatched++;
      continue;
    }

    const occurredAt = typeof ev.timestamp === "number" ? ev.timestamp * 1000 : Date.now();
    const second = Math.floor(occurredAt / 1000);
    const id = `sg-${token}-${kind}-${second}`;

    try {
      await db.insert(emailEvents).values({
        id,
        token,
        kind: kind as never,
        url: typeof ev.url === "string" ? ev.url : null,
        reason: typeof ev.reason === "string" ? ev.reason : null,
        occurredAt,
      });
      accepted++;
    } catch {
      // Klucz główny już zajęty = ponowiona paczka. To nie jest błąd.
      ignored++;
    }
  }

  return { accepted, unmatched, ignored };
}
