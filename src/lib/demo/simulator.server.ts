import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNotNull, lt } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { contactVisits, contacts, emailEvents, emailSends } from "../db/schema";
import { processLead } from "../leads/lead-intake.server";
import { processBooking } from "../visits/booking-intake.server";
import { announceVisitState } from "../booking-system/visits-import.server";
import { NO_SHOW_GRACE_MS } from "../booking-system/status";
import { recordEmailClick, recordEmailOpen } from "../email/tracking-events.server";
import { recordInboundMessage } from "../inbox/inbox.server";
import { demoOutbox, ensureDemoOutbox } from "./outbox.server";
import { nextPersonNumber, noShowChance, warsawAt } from "./seed.server";
import {
  DEMO_DOCTORS,
  DEMO_SERVICES,
  DEMO_SITES,
  LEAD_SOURCES,
  PATIENT_REPLIES,
  hashUnit,
  pickOne,
  syntheticPerson,
} from "./synthetic";

/**
 * The demo simulator — one step of a clinic's day, run on the engine clock.
 *
 * **Everything goes through the product's own entrances**, never around them:
 * a lead through the lead webhook's intake (`processLead`), a booking through
 * the booking webhook's (`processBooking`), a visit's outcome the way a booking
 * system reports it (`announceVisitState`), opens and clicks through the
 * tracking routes' recorder, a reply through the inbox. The engine, the
 * automations and PRM_Agent then react exactly as they would in a clinic —
 * the simulator never writes an automation's result itself.
 *
 * Outcomes are decided by a hash of the visit's or the send's id, not a coin
 * flipped each step: a visit is a no-show or not once and for all, so a step
 * missed or repeated changes nothing.
 */

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

export interface SimulatorStep {
  leads: number;
  bookings: number;
  completed: number;
  noShows: number;
  cancelled: number;
  opens: number;
  clicks: number;
  replies: number;
}

const empty = (): SimulatorStep => ({
  leads: 0,
  bookings: 0,
  completed: 0,
  noShows: 0,
  cancelled: 0,
  opens: 0,
  clicks: 0,
  replies: 0,
});

/** Per-step chances — at the default 30 s step, a lead and a booking every 3–4 minutes. */
export const RATES = { lead: 0.15, booking: 0.18, cancel: 0.04, reply: 0.1 };

/** A new lead, as an ad form would post it to the lead webhook. */
async function newLead(r: () => number): Promise<boolean> {
  const p = syntheticPerson(r, await nextPersonNumber(), false);
  const src = pickOne(r, LEAD_SOURCES);
  const reply = await processLead({
    first_name: p.firstName,
    last_name: p.lastName,
    email: p.email,
    phone: p.phone,
    source: src.source,
    medium: src.medium,
    campaign: src.campaign,
    status: "Lead",
    tags: src.source === "Meta" ? "meta-lead" : "",
    consentEmail: true,
    consentSms: r() > 0.1,
  });
  return reply.status === 200;
}

/**
 * A booking, as the booking system would post it: for a returning patient
 * now and then, otherwise for somebody new. A third of them start within
 * the next two and a half hours, so a visitor sees visits end, too.
 */
async function newBooking(r: () => number, now: number): Promise<boolean> {
  const db = getDb();
  let who: { firstName: string; lastName: string; email: string; phone: string; pesel: string };
  if (r() < 0.35) {
    const pool = await db.select().from(contacts).orderBy(desc(contacts.createdAt)).limit(80);
    const known = pool.filter((c) => c.email || c.phone);
    if (known.length === 0) return false;
    const c = pickOne(r, known);
    who = {
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      pesel: "",
    };
  } else {
    who = syntheticPerson(r, await nextPersonNumber());
  }
  const svc = pickOne(r, DEMO_SERVICES);
  let startsAt: number;
  if (r() < 0.35) {
    startsAt = Math.ceil((now + (40 + r() * 110) * MIN) / (10 * MIN)) * 10 * MIN;
  } else {
    startsAt = warsawAt(
      now,
      1 + Math.floor(r() * 14),
      8 + Math.floor(r() * 10),
      pickOne(r, [0, 20, 40]),
    );
  }
  const iso = new Date(startsAt).toISOString();
  const result = await processBooking({
    imie: who.firstName,
    nazwisko: who.lastName,
    telefon: who.phone,
    email: who.email,
    pesel: who.pesel,
    usluga: svc.title,
    lekarz: DEMO_DOCTORS[pickOne(r, svc.doctors)],
    specjalizacja: svc.specialization,
    placowka: pickOne(r, DEMO_SITES),
    visitAt: iso,
    cena: svc.price,
    idx_terminu: 100_000 + Math.floor(r() * 899_999_999),
    tagi: [svc.specialization.toLowerCase()],
    zgoda_email: true,
    zgoda_sms: r() > 0.15,
    zgoda_profilowanie: true,
    zgoda_regulamin: true,
    zgoda_marketingowa: r() > 0.3,
    source: "Rejestracja online",
  });
  return result.ok;
}

/**
 * Visits whose time has come: completed, or — once the two hours of grace
 * have passed — a no-show, with the same chance the seed used, so the model
 * keeps learning the same pattern.
 */
async function resolveVisits(now: number, out: SimulatorStep): Promise<void> {
  const db = getDb();
  const due = await db
    .select()
    .from(contactVisits)
    .where(
      and(
        eq(contactVisits.stateEventSent, ""),
        eq(contactVisits.systemStatus, ""),
        isNotNull(contactVisits.startsAt),
        lt(contactVisits.startsAt, now - 15 * MIN),
      ),
    )
    .orderBy(contactVisits.startsAt)
    .limit(25);
  // Visits written by the seed or the booking system carry "booked"; a webhook booking carries "".
  const dueBooked = await db
    .select()
    .from(contactVisits)
    .where(
      and(
        eq(contactVisits.stateEventSent, ""),
        eq(contactVisits.systemStatus, "booked"),
        isNotNull(contactVisits.startsAt),
        lt(contactVisits.startsAt, now - 15 * MIN),
      ),
    )
    .orderBy(contactVisits.startsAt)
    .limit(25);
  for (const v of [...due, ...dueBooked]) {
    const c = await db.select().from(contacts).where(eq(contacts.id, v.contactId)).get();
    if (!c) continue;
    const earlier = await db
      .select({ s: contactVisits.stateEventSent })
      .from(contactVisits)
      .where(
        and(eq(contactVisits.contactId, v.contactId), lt(contactVisits.startsAt, v.startsAt!)),
      );
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Warsaw",
        hour: "numeric",
        hour12: false,
      })
        .format(new Date(v.startsAt!))
        .replace(/\D/g, ""),
    );
    const chance = noShowChance({
      leadDays: Math.max(0, (v.startsAt! - v.createdAt) / DAY),
      priorNoShows: earlier.filter((e) => e.s === "no_show").length,
      consentSms: c.consentSms === 1,
      hour,
      recent: true,
    });
    if (hashUnit(v.id) < chance) {
      if (now <= v.startsAt! + NO_SHOW_GRACE_MS) continue;
      // Still "booked" two hours after the start: that is what a no-show is.
      if (v.systemStatus !== "booked")
        await db
          .update(contactVisits)
          .set({ systemStatus: "booked" })
          .where(eq(contactVisits.id, v.id));
      out.noShows += await announceVisitState(v.id, v.contactId, "no_show", v.title, 0);
    } else {
      await db
        .update(contactVisits)
        .set({ systemStatus: "completed" })
        .where(eq(contactVisits.id, v.id));
      out.completed += await announceVisitState(v.id, v.contactId, "completed", v.title, 0);
    }
  }
}

/** Now and then a patient cancels an upcoming visit. */
async function cancelOne(r: () => number, now: number): Promise<boolean> {
  const db = getDb();
  const upcoming = await db
    .select()
    .from(contactVisits)
    .where(and(eq(contactVisits.stateEventSent, ""), gt(contactVisits.startsAt, now + 60 * MIN)))
    .orderBy(contactVisits.startsAt)
    .limit(40);
  const open = upcoming.filter((v) => v.systemStatus !== "cancelled");
  if (open.length === 0) return false;
  const v = pickOne(r, open);
  await db
    .update(contactVisits)
    .set({ systemStatus: "cancelled" })
    .where(eq(contactVisits.id, v.id));
  return (await announceVisitState(v.id, v.contactId, "cancelled", v.title, 0)) > 0;
}

/**
 * Patients open and click what the engine really sent them, a few minutes
 * later. Whether a given message is opened is fixed by its token.
 */
async function engage(now: number, out: SimulatorStep): Promise<void> {
  const db = getDb();
  const recent = await db
    .select()
    .from(emailSends)
    .where(gt(emailSends.sentAt, now - DAY))
    .orderBy(desc(emailSends.sentAt))
    .limit(200);
  if (recent.length === 0) return;
  const tokens = recent.map((s) => s.token);
  const seen = await db
    .select({ token: emailEvents.token, kind: emailEvents.kind })
    .from(emailEvents)
    .where(inArray(emailEvents.token, tokens));
  const has = (token: string, kind: string) =>
    seen.some((e) => e.token === token && e.kind === kind);
  for (const s of recent) {
    if (hashUnit(`${s.token}:open`) >= 0.5) continue;
    const openAt = s.sentAt + (1 + hashUnit(`${s.token}:delay`) * 8) * MIN;
    if (now < openAt) continue;
    if (!has(s.token, "open") && (await recordEmailOpen(s.token, now))) out.opens++;
    if (hashUnit(`${s.token}:click`) >= 0.45 || has(s.token, "click")) continue;
    if (now < openAt + 2 * MIN) continue;
    await recordEmailClick(s.token, "https://example.test/umow-wizyte", undefined, now);
    out.clicks++;
  }
}

/** A patient writes back — preferably somebody the demo just "sent" something to. */
async function reply(r: () => number, now: number): Promise<boolean> {
  const db = getDb();
  await ensureDemoOutbox();
  const lately = await db
    .select({ to: demoOutbox.to, channel: demoOutbox.channel })
    .from(demoOutbox)
    .where(gt(demoOutbox.createdAt, now - 3 * 60 * MIN))
    .orderBy(desc(demoOutbox.createdAt))
    .limit(30);
  const msg = pickOne(r, PATIENT_REPLIES);
  let contactId: string | null = null;
  const addressed = lately.filter((m) => m.channel === msg.channel);
  if (addressed.length > 0) {
    const to = pickOne(r, addressed).to;
    const c = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(msg.channel === "sms" ? eq(contacts.phone, to) : eq(contacts.email, to))
      .get();
    contactId = c?.id ?? null;
  }
  if (!contactId) {
    const pool = await db
      .select({ id: contacts.id, email: contacts.email, phone: contacts.phone })
      .from(contacts)
      .where(eq(contacts.status, "patient"))
      .limit(200);
    const reachable = pool.filter((c) => (msg.channel === "sms" ? c.phone : c.email));
    if (reachable.length === 0) return false;
    contactId = pickOne(r, reachable).id;
  }
  await recordInboundMessage({
    contactId,
    channel: msg.channel,
    subject: msg.subject,
    body: msg.body,
    source: msg.channel,
    externalId: `demo-sim-${randomUUID()}`,
    occurredAt: now,
  });
  return true;
}

/** One step. `r` is the randomness — `Math.random` live, a seeded generator in tests. */
export async function simulateStep(
  now = Date.now(),
  r: () => number = Math.random,
): Promise<SimulatorStep> {
  const out = empty();
  await resolveVisits(now, out);
  await engage(now, out);
  if (r() < RATES.lead && (await newLead(r))) out.leads++;
  if (r() < RATES.booking && (await newBooking(r, now))) out.bookings++;
  if (r() < RATES.cancel && (await cancelOne(r, now))) out.cancelled++;
  if (r() < RATES.reply && (await reply(r, now))) out.replies++;
  return out;
}
