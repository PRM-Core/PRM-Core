import { z } from "zod";

/**
 * Update notices — what the PRM Core owner publishes to every installation.
 *
 * **Pull, not push.** An installation fetches one public file (`updates.json`
 * in the product repository) at most twice a day. Nothing is sent: no
 * version, no identifier, no data. The owner never learns who installed PRM
 * Core; the installation simply reads what the owner published. An
 * administrator can switch the check off with `PRM_UPDATE_CHECK=0`.
 *
 * The file is untrusted input from the network, so it is validated here and
 * shown as plain text: no HTML, links only over https.
 */

/** Official feed. A fork points `PRM_UPDATE_FEED_URL` at its own. */
export const DEFAULT_UPDATE_FEED_URL =
  "https://raw.githubusercontent.com/PRM-Core/PRM-Core-/main/updates.json";

const VERSION = /^\d+\.\d+\.\d+$/;
const httpsUrl = z
  .string()
  .max(500)
  .refine((u) => u.startsWith("https://"), "https only");
/** English is required, Polish optional — the reader's language is picked at display. */
const Text = z.object({ en: z.string().min(1).max(600), pl: z.string().max(600).optional() });

const Message = z.object({
  /** Stable, used to remember that an administrator dismissed it. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  date: z.string().max(10).optional(),
  level: z.enum(["info", "important", "security"]).default("info"),
  title: Text,
  body: Text.optional(),
  url: httpsUrl.optional(),
  /** Shown only to installations in this version range (inclusive). */
  minVersion: z.string().regex(VERSION).optional(),
  maxVersion: z.string().regex(VERSION).optional(),
});

export const UpdateFeedSchema = z.object({
  latest: z
    .object({
      version: z.string().regex(VERSION),
      date: z.string().max(10).optional(),
      url: httpsUrl.optional(),
      notes: Text.optional(),
    })
    .optional(),
  messages: z.array(Message).max(20).default([]),
});

export type UpdateFeed = z.infer<typeof UpdateFeedSchema>;
export type NoticeLevel = z.infer<typeof Message>["level"];

export interface Notice {
  id: string;
  level: NoticeLevel | "update";
  title: string;
  body: string;
  url: string;
  date: string;
}

/** Semantic comparison of `1.2.3` strings; anything else sorts as unknown (0). */
export function compareVersions(a: string, b: string): number {
  if (!VERSION.test(a) || !VERSION.test(b)) return 0;
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

const pick = (text: { en: string; pl?: string } | undefined, locale: "en" | "pl") =>
  text ? (locale === "pl" && text.pl ? text.pl : text.en) : "";

/**
 * What an installation shows: the newer version (if any) and the messages for
 * its version range, minus what the administrator dismissed. A development
 * build ("dev") has no comparable version, so it gets messages without a
 * range and no update notice.
 */
export function visibleNotices(
  feed: UpdateFeed,
  current: string,
  locale: "en" | "pl",
  dismissed: string[] = [],
): Notice[] {
  const known = VERSION.test(current);
  const out: Notice[] = [];
  const latest = feed.latest;
  if (known && latest && compareVersions(latest.version, current) > 0) {
    out.push({
      id: `update-${latest.version}`,
      level: "update",
      title: latest.version,
      body: pick(latest.notes, locale),
      url: latest.url ?? "",
      date: latest.date ?? "",
    });
  }
  for (const m of feed.messages) {
    if (m.minVersion || m.maxVersion) {
      if (!known) continue;
      if (m.minVersion && compareVersions(current, m.minVersion) < 0) continue;
      if (m.maxVersion && compareVersions(current, m.maxVersion) > 0) continue;
    }
    out.push({
      id: m.id,
      level: m.level,
      title: pick(m.title, locale),
      body: pick(m.body, locale),
      url: m.url ?? "",
      date: m.date ?? "",
    });
  }
  return out.filter((n) => !dismissed.includes(n.id));
}
