import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { popupSettings, popupEvents } from "../db/schema";
import type { PopupConfig } from "../content-builder";

// Publishing popups to the tracked site. Several can be live at once —
// `priority` orders them, and the tracker shows the first one a given visitor
// is actually eligible for (device targeting + capping). The HTML is rendered
// client-side at activation (renderContentItemToFragment, same
// snapshot-at-send pattern as sendTestEmail) because the block content lives
// in localStorage, out of the server's reach.

const popupConfigSchema = z.object({
  format: z.enum(["modal", "corner", "bar"]),
  corner: z.enum(["bottom-right", "bottom-left"]),
  width: z.number().min(200).max(1200),
  height: z.number().min(0).max(800),
  devices: z.enum(["all", "desktop", "mobile"]),
  cappingMode: z.enum(["session", "day"]),
  cappingLimit: z.number().min(1).max(50),
  // Defaulted rather than required: rows published before URL targeting
  // existed still validate when they're re-published.
  urlMode: z.enum(["all", "match"]).default("all"),
  urlRules: z.array(z.string()).default([]),
  // Domyślne, nie wymagane — z tego samego powodu co `urlMode` niżej: pop-up
  // opublikowany przed dodaniem tych pól ma się nadal walidować przy ponownej
  // publikacji, zamiast wywalać zapis komunikatem o brakującym kluczu.
  background: z.string().default(""),
  backgroundImage: z.string().default(""),
  textColor: z.string().default(""),
  overlay: z.string().default(""),
  startsAt: z.string().default(""),
  endsAt: z.string().default(""),
});

export interface ActivePopup {
  contentItemId: string;
  name: string;
  config: PopupConfig;
  priority: number;
}

/** Every published popup, in the order the tracker will consider them. */
export const getActivePopups = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<ActivePopup[]> => {
    const db = getDb();
    const rows = await db.select().from(popupSettings).orderBy(asc(popupSettings.priority));
    return rows.map((r) => ({
      contentItemId: r.contentItemId,
      name: r.name,
      config: r.config as PopupConfig,
      priority: r.priority,
    }));
  });

export const activatePopup = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      contentItemId: z.string().min(1),
      name: z.string().min(1),
      html: z.string().min(1),
      config: popupConfigSchema,
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const existing = await db
      .select()
      .from(popupSettings)
      .where(eq(popupSettings.contentItemId, data.contentItemId))
      .get();
    const now = new Date().toISOString();

    if (existing) {
      // Re-publish (content or settings changed) — keep its place in the order.
      await db
        .update(popupSettings)
        .set({ name: data.name, html: data.html, config: data.config, updatedAt: now })
        .where(eq(popupSettings.id, existing.id));
      return { ok: true };
    }

    const all = await db.select().from(popupSettings);
    const nextPriority = all.reduce((max, r) => Math.max(max, r.priority), -1) + 1;
    await db.insert(popupSettings).values({
      contentItemId: data.contentItemId,
      name: data.name,
      html: data.html,
      config: data.config,
      priority: nextPriority,
      updatedAt: now,
    });
    return { ok: true };
  });

export const deactivatePopup = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ contentItemId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const db = getDb();
    await db.delete(popupSettings).where(eq(popupSettings.contentItemId, data.contentItemId));
    return { ok: true };
  });

/** Rewrites the whole order in one go — the UI sends the ids as they should be checked. */
export const reorderPopups = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ contentItemIds: z.array(z.string()) }))
  .handler(async ({ data }) => {
    const db = getDb();
    for (let i = 0; i < data.contentItemIds.length; i++) {
      await db
        .update(popupSettings)
        .set({ priority: i })
        .where(eq(popupSettings.contentItemId, data.contentItemIds[i]));
    }
    return { ok: true };
  });

/**
 * Wyświetlenia i kliknięcia w rozbiciu na treść.
 *
 * Liczone **agregatem z tabeli zdarzeń**, nie licznikami — patrz `popupEvents`
 * w schemacie. Zwraca komplet naraz, bo lista pop-upów i tak pokazuje wszystkie
 * pozycje; zapytanie na pozycję dałoby kilkanaście zapytań przy otwarciu strony.
 *
 * `unique` liczy **osoby, nie odsłony**: pop-up pokazany sto razy jednemu
 * gościowi to nie to samo co pokazany stu, a różnicy nie widać po samej sumie.
 */
export const getPopupStats = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(
    async (): Promise<
      Record<string, { impressions: number; clicks: number; unique: number; lastAt: number }>
    > => {
      const rows = await getDb()
        .select({
          contentItemId: popupEvents.contentItemId,
          kind: popupEvents.kind,
          n: sql<number>`count(*)`,
          uniques: sql<number>`count(distinct nullif(${popupEvents.visitorId}, ''))`,
          lastAt: sql<number>`max(${popupEvents.createdAt})`,
        })
        .from(popupEvents)
        .groupBy(popupEvents.contentItemId, popupEvents.kind);

      const out: Record<
        string,
        { impressions: number; clicks: number; unique: number; lastAt: number }
      > = {};
      for (const r of rows) {
        const entry = (out[r.contentItemId] ??= {
          impressions: 0,
          clicks: 0,
          unique: 0,
          lastAt: 0,
        });
        if (r.kind === "click") entry.clicks += Number(r.n);
        else {
          entry.impressions += Number(r.n);
          // Unikalni liczeni z wyświetleń: to one mówią, ilu ludzi w ogóle
          // zobaczyło pop-up. Kliknięcia są podzbiorem i podwajałyby rachunek.
          entry.unique = Number(r.uniques);
        }
        entry.lastAt = Math.max(entry.lastAt, Number(r.lastAt ?? 0));
      }
      return out;
    },
  );
