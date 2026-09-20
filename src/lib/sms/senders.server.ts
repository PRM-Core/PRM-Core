import { randomUUID } from "node:crypto";
import { asc, eq, ne } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { smsSenders } from "../db/schema";
import type { SmsSenderKind, SmsSenderRow } from "../db/schema";
import { t } from "@/lib/i18n";

// Several SMS senders at once, and the rules for picking between them.
//
// A clinic realistically runs two: a branded alphanumeric ID like "KlinikaABC" for
// campaigns, and a real number for anything the patient might answer. They are
// not interchangeable — see `kind` on the table — so choosing badly is the
// difference between a conversation and a dead end.
//
// Server-only (`.server.ts`): `randomUUID` from node:crypto.

/**
 * A sender starting with "+" or a digit is a phone number; anything else is a
 * branded alphanumeric ID. Twilio makes the same distinction, and it decides
 * whether a patient can reply at all.
 */
export function detectSenderKind(value: string): SmsSenderKind {
  return /^[+0-9]/.test(value.trim()) ? "number" : "alphanumeric";
}

export async function listSmsSenders(): Promise<SmsSenderRow[]> {
  const db = getDb();
  return db.select().from(smsSenders).orderBy(asc(smsSenders.createdAt));
}

export async function addSmsSender(input: {
  label: string;
  value: string;
}): Promise<{ ok: boolean; error?: string }> {
  const value = input.value.trim();
  const label = input.label.trim() || value;
  if (!value) return { ok: false, error: t("Podaj nadawcę.") };

  const db = getDb();
  const existing = await db.select().from(smsSenders).where(eq(smsSenders.value, value)).get();
  if (existing)
    return { ok: false, error: t("Nadawca „{value}” jest już na liście.", { value: value }) };

  // The first sender added is automatically the default — otherwise a fresh
  // install would have senders configured and still refuse to send.
  const any = await db.select({ id: smsSenders.id }).from(smsSenders).get();
  await db.insert(smsSenders).values({
    id: randomUUID(),
    label,
    value,
    kind: detectSenderKind(value),
    isDefault: any ? 0 : 1,
    createdAt: Date.now(),
  });
  return { ok: true };
}

export async function setDefaultSmsSender(id: string): Promise<void> {
  const db = getDb();
  await db.update(smsSenders).set({ isDefault: 0 }).where(ne(smsSenders.id, id));
  await db.update(smsSenders).set({ isDefault: 1 }).where(eq(smsSenders.id, id));
}

export async function deleteSmsSender(id: string): Promise<void> {
  const db = getDb();
  const row = await db.select().from(smsSenders).where(eq(smsSenders.id, id)).get();
  if (!row) return;
  await db.delete(smsSenders).where(eq(smsSenders.id, id));

  // Never leave the list without a default: the next sender takes over, so
  // sending keeps working instead of failing on the next automation step.
  if (row.isDefault) {
    const next = await db.select().from(smsSenders).orderBy(asc(smsSenders.createdAt)).get();
    if (next) await setDefaultSmsSender(next.id);
  }
}

/**
 * Which sender to send from.
 *
 * `preferred` is whatever a node config or a form field asked for, matched on
 * id first and then on the raw value — automations saved before senders had ids
 * carry the literal "KlinikaABC", and those must keep working.
 * Falls back to the default, then to any configured sender.
 */
export async function resolveSmsSender(preferred?: string | null): Promise<SmsSenderRow | null> {
  const senders = await listSmsSenders();
  if (senders.length === 0) return null;

  const want = (preferred ?? "").trim();
  if (want) {
    const match =
      senders.find((s) => s.id === want) ??
      senders.find((s) => s.value.toLowerCase() === want.toLowerCase());
    if (match) return match;
  }
  return senders.find((s) => s.isDefault === 1) ?? senders[0];
}

/**
 * The sender to use for a message the patient is meant to answer.
 *
 * Prefers a real number, because an alphanumeric sender cannot receive replies
 * — sending a "reply to confirm" from "KlinikaABC" produces a message the phone
 * physically cannot respond to. Falls back to the default rather than refusing:
 * a one-way reply still delivers the information.
 */
export async function resolveReplySmsSender(): Promise<SmsSenderRow | null> {
  const senders = await listSmsSenders();
  if (senders.length === 0) return null;
  const numbers = senders.filter((s) => s.kind === "number");
  if (numbers.length > 0) {
    return numbers.find((s) => s.isDefault === 1) ?? numbers[0];
  }
  return senders.find((s) => s.isDefault === 1) ?? senders[0];
}
