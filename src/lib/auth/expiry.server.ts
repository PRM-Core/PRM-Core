import { and, isNotNull, lte } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { users } from "../db/schema";
import { logStep } from "../engine/log.server";
import { t } from "@/lib/i18n";
import { deleteUserAccount } from "./delete-account.server";

/**
 * Sprzątanie kont po terminie ważności.
 *
 * **Dlaczego kasujemy, a nie tylko blokujemy.** Konto założone na czas audytu
 * ma zniknąć, a nie zostać jako zablokowany wiersz — inaczej po pół roku nikt
 * nie wie, czy „konto podglądu" w spisie to relikt testu, czy coś, z czego ktoś
 * korzysta. Zablokowane konto jest też nadal kontem: wystarczy, że ktoś zdejmie
 * flagę.
 *
 * **Kasujemy razem z sesjami i urządzeniami.** Sam wiersz użytkownika nie
 * wystarcza: otwarte okno przeglądarki audytora żyłoby dalej do końca ważności
 * ciasteczka.
 */
export async function purgeExpiredAccounts(now = Date.now()): Promise<number> {
  const db = getDb();

  const wygasle = await db
    .select()
    .from(users)
    .where(and(isNotNull(users.expiresAt), lte(users.expiresAt, now)));

  for (const konto of wygasle) {
    await deleteUserAccount(konto.id);

    // Wpis w dzienniku, bo zniknięcie konta bez śladu wygląda jak awaria.
    await logStep({
      kind: "action",
      message: t("Konto {email} ({role}) wygasło i zostało usunięte razem z sesjami.", {
        email: konto.email,
        role: konto.role,
      }),
      detail: { source: "konto-wygasa", email: konto.email, rola: konto.role },
    });
  }

  return wygasle.length;
}
