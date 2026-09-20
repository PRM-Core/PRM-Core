import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { getSessionUser } from "../auth/session.server";
import {
  deleteFeed,
  getFeedRows,
  listFeeds,
  parseWorkbook,
  saveFeed,
  setKeyColumn,
} from "../feeds/feeds.server";
import type { FeedRow } from "../db/schema";
import { t } from "@/lib/i18n";

// Feedy — wgrywanie arkuszy i podgląd. Rozwijanie pól w treści dzieje się
// przy wysyłce (feeds/feed-tags.server.ts), nie tutaj.

export const getFeeds = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<FeedRow[]> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return listFeeds();
  });

export interface FeedPreview {
  sheets: { name: string; columns: string[]; rowCount: number; sample: Record<string, string>[] }[];
}

/**
 * Podgląd przed zapisem — użytkownik widzi, co system odczytał, ZANIM to
 * trafi do bazy. Plik z przesuniętym nagłówkiem albo pustym arkuszem daje
 * bezsensowne kolumny, a bez podglądu wychodziłoby to dopiero w wiadomości.
 */
export const previewFeedFile = createServerFn({ method: "POST" })
  .middleware([allowReporter])
  .inputValidator(
    z.object({
      fileName: z.string().max(200),
      bytesBase64: z.string().max(30 * 1024 * 1024),
    }),
  )
  .handler(async ({ data }): Promise<FeedPreview> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    const sheets = parseWorkbook(Buffer.from(data.bytesBase64, "base64"), data.fileName);
    return {
      sheets: sheets.map((s) => ({
        name: s.name,
        columns: s.columns,
        rowCount: s.rows.length,
        sample: s.rows.slice(0, 3),
      })),
    };
  });

export const importFeedSheet = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      fileName: z.string().max(200),
      bytesBase64: z.string().max(30 * 1024 * 1024),
      sheetName: z.string(),
      feedName: z.string().min(1).max(80),
      keyColumn: z.string().default(""),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; rowCount?: number; error?: string }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    const sheets = parseWorkbook(Buffer.from(data.bytesBase64, "base64"), data.fileName);
    const sheet = sheets.find((s) => s.name === data.sheetName) ?? sheets[0];
    if (!sheet) return { ok: false, error: t("Nie znaleziono arkusza w pliku.") };

    const saved = await saveFeed({
      name: data.feedName.trim(),
      columns: sheet.columns,
      rows: sheet.rows,
      keyColumn: data.keyColumn,
      sourceFile: data.fileName,
    });
    return { ok: true, rowCount: saved.rowCount };
  });

export const getFeedPreviewRows = createServerFn({ method: "POST" })
  .middleware([allowReporter])
  .inputValidator(z.object({ feedId: z.string() }))
  .handler(async ({ data }): Promise<Record<string, string>[]> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return getFeedRows(data.feedId, 25);
  });

export const removeFeed = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    await deleteFeed(data.id);
    return { ok: true };
  });

export const changeFeedKeyColumn = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ feedId: z.string(), column: z.string() }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    await setKeyColumn(data.feedId, data.column);
    return { ok: true };
  });
