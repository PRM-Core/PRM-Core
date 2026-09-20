import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { allowReporter, requireUser } from "./require-user";
import { getSessionUser } from "../auth/session.server";
import { rangeSchema } from "../reports/custom/catalog";
import { listFilterValues, runWidget } from "../reports/custom/query.server";
import type { WidgetData } from "../reports/custom/results";
import {
  deleteReport,
  duplicateReport,
  getReport,
  listReports,
  saveReport,
  type ReportFull,
  type ReportSummary,
} from "../reports/custom/store.server";
import { t } from "@/lib/i18n";

// Raporty → Własne raporty.
//
// Odczyt i liczenie: także konto podglądu (`allowReporter`) — raporty są po to,
// żeby je oglądać. Tworzenie, zmiana, kopiowanie i usuwanie: tylko pełne konta.
// Liczenie przyjmuje kafelek wprost z ekranu (podgląd podczas budowania), ale
// serwer i tak sprawdza go z katalogiem, zanim cokolwiek zapyta — patrz
// `query.server.ts`.

export const listCustomReports = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<ReportSummary[]> => listReports());

export const getCustomReport = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ id: z.string().min(1).max(64) }))
  .handler(async ({ data }): Promise<ReportFull | null> => getReport(data.id));

export const saveCustomReport = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      id: z.string().min(1).max(64).optional(),
      name: z.string().max(120),
      description: z.string().max(500).default(""),
      definition: z.unknown(),
    }),
  )
  .handler(async ({ data }): Promise<{ id: string }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return saveReport({
      id: data.id,
      name: data.name,
      description: data.description,
      definition: data.definition,
      userId: user.id,
    });
  });

export const deleteCustomReport = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string().min(1).max(64) }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await deleteReport(data.id);
    return { ok: true };
  });

export const duplicateCustomReport = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string().min(1).max(64) }))
  .handler(async ({ data }): Promise<{ id: string }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return duplicateReport(data.id, user.id);
  });

export const runCustomReportWidget = createServerFn({ method: "POST" })
  .middleware([allowReporter])
  .inputValidator(z.object({ widget: z.unknown(), range: rangeSchema }))
  .handler(
    async ({ data }): Promise<WidgetData> => runWidget({ widget: data.widget, range: data.range }),
  );

export const getCustomReportFilterValues = createServerFn({ method: "POST" })
  .middleware([allowReporter])
  .inputValidator(
    z.object({ source: z.string().max(40), dimension: z.string().max(40), range: rangeSchema }),
  )
  .handler(
    async ({ data }): Promise<{ value: string; label: string; count: number }[]> =>
      listFilterValues(data),
  );
