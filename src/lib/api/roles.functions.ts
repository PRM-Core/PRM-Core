import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { allowReporter, requireUser } from "./require-user";
import { t } from "@/lib/i18n";

/**
 * Reports for every role: finance and marketing over the same tables the
 * agent reads. Reading is open to the reviewer role; unit prices are set
 * by an administrator.
 */

export const getFinanceView = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async () => {
    const { financeView } = await import("../reports/roles.server");
    return financeView();
  });

export const getMarketingView = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async () => {
    const { marketingView } = await import("../reports/roles.server");
    return marketingView();
  });

export const saveUnitPricesFn = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      smsPartGrosze: z.number().int().min(0).max(100_000),
      emailPer1000Grosze: z.number().int().min(0).max(10_000_000),
    }),
  )
  .handler(async ({ data }) => {
    const { getSessionUser } = await import("../auth/session.server");
    const user = await getSessionUser();
    if (!user || user.role !== "admin") throw new Error(t("Ceny kanałów ustawia administrator."));
    const { saveUnitPrices } = await import("../reports/roles.server");
    await saveUnitPrices(data);
    return { ok: true as const };
  });
