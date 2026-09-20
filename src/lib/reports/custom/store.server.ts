import { randomUUID } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../db/client.server";
import { customReports, users } from "../../db/schema";
import { definitionSchema, widgetProblems, type ReportDefinition } from "./catalog";
import { t } from "@/lib/i18n";

/**
 * Własne raporty — zapis i odczyt.
 *
 * Zapisujemy wyłącznie definicje, które da się policzyć: każdy kafelek musi
 * przejść `widgetProblems`. Raport zapisany z kafelkiem „do dokończenia"
 * otwierałby się potem z błędem u kogoś, kto go nie budował i nie wie, co
 * poprawić.
 */

export class ReportStoreError extends Error {}

export interface ReportSummary {
  id: string;
  name: string;
  description: string;
  widgetCount: number;
  updatedAt: number;
  updatedByName: string;
}

export interface ReportFull extends ReportSummary {
  definition: ReportDefinition;
}

async function namesOf(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await getDb()
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.email]));
}

/**
 * Definicja z bazy przepuszczona przez schemat. Raport zapisany przed zmianą
 * kształtu definicji nie może wywrócić listy — wraca wtedy pusty układ.
 */
function readDefinition(raw: unknown): ReportDefinition {
  const parsed = definitionSchema.safeParse(raw);
  return parsed.success ? parsed.data : { range: { preset: "30", from: "", to: "" }, widgets: [] };
}

export async function listReports(): Promise<ReportSummary[]> {
  const rows = await getDb().select().from(customReports).orderBy(desc(customReports.updatedAt));
  const names = await namesOf(rows.map((r) => r.updatedBy));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    widgetCount: readDefinition(r.definition).widgets.length,
    updatedAt: r.updatedAt,
    updatedByName: names.get(r.updatedBy) ?? "",
  }));
}

export async function getReport(id: string): Promise<ReportFull | null> {
  const r = await getDb().select().from(customReports).where(eq(customReports.id, id)).get();
  if (!r) return null;
  const definition = readDefinition(r.definition);
  const names = await namesOf([r.updatedBy]);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    widgetCount: definition.widgets.length,
    updatedAt: r.updatedAt,
    updatedByName: names.get(r.updatedBy) ?? "",
    definition,
  };
}

export async function saveReport(input: {
  id?: string;
  name: string;
  description: string;
  definition: unknown;
  userId: string;
  now?: number;
}): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new ReportStoreError(t("Nadaj raportowi nazwę."));
  const parsed = definitionSchema.safeParse(input.definition);
  if (!parsed.success) throw new ReportStoreError(t("Raport ma niepoprawną definicję."));
  const definition = parsed.data;

  const ids = new Set<string>();
  for (const [i, w] of definition.widgets.entries()) {
    if (ids.has(w.id)) throw new ReportStoreError(t("Dwa kafelki mają ten sam identyfikator."));
    ids.add(w.id);
    const problems = widgetProblems(w);
    if (problems.length > 0) {
      throw new ReportStoreError(`Kafelek ${i + 1}: ${problems[0]}`);
    }
  }

  const db = getDb();
  const now = input.now ?? Date.now();
  const description = input.description.trim();

  if (input.id) {
    const existing = await db
      .select({ id: customReports.id })
      .from(customReports)
      .where(eq(customReports.id, input.id))
      .get();
    if (!existing) throw new ReportStoreError(t("Tego raportu już nie ma — mógł zostać usunięty."));
    await db
      .update(customReports)
      .set({ name, description, definition, updatedBy: input.userId, updatedAt: now })
      .where(eq(customReports.id, input.id));
    return { id: input.id };
  }

  const id = randomUUID();
  await db.insert(customReports).values({
    id,
    name,
    description,
    definition,
    createdBy: input.userId,
    updatedBy: input.userId,
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}

export async function deleteReport(id: string): Promise<void> {
  await getDb().delete(customReports).where(eq(customReports.id, id));
}

export async function duplicateReport(id: string, userId: string): Promise<{ id: string }> {
  const original = await getReport(id);
  if (!original) throw new ReportStoreError(t("Tego raportu już nie ma — mógł zostać usunięty."));
  return saveReport({
    name: `${original.name} (kopia)`.slice(0, 120),
    description: original.description,
    definition: original.definition,
    userId,
  });
}
