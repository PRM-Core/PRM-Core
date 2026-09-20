import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { emailSenders, emailSettings, type EmailSenderRow } from "../db/schema";
import { t } from "@/lib/i18n";

/**
 * Nazwy nadawcy e-mail.
 *
 * **Adres jeden, nazw kilka.** Pacjent widzi w skrzynce nazwę, nie adres —
 * i to ona decyduje, czy wiadomość wygląda na tę samą rozmowę co poprzednia.
 * Na przykład „Klinika ABC" przy zaproszeniach na badania i „Klinika"
 * przy przypomnieniach, z tego samego `listonosz@klinika-abc.pl`.
 *
 * Ten sam układ co przy SMS (`sms/senders.server.ts`), z tego samego powodu:
 * jedno pole w ustawieniach nie opisywało rzeczywistości, w której jedna
 * placówka prowadzi kilka rodzajów korespondencji.
 */

/**
 * Lista nadawców, z jednorazowym przeniesieniem tego, co było w ustawieniach.
 *
 * Bez tego kroku placówka po wdrożeniu miałaby pustą listę i wiadomości bez
 * podpisu — a nazwa nadawcy była już ustawiona, tylko w innym miejscu.
 */
export async function listEmailSenders(): Promise<EmailSenderRow[]> {
  const db = getDb();
  const rows = await db.select().from(emailSenders).orderBy(emailSenders.name).all();
  if (rows.length > 0) return rows;

  const settings = await db.select().from(emailSettings).get();
  const name = settings?.fromName?.trim();
  if (!name) return [];
  const seeded: EmailSenderRow = {
    id: randomUUID(),
    name,
    email: "",
    note: t("Przeniesione z Ustawień → SMTP."),
    isDefault: 1,
    createdAt: Date.now(),
  };
  await db.insert(emailSenders).values(seeded);
  return [seeded];
}

export async function createEmailSender(input: {
  name: string;
  email: string;
  note: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const db = getDb();
  const name = input.name.trim();
  if (!name) return { ok: false, error: t("Nadawca musi mieć nazwę.") };

  const existing = await listEmailSenders();
  if (existing.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: t('Nadawca „{name}" już istnieje.', { name: name }) };
  }

  const id = randomUUID();
  await db.insert(emailSenders).values({
    id,
    name,
    email: input.email.trim(),
    note: input.note.trim(),
    // Pierwszy nadawca jest domyślny z automatu — inaczej lista byłaby pełna,
    // a wiadomości nadal szłyby bez podpisu.
    isDefault: existing.length === 0 ? 1 : 0,
    createdAt: Date.now(),
  });
  return { ok: true, id };
}

export async function deleteEmailSender(id: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const rows = await listEmailSenders();
  const row = rows.find((s) => s.id === id);
  if (!row) return { ok: false, error: t("Ten nadawca już nie istnieje.") };
  if (rows.length === 1) {
    return { ok: false, error: t("To jedyny nadawca — wiadomości muszą mieć czym się podpisać.") };
  }
  await db.delete(emailSenders).where(eq(emailSenders.id, id));
  // Usunięcie domyślnego zostawiłoby listę bez wskazania — pierwszy z reszty
  // przejmuje rolę, zamiast czekać, aż ktoś zauważy brak.
  if (row.isDefault === 1) {
    const next = rows.find((s) => s.id !== id);
    if (next)
      await db.update(emailSenders).set({ isDefault: 1 }).where(eq(emailSenders.id, next.id));
  }
  return { ok: true };
}

export async function setDefaultEmailSender(id: string): Promise<{ ok: boolean }> {
  const db = getDb();
  await db.update(emailSenders).set({ isDefault: 0 });
  await db.update(emailSenders).set({ isDefault: 1 }).where(eq(emailSenders.id, id));
  return { ok: true };
}

export interface ResolvedSender {
  fromEmail: string;
  fromName: string;
}

/**
 * Adres i nazwa, którymi realnie podpiszemy wiadomość.
 *
 * `senderId` pusty albo wskazujący na skasowanego nadawcę cofa się do
 * domyślnego, a ten do ustawień SMTP. **Wiadomość nigdy nie zostaje bez
 * nadawcy** — brak podpisu to wiadomość, której SendGrid nie przyjmie.
 */
export async function resolveEmailSender(senderId: string): Promise<ResolvedSender> {
  const db = getDb();
  const settings = await db.select().from(emailSettings).get();
  const fallback: ResolvedSender = {
    fromEmail: settings?.fromEmail ?? "",
    fromName: settings?.fromName ?? "",
  };

  const rows = await listEmailSenders();
  if (rows.length === 0) return fallback;

  const chosen = rows.find((s) => s.id === senderId) ?? rows.find((s) => s.isDefault === 1);
  if (!chosen) return fallback;

  return {
    // Adres własny nadawcy tylko wtedy, gdy go podano; inaczej ten
    // zweryfikowany w SendGridzie. Wysyłka z niezweryfikowanego adresu kończy
    // się odrzuceniem całej wiadomości.
    fromEmail: chosen.email.trim() || fallback.fromEmail,
    fromName: chosen.name,
  };
}
