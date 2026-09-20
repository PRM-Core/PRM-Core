import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./require-user";
import { INTEGRATIONS, isCredentialName, type IntegrationId } from "../credentials/catalog";
import { t } from "@/lib/i18n";

/**
 * Panel Integracje → Klucze i dane dostępowe.
 *
 * **Wyłącznie administrator** — także odczyt stanu. Rola marketing obsługuje
 * kampanie i nadawców, ale kluczy nie widzi i nie zmienia (w opisie ról:
 * „bez zmian technicznych"). Bramka jest tu, na serwerze: każda funkcja to
 * publiczny adres `/_serverFn/…`, więc ukrycie panelu w interfejsie niczego
 * by nie chroniło.
 *
 * **Żadna funkcja nie zwraca wartości sekretu.** Jedyny wyjątek to świeżo
 * wygenerowany token MCP — raz, w odpowiedzi na jego wygenerowanie.
 */

async function requireAdmin() {
  const { getSessionUser } = await import("@/lib/auth/session.server");
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    throw new Error(t("Klucze i dane dostępowe może zmieniać tylko administrator."));
  }
  return { user, label: `${user.firstName} ${user.lastName}`.trim() || user.email };
}

const INTEGRATION_IDS = INTEGRATIONS.map((i) => i.id) as [IntegrationId, ...IntegrationId[]];

export const getCredentialsPanel = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async () => {
    const { getSessionUser } = await import("@/lib/auth/session.server");
    const user = await getSessionUser();
    if (user?.role !== "admin") return { allowed: false as const };
    const { listCredentialStatuses, masterKeyStatus } = await import("../credentials/store.server");
    return {
      allowed: true as const,
      masterKey: masterKeyStatus(),
      statuses: await listCredentialStatuses(),
    };
  });

export const saveIntegrationCredentials = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      values: z
        .record(z.string(), z.string().max(2000))
        .refine((v) => Object.keys(v).every((k) => isCredentialName(k)), {
          message: "Unknown credential name.",
        }),
    }),
  )
  .handler(async ({ data }) => {
    const { label } = await requireAdmin();
    const { saveCredentials } = await import("../credentials/store.server");
    const saved = await saveCredentials(data.values, label);
    return { saved };
  });

export const clearIntegrationCredential = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      name: z.string().refine((n) => isCredentialName(n), { message: "Unknown credential name." }),
    }),
  )
  .handler(async ({ data }) => {
    const { label } = await requireAdmin();
    const { clearCredential } = await import("../credentials/store.server");
    await clearCredential(data.name, label);
    return { ok: true as const };
  });

export const checkIntegrationConnection = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ integration: z.enum(INTEGRATION_IDS) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { checkIntegration } = await import("../credentials/checks.server");
    return checkIntegration(data.integration);
  });

export const generateMcpAccessToken = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => {
    const { label } = await requireAdmin();
    const { generateMcpToken } = await import("../credentials/store.server");
    return { token: await generateMcpToken(label) };
  });

/** Przeniesienie wartości używanych dziś z `.env` do panelu — bez zwracania ich. */
export const importIntegrationCredentialsFromEnv = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => {
    const { label } = await requireAdmin();
    const { importCredentialsFromEnv } = await import("../credentials/store.server");
    return importCredentialsFromEnv(label);
  });
