import { describe, expect, test } from "bun:test";
import { UpdateFeedSchema, compareVersions, visibleNotices } from "./feed";

const feed = UpdateFeedSchema.parse({
  latest: { version: "1.67.0", url: "https://example.org/r", notes: { en: "New", pl: "Nowe" } },
  messages: [
    { id: "all", title: { en: "Hello" } },
    { id: "old-only", level: "security", title: { en: "Patch" }, maxVersion: "1.66.9" },
    { id: "new-only", title: { en: "Later" }, minVersion: "1.67.0" },
  ],
});

describe("compareVersions", () => {
  test("numeric, not alphabetical", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.66.0", "1.66.0")).toBe(0);
    expect(compareVersions("dev", "1.0.0")).toBe(0);
  });
});

describe("visibleNotices", () => {
  test("older installation: update + messages for its range, in its language", () => {
    const n = visibleNotices(feed, "1.66.0", "pl");
    expect(n.map((x) => x.id)).toEqual(["update-1.67.0", "all", "old-only"]);
    expect(n[0].body).toBe("Nowe");
  });

  test("current installation: no update notice, no messages for older versions", () => {
    expect(visibleNotices(feed, "1.67.0", "en").map((x) => x.id)).toEqual(["all", "new-only"]);
  });

  test("dismissed notices stay hidden", () => {
    expect(visibleNotices(feed, "1.66.0", "en", ["update-1.67.0", "all"]).map((x) => x.id)).toEqual(
      ["old-only"],
    );
  });

  test("development build: only messages without a version range", () => {
    expect(visibleNotices(feed, "dev", "en").map((x) => x.id)).toEqual(["all"]);
  });
});

describe("UpdateFeedSchema — the file comes from the network", () => {
  test("links only over https, ids without spaces, versions as x.y.z", () => {
    const bad = (m: object) =>
      UpdateFeedSchema.safeParse({ messages: [{ id: "a", title: { en: "t" }, ...m }] }).success;
    expect(bad({ url: "javascript:alert(1)" })).toBe(false);
    expect(bad({ url: "http://example.org" })).toBe(false);
    expect(bad({ id: "Has Space" })).toBe(false);
    expect(bad({ minVersion: "1.x" })).toBe(false);
    expect(bad({})).toBe(true);
  });
});
