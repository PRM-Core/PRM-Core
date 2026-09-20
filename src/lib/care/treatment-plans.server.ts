import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  contactTreatmentPlans,
  treatmentPlans,
  type ContactTreatmentPlanRow,
  type TreatmentPlanRow,
} from "../db/schema";
import { foldKey } from "../feeds/feeds.server";
import { t } from "@/lib/i18n";

/**
 * Plany leczenia — materiały, które placówka pisze raz, a wysyła setki razy.
 *
 * Plan dietetyczny po bariatrii, zalecenia pozabiegowe, przygotowanie do
 * kolonoskopii. Dziś każda taka rzecz żyje w Wordzie i jest wklejana do maila,
 * przez co po pół roku krąży pięć wersji i nikt nie wie, którą dostał pacjent.
 * Tutaj plan ma jedno miejsce, a wiadomość odwołuje się do niego znacznikiem.
 *
 * **Nazwa jest kluczem** — wchodzi wprost do `%%PLAN:nazwa%%`, dokładnie tak
 * jak nazwa feedu wchodzi do `%%FEED:…%%`. Stąd wymóg unikalności i stąd
 * ostrzeżenie przy zmianie nazwy: treści, które się na nią powołują, przestaną
 * trafiać.
 */

export interface PlanInput {
  id?: string;
  name: string;
  category: string;
  description: string;
  html: string;
  active: boolean;
}

export interface PlanSaveResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function listPlans(includeInactive = true): Promise<TreatmentPlanRow[]> {
  const db = getDb();
  const rows = await db.select().from(treatmentPlans).orderBy(treatmentPlans.name).all();
  return includeInactive ? rows : rows.filter((p) => p.active);
}

export async function savePlan(input: PlanInput): Promise<PlanSaveResult> {
  const db = getDb();
  const name = input.name.trim();
  if (!name) return { ok: false, error: t("Plan musi mieć nazwę.") };
  // `%` i `|` rozbiłyby znacznik w treści wiadomości — lepiej nie wpuścić ich
  // do nazwy, niż tłumaczyć potem, czemu akurat ten plan się nie wstawia.
  if (/[%|]/.test(name)) {
    return {
      ok: false,
      error: t("Nazwa nie może zawierać znaków % ani | — kolidują ze znacznikiem."),
    };
  }

  const all = await db.select().from(treatmentPlans).all();
  const clash = all.find((p) => foldKey(p.name) === foldKey(name) && p.id !== input.id);
  if (clash) {
    return { ok: false, error: t('Plan o nazwie „{name}" już istnieje.', { name: clash.name }) };
  }

  const now = Date.now();
  if (input.id) {
    const existing = all.find((p) => p.id === input.id);
    if (!existing) return { ok: false, error: t("Ten plan już nie istnieje.") };
    await db
      .update(treatmentPlans)
      .set({
        name,
        category: input.category.trim(),
        description: input.description.trim(),
        html: input.html,
        active: input.active,
        updatedAt: now,
      })
      .where(eq(treatmentPlans.id, input.id));
    return { ok: true, id: input.id };
  }

  const id = randomUUID();
  await db.insert(treatmentPlans).values({
    id,
    name,
    category: input.category.trim(),
    description: input.description.trim(),
    html: input.html,
    active: input.active,
    createdAt: now,
    updatedAt: now,
  });
  return { ok: true, id };
}

/**
 * Usunięcie planu kasuje też historię przypisań (kaskada w schemacie).
 *
 * Świadomie, choć historia jest cenna: plan bez treści to w historii pusty
 * wiersz „przypisano coś, czego już nie ma". Kto chce zachować ślad, wyłącza
 * plan zamiast go kasować — i dlatego wyłączanie jest w interfejsie na
 * pierwszym miejscu, a kasowanie pyta o potwierdzenie.
 */
export async function deletePlan(id: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const row = await db.select().from(treatmentPlans).where(eq(treatmentPlans.id, id)).get();
  if (!row) return { ok: false, error: t("Ten plan już nie istnieje.") };
  await db.delete(contactTreatmentPlans).where(eq(contactTreatmentPlans.planId, id));
  await db.delete(treatmentPlans).where(eq(treatmentPlans.id, id));
  return { ok: true };
}

export interface AssignedPlan {
  assignmentId: string;
  planId: string;
  planName: string;
  category: string;
  assignedAt: number;
  assignedBy: string;
  note: string;
}

/** Historia planów pacjenta, od najnowszego. */
export async function contactPlans(contactId: string): Promise<AssignedPlan[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(contactTreatmentPlans)
    .where(eq(contactTreatmentPlans.contactId, contactId))
    .orderBy(desc(contactTreatmentPlans.assignedAt))
    .all();
  if (rows.length === 0) return [];
  const plans = await db.select().from(treatmentPlans).all();
  const byId = new Map(plans.map((p) => [p.id, p]));
  return rows.map((r) => {
    const plan = byId.get(r.planId);
    return {
      assignmentId: r.id,
      planId: r.planId,
      planName: plan?.name ?? t("(plan usunięty)"),
      category: plan?.category ?? "",
      assignedAt: r.assignedAt,
      assignedBy: r.assignedBy,
      note: r.note,
    };
  });
}

export async function assignPlan(args: {
  contactId: string;
  planId: string;
  assignedBy: string;
  note: string;
}): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const plan = await db
    .select()
    .from(treatmentPlans)
    .where(eq(treatmentPlans.id, args.planId))
    .get();
  if (!plan) return { ok: false, error: t("Ten plan już nie istnieje.") };

  // Ten sam plan przypisany drugi raz to zwykle omyłkowe dwukrotne kliknięcie,
  // a nie świadoma decyzja — historia zostaje czytelna, gdy tego nie dublujemy.
  const already = await db
    .select()
    .from(contactTreatmentPlans)
    .where(
      and(
        eq(contactTreatmentPlans.contactId, args.contactId),
        eq(contactTreatmentPlans.planId, args.planId),
      ),
    )
    .get();
  if (already)
    return { ok: false, error: t('Pacjent ma już przypisany plan „{name}".', { name: plan.name }) };

  await db.insert(contactTreatmentPlans).values({
    id: randomUUID(),
    contactId: args.contactId,
    planId: args.planId,
    assignedBy: args.assignedBy,
    note: args.note.trim(),
    assignedAt: Date.now(),
  });
  return { ok: true };
}

export async function unassignPlan(assignmentId: string): Promise<{ ok: boolean }> {
  await getDb().delete(contactTreatmentPlans).where(eq(contactTreatmentPlans.id, assignmentId));
  return { ok: true };
}

/** Ilu pacjentów ma dany plan — do listy w module Care. */
export async function planUsage(): Promise<Record<string, number>> {
  const rows = await getDb().select().from(contactTreatmentPlans).all();
  const out: Record<string, number> = {};
  for (const r of rows) out[r.planId] = (out[r.planId] ?? 0) + 1;
  return out;
}

/** Plan o tej nazwie — dopasowanie tolerancyjne, jak przy feedach. */
export async function planByName(name: string): Promise<TreatmentPlanRow | null> {
  const wanted = foldKey(name);
  const rows = await getDb().select().from(treatmentPlans).all();
  return rows.find((p) => foldKey(p.name) === wanted) ?? null;
}

/**
 * Ostatnio przypisany plan pacjenta — to podstawia `%%PLAN%%`.
 *
 * Ostatni, a nie „aktywny": pacjent po bariatrii przechodzi kolejno plan
 * przedoperacyjny, płynny i stały, a wiadomość ma zawsze nieść ten, na którym
 * pacjent jest teraz.
 */
export async function latestPlanFor(contactId: string): Promise<TreatmentPlanRow | null> {
  const db = getDb();
  const rows: ContactTreatmentPlanRow[] = await db
    .select()
    .from(contactTreatmentPlans)
    .where(eq(contactTreatmentPlans.contactId, contactId))
    .orderBy(desc(contactTreatmentPlans.assignedAt))
    .all();
  for (const r of rows) {
    const plan = await db
      .select()
      .from(treatmentPlans)
      .where(eq(treatmentPlans.id, r.planId))
      .get();
    if (plan) return plan;
  }
  return null;
}
