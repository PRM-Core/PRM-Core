import { t, localized } from "@/lib/i18n";
export type UserRole = "admin" | "marketing" | "reporter";

export const ROLE_LABELS: Record<UserRole, string> = localized(() => ({
  admin: "Administrator",
  marketing: "Marketing",
  reporter: t("Podgląd (reporter)"),
}));

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = localized(() => ({
  admin: t("Pełny dostęp — wszystkie funkcje, w tym zarządzanie użytkownikami i domenami."),
  marketing: t(
    "Dostęp do wszystkiego poza dodawaniem użytkowników i zmianami technicznymi domeny.",
  ),
  reporter: t(
    "Tylko odczyt: kontakty, kampanie, raporty i segmenty. Bez edycji, bez eksportu, bez wysyłek i bez ustawień. Loguje się samym hasłem, bez kodu weryfikacyjnego.",
  ),
}));

export const ALL_ROLES: UserRole[] = ["admin", "marketing", "reporter"];

/**
 * Rola wyłącznie do oglądania.
 *
 * **Ograniczenie jest po stronie serwera, nie interfejsu.** Ukrycie przycisku
 * niczego nie chroni: każda funkcja serwerowa to publiczny adres
 * `/_serverFn/<identyfikator>`, a identyfikatory leżą w kodzie strony (patrz
 * `api/require-user.ts`). Dlatego reporterowi **domyślnie odmawiamy wszystkiego**,
 * a wolno mu tylko to, co jawnie dopuszczono przez `allowReporter`.
 *
 * Przy takim ustawieniu pomyłka w jedną stronę oznacza „reporter czegoś nie
 * zobaczy" — niewygodne, ale bezpieczne. Przy odwrotnym domyśle pomyłka
 * oznaczałaby „reporter może usunąć kampanię", a tego nie widać, dopóki się nie
 * zdarzy.
 */
export function isReadOnlyRole(role: string | null | undefined): boolean {
  return role === "reporter";
}
