import { unzipSync, strFromU8 } from "fflate";

export interface ZipImportResult {
  fileNames: string[];
  html: string | null;
  htmlFileName: string | null;
}

/** Reads a .zip in the browser (no upload — fully client-side) and looks for an HTML entry to preview. */
export async function importZipFile(file: File): Promise<ZipImportResult> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buf);
  const fileNames = Object.keys(entries).filter((n) => !n.endsWith("/"));

  const htmlFileName =
    fileNames.find((n) => /(^|\/)index\.html?$/i.test(n)) ??
    fileNames.find((n) => /\.html?$/i.test(n)) ??
    null;

  const html = htmlFileName ? strFromU8(entries[htmlFileName]) : null;

  return { fileNames, html, htmlFileName };
}
