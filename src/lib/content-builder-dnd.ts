import { makeBlock, type BlockType, type ContentBlock } from "./content-builder";

/**
 * Przeciąganie bloków — wspólne dla klasycznego edytora i Design Studia.
 *
 * **Jedna implementacja, dwa ekrany.** Kiedy Studio dostawało własną kopię
 * tej logiki, wystarczyłaby jedna poprawka w jednym miejscu, żeby te same
 * gesty zaczęły dawać różne wyniki — a wiadomość otwarta raz tu, raz tam to
 * ta sama treść w bazie. Ten sam powód, dla którego `inlinePatch`
 * i `attachmentIdsFromBlocks` też mają po jednym domu.
 *
 * **Ładunek jest napisem w `dataTransfer`**, bo HTML5 drag-and-drop nie potrafi
 * przenieść obiektu między elementami. Dwie postacie:
 *
 *   `new:heading`  — nowy blok z palety
 *   `move:3`       — blok, który już jest na płótnie, spod indeksu 3
 */

export function paletteDragPayload(type: BlockType): string {
  return `new:${type}`;
}

export function moveDragPayload(index: number): string {
  return `move:${index}`;
}

export interface DropResult {
  blocks: ContentBlock[];
  /** Blok, który po upuszczeniu ma zostać zaznaczony. `null` = bez zmiany. */
  selectId: string | null;
  /** `false`, gdy gest nic nie zmienił — wołający nie powinien wtedy zapisywać. */
  changed: boolean;
}

/**
 * Wstawienie albo przeniesienie bloku na wskazaną pozycję.
 *
 * `index` to **szczelina między blokami**, nie numer bloku: 0 znaczy „przed
 * pierwszym", `blocks.length` — „na końcu". Dzięki temu upuszczenie nad i pod
 * blokiem to dwa różne miejsca bez żadnego przypadku szczególnego.
 */
export function applyDrop(blocks: ContentBlock[], index: number, payload: string): DropResult {
  const unchanged: DropResult = { blocks, selectId: null, changed: false };
  if (!payload) return unchanged;

  if (payload.startsWith("new:")) {
    const type = payload.slice(4) as BlockType;
    const block = makeBlock(type);
    const next = [...blocks];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, block);
    return { blocks: next, selectId: block.id, changed: true };
  }

  if (payload.startsWith("move:")) {
    const from = Number(payload.slice(5));
    if (!Number.isInteger(from) || from < 0 || from >= blocks.length) return unchanged;
    // Upuszczenie tuż nad albo tuż pod sobą nie jest przeniesieniem. Bez tego
    // każde nieudane chwycenie bloku zapisywałoby „zmianę", której nie widać.
    if (index === from || index === from + 1) return unchanged;

    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    // Po wyjęciu bloku wszystkie szczeliny za nim przesuwają się o jeden.
    const adjusted = from < index ? index - 1 : index;
    next.splice(adjusted, 0, moved);
    return { blocks: next, selectId: moved.id, changed: true };
  }

  return unchanged;
}
