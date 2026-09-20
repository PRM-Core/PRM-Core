import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { BUILTIN_STATUSES, contactStatuses, contacts, type ContactStatusRow } from "../db/schema";
import { t } from "@/lib/i18n";

/**
 * Statusy kontaktu jako dane, nie jako lista w kodzie.
 *
 * Kiedyś były czterema wartościami wpisanymi w typ. Placówki potrzebują
 * własnych (np. „Lekarze"), więc mieszkają teraz w tabeli — a kod, który
 * potrzebuje etykiety albo barwy, pyta o nie zamiast wiedzieć.
 */

/** Wsiewa cztery wbudowane statusy. Bezpieczne do wielokrotnego wywołania. */
export async function ensureStatusesSeeded(): Promise<void> {
  const db = getDb();
  const existing = await db.select({ key: contactStatuses.key }).from(contactStatuses);
  const known = new Set(existing.map((r) => r.key));
  const now = Date.now();
  for (const [i, s] of BUILTIN_STATUSES.entries()) {
    if (known.has(s.key)) continue;
    // `onConflictDoNothing`: kilka żądań naraz na świeżej bazie (np. kafelki
    // raportu liczone równolegle) widzi pustą tabelę i każde próbuje wstawić
    // te same statusy. Bez tego wszystkie poza pierwszym kończyły się błędem
    // unikalnego klucza, choć stan końcowy byłby ten sam.
    await db
      .insert(contactStatuses)
      .values({
        key: s.key,
        label: s.label,
        color: s.color,
        builtin: 1,
        sortOrder: i,
        createdAt: now,
      })
      .onConflictDoNothing();
  }
}

export async function listStatuses(): Promise<ContactStatusRow[]> {
  await ensureStatusesSeeded();
  return getDb().select().from(contactStatuses).orderBy(asc(contactStatuses.sortOrder));
}

/**
 * Klucz z etykiety — `Lekarze` → `lekarze`, `Nowy pacjent` → `nowy_pacjent`.
 *
 * Klucz jest **niezmienny po utworzeniu**: siedzi w `contacts.status`
 * i w definicjach segmentów, więc jego zmiana osierociłaby jedno i drugie.
 * Stąd generowanie z etykiety tylko raz, przy zakładaniu.
 */
function statusKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => "acelnoszz"["ąćęłńóśźż".indexOf(ch)])
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

export async function createStatus(input: {
  label: string;
  color: string;
}): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const label = input.label.trim();
  if (!label) return { ok: false, error: t("Podaj nazwę statusu.") };
  const key = statusKey(label);
  if (!key) return { ok: false, error: t("Nazwa musi zawierać litery lub cyfry.") };

  const db = getDb();
  await ensureStatusesSeeded();
  const clash = await db.select().from(contactStatuses).where(eq(contactStatuses.key, key)).get();
  if (clash)
    return {
      ok: false,
      error: t('Status „{label}" ma już taki klucz ({key}).', { label: clash.label, key: key }),
    };

  const count = (await db.select().from(contactStatuses)).length;
  await db.insert(contactStatuses).values({
    key,
    label,
    color: input.color || "oklch(0.62 0.17 300)",
    builtin: 0,
    sortOrder: count,
    createdAt: Date.now(),
  });
  return { ok: true, key };
}

/** Zmiana nazwy i barwy. Klucza nie ruszamy — uzasadnienie przy `statusKey`. */
export async function renameStatus(key: string, label: string, color: string): Promise<void> {
  await getDb()
    .update(contactStatuses)
    .set({ label: label.trim() || key, color })
    .where(eq(contactStatuses.key, key));
}

/**
 * Usunięcie statusu.
 *
 * **Blokowane, gdy używa go choć jeden kontakt** — inaczej zostałyby kartoteki
 * ze statusem, którego nikt nie potrafi nazwać, niewidoczne w żadnym filtrze.
 * Komunikat podaje liczbę, żeby dało się je najpierw przenieść.
 */
export async function deleteStatus(key: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const row = await db.select().from(contactStatuses).where(eq(contactStatuses.key, key)).get();
  if (!row) return { ok: false, error: t("Nie znaleziono statusu.") };
  if (row.builtin) {
    return {
      ok: false,
      error: t("Statusu wbudowanego nie można usunąć — można zmienić jego nazwę."),
    };
  }

  const used = await db
    .select({ n: sql<number>`count(*)` })
    .from(contacts)
    .where(eq(contacts.status, key))
    .get();
  const n = Number(used?.n ?? 0);
  if (n > 0) {
    return {
      ok: false,
      error: t("Status ma {n} {v1}. Przenieś je najpierw na inny status.", {
        n: n,
        v1: n === 1 ? "kontakt" : t("kontaktów"),
      }),
    };
  }

  await db.delete(contactStatuses).where(eq(contactStatuses.key, key));
  return { ok: true };
}
