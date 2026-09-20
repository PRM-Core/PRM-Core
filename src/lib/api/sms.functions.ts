import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import process from "node:process";

import { z } from "zod";
import { sendSms, TwilioError } from "../sms/twilio.server";
import {
  addSmsSender,
  deleteSmsSender,
  listSmsSenders,
  resolveSmsSender,
  setDefaultSmsSender,
} from "../sms/senders.server";
import type { SmsSenderKind } from "../db/schema";
import { getCredential } from "@/lib/credentials/store.server";
import { t } from "@/lib/i18n";

// RPC only — every rule about which sender wins lives in sms/senders.server.ts.

export interface SmsSenderView {
  id: string;
  label: string;
  value: string;
  kind: SmsSenderKind;
  isDefault: boolean;
}

export const getSmsSenders = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<SmsSenderView[]> => {
    const rows = await listSmsSenders();
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      value: r.value,
      kind: r.kind,
      isDefault: r.isDefault === 1,
    }));
  });

export const createSmsSender = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ label: z.string(), value: z.string().min(1) }))
  .handler(async ({ data }) => addSmsSender(data));

export const removeSmsSender = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await deleteSmsSender(data.id);
    return { ok: true };
  });

export const makeSmsSenderDefault = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await setDefaultSmsSender(data.id);
    return { ok: true };
  });

export const getSmsIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async () => {
    const senders = await listSmsSenders();
    return {
      apiKeyConfigured:
        !!(await getCredential("TWILIO_ACCOUNT_SID")) &&
        !!(await getCredential("TWILIO_AUTH_TOKEN")),
      senderCount: senders.length,
      /** True once at least one sender can actually receive a reply — see SmsSenderKind. */
      hasReplyCapableSender: senders.some((s) => s.kind === "number"),
    };
  });

export const sendTestSms = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      to: z.string().min(1),
      body: z.string().min(1),
      /** Sender id; empty means "whichever is default". */
      sender: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const sender = await resolveSmsSender(data.sender);
    if (!sender) {
      throw new Error(t("Brak skonfigurowanego nadawcy SMS — dodaj go w Integracje → SMS API."));
    }
    try {
      await sendSms({ to: data.to, fromNumber: sender.value, body: data.body });
      return { ok: true, sender: sender.value };
    } catch (err) {
      if (err instanceof TwilioError) throw new Error(err.message);
      throw err;
    }
  });
