import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { getSessionUser } from "../auth/session.server";
import {
  createEmailSender,
  deleteEmailSender,
  listEmailSenders,
  setDefaultEmailSender,
} from "../email/senders.server";
import type { EmailSenderRow } from "../db/schema";
import { t } from "@/lib/i18n";

// Nazwy nadawcy e-mail — Ustawienia → SMTP. Reguły siedzą
// w email/senders.server.ts.

export type { EmailSenderRow };

export const getEmailSenders = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<EmailSenderRow[]> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return listEmailSenders();
  });

export const addEmailSender = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      name: z.string().min(1).max(80),
      /** Pusty = adres z ustawień SMTP, ten zweryfikowany w SendGridzie. */
      email: z.string().max(200).default(""),
      note: z.string().max(200).default(""),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return createEmailSender(data);
  });

export const removeEmailSender = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return deleteEmailSender(data.id);
  });

export const makeDefaultEmailSender = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return setDefaultEmailSender(data.id);
  });
