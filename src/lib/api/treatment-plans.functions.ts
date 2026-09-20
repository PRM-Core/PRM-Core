import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { getSessionUser } from "../auth/session.server";
import {
  assignPlan,
  contactPlans,
  deletePlan,
  listPlans,
  planUsage,
  savePlan,
  unassignPlan,
  type AssignedPlan,
} from "../care/treatment-plans.server";
import type { TreatmentPlanRow } from "../db/schema";
import { t } from "@/lib/i18n";

// Plany leczenia — warstwa RPC. Logika siedzi w care/treatment-plans.server.ts,
// a podstawianie `%%PLAN%%` w treści dzieje się przy wysyłce
// (care/plan-tags.server.ts), nie tutaj.

export type { AssignedPlan };

export const getTreatmentPlans = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<{ plans: TreatmentPlanRow[]; usage: Record<string, number> }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    const [plans, usage] = await Promise.all([listPlans(true), planUsage()]);
    return { plans, usage };
  });

export const saveTreatmentPlan = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1).max(120),
      category: z.string().max(80).default(""),
      description: z.string().max(1000).default(""),
      // Plan bywa długi — dieta na cztery tygodnie to kilkadziesiąt kilobajtów
      // HTML-a. Sufit jest po to, żeby ktoś nie wkleił obrazków w base64.
      html: z.string().max(400_000).default(""),
      active: z.boolean().default(true),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return savePlan(data);
  });

export const removeTreatmentPlan = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return deletePlan(data.id);
  });

/** Plany przypisane pacjentowi — historia, od najnowszego. */
export const getContactPlans = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ contactId: z.string().min(1) }))
  .handler(async ({ data }): Promise<AssignedPlan[]> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return contactPlans(data.contactId);
  });

export const assignTreatmentPlan = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      contactId: z.string().min(1),
      planId: z.string().min(1),
      note: z.string().max(500).default(""),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    // Kto przypisał, zapisane na sztywno: za pół roku konto może już nie
    // istnieć, a w dokumentacji ma zostać nazwisko, nie martwy identyfikator.
    return assignPlan({
      contactId: data.contactId,
      planId: data.planId,
      assignedBy: `${user.firstName} ${user.lastName}`.trim(),
      note: data.note,
    });
  });

export const unassignTreatmentPlan = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ assignmentId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return unassignPlan(data.assignmentId);
  });
