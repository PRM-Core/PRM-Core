// Część wspólna biblioteki Media — bezpieczna dla przeglądarki.
//
// Wydzielona z media.server.ts, bo importuje ją walidacja w *.functions.ts,
// a ta przeżywa w bundlu klienta; import z pliku serwerowego wciągnąłby
// node:fs do przeglądarki (ta sama zasada co przy contacts.server.ts).

export const MEDIA_FOLDERS = ["email", "newsletter", "popup", "inne"] as const;
export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

/** Nazwy folderów, jak widzi je człowiek w zakładce Media. */
export const MEDIA_FOLDER_LABELS: Record<MediaFolder, string> = {
  email: "Email",
  newsletter: "Newsletter",
  popup: "Pop-Up",
  inne: "Inne",
};
