import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { funnels, contactFunnelProgress } from "../db/schema";
import { seedFunnels, type Funnel, type ContactFunnelProgress } from "../funnels";
import { shouldSeedDemoData } from "../db/demo-seed.server";
import { emitEvent } from "../engine/events.server";

const funnelStageInput = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
});

async function ensureSeeded() {
  if (!shouldSeedDemoData()) return;
  const db = getDb();
  const existing = await db.select().from(funnels).limit(1);
  if (existing.length > 0) return;
  for (const f of seedFunnels) {
    await db.insert(funnels).values(f);
  }
}

/** All funnels available in the system — seeded once, then fully user-managed. */
export const getAllFunnels = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<Funnel[]> => {
    await ensureSeeded();
    const db = getDb();
    return db.select().from(funnels);
  });

export const saveFunnel = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      id: z.string(),
      name: z.string().min(1),
      stages: z.array(funnelStageInput),
      updatedAt: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const existing = await db.select().from(funnels).where(eq(funnels.id, data.id)).get();
    if (existing) {
      await db.update(funnels).set(data).where(eq(funnels.id, data.id));
    } else {
      await db.insert(funnels).values(data);
    }
    return { ok: true };
  });

export const deleteFunnel = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    await db.delete(funnels).where(eq(funnels.id, data.id));
    return { ok: true };
  });

/** How many contacts currently have their funnel progress pointed at this funnel. */
export const countContactsInFunnel = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ funnelId: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(contactFunnelProgress)
      .where(eq(contactFunnelProgress.funnelId, data.funnelId));
    return rows.length;
  });

/**
 * The funnel + stage a contact is on, or `funnelId: ""` when they are on none.
 *
 * "No funnel" is a real state, not a missing value. This used to fall back to
 * the first funnel in the list, which meant every contact *looked* enrolled in
 * whatever funnel happened to be first — and, combined with the card writing
 * that value straight back, merely opening a contact silently enrolled them.
 * A funnel is now something somebody assigns, by hand or by automation.
 */
export const getContactFunnelProgress = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ contactId: z.string() }))
  .handler(async ({ data }): Promise<ContactFunnelProgress> => {
    await ensureSeeded();
    const db = getDb();
    const [existing, allFunnels] = await Promise.all([
      db
        .select()
        .from(contactFunnelProgress)
        .where(eq(contactFunnelProgress.contactId, data.contactId))
        .get(),
      db.select().from(funnels),
    ]);
    // A row pointing at a deleted funnel is also "no funnel" — showing a stage
    // of something that no longer exists would be worse than showing nothing.
    if (existing && allFunnels.some((f) => f.id === existing.funnelId)) {
      return { funnelId: existing.funnelId, stageIndex: existing.stageIndex };
    }
    return { funnelId: "", stageIndex: 0 };
  });

export const setContactFunnelProgress = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ contactId: z.string(), funnelId: z.string(), stageIndex: z.number() }))
  .handler(async ({ data }) => {
    const db = getDb();

    // An empty funnelId means "take this contact out of every funnel" — the
    // row is deleted rather than blanked, so "no funnel" is the absence of a
    // record everywhere in the system.
    //
    // No `funnel.stage_changed` is emitted here on purpose: that trigger is
    // called "Zmiana etapu" and every automation built on it assumes the
    // contact is standing *somewhere*. Firing it with no stage would run those
    // scenarios for somebody who just left the funnel entirely.
    if (!data.funnelId) {
      await db
        .delete(contactFunnelProgress)
        .where(eq(contactFunnelProgress.contactId, data.contactId));
      return { ok: true };
    }

    const existing = await db
      .select()
      .from(contactFunnelProgress)
      .where(eq(contactFunnelProgress.contactId, data.contactId))
      .get();
    if (existing) {
      await db
        .update(contactFunnelProgress)
        .set({ funnelId: data.funnelId, stageIndex: data.stageIndex })
        .where(eq(contactFunnelProgress.contactId, data.contactId));
    } else {
      await db.insert(contactFunnelProgress).values(data);
    }

    // Only a genuine move emits — re-saving the same stage (a re-render, a
    // double click on "Następny etap") must not re-trigger automations.
    if (
      !existing ||
      existing.stageIndex !== data.stageIndex ||
      existing.funnelId !== data.funnelId
    ) {
      await emitEvent({
        type: "funnel.stage_changed",
        contactId: data.contactId,
        payload: { funnelId: data.funnelId, stageIndex: String(data.stageIndex) },
      });
    }

    return { ok: true };
  });
