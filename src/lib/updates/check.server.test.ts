/**
 * Fetching the update feed — no network: `fetch` replaced, own temp database.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prm-updates-"));
const dbUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = dbUrl;

const { maybeCheckForUpdates, storedFeed, dismissNotice, dismissedNotices } =
  await import("./check.server");
const { getDb } = await import("../db/client.server");
const { appSettings } = await import("../db/schema");

const realFetch = globalThis.fetch;
let requests: { url: string; init?: RequestInit }[] = [];
const serve = (status: number, body: string) => {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(body, { status });
  }) as typeof fetch;
};
const FEED = JSON.stringify({ latest: { version: "9.0.0" }, messages: [] });
const H = 60 * 60 * 1000;

beforeAll(() => {
  const r = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: "./src/lib/db/migrations" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
});
beforeEach(async () => {
  process.env.DATABASE_URL = dbUrl;
  delete process.env.PRM_UPDATE_CHECK;
  delete process.env.PRM_UPDATE_FEED_URL;
  requests = [];
  await getDb().delete(appSettings);
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("maybeCheckForUpdates", () => {
  test("fetches the official feed without identifying anything, stores it", async () => {
    serve(200, FEED);
    expect(await maybeCheckForUpdates(1000)).toBe("updated");
    expect(requests[0].url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/.+\/updates\.json$/);
    expect(requests[0].url).not.toContain("?");
    expect(Object.keys((requests[0].init?.headers ?? {}) as object)).toEqual(["Accept"]);
    expect((await storedFeed())?.latest?.version).toBe("9.0.0");
  });

  test("once per 12 hours — also after a failure", async () => {
    serve(500, "");
    expect(await maybeCheckForUpdates(1000)).toBe("failed");
    expect(await maybeCheckForUpdates(1000 + 11 * H)).toBe("not-due");
    serve(200, FEED);
    expect(await maybeCheckForUpdates(1000 + 13 * H)).toBe("updated");
    expect(requests).toHaveLength(2);
  });

  test("an invalid file does not replace the last good feed", async () => {
    serve(200, FEED);
    await maybeCheckForUpdates(1000);
    serve(200, JSON.stringify({ messages: [{ id: "x", title: { en: "t" }, url: "http://x" }] }));
    expect(await maybeCheckForUpdates(1000 + 13 * H)).toBe("failed");
    expect((await storedFeed())?.latest?.version).toBe("9.0.0");
  });

  test("PRM_UPDATE_CHECK=0: no request at all", async () => {
    process.env.PRM_UPDATE_CHECK = "0";
    serve(200, FEED);
    expect(await maybeCheckForUpdates(1000)).toBe("disabled");
    expect(requests).toHaveLength(0);
  });

  test("PRM_UPDATE_FEED_URL is used only over https", async () => {
    serve(200, FEED);
    process.env.PRM_UPDATE_FEED_URL = "http://evil.example/feed.json";
    await maybeCheckForUpdates(1000);
    expect(requests[0].url).toStartWith("https://raw.githubusercontent.com/");
  });
});

test("dismissals are per user", async () => {
  await dismissNotice("u1", "update-9.0.0");
  await dismissNotice("u1", "update-9.0.0");
  expect(await dismissedNotices("u1")).toEqual(["update-9.0.0"]);
  expect(await dismissedNotices("u2")).toEqual([]);
});
