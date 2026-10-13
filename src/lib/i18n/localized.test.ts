import { describe, expect, test } from "bun:test";
import { localized, t } from "./index";

describe("localized — behaves like the plain value", () => {
  test("serialises like plain data (server-function transport)", () => {
    const obj = localized(() => ({ a: t("Zapisz"), list: [1, 2] }));
    const arr = localized(() => [{ k: t("Anuluj") }]);
    expect(obj.constructor).toBe(Object);
    expect(arr.constructor).toBe(Array);
    expect(JSON.parse(JSON.stringify(obj))).toEqual({ a: "Zapisz", list: [1, 2] });
    expect(JSON.parse(JSON.stringify(arr))).toEqual([{ k: "Anuluj" }]);
    expect(arr instanceof Array).toBe(true);
    expect(Object.keys(obj)).toEqual(["a", "list"]);
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.map((x) => x.k)).toEqual(["Anuluj"]);
  });
});
