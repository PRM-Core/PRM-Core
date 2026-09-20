import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import {
  createCampaign,
  cancelCampaign,
  pauseCampaign,
  resumeCampaign,
  listCampaigns,
  type CreateCampaignInput,
} from "../campaigns/campaigns.server";
import { saveSnapshot } from "../engine/snapshots.server";
import { findContentItem, renderContentItem } from "../content/content-items.server";
import { listSegments, previewSegment, getSegment } from "../segments/segments.server";
import type { CampaignRow } from "../db/schema";
import { t } from "@/lib/i18n";

// Warstwa RPC wysyłek. Cała logika siedzi w campaigns.server.ts — patrz nota
// w contacts.functions.ts o tym, dlaczego zwykły eksport w pliku `.functions.ts`
// wciągnąłby `node:crypto` do przeglądarki.

export type { CampaignRow };

const kind = z.enum(["newsletter", "email", "sms"]);

/**
 * Publikuje treść szablonu na serwer i planuje wysyłkę.
 *
 * Jedno wywołanie, nie dwa, bo te dwie rzeczy nie mają prawa się rozjechać:
 * kampania bez migawki treści to kampania, która padnie dopiero przy wysyłce,
 * a migawka bez kampanii to śmieć w bazie.
 *
 * **Treść bierze się z bazy, nie od przeglądarki.** Wcześniej klient przynosił
 * gotowy HTML, bo szablony mieszkały w `localStorage` — przez co szablon
 * utworzony na jednym komputerze nie istniał na drugim i wysyłka była tam
 * niemożliwa. Teraz klient podaje wyłącznie rodzaj i nazwę.
 */
export const scheduleCampaign = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      kind,
      templateName: z.string().min(1),
      segmentId: z.string().min(1),
      subject: z.string().default(""),
      tags: z.array(z.string()).default([]),
      /** Milisekundy epoki albo null = wyślij teraz. */
      scheduledAt: z.number().nullable().default(null),
      /**
       * Limity tempa. `null` = bez ograniczenia.
       *
       * Górne widełki (10 000/h, 100 000/dobę) nie chronią przed niczym
       * technicznie — są po to, żeby literówka w polu („1000" zamiast „100")
       * nie przeszła niezauważona jako limit większy niż cała baza.
       */
      /**
       * Godziny wysyłki, „HH:MM". Puste = całą dobę.
       *
       * Sprawdzane wzorcem, a nie tylko długością: „7:0" przeszłoby kontrolę
       * długości i po cichu wyłączyłoby okno, bo parser nie umiałby tego
       * odczytać — a użytkownik byłby przekonany, że cisza obowiązuje.
       */
      sendFrom: z
        .string()
        .regex(/^$|^([01]?\d|2[0-3]):[0-5]\d$/, "Godzina w formacie GG:MM.")
        .default(""),
      sendTo: z
        .string()
        .regex(/^$|^([01]?\d|2[0-3]):[0-5]\d$/, "Godzina w formacie GG:MM.")
        .default(""),
      perHourLimit: z.number().int().min(1).max(10_000).nullable().default(null),
      perDayLimit: z.number().int().min(1).max(100_000).nullable().default(null),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; id?: string; error?: string }> => {
    const item = await findContentItem(data.kind, data.templateName);
    if (!item) {
      return {
        ok: false,
        error: t('Nie ma szablonu „{templateName}". Sprawdź nazwę w module {v1}.', {
          templateName: data.templateName,
          v1:
            data.kind === "sms" ? t("SMS") : data.kind === "email" ? t("E-mail") : t("Newsletter"),
        }),
      };
    }
    const rendered = renderContentItem(item);
    if (data.kind === "sms" ? !rendered.smsBody.trim() : !rendered.html.trim()) {
      return {
        ok: false,
        error: t('Szablon „{name}" nie ma jeszcze treści.', { name: item.name }),
      };
    }

    await saveSnapshot({
      kind: data.kind,
      name: item.name,
      contentItemId: rendered.contentItemId,
      subject: data.subject,
      html: rendered.html,
      smsBody: rendered.smsBody,
      config: null,
      // Załączniki idą z pozycji treści, a nie z formularza wysyłki — dzięki
      // temu nie da się wysłać kampanii bez plików, które ktoś dopiął
      // w edytorze, i nie trzeba ich wybierać drugi raz.
      attachments: rendered.attachments,
      senderId: rendered.senderId,
    });

    const input: CreateCampaignInput = {
      kind: data.kind,
      templateName: item.name,
      segmentId: data.segmentId,
      subject: data.subject,
      tags: data.tags,
      scheduledAt: data.scheduledAt,
      sendFrom: data.sendFrom,
      sendTo: data.sendTo,
      perHourLimit: data.perHourLimit,
      perDayLimit: data.perDayLimit,
    };
    return createCampaign(input);
  });

export const getCampaigns = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<CampaignRow[]> => listCampaigns());

/** „Zatrzymaj" — wstrzymuje, nie kasuje. Zamknięcie na dobre robi `killCampaign`. */
export const stopCampaign = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => pauseCampaign(data.id));

/** „Wznów" — dalej od miejsca, w którym wysyłka stanęła. */
export const resumeCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => resumeCampaign(data.id));

/** „Anuluj" — nieodwracalne. Wiadomości, które wyszły, nie wrócą. */
export const killCampaign = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => cancelCampaign(data.id));

/** Segmenty do wyboru na stronie wysyłki. */
export const getSegmentChoices = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<{ id: string; name: string; members: number }[]> => {
    const list = await listSegments();
    return list.map((s) => ({ id: s.id, name: s.name, members: s.members }));
  });

/**
 * Przelicza segment na żądanie.
 *
 * Liczba na liście segmentów bywa sprzed godziny; przed wysyłką człowiek ma
 * prawo zobaczyć stan na teraz, zanim kliknie „Wyślij”.
 */
export const countSegmentNow = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ segmentId: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ members: number; total: number; warnings: string[] }> => {
    const segment = await getSegment(data.segmentId);
    if (!segment) return { members: 0, total: 0, warnings: [t("Segment nie istnieje.")] };
    const preview = await previewSegment(segment.definition);
    return { members: preview.members, total: preview.total, warnings: preview.warnings ?? [] };
  });
