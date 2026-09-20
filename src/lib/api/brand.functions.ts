import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { appSettings } from "../db/schema";
import { getSessionUser } from "../auth/session.server";
import { t, localized } from "@/lib/i18n";

/**
 * Domyślny nagłówek i stopka wiadomości — dane placówki, nie ustawienie widoku.
 *
 * **Przeniesione z `localStorage`.** Logo, hasło i treść stopki
 * z adresem firmy leżały w przeglądarce, więc ktoś ustawiał je raz, a kolega
 * przy sąsiednim biurku dostawał z powrotem dane przykładowe („Klinika ABC,
 * ul. Zdrowa 12") — i mógł je tak wysłać pacjentom. To ta sama usterka co przy
 * szablonach, tylko cichsza: nic nie odmawiało działania, po prostu wychodziła
 * zła stopka.
 *
 * Trzymane w `app_settings` jako jeden JSON, a nie jako tabela z kolumnami:
 * to pięć pól jednej całości, ustawianych i czytanych zawsze razem.
 */

const KEY = "email-header-footer";

const schema = z.object({
  logoText: z.string().max(200).default(""),
  tagline: z.string().max(300).default(""),
  // Obrazy bywają wklejane jako data URI prosto z dysku — stąd sufit liczony
  // w setkach kilobajtów, a nie w długości adresu.
  logoImageUrl: z.string().max(2_000_000).default(""),
  footerText: z.string().max(5000).default(""),
  footerImageUrl: z.string().max(2_000_000).default(""),
});

export type BrandDefaults = z.infer<typeof schema>;

export const DEFAULT_BRAND: BrandDefaults = localized(() => ({
  logoText: "PRM Core",
  tagline: t("Klinika ABC — Zdrowie w dobrych rękach"),
  logoImageUrl: "",
  footerText: t(
    "© 2026 Klinika ABC Sp. z o.o., ul. Zdrowa 12, Warszawa\nWypisz się z tej listy w każdej chwili.",
  ),
  footerImageUrl: "",
}));

export const getBrandDefaults = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<BrandDefaults> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    const row = await getDb().select().from(appSettings).where(eq(appSettings.key, KEY)).get();
    if (!row) return DEFAULT_BRAND;
    const parsed = schema.safeParse(JSON.parse(row.value));
    // Zapis niezgodny z kształtem (np. po zmianie pól) nie może wywrócić modułu
    // — lepiej wrócić do wartości domyślnych niż pokazać pustą stronę.
    return parsed.success ? parsed.data : DEFAULT_BRAND;
  });

export const saveBrandDefaults = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(schema)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    await getDb()
      .insert(appSettings)
      .values({ key: KEY, value: JSON.stringify(data) })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(data) } });
    return { ok: true };
  });
