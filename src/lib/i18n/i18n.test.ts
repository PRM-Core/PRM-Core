import { afterEach, describe, expect, test } from "bun:test";
import { EN } from "./en";
import { currentLocale, intlLocale, t } from "./index";

const saved = process.env.PRM_LOCALE;
afterEach(() => {
  process.env.PRM_LOCALE = saved;
});

describe("t", () => {
  test("a Polish installation gets the original text unchanged", () => {
    process.env.PRM_LOCALE = "pl";
    expect(currentLocale()).toBe("pl");
    expect(t("Zapisz")).toBe("Zapisz");
    expect(t("Usunięto {n} kontaktów", { n: 3 })).toBe("Usunięto 3 kontaktów");
    expect(intlLocale()).toBe("pl-PL");
  });

  test("English is the default", () => {
    delete process.env.PRM_LOCALE;
    expect(currentLocale()).toBe("en");
    expect(intlLocale()).toBe("en-GB");
  });

  test("a missing English entry falls back to Polish, never to an empty string", () => {
    process.env.PRM_LOCALE = "en";
    expect(t("Tekst, którego nie ma w słowniku")).toBe("Tekst, którego nie ma w słowniku");
  });

  test("placeholders are filled in English too", () => {
    process.env.PRM_LOCALE = "en";
    const key = Object.keys(EN).find((k) => /\{\w+\}/.test(k));
    if (!key) return;
    const names = [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const out = t(key, Object.fromEntries(names.map((n) => [n, "X"])));
    expect(out).not.toMatch(/\{\w+\}/);
  });

  test("every English entry keeps the placeholders of its Polish key", () => {
    for (const [pl, en] of Object.entries(EN)) {
      const a = [...pl.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const b = [...en.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect({ key: pl, vars: b }).toEqual({ key: pl, vars: a });
    }
  });
});

describe("localized", () => {
  test("a module-level constant follows the current language", async () => {
    const { localized, t } = await import("./index");
    process.env.PRM_LOCALE = "pl";
    const LABELS = localized(() => ({ save: t("Zapisz") }));
    expect(LABELS.save).toBe("Zapisz");
    process.env.PRM_LOCALE = "en";
    expect(LABELS.save).toBe("Save");
    process.env.PRM_LOCALE = "pl";
    expect(LABELS.save).toBe("Zapisz");
  });

  test("arrays and maps work as usual", async () => {
    const { localized, t } = await import("./index");
    process.env.PRM_LOCALE = "en";
    const LIST = localized(() => [{ key: "a", label: t("Zapisz") }]);
    expect(Array.isArray(LIST)).toBe(true);
    expect(LIST.length).toBe(1);
    expect(LIST.map((x) => x.label)).toEqual(["Save"]);
    expect([...LIST][0].key).toBe("a");
    expect(Object.keys(LIST[0])).toEqual(["key", "label"]);
    const BY_KEY = localized(() => new Map(LIST.map((x) => [x.key, x])));
    expect(BY_KEY.get("a")?.label).toBe("Save");
    expect(BY_KEY.size).toBe(1);
  });

  test("own function values keep their identity (React components)", async () => {
    const { localized } = await import("./index");
    const Icon = () => null;
    const ITEMS = localized(() => ({ icon: Icon }));
    expect(ITEMS.icon).toBe(Icon);
  });
});
