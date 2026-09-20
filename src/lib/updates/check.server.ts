import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { appSettings } from "../db/schema";
import { DEFAULT_UPDATE_FEED_URL, UpdateFeedSchema, type UpdateFeed } from "./feed";

/**
 * Fetching the update feed (see `feed.ts`). Rides on the engine clock and
 * rate-limits itself: one request per 12 hours, also after a failure, so an
 * unreachable GitHub costs nothing. The last good feed stays until a new valid
 * one arrives — a broken file on the owner's side never blanks the notices.
 */
const INTERVAL_MS = 12 * 60 * 60 * 1000;
const MAX_BYTES = 64 * 1024;
const KEY_FEED = "updates.feed";
const KEY_CHECKED = "updates.checked_at";
const KEY_ERROR = "updates.last_error";

export function updateCheckEnabled(): boolean {
  return process.env.PRM_UPDATE_CHECK !== "0";
}

export function updateFeedUrl(): string {
  const url = process.env.PRM_UPDATE_FEED_URL?.trim();
  return url && url.startsWith("https://") ? url : DEFAULT_UPDATE_FEED_URL;
}

async function setSetting(key: string, value: string): Promise<void> {
  await getDb()
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

/** Returns what happened, for tests and the log; never throws. */
export async function maybeCheckForUpdates(
  now: number = Date.now(),
): Promise<"disabled" | "not-due" | "updated" | "failed"> {
  if (!updateCheckEnabled()) return "disabled";
  const db = getDb();
  const last = await db.select().from(appSettings).where(eq(appSettings.key, KEY_CHECKED)).get();
  if (last && now - Number(last.value) < INTERVAL_MS) return "not-due";
  await setSetting(KEY_CHECKED, String(now));
  try {
    // No identifying headers, no query string: the request carries nothing
    // about this installation.
    const res = await fetch(updateFeedUrl(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error("feed too large");
    const feed = UpdateFeedSchema.parse(JSON.parse(text));
    await setSetting(KEY_FEED, JSON.stringify(feed));
    await setSetting(KEY_ERROR, "");
    return "updated";
  } catch (err) {
    await setSetting(KEY_ERROR, String(err instanceof Error ? err.message : err).slice(0, 200));
    return "failed";
  }
}

export async function storedFeed(): Promise<UpdateFeed | null> {
  const row = await getDb().select().from(appSettings).where(eq(appSettings.key, KEY_FEED)).get();
  if (!row) return null;
  const parsed = UpdateFeedSchema.safeParse(JSON.parse(row.value));
  return parsed.success ? parsed.data : null;
}

const dismissedKey = (userId: string) => `updates.dismissed.${userId}`;

export async function dismissedNotices(userId: string): Promise<string[]> {
  const row = await getDb()
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, dismissedKey(userId)))
    .get();
  try {
    const ids = JSON.parse(row?.value ?? "[]");
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function dismissNotice(userId: string, id: string): Promise<void> {
  const ids = await dismissedNotices(userId);
  if (ids.includes(id)) return;
  await setSetting(dismissedKey(userId), JSON.stringify([...ids, id].slice(-100)));
}
