import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contentItems } from "../db/schema";
import { DEFAULT_POPUP_CONFIG, type BuilderKind, type ContentItem } from "../content-builder";
import {
  attachmentIdsFromBlocks,
  mergeAttachmentIds,
  renderContentItemToFragment,
  renderContentItemToHtml,
} from "../content-builder-html";

/**
 * Treści kreatora — odczyt po stronie serwera.
 *
 * **Po co to istnieje.** Treści przeniesiono do bazy, ale połowa
 * aplikacji dalej czytała je z `localStorage` przez `getAllContentItems`.
 * Efekt: szablon utworzony na jednym komputerze nie istniał na drugim —
 * strona wysyłki pokazywała „nie znaleziono szablonu w tej przeglądarce"
 * i nie dawała nic wysłać.
 *
 * Renderer (`content-builder-html.ts`) jest czystą funkcją bez DOM-u, więc
 * serwer potrafi złożyć HTML sam. Dzięki temu przeglądarka nie musi już
 * **przynosić treści** przy wysyłce ani przy publikacji szablonów
 * automatyzacji — podaje tylko nazwę, a resztą zajmuje się serwer.
 */

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
    updatedAt: row.updatedAt,
  };
}

export async function listContentItems(kind: BuilderKind): Promise<ContentItem[]> {
  const rows = await getDb().select().from(contentItems).where(eq(contentItems.kind, kind));
  return rows.map(toItem);
}

/**
 * Treść o tej nazwie.
 *
 * Porównanie bez rozróżniania wielkości liter, bo nazwa jest tym, co człowiek
 * wpisuje w węźle automatyzacji i w adresie strony wysyłki — a „Demencja"
 * i „demencja" to dla niego ten sam szablon.
 */
export async function findContentItem(
  kind: BuilderKind,
  name: string,
): Promise<ContentItem | null> {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const items = await listContentItems(kind);
  return items.find((i) => i.name.trim().toLowerCase() === wanted) ?? null;
}

export interface RenderedContent {
  contentItemId: string;
  name: string;
  /** Pusty dla SMS-a. */
  html: string;
  /** Pusty poza SMS-em. */
  smsBody: string;
  attachments: string[];
  /** Nazwa nadawcy wybrana w edytorze. */
  senderId: string;
  popupConfig: unknown;
}

/**
 * Treść złożona do postaci, w jakiej idzie do migawki.
 *
 * **Bez próbki personalizacji** — znaczniki zostają w HTML-u, a silnik
 * podstawia je per odbiorca. Jedna migawka obsługuje cały segment.
 */
export function renderContentItem(item: ContentItem): RenderedContent {
  return {
    contentItemId: item.id,
    name: item.name,
    html:
      item.kind === "sms"
        ? ""
        : item.kind === "popup"
          ? renderContentItemToFragment(item)
          : renderContentItemToHtml(item),
    smsBody: item.kind === "sms" ? (item.smsBody ?? "") : "",
    // Załączniki dla wiadomości e-mail — z dwóch źródeł naraz: menu
    // „Załączniki" na liście oraz bloków „Załączniki" w treści. Sklejane
    // **tutaj**, w jednym miejscu, bo migawkę czytają trzy różne ścieżki
    // wysyłki (kampania, automatyzacja, wysyłka testowa); dokładanie tego
    // w każdej z nich osobno skończyłoby się tym, że jedna zostaje w tyle.
    attachments:
      item.kind === "email" || item.kind === "newsletter"
        ? mergeAttachmentIds(item.attachments ?? [], attachmentIdsFromBlocks(item.blocks ?? []))
        : [],
    senderId: item.senderId ?? "",
    popupConfig: item.kind === "popup" ? (item.popupConfig ?? DEFAULT_POPUP_CONFIG) : null,
  };
}

/** Nazwy treści danego rodzaju — do list wyboru w interfejsie. */
export async function contentItemNames(kind: BuilderKind): Promise<string[]> {
  const items = await listContentItems(kind);
  return items.map((i) => i.name).sort((a, b) => a.localeCompare(b, "pl"));
}
