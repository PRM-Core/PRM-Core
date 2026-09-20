import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { appSettings, contentItems } from "../db/schema";
import { shouldSeedDemoData } from "../db/demo-seed.server";
import type { BuilderKind, ContentItem } from "../content-builder";
import { contentItemNames } from "../content/content-items.server";
import { warsawToday } from "../visits/warsaw-time";
import { t } from "@/lib/i18n";

/**
 * Treści kreatora trzymane po stronie serwera.
 *
 * **Zastępuje `localStorage`.** Powód w komentarzu przy tabeli `contentItems`
 * w schemacie: treść w przeglądarce znaczyła, że ten sam pop-up istnieje
 * w Arc, a nie istnieje w Safari — i że wyczyszczenie danych przeglądarki
 * kasuje pracę bez śladu.
 */

const itemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["popup", "newsletter", "email", "sms"]),
  name: z.string(),
  source: z.enum(["blocks", "zip", "html"]).default("blocks"),
  // Bloki i konfiguracja pop-upu przechodzą bez walidacji kształtu: to struktura
  // kreatora, która zmienia się razem z nim, a zod-owy opis rozjeżdżałby się
  // z nią przy każdym nowym typie bloku. Zawartość i tak renderujemy my sami.
  blocks: z.array(z.unknown()).default([]),
  smsBody: z.string().default(""),
  html: z.string().default(""),
  fileNames: z.array(z.string()).nullable().default(null),
  popupConfig: z.unknown().nullable().default(null),
  status: z.enum(["draft", "ready"]).default("draft"),
  attachments: z.array(z.string()).nullable().default(null),
  senderId: z.string().max(80).default(""),
  // Ustawienia wyglądu z zakładki „Style" w Studiu. Jak `blocks` — bez opisu
  // kształtu, bo lista pól rośnie razem z panelem, a wartości i tak są napisami.
  style: z.record(z.string(), z.string()).nullable().default(null),
  updatedAt: z.string(),
});

type Row = typeof contentItems.$inferSelect;

function toItem(row: Row): ContentItem {
  return {
    id: row.id,
    kind: row.kind as ContentItem["kind"],
    name: row.name,
    source: row.source as ContentItem["source"],
    blocks: (row.blocks ?? []) as ContentItem["blocks"],
    smsBody: row.smsBody,
    html: row.html,
    fileNames: row.fileNames ?? undefined,
    popupConfig: row.popupConfig ?? undefined,
    status: row.status as ContentItem["status"],
    attachments: row.attachments ?? undefined,
    senderId: row.senderId ?? "",
    style: row.style ?? undefined,
    updatedAt: row.updatedAt,
  };
}

/**
 * Wszystkie treści danego rodzaju.
 *
 * **Przykładowe treści nie są już doklejane z kodu przy każdym odczycie.**
 * Wcześniej lista powstawała jako „to, co w bazie" + „szablony z repozytorium",
 * więc skasowanie przykładu działało do pierwszego odświeżenia — wracał, bo
 * pochodził z kodu, nie z bazy — przykładowych maili, newsletterów i pop-upów
 * nie dało się usunąć.
 *
 * Teraz przykłady są **wsiewane raz** (`seedContentItems`, tylko na instalacji
 * demonstracyjnej) i od tej chwili są zwykłymi wierszami — edytowalnymi
 * i usuwalnymi na stałe.
 */
export const getContentItems = createServerFn({ method: "POST" })
  .middleware([allowReporter])
  .inputValidator(z.object({ kind: z.enum(["popup", "newsletter", "email", "sms"]) }))
  .handler(async ({ data }): Promise<ContentItem[]> => {
    const rows = await getDb().select().from(contentItems).where(eq(contentItems.kind, data.kind));
    return rows.map(toItem);
  });

/**
 * Jednorazowe wsianie przykładowych treści.
 *
 * Woła je widok przy pierwszym wejściu na moduł. **Warunkiem jest pusta
 * tabela dla tego rodzaju ORAZ instalacja demonstracyjna** — na produkcji
 * przykłady nie powstają w ogóle, a te, które już tam są, znikną z listy
 * i przestaną wracać.
 *
 * Znacznik `seeded` w tabeli ustawień, a nie „czy tabela jest pusta": bez
 * niego skasowanie wszystkich treści przywracałoby przykłady przy następnym
 * wejściu, co jest dokładnie tym zachowaniem, które naprawiamy.
 */
export const seedContentItemsOnce = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      kind: z.enum(["popup", "newsletter", "email", "sms"]),
      items: z.array(itemSchema),
    }),
  )
  .handler(async ({ data }): Promise<{ seeded: number }> => {
    if (!shouldSeedDemoData()) return { seeded: 0 };

    const db = getDb();
    const markerKey = `content-seeded:${data.kind}`;
    const marker = await db.select().from(appSettings).where(eq(appSettings.key, markerKey)).get();
    if (marker) return { seeded: 0 };

    const existing = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(eq(contentItems.kind, data.kind));
    const known = new Set(existing.map((r) => r.id));

    const now = Date.now();
    let seeded = 0;
    for (const item of data.items) {
      if (known.has(item.id)) continue;
      await db.insert(contentItems).values({
        id: item.id,
        kind: item.kind,
        name: item.name,
        source: item.source,
        blocks: item.blocks,
        smsBody: item.smsBody,
        html: item.html,
        fileNames: item.fileNames,
        popupConfig: (item.popupConfig ?? null) as never,
        status: item.status,
        updatedAt: item.updatedAt,
        createdAt: now,
      });
      seeded++;
    }
    await db.insert(appSettings).values({ key: markerKey, value: String(now) });
    return { seeded };
  });

/**
 * Zapis całej listy danego rodzaju.
 *
 * **Pełna podmiana w obrębie rodzaju**, bo taka była semantyka `saveItems()`
 * i taki jest kształt wywołań w kreatorze: po każdej zmianie leci cała lista.
 *
 * **Świadome ograniczenie**: gdyby dwie osoby redagowały ten sam rodzaj treści
 * jednocześnie w dwóch przeglądarkach, zapis późniejszy wygra i może skasować
 * pozycję dodaną przez drugą. To i tak nieporównanie lepsze niż stan sprzed tej
 * zmiany, gdzie każda przeglądarka miała **własny, niewidoczny dla innych**
 * zestaw treści. Gdyby okazało się realnym problemem, wyjściem są operacje
 * punktowe (zapis i usunięcie pojedynczej pozycji) zamiast podmiany listy.
 */
export const saveContentItems = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      kind: z.enum(["popup", "newsletter", "email", "sms"]),
      items: z.array(itemSchema),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: true; saved: number }> => {
    const db = getDb();
    const now = Date.now();
    await db.delete(contentItems).where(eq(contentItems.kind, data.kind));
    for (const item of data.items) {
      await db.insert(contentItems).values({
        id: item.id,
        kind: item.kind,
        name: item.name,
        source: item.source,
        blocks: item.blocks,
        smsBody: item.smsBody,
        html: item.html,
        fileNames: item.fileNames,
        popupConfig: (item.popupConfig ?? null) as never,
        status: item.status,
        attachments: item.attachments,
        // **Te dwa pola były przyjmowane i odczytywane, ale nigdy zapisywane.**
        // Efekt: wybrany nadawca i cała zakładka „Style" znikały przy pierwszym
        // zapisie — funkcja wyglądała na działającą aż do przeładowania strony.
        senderId: item.senderId,
        style: (item.style ?? null) as never,
        updatedAt: item.updatedAt,
        createdAt: now,
      });
    }
    return { ok: true, saved: data.items.length };
  });

/**
 * Przeniesienie wiadomości do innego modułu (Newsletter / E-mail / Pop-up).
 *
 * **Zmienia `kind` istniejącego wiersza, nie tworzy kopii.** Kopiowanie
 * dawałoby dwie wiadomości o tej samej nazwie, z których jedna cicho
 * dezaktualizuje się przy każdej poprawce w drugiej — a przy wysyłce nikt nie
 * wie, którą wybrał.
 *
 * Bloków **nie filtrujemy** przy przenoszeniu, choć paleta pop-upu jest węższa
 * niż e-maila. Wyrzucenie bloku, którego pop-up nie ma w palecie, byłoby cichą
 * stratą pracy przy operacji wyglądającej na przełożenie z półki na półkę;
 * renderer i tak pomija to, czego nie umie narysować, a Studio ostrzega przed
 * zapisem, wypisując, co się nie przeniesie.
 */
export const moveContentItem = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      id: z.string().min(1),
      to: z.enum(["popup", "newsletter", "email", "sms"]),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const db = getDb();
    const row = await db.select().from(contentItems).where(eq(contentItems.id, data.id)).get();
    if (!row) return { ok: false, error: t("Tej wiadomości już nie ma.") };
    if (row.kind === data.to) return { ok: true };
    // SMS to edytor zwykłego tekstu bez płótna — wiadomość z blokami trafiłaby
    // tam jako pusta. Blokujemy zamiast po cichu gubić treść.
    if (data.to === "sms" || row.kind === "sms") {
      return { ok: false, error: t("SMS-a nie da się przenieść — to zwykły tekst, nie bloki.") };
    }
    await db
      .update(contentItems)
      .set({ kind: data.to, updatedAt: warsawToday() })
      .where(eq(contentItems.id, data.id));
    return { ok: true };
  });

/**
 * Jednorazowe przeniesienie treści z `localStorage` do bazy.
 *
 * Wywoływane przy pierwszym wejściu na moduł: przeglądarka oddaje to, co ma
 * u siebie, a serwer **dokłada wyłącznie pozycje o nieznanym `id`**. Dzięki
 * temu druga przeglądarka, wchodząc później ze swoją kopią, dorzuca swoje
 * pop-upy zamiast nadpisywać cudze — a ponowne wejście niczego nie duplikuje.
 *
 * Nadpisywanie po `id` byłoby gorsze: treść mogła zostać zmieniona już po
 * stronie serwera, a stara kopia w przeglądarce cofnęłaby tę zmianę.
 */
export const importLocalContentItems = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      kind: z.enum(["popup", "newsletter", "email", "sms"]),
      items: z.array(itemSchema),
    }),
  )
  .handler(async ({ data }): Promise<{ added: number; skipped: number }> => {
    const db = getDb();
    const existing = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(eq(contentItems.kind, data.kind));
    const known = new Set(existing.map((r) => r.id));
    const now = Date.now();
    let added = 0;
    for (const item of data.items) {
      if (known.has(item.id)) continue;
      await db.insert(contentItems).values({
        id: item.id,
        kind: item.kind,
        name: item.name,
        source: item.source,
        blocks: item.blocks,
        smsBody: item.smsBody,
        html: item.html,
        fileNames: item.fileNames,
        popupConfig: (item.popupConfig ?? null) as never,
        status: item.status,
        updatedAt: item.updatedAt,
        createdAt: now,
      });
      added++;
    }
    return { added, skipped: data.items.length - added };
  });

/**
 * Same nazwy treści — do list wyboru szablonu.
 *
 * Osobno od `getContentItems`, bo listy wyboru (węzeł automatyzacji, podpowiedzi
 * dla agenta, wybór treści przy segmencie) potrzebują wyłącznie nazw, a treść
 * newslettera to dziesiątki kilobajtów HTML-a na pozycję. Wcześniej brały to
 * z `localStorage`, więc pokazywały szablony tylko tej jednej przeglądarki.
 */
export const getContentItemNames = createServerFn({ method: "POST" })
  .middleware([allowReporter])
  .inputValidator(
    z.object({ kinds: z.array(z.enum(["popup", "newsletter", "email", "sms"])).min(1) }),
  )
  .handler(async ({ data }): Promise<Record<string, string[]>> => {
    const out: Record<string, string[]> = {};
    for (const kind of data.kinds) {
      out[kind] = await contentItemNames(kind as BuilderKind);
    }
    return out;
  });
