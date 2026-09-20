import { newWidget, type ReportWidget, type WidgetType, WIDGET_TYPE_BY_KEY } from "./catalog";

/**
 * Układ kafelków raportu — przeciąganie i przestawianie.
 *
 * Ten sam wzorzec co `content-builder-dnd.ts`: ładunek przeciągania jest
 * napisem w `dataTransfer` (HTML5 nie przenosi obiektów), a miejsce upuszczenia
 * to **szczelina między kafelkami**, nie numer kafelka — 0 znaczy „przed
 * pierwszym", `widgets.length` znaczy „na końcu".
 *
 *   `new:bar`  — nowy kafelek z palety
 *   `move:3`   — kafelek, który już jest w raporcie, spod indeksu 3
 *
 * Przeciąganie nie działa z klawiatury ani na części ekranów dotykowych,
 * dlatego ekran ma też strzałki „wyżej / niżej" — `moveBy` robi to samo.
 */

const PAYLOAD_PREFIX = "prm-raport:";

export function paletteDragPayload(type: WidgetType): string {
  return `${PAYLOAD_PREFIX}new:${type}`;
}

export function moveDragPayload(index: number): string {
  return `${PAYLOAD_PREFIX}move:${index}`;
}

export type ParsedPayload = { kind: "new"; type: WidgetType } | { kind: "move"; from: number };

/**
 * Ładunek z przeciągania. Obcy napis (np. tekst przeciągnięty z innej karty)
 * daje `null` — upuszczenie go na raport nic nie robi.
 */
export function parsePayload(raw: string): ParsedPayload | null {
  if (!raw.startsWith(PAYLOAD_PREFIX)) return null;
  const body = raw.slice(PAYLOAD_PREFIX.length);
  if (body.startsWith("new:")) {
    const type = body.slice(4) as WidgetType;
    return WIDGET_TYPE_BY_KEY.has(type) ? { kind: "new", type } : null;
  }
  if (body.startsWith("move:")) {
    const from = Number(body.slice(5));
    return Number.isInteger(from) && from >= 0 ? { kind: "move", from } : null;
  }
  return null;
}

export interface DropResult {
  widgets: ReportWidget[];
  /** Kafelek do zaznaczenia po upuszczeniu. `null` = bez zmiany zaznaczenia. */
  selectId: string | null;
  /** `false`, gdy gest nic nie zmienił. */
  changed: boolean;
}

export function applyDrop(
  widgets: ReportWidget[],
  payload: ParsedPayload,
  slot: number,
  makeId: () => string,
  maxWidgets: number,
): DropResult {
  const at = Math.max(0, Math.min(slot, widgets.length));

  if (payload.kind === "new") {
    if (widgets.length >= maxWidgets) return { widgets, selectId: null, changed: false };
    const w = newWidget(payload.type, makeId());
    const next = [...widgets.slice(0, at), w, ...widgets.slice(at)];
    return { widgets: next, selectId: w.id, changed: true };
  }

  const from = payload.from;
  if (from >= widgets.length) return { widgets, selectId: null, changed: false };
  // Upuszczenie tuż przed albo tuż za samym sobą to brak ruchu.
  if (at === from || at === from + 1) return { widgets, selectId: null, changed: false };
  const moved = widgets[from];
  const without = [...widgets.slice(0, from), ...widgets.slice(from + 1)];
  const target = at > from ? at - 1 : at;
  const next = [...without.slice(0, target), moved, ...without.slice(target)];
  return { widgets: next, selectId: moved.id, changed: true };
}

/** Przestawienie o jedną pozycję — dla strzałek i klawiatury. */
export function moveBy(widgets: ReportWidget[], index: number, delta: -1 | 1): ReportWidget[] {
  const to = index + delta;
  if (index < 0 || index >= widgets.length || to < 0 || to >= widgets.length) return widgets;
  const next = [...widgets];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export function removeAt(widgets: ReportWidget[], index: number): ReportWidget[] {
  if (index < 0 || index >= widgets.length) return widgets;
  return [...widgets.slice(0, index), ...widgets.slice(index + 1)];
}

/** Kopia kafelka tuż za oryginałem — z nowym identyfikatorem. */
export function duplicateAt(
  widgets: ReportWidget[],
  index: number,
  makeId: () => string,
  maxWidgets: number,
): { widgets: ReportWidget[]; selectId: string | null } {
  if (index < 0 || index >= widgets.length || widgets.length >= maxWidgets) {
    return { widgets, selectId: null };
  }
  const copy: ReportWidget = {
    ...structuredClone(widgets[index]),
    id: makeId(),
  };
  return {
    widgets: [...widgets.slice(0, index + 1), copy, ...widgets.slice(index + 1)],
    selectId: copy.id,
  };
}

/**
 * Szczelina, na którą wskazuje kursor nad kafelkiem: górna lub lewa połowa —
 * przed nim, dolna lub prawa — za nim. Przy układzie w dwóch kolumnach kafelki
 * leżą obok siebie, więc liczy się oś, wzdłuż której są ułożone.
 */
export function slotForPointer(
  index: number,
  rect: { left: number; top: number; width: number; height: number },
  pointer: { x: number; y: number },
  axis: "x" | "y",
): number {
  const before =
    axis === "x" ? pointer.x < rect.left + rect.width / 2 : pointer.y < rect.top + rect.height / 2;
  return before ? index : index + 1;
}
