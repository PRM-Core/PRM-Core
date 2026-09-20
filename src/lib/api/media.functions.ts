import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { MEDIA_FOLDERS } from "../media/media-shared";
import { deleteMediaFile, listMediaFiles, saveMediaFile } from "../media/media.server";
import type { MediaFileRow } from "../db/schema";
import { getSessionUser } from "../auth/session.server";
import { t } from "@/lib/i18n";

// Biblioteka Media. Zapis i kasowanie wymagają sesji — publiczne jest tylko
// POBIERANIE pliku (trasa /media-file/:id, uzasadnienie tam).

const folderSchema = z.enum(MEDIA_FOLDERS);

export const uploadMedia = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      fileName: z.string().max(200),
      mimeType: z.string().max(100),
      folder: folderSchema,
      // Base64 zamiast multipart: funkcje serwerowe TanStack i tak niosą JSON,
      // a limit 8 MB pilnowany jest po zdekodowaniu w media.server.ts.
      bytesBase64: z.string().max(12 * 1024 * 1024),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return saveMediaFile(data);
  });

export const getMediaFiles = createServerFn({ method: "POST" })
  .middleware([allowReporter])
  .inputValidator(z.object({ folder: folderSchema.optional() }))
  .handler(async ({ data }): Promise<MediaFileRow[]> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return listMediaFiles(data.folder);
  });

export const removeMediaFile = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const user = await getSessionUser();
    if (!user) throw new Error(t("Wymagane zalogowanie."));
    return { ok: await deleteMediaFile(data.id) };
  });
