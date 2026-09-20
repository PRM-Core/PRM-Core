import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "./require-user";
import { z } from "zod";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { users } from "../db/schema";
import { getSessionUser } from "../auth/session.server";
import { verifyPassword } from "../auth/password.server";
import {
  beginTotpSetup,
  confirmTotpSetup,
  disableTotp,
  totpStatus,
  type TotpStatus,
} from "../auth/authenticator.server";
import { logStep } from "../engine/log.server";
import { t } from "@/lib/i18n";

// Konfiguracja aplikacji uwierzytelniającej z poziomu Ustawień → Bezpieczeństwo.
//
// Każda operacja dotyczy WYŁĄCZNIE zalogowanego użytkownika — nigdzie nie
// przyjmujemy `userId` z zewnątrz. Inaczej administrator (albo ktoś z jego
// sesją) mógłby przestawić drugi składnik na cudzym koncie.

export const getTotpStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async (): Promise<TotpStatus> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return totpStatus(user.id);
  });

export const startTotpSetup = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async (): Promise<{ qrDataUrl: string; manualKey: string }> => {
    const session = await getSessionUser();
    if (!session) throw new Error(t("Wymagane zalogowanie."));
    const user = await getDb().select().from(users).where(eq(users.id, session.id)).get();
    if (!user) throw new Error(t("Nie znaleziono konta."));

    const setup = await beginTotpSetup(user);
    // Kod QR rysowany na serwerze i wysyłany jako obraz w treści strony: adres
    // `otpauth://` niesie sekret, więc nie ma go po co wystawiać osobnym
    // adresem, pod który mógłby trafić ktoś inny.
    const qrDataUrl = await QRCode.toDataURL(setup.uri, { width: 240, margin: 1 });
    return { qrDataUrl, manualKey: setup.manualKey };
  });

export const confirmTotp = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ code: z.string().max(10) }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; recoveryCodes?: string[] }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    const result = await confirmTotpSetup(user.id, data.code);
    if (!result.ok) return { ok: false, error: result.error };

    await logStep({
      kind: "security",
      message: t("Włączono aplikację uwierzytelniającą dla konta {email}.", { email: user.email }),
      detail: { event: "totp-enabled", user: user.email },
    });
    return { ok: true, recoveryCodes: result.recoveryCodes };
  });

export const turnOffTotp = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ password: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const session = await getSessionUser();
    if (!session) throw new Error(t("Wymagane zalogowanie."));
    const user = await getDb().select().from(users).where(eq(users.id, session.id)).get();
    if (!user) throw new Error(t("Nie znaleziono konta."));

    // **Hasło przy wyłączaniu, nie przy włączaniu.** Włączenie drugiego
    // składnika podnosi ochronę i nikomu nie szkodzi; wyłączenie ją zdejmuje —
    // i to jest pierwsza rzecz, którą zrobiłby ktoś, kto usiadł przy
    // niezablokowanym komputerze.
    if (!(await verifyPassword(data.password, user.passwordHash))) {
      return { ok: false, error: t("Nieprawidłowe hasło.") };
    }

    await disableTotp(user.id);
    await logStep({
      kind: "security",
      message: t("WYŁĄCZONO aplikację uwierzytelniającą dla konta {email}.", { email: user.email }),
      detail: { event: "totp-disabled", user: user.email },
    });
    return { ok: true };
  });
