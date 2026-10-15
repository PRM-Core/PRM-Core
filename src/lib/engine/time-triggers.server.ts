import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { automations, contactVisits, contacts, engineTimeFires } from "../db/schema";
import type { ContactVisitRow, EngineEventType } from "../db/schema";
import { outcome } from "../agent/signals.server";
import { warsawDay } from "../visits/warsaw-time";
import { emitEvent } from "./events.server";
import { birthDateFromPesel, birthdayDue, recallDue } from "./time-triggers";

// The scan behind the time-based triggers. Nothing happens when a date comes,
// so the engine looks: every few minutes it finds, for each active automation
// with such a trigger, the patients whose date has come, records the firing
// (engine_time_fires — one per visit, one a year) and writes an ordinary
// engine event. From there the run starts exactly like any other: the same
// "one live run per patient" rule, the same log, the same queue.

const SCAN_EVERY_MS = 10 * 60_000;
let lastScanAt = 0;

export const TIME_TRIGGERS: Record<string, EngineEventType> = {
  visit_months_ago: "time.visit_months_ago",
  birthday: "time.birthday",
};

interface Want {
  automationId: string;
  key: string;
  config: Record<string, string>;
}

const contains = (haystack: string, needle: string) =>
  !needle.trim() || haystack.toLowerCase().includes(needle.trim().toLowerCase());

/**
 * Fire the time-based triggers that are due. Returns how many journeys it
 * asked for. `force` skips the every-ten-minutes guard (tests, a manual tick).
 */
export async function scanTimeTriggers(now = Date.now(), force = false): Promise<number> {
  if (!force && now - lastScanAt < SCAN_EVERY_MS) return 0;
  lastScanAt = now;

  const db = getDb();
  const active = await db.select().from(automations).where(eq(automations.status, "active"));
  const wants: Want[] = [];
  for (const a of active)
    for (const n of a.flow?.nodes ?? [])
      if (n.kind === "trigger" && n.key && TIME_TRIGGERS[n.key])
        wants.push({ automationId: a.id, key: n.key, config: n.config ?? {} });
  if (wants.length === 0) return 0;

  const today = warsawDay(now);
  const fired = new Set(
    (
      await db
        .select()
        .from(engineTimeFires)
        .where(
          inArray(
            engineTimeFires.automationId,
            wants.map((w) => w.automationId),
          ),
        )
    ).map((f) => `${f.automationId}|${f.contactId}|${f.occurrence}`),
  );

  let started = 0;
  const fire = async (
    w: Want,
    contactId: string,
    occurrence: string,
    extra: Record<string, string>,
  ) => {
    const key = `${w.automationId}|${contactId}|${occurrence}`;
    if (fired.has(key)) return;
    fired.add(key);
    const inserted = await db
      .insert(engineTimeFires)
      .values({
        id: randomUUID(),
        automationId: w.automationId,
        contactId,
        occurrence,
        firedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: engineTimeFires.id });
    if (inserted.length === 0) return; // another process got there first
    await emitEvent({
      type: TIME_TRIGGERS[w.key],
      contactId,
      payload: { automationId: w.automationId, occurrence, ...extra },
    });
    started += 1;
  };

  // ── N months since the last visit ─────────────────────────────────────────
  const recallWants = wants.filter((w) => w.key === "visit_months_ago");
  if (recallWants.length > 0) {
    const visits = await db.select().from(contactVisits);
    const byContact = new Map<string, ContactVisitRow[]>();
    for (const v of visits) {
      const list = byContact.get(v.contactId) ?? [];
      list.push(v);
      byContact.set(v.contactId, list);
    }
    for (const w of recallWants) {
      const months = Math.floor(Number(w.config.months) || 12);
      const service = w.config.service ?? "";
      const onlyIfNothingBooked = w.config.booked !== "nie";
      const includeOverdue = w.config.overdue === "tak";
      for (const [contactId, list] of byContact) {
        const relevant = list.filter((v) => contains(v.title, service));
        const done = relevant.filter((v) => outcome(v, now) === 0 && v.startsAt !== null);
        if (done.length === 0) continue;
        const last = done.reduce((a, b) =>
          (b.startsAt as number) > (a.startsAt as number) ? b : a,
        );
        const booked = relevant.some(
          (v) => v.startsAt !== null && v.startsAt > now && v.systemStatus !== "cancelled",
        );
        if (onlyIfNothingBooked && booked) continue;
        if (!recallDue(warsawDay(last.startsAt as number), months, today, includeOverdue)) continue;
        await fire(w, contactId, `${last.id}:${months}`, {
          months: String(months),
          lastVisitAt: new Date(last.startsAt as number).toISOString(),
          title: last.title,
          doctor: last.doctor,
        });
      }
    }
  }

  // ── birthday, from the PESEL ──────────────────────────────────────────────
  const birthdayWants = wants.filter((w) => w.key === "birthday");
  if (birthdayWants.length > 0) {
    const people = await db
      .select({ id: contacts.id, pesel: contacts.pesel })
      .from(contacts)
      .where(and(ne(contacts.pesel, "")));
    for (const p of people) {
      const birth = birthDateFromPesel(p.pesel ?? "");
      if (!birth || !birthdayDue(birth, today)) continue;
      for (const w of birthdayWants) await fire(w, p.id, today.slice(0, 4), {});
    }
  }

  return started;
}

/** Tests only — the next scan runs regardless of the last one. */
export function resetTimeScan(): void {
  lastScanAt = 0;
}
