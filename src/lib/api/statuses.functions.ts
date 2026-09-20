import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "./require-user";
import { z } from "zod";
import { getSessionUser } from "../auth/session.server";
import { createStatus, deleteStatus, listStatuses, renameStatus } from "../fields/statuses.server";
import type { ContactStatusRow } from "../db/schema";
import { t } from "@/lib/i18n";

// Statusy kontaktu — Ustawienia → Tabele / Dane.

export const getStatuses = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async (): Promise<ContactStatusRow[]> => listStatuses());

export const addStatus = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ label: z.string().max(40), color: z.string().max(60).default("") }))
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return createStatus(data);
  });

export const updateStatus = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({ key: z.string(), label: z.string().max(40), color: z.string().max(60) }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    await renameStatus(data.key, data.label, data.color);
    return { ok: true };
  });

export const removeStatus = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ key: z.string() }))
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return deleteStatus(data.key);
  });
