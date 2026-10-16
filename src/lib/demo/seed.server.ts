import { randomUUID } from "node:crypto";
import { eq, like, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  appSettings,
  automations,
  contactVisits,
  contacts,
  contentItems,
  emailEvents,
  emailSenders,
  emailSends,
  emailSettings,
  engineEvents,
  engineSettings,
  knowledgeEntries,
  knowledgeGaps,
  segments,
  smsSenders,
  smsSends,
} from "../db/schema";
import type { AutomationEdge, AutomationGraph, AutomationNode } from "../automation-flow";
import { makeBlock, type BuilderKind, type ContentItem } from "../content-builder";
import { renderContentItem } from "../content/content-items.server";
import { saveSnapshot } from "../engine/snapshots.server";
import { markThreadRead, recordInboundMessage, recordOutboundMessage } from "../inbox/inbox.server";
import { warsawDay, warsawWallClockToIso } from "../visits/warsaw-time";
import { logStep } from "../engine/log.server";
import { ensureDemoOutbox } from "./outbox.server";
import {
  DEMO_DOCTORS,
  DEMO_SERVICES,
  DEMO_SITES,
  LEAD_SOURCES,
  PATIENT_REPLIES,
  pickOne,
  rng,
  syntheticPerson,
} from "./synthetic";
import { t } from "@/lib/i18n";

/**
 * The demo's seed state, and the reset that brings it back.
 *
 * The seed is shaped so that **every screen has something true to show** the
 * moment the demo starts — not a sprinkle of rows, but a history with the
 * patterns PRM_Agent looks for:
 *
 * - visits over two years, with no-shows depending on how far ahead the visit
 *   was booked, earlier no-shows, the hour and SMS consent — so the no-show
 *   model has hundreds of resolved visits and a real signal to learn;
 * - more no-shows in the last 30 days than in the 30 before (the agent's
 *   "no-shows rising" recommendation), and fewer e-mail opens (the open-rate one);
 * - patients due for a recall, after one visit without a second, drifting
 *   away, and seen in the last week without a word since — each agent list;
 * - leads from ads, a filled inbox, a knowledge base with gaps, segments,
 *   and automations that react to everything the simulator does next.
 *
 * Every person is synthetic (`synthetic.ts`). Nothing here sends anything: the
 * history is written straight to the tables, and the engine's event queue is
 * emptied afterwards, so the automations start with tomorrow's patients, not
 * with replaying the seed.
 */

const DAY = 24 * 60 * 60 * 1000;
const DEMO_DB_KEY = "demo.database";
export const PERSON_COUNTER_KEY = "demo.person.next";

/**
 * Tables the reset leaves alone: accounts and sessions (the demo's visitors
 * stay signed in), the installation's own configuration and secrets, and the
 * audit trail. **Everything else is emptied** — a table added in a later
 * release is patient data until someone decides otherwise, so it is wiped by
 * default rather than kept by default.
 */
const KEEP_TABLES = new Set([
  "__drizzle_migrations",
  "users",
  "user_totp",
  "totp_recovery_codes",
  "sessions",
  "login_challenges",
  "trusted_devices",
  "password_resets",
  "app_settings",
  "integration_credentials",
  "audit_log",
  "engine_settings",
  "ai_settings",
  "lead_webhook_settings",
  "inbox_webhook_settings",
  "webhook_endpoints",
  "canva_connections",
  "meta_connections",
  "sms_settings",
  "contact_statuses",
  "contact_field_defs",
  "consent_defs",
  "custom_reports",
  "tracking_domains",
  "popup_settings",
  "media_files",
  "feeds",
  "feed_rows",
  "treatment_plans",
]);

export class DemoResetRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoResetRefused";
  }
}

/** Sample addresses — the demo's own, and the lazy seed's of a fresh checkout. */
const sampleEmail = (e: string) => !e || /@example\.(test|com|org)$/i.test(e.trim());
const samplePhone = (p: string) => !p || p.replace(/[\s-]/g, "").startsWith("+48000");

/**
 * The second line of defence against `PRM_DEMO=1` set on the wrong server:
 * the reset deletes patients, so it runs only on a database the demo created
 * (marked on the first reset) or one holding nothing but sample contacts.
 */
export async function assertDemoDatabase(): Promise<void> {
  const db = getDb();
  const marker = await db.select().from(appSettings).where(eq(appSettings.key, DEMO_DB_KEY)).get();
  if (marker?.value === "1") return;
  const people = await db.select({ email: contacts.email, phone: contacts.phone }).from(contacts);
  const real = people.filter((p) => !sampleEmail(p.email) || !samplePhone(p.phone));
  if (real.length > 0) {
    throw new DemoResetRefused(
      t(
        "Reset demo odmówiony: w bazie są kontakty, które nie wyglądają na dane przykładowe ({n}). Tryb demo (PRM_DEMO) uruchamia się na pustej bazie.",
        { n: real.length },
      ),
    );
  }
}

async function setSetting(key: string, value: string): Promise<void> {
  await getDb()
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

export async function nextPersonNumber(): Promise<number> {
  const db = getDb();
  const row = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, PERSON_COUNTER_KEY))
    .get();
  const n = Number(row?.value) || 1;
  await setSetting(PERSON_COUNTER_KEY, String(n + 1));
  return n;
}

async function wipe(): Promise<void> {
  const db = getDb();
  await ensureDemoOutbox();
  const rows = (await db.all(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  )) as { name: string }[];
  const targets = rows.map((r) => r.name).filter((n) => !KEEP_TABLES.has(n));
  // Two passes: a child table emptied after its parent would trip a foreign key.
  let left = targets;
  for (let pass = 0; pass < 3 && left.length > 0; pass++) {
    const failed: string[] = [];
    for (const name of left) {
      try {
        await db.run(sql.raw(`DELETE FROM "${name.replace(/"/g, '""')}"`));
      } catch {
        failed.push(name);
      }
    }
    left = failed;
  }
  if (left.length > 0) throw new Error(`demo reset: could not empty ${left.join(", ")}`);
  // Content seeds of a fresh install come back on their own once their marker is gone.
  await db.delete(appSettings).where(like(appSettings.key, "content-seeded:%"));
  await db.delete(appSettings).where(eq(appSettings.key, "agent.nightly.day"));
}

// ── settings: senders, the engine's window ─────────────────────────────────

export const DEMO_FROM_EMAIL = "recepcja@example.test";
export const DEMO_SMS_SENDER = "+48000999000";

async function seedSettings(now: number): Promise<void> {
  const db = getDb();
  const stamp = new Date(now).toISOString();
  const settings = await db.select().from(emailSettings).get();
  if (settings)
    await db
      .update(emailSettings)
      .set({ fromEmail: DEMO_FROM_EMAIL, fromName: "Przychodnia Demo", updatedAt: stamp })
      .where(eq(emailSettings.id, settings.id));
  else
    await db.insert(emailSettings).values({
      fromEmail: DEMO_FROM_EMAIL,
      fromName: "Przychodnia Demo",
      updatedAt: stamp,
    });
  await db.insert(emailSenders).values({
    id: "demo-sender",
    name: "Przychodnia Demo",
    email: "",
    note: "",
    isDefault: 1,
    createdAt: now,
  });
  await db.insert(smsSenders).values({
    id: "demo-sms",
    label: "Rejestracja",
    value: DEMO_SMS_SENDER,
    kind: "number",
    isDefault: 1,
    createdAt: now,
  });
  // Any hour, no limits: a demo visited at 22:00 must still show messages going out.
  const engine = await db.select().from(engineSettings).get();
  const patch = {
    enabled: 1,
    sendFrom: "",
    sendTo: "",
    perHourLimit: null,
    perDayLimit: null,
    marketingPerWeek: null,
    updatedAt: stamp,
  };
  if (engine) await db.update(engineSettings).set(patch).where(eq(engineSettings.id, engine.id));
  else await db.insert(engineSettings).values(patch);
}

// ── templates and automations ──────────────────────────────────────────────

const merge = (field: string, label: string) =>
  `<span class="pf-merge" data-field="${field}">${label}</span>`;

const FOOTER = `<p style="font-size:12px;color:#6b7280">Przychodnia Demo · dane symulowane, wiadomość nie została wysłana. ${merge("unsubscribeLink", "Wypisz się")}</p>`;

interface DemoTemplate {
  kind: BuilderKind;
  name: string;
  heading?: string;
  text?: string;
  button?: string;
  sms?: string;
}

export const DEMO_TEMPLATES: DemoTemplate[] = [
  {
    kind: "email",
    name: "Powitanie leada",
    heading: "Dzień dobry!",
    text: `<p>Dzień dobry ${merge("firstName", "Imię")}, dziękujemy za zainteresowanie. Pierwszą konsultację umówisz online w dwie minuty — albo odpisz na tę wiadomość, a oddzwonimy.</p>`,
    button: "Umów konsultację",
  },
  {
    kind: "email",
    name: "Ankieta po wizycie",
    heading: "Jak oceniasz wizytę?",
    text: `<p>${merge("firstName", "Imię")}, dziękujemy za wizytę. Jedno kliknięcie — i wiemy, co poprawić.</p>`,
    button: "Oceń wizytę",
  },
  {
    kind: "email",
    name: "Odwołana wizyta — nowy termin",
    heading: "Wizyta odwołana",
    text: `<p>${merge("firstName", "Imię")}, Twoja wizyta została odwołana. Wybierz nowy termin — wolne miejsca są już w tym tygodniu.</p>`,
    button: "Wybierz nowy termin",
  },
  {
    kind: "email",
    name: "Zaproszenie na kontrolę",
    heading: "Minął rok od wizyty",
    text: `<p>${merge("firstName", "Imię")}, minął rok od ostatniej wizyty. Zapraszamy na kontrolę.</p>`,
    button: "Umów kontrolę",
  },
  {
    kind: "sms",
    name: "Potwierdzenie wizyty (SMS)",
    sms: "Dzień dobry {{firstName}}, potwierdzamy rezerwację wizyty w Przychodni Demo. Odpisz TAK, jeśli będziesz.",
  },
  {
    kind: "sms",
    name: "Zaproszenie na konsultację (SMS)",
    sms: "{{firstName}}, nie udało się nam porozmawiać — pierwsza konsultacja w Przychodni Demo czeka. Odpisz, oddzwonimy.",
  },
  {
    kind: "sms",
    name: "Nieobecność (SMS)",
    sms: "{{firstName}}, nie widzieliśmy się dziś na wizycie. Odpisz, a znajdziemy nowy termin.",
  },
];

function templateItem(tpl: DemoTemplate, i: number, now: number): ContentItem {
  const id = `demo-tpl-${i + 1}`;
  if (tpl.kind === "sms")
    return {
      id,
      kind: "sms",
      name: tpl.name,
      source: "blocks",
      status: "ready",
      blocks: [],
      smsBody: tpl.sms ?? "",
      updatedAt: warsawDay(now),
    };
  return {
    id,
    kind: tpl.kind,
    name: tpl.name,
    source: "blocks",
    status: "ready",
    updatedAt: warsawDay(now),
    blocks: [
      makeBlock("header", {
        logoText: "Przychodnia Demo",
        tagline: "Dane symulowane",
        logoImageUrl: "",
      }),
      makeBlock("heading", { text: tpl.heading ?? tpl.name, align: "left" }),
      makeBlock("text", { html: tpl.text ?? "", align: "left" }),
      makeBlock("button", {
        label: tpl.button ?? "Dalej",
        url: "https://example.test/umow-wizyte",
        align: "center",
      }),
      makeBlock("text", { html: FOOTER, align: "center" }),
    ],
  };
}

async function seedTemplates(now: number): Promise<void> {
  const db = getDb();
  for (const [i, tpl] of DEMO_TEMPLATES.entries()) {
    const item = templateItem(tpl, i, now);
    await db.insert(contentItems).values({
      id: item.id,
      kind: item.kind,
      name: item.name,
      source: item.source,
      blocks: item.blocks,
      smsBody: item.smsBody ?? "",
      html: "",
      status: item.status,
      updatedAt: item.updatedAt,
      createdAt: now,
    });
    const rendered = renderContentItem(item);
    await saveSnapshot({
      kind: item.kind,
      name: item.name,
      contentItemId: item.id,
      subject: item.name,
      html: rendered.html,
      smsBody: rendered.smsBody,
      senderId: "",
    });
  }
}

let nodeSeq = 0;
const nid = (p: string) => `${p}-demo-${++nodeSeq}`;

function node(kind: AutomationNode["kind"], extra: Partial<AutomationNode>): AutomationNode {
  return { id: nid(kind), kind, position: { x: 40 + nodeSeq * 260, y: 160 }, ...extra };
}

function edge(source: AutomationNode, target: AutomationNode, handle = "out"): AutomationEdge {
  return { id: nid("edge"), source: source.id, target: target.id, sourceHandle: handle };
}

/** A straight line: each node to the next through its single output. */
function chain(...nodes: AutomationNode[]): AutomationGraph {
  return { nodes, edges: nodes.slice(1).map((n, i) => edge(nodes[i], n)) };
}

const trigger = (key: string, config: Record<string, string> = {}) =>
  node("trigger", { key, config });
const action = (key: string, config: Record<string, string> = {}) =>
  node("action", { key, config });

export function demoAutomations(): {
  id: string;
  name: string;
  active: boolean;
  flow: AutomationGraph;
}[] {
  nodeSeq = 0;
  // Lead welcome: e-mail, then wait for a click; no click in 20 minutes → SMS.
  const welcomeTrigger = trigger("contact_created", { status: "lead" });
  const welcomeMail = action("send_email", {
    template: "Powitanie leada",
    subject: "Witamy — umów pierwszą konsultację",
  });
  const waitClick = node("wait", { key: "email_clicked", amount: 20, unit: "minutes", config: {} });
  const tagHot = action("change_tags", { mode: "Dodaj", tag: "zainteresowany" });
  const smsNudge = action("send_sms", { template: "Zaproszenie na konsultację (SMS)" });
  const welcome: AutomationGraph = {
    nodes: [welcomeTrigger, welcomeMail, waitClick, tagHot, smsNudge],
    edges: [
      edge(welcomeTrigger, welcomeMail),
      edge(welcomeMail, waitClick),
      edge(waitClick, tagHot, "event"),
      edge(waitClick, smsNudge, "timeout"),
    ],
  };

  return [
    { id: "demo-auto-welcome", name: "Powitanie nowego leada", active: true, flow: welcome },
    {
      id: "demo-auto-confirm",
      name: "Potwierdzenie rezerwacji",
      active: true,
      flow: chain(
        trigger("visit_scheduled"),
        action("send_sms", { template: "Potwierdzenie wizyty (SMS)", sendMode: "Administracyjny" }),
      ),
    },
    {
      id: "demo-auto-survey",
      name: "Ankieta po wizycie",
      active: true,
      flow: chain(
        trigger("visit_completed"),
        node("delay", { amount: 10, unit: "minutes" }),
        action("send_email", { template: "Ankieta po wizycie", subject: "Jak oceniasz wizytę?" }),
      ),
    },
    {
      id: "demo-auto-noshow",
      name: "Nieobecność — nowy termin",
      active: true,
      flow: chain(
        trigger("visit_no_show"),
        action("send_sms", { template: "Nieobecność (SMS)", sendMode: "Administracyjny" }),
        action("change_tags", { mode: "Dodaj", tag: "nieobecność" }),
      ),
    },
    {
      id: "demo-auto-cancel",
      name: "Odwołana wizyta",
      active: true,
      flow: chain(
        trigger("visit_cancelled"),
        action("send_email", {
          template: "Odwołana wizyta — nowy termin",
          subject: "Wybierz nowy termin",
          sendMode: "Administracyjny",
        }),
      ),
    },
    {
      id: "demo-auto-recall",
      name: "Recall po roku",
      active: false,
      flow: chain(
        trigger("visit_months_ago", { months: "12" }),
        action("send_email", { template: "Zaproszenie na kontrolę", subject: "Minął rok" }),
      ),
    },
  ];
}

async function seedAutomations(now: number): Promise<void> {
  const db = getDb();
  for (const a of demoAutomations()) {
    await db.insert(automations).values({
      id: a.id,
      name: a.name,
      status: a.active ? "active" : "inactive",
      flow: a.flow,
      updatedAt: new Date(now).toISOString(),
    });
  }
}

// ── people and their history ───────────────────────────────────────────────

type Outcome = "completed" | "no_show" | "cancelled" | "booked";

interface Ctx {
  r: () => number;
  now: number;
  counter: number;
  /** Accumulated no-show chance — see insertPerson. */
  noShowDebt: number;
}

/** A Warsaw wall-clock time `days` from `now`, at `hour:minute`. */
export function warsawAt(now: number, days: number, hour: number, minute: number): number {
  const day = warsawDay(now + days * DAY);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return Date.parse(warsawWallClockToIso(day, `${hh}:${mm}`));
}

/**
 * The chance a visit ends as a no-show — the pattern the agent's model is
 * meant to find: booked far ahead, an earlier no-show, no SMS reminder
 * possible, an early slot. The last 30 days are worse than before.
 */
export function noShowChance(f: {
  leadDays: number;
  priorNoShows: number;
  consentSms: boolean;
  hour: number;
  recent: boolean;
}): number {
  return (
    (f.recent ? 0.18 : 0.03) +
    (f.leadDays > 14 ? 0.12 : 0) +
    (f.priorNoShows > 0 ? 0.2 : 0) +
    (f.consentSms ? 0 : 0.1) +
    (f.hour < 9 ? 0.06 : 0)
  );
}

interface PersonPlan {
  status: "lead" | "patient";
  createdDaysAgo: number;
  /** Day offsets of visits relative to now (negative = past). */
  visitDays: number[];
  /** Force every past visit to be completed (lists that depend on it). */
  allCompleted?: boolean;
  source?: (typeof LEAD_SOURCES)[number];
  consentSms?: boolean;
}

interface Seeded {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  status: string;
  lastVisitAt: number | null;
  /** Patient seen in the last week who must not get an inbound message in the seed. */
  quietAfterVisit: boolean;
}

async function insertPerson(ctx: Ctx, plan: PersonPlan, quiet = false): Promise<Seeded> {
  const { r, now } = ctx;
  const n = ctx.counter++;
  const p = syntheticPerson(r, n);
  const id = `demo-${n}`;
  const consentSms = plan.consentSms ?? r() > 0.15;
  const src = plan.source ?? { source: "Rejestracja online", medium: "rejestracja", campaign: "" };
  const db = getDb();

  // Visits, oldest first, so "earlier no-shows" is known when the next is decided.
  const days = [...plan.visitDays].sort((a, b) => a - b);
  const rows: (typeof contactVisits.$inferInsert)[] = [];
  const tags = new Set<string>();
  let priorNoShows = 0;
  let lastVisitAt: number | null = null;
  for (const d of days) {
    const svc = pickOne(r, DEMO_SERVICES);
    const doctor = DEMO_DOCTORS[pickOne(r, svc.doctors)];
    const hour = 8 + Math.floor(r() * 10);
    const startsAt = warsawAt(now, d, hour, pickOne(r, [0, 20, 40]));
    const leadDays = r() < 0.55 ? r() * 4 : 4 + r() * 26;
    const bookedAt = Math.min(now - 60_000, startsAt - leadDays * DAY);
    let outcome: Outcome;
    if (startsAt > now) outcome = "booked";
    else if (plan.allCompleted) outcome = "completed";
    else if (r() < 0.05) outcome = "cancelled";
    else {
      // Error diffusion, not a coin per visit: the chances add up and every
      // whole one is a no-show. A visit with a high chance still tips it far
      // more often, so the model has a pattern to find, but a window's rate
      // is what its chances say — with ~60 visits a window, coins would let
      // the "no-shows rising" signal come and go from one night to the next.
      ctx.noShowDebt += noShowChance({
        leadDays,
        priorNoShows,
        consentSms,
        hour,
        recent: startsAt > now - 30 * DAY,
      });
      outcome = ctx.noShowDebt >= 1 ? "no_show" : "completed";
      if (outcome === "no_show") ctx.noShowDebt -= 1;
    }
    if (outcome === "no_show") priorNoShows++;
    if (outcome === "completed") lastVisitAt = startsAt;
    tags.add(svc.specialization.toLowerCase());
    rows.push({
      id: randomUUID(),
      contactId: id,
      externalId: `demo-${randomUUID()}`,
      title: svc.title,
      doctor,
      specialization: svc.specialization,
      location: pickOne(r, DEMO_SITES),
      startsAt,
      priceGrosze: svc.price * 100,
      // A no-show stays "booked" — PRM Core infers it from the clock, as from a real system.
      systemStatus: outcome === "no_show" ? "booked" : outcome,
      stateEventSent: outcome === "booked" ? "" : outcome,
      source: r() < 0.6 ? "rejestracja-www" : "telefon",
      createdAt: Math.max(bookedAt, now - (plan.createdDaysAgo + 1) * DAY),
    });
  }
  if (plan.source?.source === "Meta") tags.add("meta-lead");

  await db.insert(contacts).values({
    id,
    prmId: `PRM-${10000 + n}`,
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    // A few patients without a phone — one of the no-show model's factors.
    phone: r() < 0.06 ? "" : p.phone,
    pesel: p.pesel,
    segments: [],
    tags: [...tags],
    source: src.source,
    medium: src.medium,
    campaign: src.campaign,
    createdAt: warsawDay(now - plan.createdDaysAgo * DAY),
    status: plan.status,
    consentEmail: r() > 0.05 ? 1 : 0,
    consentSms: consentSms ? 1 : 0,
    consentProfiling: r() > 0.4 ? 1 : 0,
    consentSource: plan.status === "lead" ? "formularz" : "rejestracja online",
    consentUpdatedAt: now - plan.createdDaysAgo * DAY,
    customFields: {},
  });
  for (let i = 0; i < rows.length; i += 100)
    await db.insert(contactVisits).values(rows.slice(i, i + 100));
  return {
    id,
    email: p.email,
    phone: p.phone,
    firstName: p.firstName,
    status: plan.status,
    lastVisitAt,
    quietAfterVisit: quiet,
  };
}

const between = (r: () => number, a: number, b: number) => a + r() * (b - a);
const whole = (r: () => number, a: number, b: number) => Math.floor(between(r, a, b + 1));

async function seedPeople(ctx: Ctx): Promise<Seeded[]> {
  const { r } = ctx;
  const out: Seeded[] = [];

  // Regular patients: history, one or two visits in the last two months, some upcoming.
  for (let i = 0; i < 80; i++) {
    const created = whole(r, 120, 700);
    const older = Array.from({ length: whole(r, 1, 4) }, () => -whole(r, 62, created - 1));
    const recent = Array.from({ length: whole(r, 1, 2) }, () => -whole(r, 8, 58));
    const upcoming = r() < 0.35 ? [whole(r, 1, 21)] : [];
    out.push(
      await insertPerson(ctx, {
        status: "patient",
        createdDaysAgo: created,
        visitDays: [...older, ...recent, ...upcoming],
      }),
    );
  }
  // Seen in the last week, nothing booked, no word since — the front desk's call list.
  for (let i = 0; i < 9; i++) {
    const created = whole(r, 90, 500);
    out.push(
      await insertPerson(
        ctx,
        {
          status: "patient",
          createdDaysAgo: created,
          visitDays: [-whole(r, 70, created - 1), -whole(r, 1, 6)],
          allCompleted: true,
        },
        true,
      ),
    );
  }
  // Recall due: last visit 13–20 months ago, nothing booked since.
  for (let i = 0; i < 16; i++) {
    const created = whole(r, 450, 900);
    const n = whole(r, 1, 3);
    out.push(
      await insertPerson(ctx, {
        status: "patient",
        createdDaysAgo: created,
        visitDays: Array.from({ length: n }, () => -whole(r, 390, Math.min(600, created - 1))),
        allCompleted: true,
      }),
    );
  }
  // One visit, months ago, never a second.
  for (let i = 0; i < 12; i++) {
    const visit = whole(r, 35, 300);
    out.push(
      await insertPerson(ctx, {
        status: "patient",
        createdDaysAgo: visit + whole(r, 0, 20),
        visitDays: [-visit],
        allCompleted: true,
      }),
    );
  }
  // In the base for a long time, never seen — drifting.
  for (let i = 0; i < 14; i++) {
    out.push(
      await insertPerson(ctx, {
        status: "patient",
        createdDaysAgo: whole(r, 200, 600),
        visitDays: [],
      }),
    );
  }
  // New patients with a first visit coming — some booked far ahead, some without SMS consent.
  for (let i = 0; i < 14; i++) {
    out.push(
      await insertPerson(ctx, {
        status: "patient",
        createdDaysAgo: whole(r, 0, 25),
        visitDays: [whole(r, 1, 25)],
        consentSms: r() > 0.35,
      }),
    );
  }
  // Leads from ads and the website, the last two months.
  for (let i = 0; i < 45; i++) {
    out.push(
      await insertPerson(ctx, {
        status: "lead",
        createdDaysAgo: whole(r, 0, 60),
        visitDays: [],
        source: pickOne(r, LEAD_SOURCES),
      }),
    );
  }
  return out;
}

/** Two months of e-mail and SMS history — fewer opens lately than before. */
async function seedSends(ctx: Ctx, people: Seeded[]): Promise<void> {
  const { r, now } = ctx;
  const db = getDb();
  const reachable = people.filter((p) => p.email);
  const subjects = DEMO_TEMPLATES.filter((x) => x.kind === "email").map((x) => x.name);
  const sends: (typeof emailSends.$inferInsert)[] = [];
  const events: (typeof emailEvents.$inferInsert)[] = [];
  // Opens by error diffusion per window, like no-shows: 30% lately, 48% before.
  const owed = { recent: 0, before: 0 };
  for (let i = 0; i < 180; i++) {
    const who = pickOne(r, reachable);
    const sentAt = now - between(r, 0.2, 59.5) * DAY;
    const token = randomUUID();
    sends.push({ token, toEmail: who.email, subject: pickOne(r, subjects), sentAt });
    const window = sentAt > now - 30 * DAY ? "recent" : "before";
    owed[window] += window === "recent" ? 0.3 : 0.48;
    if (owed[window] >= 1) {
      owed[window] -= 1;
      const openedAt = Math.min(now - 60_000, sentAt + between(r, 0.02, 1.5) * DAY);
      events.push({ id: randomUUID(), token, kind: "open", url: null, occurredAt: openedAt });
      if (r() < 0.35)
        events.push({
          id: randomUUID(),
          token,
          kind: "click",
          url: "https://example.test/umow-wizyte",
          occurredAt: Math.min(now - 30_000, openedAt + 60_000),
        });
    }
  }
  for (let i = 0; i < sends.length; i += 100)
    await db.insert(emailSends).values(sends.slice(i, i + 100));
  for (let i = 0; i < events.length; i += 100)
    await db.insert(emailEvents).values(events.slice(i, i + 100));

  const phones = people.filter((p) => p.phone);
  const sms: (typeof smsSends.$inferInsert)[] = [];
  for (let i = 0; i < 70; i++) {
    const who = pickOne(r, phones);
    sms.push({
      id: randomUUID(),
      contactId: who.id,
      toPhone: who.phone,
      sender: DEMO_SMS_SENDER,
      body: "Dzień dobry, potwierdzamy rezerwację wizyty w Przychodni Demo.",
      source: "automation",
      automationId: "demo-auto-confirm",
      sentAt: now - between(r, 0.2, 59.5) * DAY,
    });
  }
  for (let i = 0; i < sms.length; i += 100) await db.insert(smsSends).values(sms.slice(i, i + 100));
}

/** A dozen conversations, a few still unread. Written through the inbox's own functions. */
async function seedInbox(ctx: Ctx, people: Seeded[]): Promise<void> {
  const { r, now } = ctx;
  const candidates = people.filter((p) => !p.quietAfterVisit && p.email && p.phone);
  const chosen = new Set<Seeded>();
  while (chosen.size < 14 && chosen.size < candidates.length) chosen.add(pickOne(r, candidates));
  let i = 0;
  for (const who of chosen) {
    const msg = PATIENT_REPLIES[i++ % PATIENT_REPLIES.length];
    const at = now - between(r, 0.05, 10) * DAY;
    const res = await recordInboundMessage({
      contactId: who.id,
      channel: msg.channel,
      subject: msg.subject,
      body: msg.body,
      source: msg.channel,
      externalId: `demo-seed-${who.id}-${i}`,
      occurredAt: at,
    });
    // Older threads have an answer from the front desk; the newest wait for one.
    if (at < now - 2 * DAY && r() < 0.7) {
      await recordOutboundMessage({
        contactId: who.id,
        channel: msg.channel,
        subject: msg.subject ? `Re: ${msg.subject}` : "",
        body: "Dzień dobry, dziękujemy za wiadomość — rejestracja oddzwoni dziś do 16:00.",
        source: "manual",
        occurredAt: at + between(r, 0.02, 0.3) * DAY,
      });
      await markThreadRead(res.threadId);
    }
  }
}

async function seedKnowledge(now: number): Promise<void> {
  const db = getDb();
  const entries = [
    [
      "Godziny otwarcia",
      "Filia Centrum: poniedziałek–piątek 8:00–20:00, sobota 8:00–14:00. Filia Północ: poniedziałek–piątek 9:00–18:00.",
    ],
    [
      "Płatności",
      "Na miejscu przyjmujemy płatność kartą i gotówką. Ceny konsultacji są podane przy rezerwacji online.",
    ],
    [
      "Przygotowanie do USG",
      "Przed USG stawu nie trzeba być na czczo. Prosimy zabrać wcześniejsze wyniki badań obrazowych.",
    ],
  ];
  for (const [title, content] of entries)
    await db
      .insert(knowledgeEntries)
      .values({ id: randomUUID(), title, content, createdAt: now, updatedAt: now });
  const gaps = [
    ["Czy przy filii jest parking dla pacjentów?", 4],
    ["Czy wyniki badań można dostać mailem?", 3],
    ["Czy honorujecie skierowania z NFZ?", 2],
  ] as const;
  for (const [question, count] of gaps)
    await db.insert(knowledgeGaps).values({
      id: randomUUID(),
      key: question.toLowerCase(),
      question,
      source: "inbox",
      count,
      status: "open",
      firstAt: now - 6 * DAY,
      lastAt: now - DAY,
    });
}

async function seedSegments(now: number): Promise<void> {
  const db = getDb();
  const seg = (id: string, name: string, field: string, value: string, description: string) => ({
    id,
    name,
    description,
    status: "live" as const,
    definition: {
      match: "all" as const,
      groups: [
        {
          id: "g1",
          match: "all" as const,
          conditions: [{ id: "c1", field, operator: "equals" as const, value }],
        },
      ],
    },
    createdAt: now,
    updatedAt: now,
    updatedBy: "PRM Demo",
    permanent: 1,
    expiresAt: null,
  });
  await db
    .insert(segments)
    .values([
      seg(
        "demo-seg-cardio",
        "Pacjenci kardiologii",
        "tag",
        "kardiologia",
        "Każdy, kto był u kardiologa.",
      ),
      seg("demo-seg-meta", "Leady z Meta", "attr:source", "Meta", "Pozyskani z reklam Meta."),
      seg("demo-seg-leads", "Leady do kwalifikacji", "attr:status", "lead", "Jeszcze bez wizyty."),
    ]);
}

export interface DemoSeedSummary {
  contacts: number;
  visits: number;
  resolvedVisits: number;
  automations: number;
}

/**
 * Empties the demo and plants the seed again, then runs PRM_Agent's nightly
 * pass so its lists, model, recommendations and brief are ready at once.
 * Throws `DemoResetRefused` on a database that does not look like a demo.
 */
export async function resetDemo(
  now = Date.now(),
  seed = Number(warsawDay(now).replace(/-/g, "")),
): Promise<DemoSeedSummary> {
  await assertDemoDatabase();
  await wipe();
  await setSetting(DEMO_DB_KEY, "1");
  const ctx: Ctx = { r: rng(seed), now, counter: 1, noShowDebt: 0 };
  await seedSettings(now);
  await seedTemplates(now);
  await seedAutomations(now);
  const people = await seedPeople(ctx);
  await seedSends(ctx, people);
  await seedInbox(ctx, people);
  await seedKnowledge(now);
  await seedSegments(now);
  await setSetting(PERSON_COUNTER_KEY, String(ctx.counter));
  // The seed is history, not news: the automations start with what comes next.
  await getDb().delete(engineEvents);

  const { runAgentNightly } = await import("../agent/signals.server");
  await runAgentNightly(now);
  await setSetting("agent.nightly.day", warsawDay(now));

  const db = getDb();
  const visits = await db.select({ s: contactVisits.stateEventSent }).from(contactVisits);
  const summary: DemoSeedSummary = {
    contacts: people.length,
    visits: visits.length,
    resolvedVisits: visits.filter((v) => v.s === "completed" || v.s === "no_show").length,
    automations: demoAutomations().length,
  };
  await logStep({
    kind: "action",
    message: t("Demo: dane przywrócone do stanu początkowego ({n} kontaktów, {v} wizyt).", {
      n: summary.contacts,
      v: summary.visits,
    }),
    detail: { source: "demo-reset" },
  });
  return summary;
}
