import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import process from "node:process";

import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { emailSettings, emailSends, emailEvents } from "../db/schema";
import { sendEmail, SendGridError } from "../email/sendgrid.server";
import { collectAttachments } from "../email/attachments.server";
import { resolveEmailSender } from "../email/senders.server";
import {
  createTrackedSend,
  deleteTrackedSend,
  injectTracking,
} from "../email/email-tracking.server";
import { formatActivityDate } from "@/lib/activity-date";
import { getCredential } from "@/lib/credentials/store.server";
import { t } from "@/lib/i18n";

async function getOrCreateEmailSettingsRow() {
  const db = getDb();
  const existing = await db.select().from(emailSettings).get();
  if (existing) return existing;

  const now = new Date().toISOString();
  await db.insert(emailSettings).values({ fromEmail: "", fromName: "PRM Core", updatedAt: now });
  return db.select().from(emailSettings).get();
}

export const getEmailSettings = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async () => {
    const row = await getOrCreateEmailSettingsRow();
    return {
      fromEmail: row?.fromEmail ?? "",
      fromName: row?.fromName ?? "",
      replyTo: row?.replyTo ?? "",
    };
  });

export const saveEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      fromEmail: z.string().email(),
      fromName: z.string().min(1),
      // Pusty jest poprawną wartością: brak adresu zwrotnego znaczy „odpowiedz
      // nadawcy", czyli zachowanie sprzed tej zmiany.
      replyTo: z.union([z.string().email(), z.literal("")]).default(""),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const existing = await db.select().from(emailSettings).get();
    const now = new Date().toISOString();

    if (existing) {
      await db
        .update(emailSettings)
        .set({
          fromEmail: data.fromEmail,
          fromName: data.fromName,
          replyTo: data.replyTo,
          updatedAt: now,
        })
        .where(eq(emailSettings.id, existing.id));
    } else {
      await db.insert(emailSettings).values({
        fromEmail: data.fromEmail,
        fromName: data.fromName,
        replyTo: data.replyTo,
        updatedAt: now,
      });
    }

    return { ok: true };
  });

export const getEmailIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async () => {
    const row = await getOrCreateEmailSettingsRow();
    return {
      apiKeyConfigured: !!(await getCredential("SENDGRID_API_KEY")),
      fromEmail: row?.fromEmail ?? "",
      fromName: row?.fromName ?? "",
      replyTo: row?.replyTo ?? "",
    };
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      to: z.string().email(),
      subject: z.string().min(1),
      html: z.string().min(1),
      baseUrl: z.string().url(),
      contentItemId: z.string().optional(),
      /** Identyfikatory plików z Media do dołączenia — tylko moduł Email. */
      attachments: z.array(z.string()).default([]),
      /**
       * Nadawca wybrany przy wiadomości. Pusto = domyślny z listy.
       *
       * **Bez tego pola wysyłka testowa kłamała**: podpisywała się nazwą
       * z Ustawień → SMTP niezależnie od tego, co wybrano w edytorze, więc
       * test sprawdzał coś innego niż to, co pójdzie do pacjentów. Przy
       * jednym adresie i kilku nazwach to różnica niewidoczna aż do wysyłki.
       */
      senderId: z.string().max(80).default(""),
    }),
  )
  .handler(async ({ data }) => {
    // Ta sama funkcja, której używa kampania i automatyzacja — żeby test
    // podpisywał się dokładnie tak jak prawdziwa wysyłka.
    const sender = await resolveEmailSender(data.senderId ?? "");
    const token = await createTrackedSend({
      toEmail: data.to,
      subject: data.subject,
      contentItemId: data.contentItemId,
    });
    try {
      const trackedHtml = injectTracking(data.html, token, data.baseUrl);
      const { attachments, problems } = await collectAttachments(data.attachments ?? []);
      await sendEmail({
        to: data.to,
        fromEmail: sender.fromEmail,
        fromName: sender.fromName,
        subject: data.subject,
        html: trackedHtml,
        attachments,
        trackingToken: token,
      });
      // Problemy z załącznikami wracają jako ostrzeżenie, nie jako błąd:
      // wiadomość poszła i udawanie, że nie, byłoby nieprawdą. Ale przemilczenie
      // brakującego pliku znaczyłoby, że nikt się nie dowie.
      return { ok: true, warnings: problems.length > 0 ? problems : undefined };
    } catch (err) {
      await deleteTrackedSend(token);
      if (err instanceof SendGridError) throw new Error(err.message);
      throw err;
    }
  });

export interface EmailActivityItem {
  id: string;
  type: "email" | "open" | "click";
  title: string;
  description: string;
  date: string;
}

/** Real send/open/click history for a contact's email address, shaped to drop straight into the contact activity timeline. */
export const getEmailActivityForContact = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ email: z.string().email() }))
  .handler(async ({ data }): Promise<EmailActivityItem[]> => {
    const db = getDb();
    const sends = await db.select().from(emailSends).where(eq(emailSends.toEmail, data.email));
    if (sends.length === 0) return [];

    const tokens = sends.map((s) => s.token);
    const events = await db.select().from(emailEvents).where(inArray(emailEvents.token, tokens));

    const items: EmailActivityItem[] = sends.map((s) => ({
      id: `send-${s.token}`,
      type: "email",
      title: t("Wysłano e-mail: „{subject}”", { subject: s.subject }),
      description: t("Do: {toEmail}", { toEmail: s.toEmail }),
      date: formatActivityDate(s.sentAt),
    }));

    const subjectByToken = new Map(sends.map((s) => [s.token, s.subject]));
    for (const e of events) {
      const subject = subjectByToken.get(e.token) ?? "";
      items.push(
        e.kind === "open"
          ? {
              id: e.id,
              type: "open",
              title: t("Otwarto wiadomość"),
              description: `„${subject}”`,
              date: formatActivityDate(e.occurredAt),
            }
          : {
              id: e.id,
              type: "click",
              title: t("Kliknięcie w wiadomości"),
              description: `„${subject}” → ${e.url ?? ""}`,
              date: formatActivityDate(e.occurredAt),
            },
      );
    }

    return items.sort((a, b) => b.date.localeCompare(a.date));
  });
