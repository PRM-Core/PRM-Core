import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "./require-user";
import { z } from "zod";
import { generateCreative, type CreativeResult } from "../ai/creative-coder.server";
import { isOverDailyLimit } from "../ai/settings.server";
import { getSessionUser } from "../auth/session.server";
import { readMediaFile } from "../media/media.server";
import { sliceMediaImage } from "../media/slicer.server";
import { getBaseUrl } from "../engine/settings.server";
import { t } from "@/lib/i18n";

// Studio kreacji — RPC dla dialogu w modułach Email / Newsletter / Pop-Up.

export const runCreativeCoder = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      kind: z.enum(["email", "newsletter", "popup"]),
      /** Plik z biblioteki Media — bajty czyta serwer, klient nie dźwiga base64 drugi raz. */
      mediaId: z.string().nullable(),
      instruction: z.string().max(4000),
      history: z
        .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(8000) }))
        .max(30)
        .default([]),
      priorHtml: z.string().max(400_000).default(""),
      /** Klocki z poprzedniej tury — poprawka układa je dalej. */
      priorBlocks: z
        .array(
          z.object({
            id: z.string(),
            type: z.string(),
            data: z.record(z.string(), z.string()),
          }),
        )
        .default([]),
      /** Kadry z poprzednich tur — przy poprawce nie tniemy projektu drugi raz. */
      existingSlices: z
        .array(
          z.object({
            name: z.string(),
            mediaId: z.string(),
            publicPath: z.string(),
            pixelWidth: z.number(),
            pixelHeight: z.number(),
          }),
        )
        .default([]),
    }),
  )
  .handler(async ({ data }): Promise<CreativeResult> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));

    // Ten sam sufit dzienny co reszta PRM_Agenta — studio nie ma osobnej kasy.
    const budget = await isOverDailyLimit();
    if (budget.over) {
      throw new Error(
        t(
          "Dzienny limit wydatków AI wyczerpany ({v0} z {limit} USD). Podnieś limit w Automation → Agent AI albo wróć jutro.",
          { v0: budget.spent.toFixed(2), limit: budget.limit },
        ),
      );
    }

    const baseUrl = await getBaseUrl();
    let image = null;
    let imageUrl = "";
    if (data.mediaId) {
      const found = await readMediaFile(data.mediaId);
      if (!found) throw new Error(t("Nie znaleziono grafiki w bibliotece Media."));
      image = {
        mimeType: found.row.mimeType,
        dataBase64: Buffer.from(found.bytes).toString("base64"),
      };
      // Adres absolutny, bo trafia do `src` w wysyłanym e-mailu — klient
      // pocztowy pacjenta nie zna względnych ścieżek naszego serwera.
      imageUrl = `${baseUrl}/media-file/${found.row.id}`;
    }

    return generateCreative({
      kind: data.kind,
      mediaId: data.mediaId,
      image,
      imageUrl,
      baseUrl,
      instruction: data.instruction,
      history: data.history,
      priorHtml: data.priorHtml,
      priorBlocks: data.priorBlocks as never,
      existingSlices: data.existingSlices,
      // Kadrowanie wykonuje serwer — model tylko wskazuje ramki. Kadry lądują
      // w tym samym folderze Media co oryginał, więc materiały jednej kampanii
      // trzymają się razem.
      onSlice: data.mediaId
        ? (slices) =>
            sliceMediaImage({
              sourceMediaId: data.mediaId as string,
              folder: data.kind,
              slices,
            })
        : undefined,
    });
  });
