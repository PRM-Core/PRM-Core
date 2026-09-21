import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { feedRows, feeds, type FeedRow } from "../db/schema";

/**
 * Feedy — arkusze z danymi wykorzystywanymi w wiadomościach.
 *
 * **Nic tu nie zakłada, jak nazywają się kolumny.** Placówka wgrywa plik, jaki
 * ma; nagłówek staje się listą pól, a wiersze — danymi. Ten sam mechanizm
 * obsługuje listę lekarzy z linkami do opinii i katalog produktów.
 */

/** Ile wierszy przyjmujemy z jednego arkusza. Powyżej tego feed przestaje być feedem, a staje się bazą. */
const MAX_ROWS = 20_000;

/**
 * Klucz porównania — małe litery, bez polskich znaków, bez zbędnych spacji.
 *
 * Dopasowanie musi wybaczać: w kartotece stoi „Kowalski", a w arkuszu bywa
 * „KOWALSKI" albo „Kowalski ". Bez foldu trafienie zależałoby od tego, kto
 * i jak wpisał — a nietrafienie jest tu niewidoczne: w miejscu linku
 * pojawiłaby się pustka.
 */
export function foldKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => "acelnoszz"["ąćęłńóśźż".indexOf(ch)])
    .replace(/\s+/g, " ");
}

export interface ParsedSheet {
  name: string;
  columns: string[];
  rows: Record<string, string>[];
}

/**
 * Odczyt pliku. CSV daje jeden arkusz, XLSX tyle, ile ich w skoroszycie.
 *
 * Wartości sprowadzamy do napisów: w arkuszu ta sama kolumna bywa raz liczbą,
 * raz tekstem, a w wiadomości i tak wszystko jest tekstem. Zachowanie typów
 * dawałoby „2021" w jednym wierszu i 2021 w drugim.
 */
/**
 * Tekst z pliku CSV — **z rozpoznaniem kodowania**.
 *
 * Biblioteka, dostając same bajty, zgaduje stronę kodową i przy CSV w UTF-8
 * robiła z „Imię" „ImiÄ™" — w nagłówku kolumny, czyli w miejscu, którym
 * wskazuje się pole w wiadomości. Najpierw więc UTF-8 (z BOM-em albo bez),
 * a dopiero gdy bajty nie są poprawnym UTF-8 — Windows-1250, bo w tym
 * kodowaniu zapisuje CSV polski Excel.
 */
const CP1250_HIGH =
  "€�‚�„…†‡�‰Š‹ŚŤŽŹ�‘’“”•–—�™š›śťžź ˇ˘Ł¤Ą¦§¨©Ş«¬­®Ż°±˛ł´µ¶·¸ąş»Ľ˝ľżŔÁÂĂÄĹĆÇČÉĘËĚÍÎĎĐŃŇÓÔŐÖ×ŘŮÚŰÜÝŢßŕáâăäĺćçčéęëěíîďđńňóôőö÷řůúűüýţ˙";

/** Bajty Windows-1250 na znaki. Własna tablica, bo `TextDecoder` w Bunie zna tylko UTF. */
function decodeCp1250(bytes: Buffer): string {
  let out = "";
  for (const b of bytes) out += b < 0x80 ? String.fromCharCode(b) : CP1250_HIGH[b - 0x80];
  return out;
}

function csvText(bytes: Buffer): string {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.replace(/^\uFEFF/, "");
  } catch {
    return decodeCp1250(bytes);
  }
}

export function parseWorkbook(bytes: Buffer, fileName: string): ParsedSheet[] {
  // XLSX to spakowany plik binarny; CSV to tekst, więc kodowanie ustalamy sami.
  const isCsv = /\.(csv|txt|tsv)$/i.test(fileName);
  const wb = isCsv
    ? XLSX.read(csvText(bytes), { type: "string", raw: false })
    : XLSX.read(bytes, { type: "buffer", raw: false });
  const out: ParsedSheet[] = [];

  for (const sheetName of wb.SheetNames) {
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
      defval: "",
      raw: false,
    });
    if (raw.length === 0) continue;

    // Nazwy kolumn z pierwszego wiersza — `sheet_to_json` bierze je z nagłówka.
    // Puste nagłówki (kolumny bez nazwy) odpadają: pole bez nazwy nie da się
    // wskazać w wiadomości.
    const columns = Object.keys(raw[0]).filter((c) => c.trim() !== "");
    const rows = raw.slice(0, MAX_ROWS).map((r) => {
      const row: Record<string, string> = {};
      for (const c of columns) row[c] = String(r[c] ?? "").trim();
      return row;
    });

    out.push({
      name: wb.SheetNames.length === 1 ? fileName.replace(/\.[a-z]+$/i, "") : sheetName,
      columns,
      rows,
    });
  }
  return out;
}

/** Zapis arkusza jako feedu. Ponowne wgranie pod tą samą nazwą PODMIENIA zawartość. */
export async function saveFeed(input: {
  name: string;
  columns: string[];
  rows: Record<string, string>[];
  keyColumn: string;
  sourceFile: string;
}): Promise<{ id: string; rowCount: number }> {
  const db = getDb();
  const now = Date.now();

  const existing = await db.select().from(feeds).where(eq(feeds.name, input.name)).get();
  const id = existing?.id ?? randomUUID();

  if (existing) {
    // Podmiana, nie dokładanie: wgranie nowszej wersji arkusza ma zastąpić
    // starą. Doklejanie dawałoby duplikaty wierszy przy każdej aktualizacji.
    await db.delete(feedRows).where(eq(feedRows.feedId, id));
    await db
      .update(feeds)
      .set({
        columns: input.columns,
        keyColumn: input.keyColumn,
        sourceFile: input.sourceFile,
        rowCount: input.rows.length,
        updatedAt: now,
      })
      .where(eq(feeds.id, id));
  } else {
    await db.insert(feeds).values({
      id,
      name: input.name,
      columns: input.columns,
      keyColumn: input.keyColumn,
      sourceFile: input.sourceFile,
      rowCount: input.rows.length,
      updatedAt: now,
      createdAt: now,
    });
  }

  for (const [i, row] of input.rows.entries()) {
    await db.insert(feedRows).values({
      id: randomUUID(),
      feedId: id,
      keyValue: input.keyColumn ? foldKey(row[input.keyColumn] ?? "") : "",
      rowIndex: i,
      data: row,
    });
  }

  return { id, rowCount: input.rows.length };
}

export async function listFeeds(): Promise<FeedRow[]> {
  return getDb().select().from(feeds).orderBy(asc(feeds.name));
}

export async function getFeedRows(feedId: string, limit = 50): Promise<Record<string, string>[]> {
  const rows = await getDb()
    .select()
    .from(feedRows)
    .where(eq(feedRows.feedId, feedId))
    .orderBy(asc(feedRows.rowIndex))
    .limit(limit);
  return rows.map((r) => r.data);
}

export async function deleteFeed(id: string): Promise<void> {
  const db = getDb();
  await db.delete(feedRows).where(eq(feedRows.feedId, id));
  await db.delete(feeds).where(eq(feeds.id, id));
}

/** Zmiana kolumny kluczowej przelicza klucze wszystkich wierszy. */
export async function setKeyColumn(feedId: string, column: string): Promise<void> {
  const db = getDb();
  await db.update(feeds).set({ keyColumn: column }).where(eq(feeds.id, feedId));
  const rows = await db.select().from(feedRows).where(eq(feedRows.feedId, feedId));
  for (const r of rows) {
    await db
      .update(feedRows)
      .set({ keyValue: column ? foldKey(r.data[column] ?? "") : "" })
      .where(eq(feedRows.id, r.id));
  }
}

/** Wiersz pasujący do wartości (np. nazwiska lekarza). `null`, gdy nic nie pasuje. */
export async function findFeedRow(
  feedName: string,
  value: string,
): Promise<Record<string, string> | null> {
  const db = getDb();
  const feed = await db.select().from(feeds).where(eq(feeds.name, feedName)).get();
  if (!feed) return null;
  const row = await db
    .select()
    .from(feedRows)
    .where(and(eq(feedRows.feedId, feed.id), eq(feedRows.keyValue, foldKey(value))))
    .get();
  return row?.data ?? null;
}
