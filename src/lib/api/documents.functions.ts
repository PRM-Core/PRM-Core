import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "./require-user";
import { z } from "zod";
import {
  listDocuments,
  uploadDocument,
  deleteDocument,
  type DocumentView,
} from "../documents/documents.server";
import { getSessionUser } from "../auth/session.server";
import { t } from "@/lib/i18n";

// Warstwa RPC dokumentów. Logika w documents.server.ts — patrz nota
// w contacts.functions.ts o tym, czemu zwykły eksport tutaj wciągnąłby
// `node:fs` do przeglądarki.

export type { DocumentView };

export const getContactDocuments = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .inputValidator(z.object({ contactId: z.string().min(1) }))
  .handler(async ({ data }): Promise<DocumentView[]> => listDocuments(data.contactId));

export const uploadContactDocument = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      contactId: z.string().min(1),
      fileName: z.string().min(1),
      mimeType: z.string().default(""),
      contentBase64: z.string().min(1),
      note: z.string().default(""),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; id?: string; error?: string }> => {
    // Kto wgrał — na dokumentacji medycznej to nie ozdoba, tylko ślad audytowy.
    const user = await getSessionUser();
    if (!user) return { ok: false, error: t("Musisz być zalogowany.") };
    return uploadDocument({
      contactId: data.contactId,
      fileName: data.fileName,
      mimeType: data.mimeType,
      contentBase64: data.contentBase64,
      note: data.note,
      uploadedBy: `${user.firstName} ${user.lastName}`.trim() || user.email,
    });
  });

export const removeContactDocument = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: t("Musisz być zalogowany.") };
    return deleteDocument(data.id);
  });
