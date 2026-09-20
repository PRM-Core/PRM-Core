import { describe, expect, test } from "bun:test";
import { newWidget, type ReportWidget } from "./catalog";
import {
  applyDrop,
  duplicateAt,
  moveBy,
  moveDragPayload,
  paletteDragPayload,
  parsePayload,
  removeAt,
  slotForPointer,
} from "./layout";

const ids = (ws: ReportWidget[]) => ws.map((w) => w.id);
const trzy = () => [newWidget("kpi", "a"), newWidget("bar", "b"), newWidget("table", "c")];
let n = 0;
const makeId = () => `n${n++}`;

describe("ładunek przeciągania", () => {
  test("paleta i przeniesienie przechodzą w obie strony", () => {
    expect(parsePayload(paletteDragPayload("line"))).toEqual({ kind: "new", type: "line" });
    expect(parsePayload(moveDragPayload(2))).toEqual({ kind: "move", from: 2 });
  });

  test("obcy tekst i nieznany rodzaj kafelka nic nie robią", () => {
    expect(parsePayload("https://przyklad.pl")).toBeNull();
    expect(parsePayload("prm-raport:new:pie")).toBeNull();
    expect(parsePayload("prm-raport:move:-1")).toBeNull();
    expect(parsePayload("prm-raport:move:abc")).toBeNull();
    // Ładunek edytora treści nie jest ładunkiem raportu.
    expect(parsePayload("new:heading")).toBeNull();
  });
});

describe("applyDrop — nowy kafelek", () => {
  test("wstawia w szczelinę i zaznacza nowy kafelek", () => {
    const r = applyDrop(trzy(), { kind: "new", type: "line" }, 1, () => "x", 24);
    expect(ids(r.widgets)).toEqual(["a", "x", "b", "c"]);
    expect(r.selectId).toBe("x");
    expect(r.widgets[1].dimensions).toEqual(["day"]);
  });

  test("szczelina poza zakresem trafia na koniec albo początek", () => {
    expect(ids(applyDrop(trzy(), { kind: "new", type: "kpi" }, 99, () => "x", 24).widgets)).toEqual(
      ["a", "b", "c", "x"],
    );
    expect(ids(applyDrop(trzy(), { kind: "new", type: "kpi" }, -5, () => "x", 24).widgets)[0]).toBe(
      "x",
    );
  });

  test("po osiągnięciu limitu kafelków nic się nie dodaje", () => {
    const r = applyDrop(trzy(), { kind: "new", type: "kpi" }, 0, () => "x", 3);
    expect(r.changed).toBe(false);
    expect(ids(r.widgets)).toEqual(["a", "b", "c"]);
  });
});

describe("applyDrop — przenoszenie", () => {
  test("w dół: szczelina liczona przed usunięciem kafelka", () => {
    // „a" upuszczone za „b" (szczelina 2) ląduje między b i c.
    expect(ids(applyDrop(trzy(), { kind: "move", from: 0 }, 2, makeId, 24).widgets)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(ids(applyDrop(trzy(), { kind: "move", from: 0 }, 3, makeId, 24).widgets)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  test("w górę", () => {
    expect(ids(applyDrop(trzy(), { kind: "move", from: 2 }, 0, makeId, 24).widgets)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  test("upuszczenie tuż przed albo tuż za samym sobą to brak ruchu", () => {
    for (const slot of [1, 2]) {
      const r = applyDrop(trzy(), { kind: "move", from: 1 }, slot, makeId, 24);
      expect(r.changed).toBe(false);
      expect(ids(r.widgets)).toEqual(["a", "b", "c"]);
    }
  });

  test("indeks spoza listy (np. nieaktualny ładunek) nic nie robi", () => {
    expect(applyDrop(trzy(), { kind: "move", from: 7 }, 0, makeId, 24).changed).toBe(false);
  });
});

describe("strzałki, usuwanie, kopia", () => {
  test("moveBy zamienia z sąsiadem i nie wychodzi poza brzegi", () => {
    expect(ids(moveBy(trzy(), 1, -1))).toEqual(["b", "a", "c"]);
    expect(ids(moveBy(trzy(), 1, 1))).toEqual(["a", "c", "b"]);
    expect(ids(moveBy(trzy(), 0, -1))).toEqual(["a", "b", "c"]);
    expect(ids(moveBy(trzy(), 2, 1))).toEqual(["a", "b", "c"]);
  });

  test("removeAt", () => {
    expect(ids(removeAt(trzy(), 1))).toEqual(["a", "c"]);
    expect(ids(removeAt(trzy(), 9))).toEqual(["a", "b", "c"]);
  });

  test("kopia ląduje za oryginałem, z nowym id i niezależnymi filtrami", () => {
    const start = trzy();
    start[1].filters = [{ dimension: "status", operator: "in", values: ["patient"] }];
    const r = duplicateAt(start, 1, () => "kopia", 24);
    expect(ids(r.widgets)).toEqual(["a", "b", "kopia", "c"]);
    r.widgets[2].filters[0].values.push("lead");
    // Zmiana w kopii nie może zmienić oryginału.
    expect(start[1].filters[0].values).toEqual(["patient"]);
  });
});

describe("slotForPointer", () => {
  const rect = { left: 100, top: 100, width: 200, height: 100 };
  test("w pionie: górna połowa przed, dolna za", () => {
    expect(slotForPointer(3, rect, { x: 150, y: 120 }, "y")).toBe(3);
    expect(slotForPointer(3, rect, { x: 150, y: 180 }, "y")).toBe(4);
  });
  test("w poziomie: lewa połowa przed, prawa za", () => {
    expect(slotForPointer(3, rect, { x: 150, y: 180 }, "x")).toBe(3);
    expect(slotForPointer(3, rect, { x: 250, y: 120 }, "x")).toBe(4);
  });
});

describe("szablony startowe", () => {
  test("każdy kafelek każdego szablonu da się policzyć, a identyfikatory są unikalne", async () => {
    const { REPORT_TEMPLATES } = await import("./templates");
    const { widgetProblems, definitionSchema } = await import("./catalog");
    for (const t of REPORT_TEMPLATES) {
      const d = t.build();
      expect(definitionSchema.safeParse(d).success).toBe(true);
      for (const w of d.widgets) expect([t.key, widgetProblems(w)]).toEqual([t.key, []]);
      expect(new Set(d.widgets.map((w) => w.id)).size).toBe(d.widgets.length);
    }
  });
});
