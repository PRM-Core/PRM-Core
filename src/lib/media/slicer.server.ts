import sharp from "sharp";
import { readMediaFile, saveMediaFile, type MediaFolder } from "./media.server";
import { t } from "@/lib/i18n";

/**
 * Kadrowanie projektu graficznego na osobne pliki.
 *
 * **Po co to istnieje.** Grafik oddaje JEDEN plik z całym projektem mailingu.
 * Model widzi go w całości i potrafi powiedzieć, gdzie kończy się nagłówek,
 * a zaczyna zdjęcie — ale nie potrafi wyciąć pliku. Bez kadrowania każdy
 * `<img>` w kodzie wskazywał ten sam adres, więc wiadomość wyglądała jak
 * pięciokrotnie powtórzony cały projekt.
 *
 * **Współrzędne są względne (0–1), nie w pikselach.** Model patrzy na obraz
 * przeskalowany przez dostawcę do własnego limitu i nie zna rozdzielczości
 * oryginału; ułamek szerokości jest jedyną miarą, którą obie strony rozumieją
 * tak samo.
 */

export interface SliceSpec {
  /** Nazwa robocza — trafia do nazwy pliku i pomaga człowiekowi rozpoznać kadr w Media. */
  name: string;
  /** Ramka kadru jako ułamki wymiarów oryginału, lewy górny róg + rozmiar. */
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SlicedImage {
  name: string;
  mediaId: string;
  publicPath: string;
  /** Szerokość kadru w pikselach — do atrybutu `width` w kodzie. */
  pixelWidth: number;
  pixelHeight: number;
}

/** Kadr węższy niż to nie niesie treści — to zwykle pomyłka modelu w liczeniu ułamków. */
const MIN_PX = 24;

export interface SliceOutcome {
  slices: SlicedImage[];
  /** Kadry odrzucone wraz z powodem — **nigdy po cichu**: brakujący kadr zmuszał
   *  model do sięgnięcia po adres całego projektu i psuł wiadomość. */
  skipped: { name: string; reason: string }[];
}

function clamp01(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Wycina kadry ze źródłowego pliku Media i zapisuje każdy jako osobny plik.
 *
 * Kadry lądują w tym samym folderze co oryginał, więc materiały jednej
 * kampanii trzymają się razem w bibliotece.
 */
export async function sliceMediaImage(input: {
  sourceMediaId: string;
  folder: MediaFolder;
  slices: SliceSpec[];
}): Promise<SliceOutcome> {
  const source = await readMediaFile(input.sourceMediaId);
  if (!source) throw new Error(t("Nie znaleziono grafiki źródłowej w bibliotece Media."));

  const image = sharp(source.bytes);
  const meta = await image.metadata();
  const fullW = meta.width ?? 0;
  const fullH = meta.height ?? 0;
  if (!fullW || !fullH) throw new Error(t("Nie udało się odczytać wymiarów grafiki."));

  const out: SlicedImage[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (const spec of input.slices) {
    const left = Math.round(clamp01(spec.left) * fullW);
    const top = Math.round(clamp01(spec.top) * fullH);
    // Szerokość liczona z pozostałej przestrzeni, żeby zaokrąglenia nie wyszły
    // poza obraz — sharp odrzuca kadr wystający choćby o piksel.
    const width = Math.min(Math.round(clamp01(spec.width) * fullW), fullW - left);
    const height = Math.min(Math.round(clamp01(spec.height) * fullH), fullH - top);
    if (width < MIN_PX || height < MIN_PX) {
      skipped.push({
        name: spec.name,
        reason: t("kadr po przeliczeniu ma {width}×{height} px (minimum {MIN_PX})", {
          width: width,
          height: height,
          MIN_PX: MIN_PX,
        }),
      });
      continue;
    }

    const safeName = spec.name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40) || "kadr";
    const bytes = await sharp(source.bytes)
      .extract({ left, top, width, height })
      // JPEG z jakością 82 i progresywny: waga wiadomości ma znaczenie dla
      // dostarczalności, a różnicy przy fotografii nie widać. PNG zostawiłby
      // kadry fotograficzne kilkukrotnie cięższe.
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toBuffer();

    const saved = await saveMediaFile({
      fileName: `${safeName}.jpg`,
      mimeType: "image/jpeg",
      folder: input.folder,
      bytesBase64: bytes.toString("base64"),
    });
    out.push({
      name: spec.name,
      mediaId: saved.id,
      publicPath: saved.publicPath,
      pixelWidth: width,
      pixelHeight: height,
    });
  }
  return { slices: out, skipped };
}
