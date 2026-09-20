import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { canvaConnections } from "../db/schema";
import { saveMediaFile } from "../media/media.server";
import { validAccessToken } from "./oauth.server";
import { t } from "@/lib/i18n";

/**
 * Projekty z Canvy: lista i przeniesienie wybranego do biblioteki Media.
 *
 * **Canva nie odda projektu jako edytowalnych bloków.** Connect API pozwala go
 * wylistować i **wyeksportować do obrazu** — nic więcej. Dlatego droga do
 * Design Studia prowadzi przez plik: eksport → Media → PRM_Agent, który układa
 * z grafiki klocki. Ta sama ścieżka co przy „zakoduj z grafiki", tyle że plik
 * nie przechodzi przez dysk człowieka.
 */

const API = "https://api.canva.com/rest/v1";

export interface CanvaDesign {
  id: string;
  title: string;
  thumbnailUrl: string;
  updatedAt: number | null;
}

/** Wspólne wywołanie API z tokenem. Rzuca z **treścią** odmowy, nie samym kodem. */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await validAccessToken();
  if (!token) {
    throw new Error(t("Brak ważnego połączenia z Canvą — połącz konto ponownie w Integracjach."));
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) {
    // Zapisujemy powód przy połączeniu: „lista pusta" i „Canva odmówiła" wyglądają
    // w interfejsie tak samo, a to dwa różne problemy.
    await getDb()
      .update(canvaConnections)
      .set({ lastError: `${res.status}: ${text.slice(0, 200)}`, lastErrorAt: Date.now() })
      .where(eq(canvaConnections.id, "default"));
    throw new Error(
      t("Canva odmówiła (HTTP {status}): {v1}", { status: res.status, v1: text.slice(0, 200) }),
    );
  }
  return JSON.parse(text) as T;
}

interface DesignsResponse {
  items?: {
    id: string;
    title?: string;
    thumbnail?: { url?: string };
    updated_at?: number;
  }[];
  continuation?: string;
}

/**
 * Lista projektów, stronicowana.
 *
 * `continuation` oddajemy dalej, zamiast ściągać wszystko naraz: przy koncie
 * z setkami projektów jedno wywołanie po całość znaczyłoby długie czekanie
 * i ścianę miniatur, przez którą i tak nikt nie przewinie.
 */
export async function listCanvaDesigns(
  continuation?: string,
  /**
   * Fraza wyszukiwania — przekazywana **do Canvy**, nie filtrowana u nas.
   *
   * Filtrowanie po naszej stronie działałoby wyłącznie na wczytanej stronie
   * wyników, więc przy koncie z setkami projektów szukanie „ulotka" nie
   * znalazłoby ulotki leżącej na trzeciej stronie — i wyglądałoby to, jakby jej
   * w Canvie nie było.
   */
  szukaj?: string,
): Promise<{ designs: CanvaDesign[]; continuation: string | null }> {
  const params = new URLSearchParams();
  if (continuation) params.set("continuation", continuation);
  if (szukaj?.trim()) params.set("query", szukaj.trim());

  /**
   * **Wszystko, co użytkownik widzi w Canvie** — własne i udostępnione.
   *
   * `any` jest dziś domyślne po stronie Canvy, ale ustawiamy je jawnie: gdyby
   * kiedyś zmienili domyślną wartość na `owned`, projekty udostępnione zniknęłyby
   * z listy bez żadnego komunikatu i bez zmiany u nas.
   */
  params.set("ownership", "any");

  /**
   * **Od ostatnio zmienianych.** Canva domyślnie sortuje po „trafności", co przy
   * pustym zapytaniu znaczy kolejność, której człowiek nie umie przewidzieć —
   * i wygląda jak brak projektów, choć to tylko inna kolejność. Przy szukaniu
   * po frazie trafność ma sens, więc wtedy zostawiamy ją Canvie.
   */
  if (!szukaj?.trim()) params.set("sort_by", "modified_descending");

  /**
   * Sto na stronę zamiast domyślnych 25 — mniej dobierania i mniejsza szansa,
   * że ktoś uzna listę za kompletną, bo skończyła się na pierwszej stronie.
   */
  params.set("limit", "100");

  /**
   * **Dociągamy kolejne strony sami, nie po kliknięciu.**
   *
   * `limit=100` jest dla Canvy sufitem, nie obietnicą — realnie oddaje około 25
   * pozycji i resztę wydaje przez token następnej strony. Przy koncie z setką
   * projektów oznaczało to, że użytkownik widział pierwsze 25 i uznawał, że
   * reszty „nie ma w systemie". Pobranie kilku stron trwa ułamek sekundy i jest
   * uczciwsze niż lista, która wygląda na kompletną.
   *
   * **Sufit sześciu stron** (~600 projektów), żeby konto z tysiącami pozycji
   * nie zamieniło otwarcia zakładki w minutę czekania. Gdy zatrzymamy się na
   * suficie, oddajemy token dalej — przycisk „Pokaż więcej" dobierze resztę.
   */
  const MAX_STRON = 6;
  const zebrane: CanvaDesign[] = [];
  let dalej: string | null = continuation ?? null;
  let strona = 0;

  do {
    if (dalej) params.set("continuation", dalej);
    const qs = params.toString();
    const data: DesignsResponse = await call<DesignsResponse>(`/designs${qs ? `?${qs}` : ""}`);
    for (const d of data.items ?? []) {
      zebrane.push({
        id: d.id,
        title: d.title?.trim() || t("(bez nazwy)"),
        thumbnailUrl: d.thumbnail?.url ?? "",
        // Canva podaje sekundy; u nas wszystko jest w milisekundach.
        updatedAt: typeof d.updated_at === "number" ? d.updated_at * 1000 : null,
      });
    }
    dalej = data.continuation ?? null;
    strona++;
  } while (dalej && strona < MAX_STRON);

  return { designs: zebrane, continuation: dalej };
}

interface ExportJob {
  job?: {
    id?: string;
    status?: "in_progress" | "success" | "failed";
    urls?: string[];
    error?: { message?: string };
  };
}

/**
 * Eksport projektu do PNG i pobranie pliku.
 *
 * **Eksport jest zadaniem, nie odpowiedzią** — Canva przyjmuje zlecenie i każe
 * dopytywać o wynik. Odpytujemy co sekundę przez pół minuty: projekt na kilka
 * ekranów potrafi się renderować kilkanaście sekund, a cierpliwość dłuższa niż
 * pół minuty i tak nie ma sensu w oknie, przy którym ktoś czeka.
 */
async function exportDesignPng(designId: string): Promise<string> {
  const start = await call<ExportJob>("/exports", {
    method: "POST",
    body: JSON.stringify({ design_id: designId, format: { type: "png" } }),
  });

  let job = start.job;
  const deadline = Date.now() + 30_000;
  while (job?.status === "in_progress" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    const next = await call<ExportJob>(`/exports/${job.id}`);
    job = next.job;
  }

  if (job?.status !== "success" || !job.urls?.length) {
    const powod = job?.error?.message ?? job?.status ?? "brak odpowiedzi";
    throw new Error(t("Eksport projektu nie powiódł się: {powod}", { powod: powod }));
  }
  // Pierwsza strona projektu. Wielostronicowe eksporty dają URL na stronę —
  // wiadomość e-mail powstaje z pierwszej, resztę można zaimportować osobno.
  return job.urls[0];
}

/**
 * Projekt z Canvy → plik w bibliotece Media.
 *
 * Do Media, a nie prosto do agenta, z dwóch powodów: adres eksportu z Canvy
 * **wygasa** (za kilka godzin obrazek w wiadomości byłby martwy), a agent tnie
 * grafikę na kadry i każdy z nich musi mieć adres w **naszej** domenie.
 */
export async function importCanvaDesignToMedia(
  designId: string,
  title: string,
  folder: "email" | "newsletter" | "popup" | "inne" = "email",
): Promise<{
  mediaId: string;
  publicPath: string;
  name: string;
}> {
  const url = await exportDesignPng(designId);
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok)
    throw new Error(
      t("Nie udało się pobrać wyeksportowanego pliku (HTTP {status}).", { status: res.status }),
    );

  const bytes = Buffer.from(await res.arrayBuffer());
  const nazwa = `${title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "Projekt Canva"}.png`;
  const saved = await saveMediaFile({
    fileName: nazwa,
    mimeType: "image/png",
    folder,
    bytesBase64: bytes.toString("base64"),
  });

  return { mediaId: saved.id, publicPath: saved.publicPath, name: title };
}
