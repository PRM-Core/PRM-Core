import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  contacts,
  funnels,
  contactFunnelProgress,
  emailSends,
  emailEvents,
  emailSettings,
  contactFieldDefs,
  smsSends,
} from "../db/schema";
import type { ContactRow } from "../db/schema";
import type { AutomationNode } from "../automation-flow";
import {
  resolveMergeTagsInHtml,
  resolvePersonalizationInText,
  DEFAULT_POPUP_CONFIG,
  type PersonalizationSample,
} from "../content-builder";
import { sendEmail, SendGridError } from "../email/sendgrid.server";
import { sendSms, TwilioError } from "../sms/twilio.server";
import {
  createTrackedSend,
  deleteTrackedSend,
  injectTracking,
} from "../email/email-tracking.server";
import { addNote } from "../notes/notes.server";
import { emitEvent } from "./events.server";
import { getSnapshot } from "./snapshots.server";
import { resolveEmailSender } from "../email/senders.server";
import { resolveDynamicFields } from "../messaging/dynamic-fields.server";
import { collectAttachments } from "../email/attachments.server";
import { queuePopupForContact } from "./popup-queue.server";
import { contactInDynamicSegment, ensureLabelSegment } from "../segments/segments.server";
import { getBaseUrl } from "./settings.server";
import { resolveSmsSender } from "../sms/senders.server";
import { checkConsent, type SendMode } from "../consent/consent.server";
import { t as tr } from "@/lib/i18n";

// Executors for every action node. Nothing here is new plumbing — each one
// calls the same SendGrid / Twilio / contact / funnel code the UI already
// uses, which is exactly why engine sends get open- and click-tracking for
// free.

export interface ActionResult {
  status: "ok" | "skipped" | "error";
  message: string;
  detail?: Record<string, string>;
  /** Set by end_process and delete_contact — the run has nowhere left to go. */
  stopRun?: boolean;
}

/**
 * Which run/node is executing. Only actions that outlive the step itself need
 * it — a queued popup is delivered days later and has to remember whose it was.
 */
export interface ActionContext {
  runId?: string | null;
  automationId?: string | null;
  nodeId?: string | null;
}

/** The tag standing in for "do not contact" — set_dnc writes it, dnc_status reads it. */
export const DNC_TAG = "nie-kontaktowac";

export function sampleFromContact(contact: ContactRow): PersonalizationSample {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName || undefined,
    email: contact.email,
    phone: contact.phone || undefined,
    prmId: contact.prmId || undefined,
    segments: contact.segments ?? [],
    tags: contact.tags ?? [],
  };
}

function cfg(node: AutomationNode, key: string): string {
  return (node.config?.[key] ?? "").trim();
}

/**
 * Send mode from the node config. Defaults to `marketing`, i.e. the safe one —
 * a step whose author never thought about consent must not quietly bypass it.
 *
 * Keyed `sendMode`, not `mode`: `change_tags` and `change_segment` already use
 * `mode` for "Dodaj"/"Usuń", and one key meaning two things in the same config
 * namespace is a trap for whoever touches this next.
 */
function sendMode(node: AutomationNode): SendMode {
  return cfg(node, "sendMode") === "Administracyjny" ? "administrative" : "marketing";
}

async function loadContact(contactId: string): Promise<ContactRow | null> {
  const db = getDb();
  const row = await db.select().from(contacts).where(eq(contacts.id, contactId)).get();
  return row ?? null;
}

// ── messaging ───────────────────────────────────────────────────────────────

async function sendTemplatedEmail(
  node: AutomationNode,
  contact: ContactRow,
  kind: "email" | "newsletter",
): Promise<ActionResult> {
  const templateName = cfg(node, "template");
  if (!templateName) {
    return { status: "skipped", message: tr("Krok pominięty — nie wybrano szablonu.") };
  }

  const snapshot = await getSnapshot(kind, templateName);
  if (!snapshot || !snapshot.html) {
    return {
      status: "error",
      message: tr(
        "Brak opublikowanej treści szablonu „{templateName}”. Zapisz automatyzację ponownie, aby wysłać jej szablony na serwer.",
        { templateName: templateName },
      ),
    };
  }
  if (!contact.email) {
    return { status: "skipped", message: tr("Kontakt nie ma adresu e-mail.") };
  }

  const consent = checkConsent(contact, "email", sendMode(node));
  if (!consent.allowed) {
    return { status: "skipped", message: consent.reason ?? tr("Brak zgody na wysyłkę.") };
  }

  // Nadawca z migawki — ta sama zasada co przy kampanii: wiadomość podpisuje
  // się nazwą wybraną w jej edytorze, nie tą domyślną w chwili wysyłki.
  const sender = await resolveEmailSender(snapshot.senderId ?? "");
  const subject = cfg(node, "subject") || snapshot.subject || snapshot.name;
  const baseUrl = await getBaseUrl();
  // Te same pola dynamiczne co przy wysyłce do segmentu. Wcześniej rozwijała je
  // wyłącznie kampania, więc automatyzacja wysyłała `%%FEED:…%%` surowo —
  // pacjent dostawał w mailu kod zamiast linku.
  const dynamic = await resolveDynamicFields(snapshot.html, contact);
  const html = resolveMergeTagsInHtml(dynamic.html, sampleFromContact(contact));
  const { attachments, problems } = await collectAttachments(snapshot.attachments ?? []);

  const token = await createTrackedSend({
    toEmail: contact.email,
    subject,
    contentItemId: snapshot.contentItemId,
  });
  try {
    await sendEmail({
      to: contact.email,
      fromEmail: sender.fromEmail,
      fromName: sender.fromName,
      subject,
      html: injectTracking(html, token, baseUrl),
      attachments,
      trackingToken: token,
    });
    return {
      status: "ok",
      message:
        tr("Wysłano {v0} „{subject}” na {email}.", {
          v0: kind === "newsletter" ? "newsletter" : "e-mail",
          subject: subject,
          email: contact.email,
        }) +
        (dynamic.misses.length > 0
          ? tr(" Pola bez pokrycia: {v0}.", { v0: dynamic.misses.join("; ") })
          : "") +
        (problems.length > 0 ? tr(" Załączniki: {v0}", { v0: problems.join(" ") }) : ""),
      detail: { template: templateName, token },
    };
  } catch (err) {
    await deleteTrackedSend(token);
    const message = err instanceof SendGridError ? err.message : String(err);
    return {
      status: "error",
      message: tr("Wysyłka e-maila nie powiodła się: {message}", { message: message }),
    };
  }
}

async function sendTemplatedSms(node: AutomationNode, contact: ContactRow): Promise<ActionResult> {
  const templateName = cfg(node, "template");
  if (!templateName) {
    return { status: "skipped", message: tr("Krok pominięty — nie wybrano szablonu SMS.") };
  }

  const snapshot = await getSnapshot("sms", templateName);
  if (!snapshot || !snapshot.smsBody) {
    return {
      status: "error",
      message: tr(
        "Brak opublikowanej treści szablonu SMS „{templateName}”. Zapisz automatyzację ponownie.",
        { templateName: templateName },
      ),
    };
  }
  if (!contact.phone) {
    return { status: "skipped", message: tr("Kontakt nie ma numeru telefonu.") };
  }

  const consent = checkConsent(contact, "sms", sendMode(node));
  if (!consent.allowed) {
    return { status: "skipped", message: consent.reason ?? tr("Brak zgody na wysyłkę.") };
  }

  const body = resolvePersonalizationInText(snapshot.smsBody, sampleFromContact(contact));

  // The node may name its own sender; without one the default is used.
  const sender = await resolveSmsSender(cfg(node, "sender"));
  if (!sender) {
    return {
      status: "error",
      message: tr("Brak skonfigurowanego nadawcy SMS — dodaj go w Integracje → SMS API."),
    };
  }

  try {
    await sendSms({ to: contact.phone, fromNumber: sender.value, body });
    // Zapisane dopiero PO udanej wysyłce — historia ma mówić, co naprawdę
    // poszło do pacjenta, a nie co próbowaliśmy wysłać.
    await getDb().insert(smsSends).values({
      id: randomUUID(),
      contactId: contact.id,
      toPhone: contact.phone,
      sender: sender.value,
      body,
      source: "automation",
      automationId: node.id,
      sentAt: Date.now(),
    });
    return {
      status: "ok",
      message: tr("Wysłano SMS na {phone} (nadawca „{value}”).", {
        phone: contact.phone,
        value: sender.value,
      }),
      detail: { template: templateName, sender: sender.value },
    };
  } catch (err) {
    const message = err instanceof TwilioError ? err.message : String(err);
    return {
      status: "error",
      message: tr("Wysyłka SMS nie powiodła się: {message}", { message: message }),
    };
  }
}

/**
 * M5: queues a popup for this one patient instead of publishing it to every
 * visitor. Nothing is displayed here — the popup waits until the tracker
 * recognises the patient on the site (see /popup-active and popup-queue.server.ts).
 */
async function queueTemplatedPopup(
  node: AutomationNode,
  contact: ContactRow,
  context?: ActionContext,
): Promise<ActionResult> {
  const templateName = cfg(node, "template");
  if (!templateName) {
    return { status: "skipped", message: tr("Krok pominięty — nie wybrano szablonu pop-upu.") };
  }

  const snapshot = await getSnapshot("popup", templateName);
  if (!snapshot || !snapshot.html) {
    return {
      status: "error",
      message: tr(
        "Brak opublikowanej treści pop-upu „{templateName}”. Zapisz automatyzację ponownie, aby wysłać jej szablony na serwer.",
        { templateName: templateName },
      ),
    };
  }

  const { queued, id } = await queuePopupForContact({
    contactId: contact.id,
    contentItemId: snapshot.contentItemId,
    name: snapshot.name,
    html: snapshot.html,
    // Snapshots taken before the config column existed fall back to the
    // defaults rather than refusing to show anything.
    config: snapshot.config ?? DEFAULT_POPUP_CONFIG,
    automationId: context?.automationId,
    runId: context?.runId,
    nodeId: context?.nodeId,
  });

  if (!queued) {
    return {
      status: "skipped",
      message: tr("Pop-up „{name}” już czeka w kolejce tego pacjenta — nie dodano drugiej kopii.", {
        name: snapshot.name,
      }),
      detail: { template: snapshot.name, queueId: id ?? "" },
    };
  }

  return {
    status: "ok",
    message: tr(
      "Pop-up „{name}” zakolejkowany dla pacjenta — pokaże się przy najbliższej wizycie na stronie z kodem śledzącym.",
      { name: snapshot.name },
    ),
    detail: { template: snapshot.name, queueId: id ?? "" },
  };
}

// ── contact mutations ───────────────────────────────────────────────────────

/**
 * Announces that a contact field actually changed value. Fires on top of the
 * more specific events (tag_added, segment_added) rather than instead of them:
 * "dodano tag VIP" and "zmieniło się pole Tagi" are two different questions an
 * automation might be asking, and a trigger listening on the general one should
 * not go deaf just because a specific event also exists.
 *
 * Only real changes are announced — writing the same value twice is not a change.
 */
export async function emitFieldChanged(
  contactId: string,
  field: string,
  value: string,
  previous: string,
): Promise<void> {
  if (value === previous) return;
  await emitEvent({
    type: "contact.field_changed",
    contactId,
    payload: { field, value, previous },
  });
}

/** Adds or removes a tag, emitting contact.tag_added so tag triggers see engine-made changes too. */
export async function applyTagChange(
  contact: ContactRow,
  tag: string,
  mode: "add" | "remove",
): Promise<boolean> {
  const current = contact.tags ?? [];
  const has = current.some((t) => t.toLowerCase() === tag.toLowerCase());
  if (mode === "add" && has) return false;
  if (mode === "remove" && !has) return false;

  const next =
    mode === "add"
      ? [...current, tag]
      : current.filter((t) => t.toLowerCase() !== tag.toLowerCase());
  const db = getDb();
  await db.update(contacts).set({ tags: next }).where(eq(contacts.id, contact.id));
  const previous = current;
  contact.tags = next;

  if (mode === "add") {
    await emitEvent({ type: "contact.tag_added", contactId: contact.id, payload: { tag } });
  }
  await emitFieldChanged(contact.id, "tags", next.join(", "), previous.join(", "));
  return true;
}

export async function applySegmentChange(
  contact: ContactRow,
  segment: string,
  mode: "add" | "remove",
): Promise<boolean> {
  const current = contact.segments ?? [];
  const has = current.some((s) => s.toLowerCase() === segment.toLowerCase());
  if (mode === "add" && has) return false;
  if (mode === "remove" && !has) return false;

  const next =
    mode === "add"
      ? [...current, segment]
      : current.filter((s) => s.toLowerCase() !== segment.toLowerCase());
  const db = getDb();
  await db.update(contacts).set({ segments: next }).where(eq(contacts.id, contact.id));
  const previous = current;
  contact.segments = next;

  if (mode === "add") {
    // Każda nadana gdziekolwiek etykieta dostaje za sobą segment, więc moduł
    // Segmenty wypisuje to, czego baza realnie używa, a nie tylko to, co ktoś
    // zbudował w builderze. Jedno wąskie gardło: akcja silnika, agent i karta
    // kontaktu przechodzą wszystkie tędy.
    await ensureLabelSegment({ name: segment });
    await emitEvent({
      type: "contact.segment_added",
      contactId: contact.id,
      payload: { segment },
    });
  }
  await emitFieldChanged(contact.id, "segments", next.join(", "), previous.join(", "));
  return true;
}

async function changeStage(node: AutomationNode, contact: ContactRow): Promise<ActionResult> {
  const funnelId = cfg(node, "funnelId");
  const stageId = cfg(node, "stageId");
  if (!funnelId || !stageId) {
    return { status: "skipped", message: tr("Krok pominięty — nie wybrano lejka i etapu.") };
  }

  const db = getDb();
  const funnel = await db.select().from(funnels).where(eq(funnels.id, funnelId)).get();
  if (!funnel) {
    return {
      status: "error",
      message: tr("Lejek „{v0}” już nie istnieje.", { v0: cfg(node, "funnelName") || funnelId }),
    };
  }
  const stageIndex = (funnel.stages ?? []).findIndex((s) => s.id === stageId);
  if (stageIndex < 0) {
    return {
      status: "error",
      message: tr("Etap „{v0}” nie istnieje już w lejku „{name}”.", {
        v0: cfg(node, "stageName") || stageId,
        name: funnel.name,
      }),
    };
  }

  const existing = await db
    .select()
    .from(contactFunnelProgress)
    .where(eq(contactFunnelProgress.contactId, contact.id))
    .get();
  if (existing) {
    await db
      .update(contactFunnelProgress)
      .set({ funnelId, stageIndex })
      .where(eq(contactFunnelProgress.contactId, contact.id));
  } else {
    await db.insert(contactFunnelProgress).values({ contactId: contact.id, funnelId, stageIndex });
  }

  if (!existing || existing.funnelId !== funnelId || existing.stageIndex !== stageIndex) {
    await emitEvent({
      type: "funnel.stage_changed",
      contactId: contact.id,
      payload: { funnelId, stageIndex: String(stageIndex) },
    });
  }

  return {
    status: "ok",
    message: tr("Przeniesiono do etapu „{label}” w lejku „{name}”.", {
      label: funnel.stages[stageIndex].label,
      name: funnel.name,
    }),
  };
}

/**
 * Puts a contact into a funnel. The difference from `change_stage` is intent:
 * this one is for enrolling somebody who may be on no funnel at all (the usual
 * shape being "tag added → assign funnel"), so the stage is optional and a
 * contact already in this funnel is left exactly where they are rather than
 * being yanked back to the start.
 */
async function assignFunnel(node: AutomationNode, contact: ContactRow): Promise<ActionResult> {
  const funnelId = cfg(node, "funnelId");
  if (!funnelId) {
    return { status: "skipped", message: tr("Krok pominięty — nie wybrano lejka.") };
  }

  const db = getDb();
  const funnel = await db.select().from(funnels).where(eq(funnels.id, funnelId)).get();
  if (!funnel) {
    return {
      status: "error",
      message: tr("Lejek „{v0}” już nie istnieje.", { v0: cfg(node, "funnelName") || funnelId }),
    };
  }
  const stages = funnel.stages ?? [];
  if (stages.length === 0) {
    return {
      status: "error",
      message: tr("Lejek „{name}” nie ma żadnych etapów.", { name: funnel.name }),
    };
  }

  const stageId = cfg(node, "stageId");
  const requested = stageId ? stages.findIndex((s) => s.id === stageId) : 0;
  if (stageId && requested < 0) {
    return {
      status: "error",
      message: tr("Etap „{v0}” nie istnieje już w lejku „{name}”.", {
        v0: cfg(node, "stageName") || stageId,
        name: funnel.name,
      }),
    };
  }
  const stageIndex = requested < 0 ? 0 : requested;

  const existing = await db
    .select()
    .from(contactFunnelProgress)
    .where(eq(contactFunnelProgress.contactId, contact.id))
    .get();

  // Already here: leave the patient on whatever stage they reached. Re-running
  // the automation must not quietly rewind somebody's progress.
  if (existing && existing.funnelId === funnelId) {
    return {
      status: "skipped",
      message: tr("Pacjent jest już w lejku „{name}” (etap „{v1}”) — nie zmieniono etapu.", {
        name: funnel.name,
        v1: stages[existing.stageIndex]?.label ?? existing.stageIndex + 1,
      }),
      detail: { funnel: funnel.name },
    };
  }

  if (existing) {
    await db
      .update(contactFunnelProgress)
      .set({ funnelId, stageIndex })
      .where(eq(contactFunnelProgress.contactId, contact.id));
  } else {
    await db.insert(contactFunnelProgress).values({ contactId: contact.id, funnelId, stageIndex });
  }

  await emitEvent({
    type: "funnel.stage_changed",
    contactId: contact.id,
    payload: { funnelId, stageIndex: String(stageIndex) },
  });

  const movedFrom = existing ? " (przeniesiony z poprzedniego lejka)" : "";
  return {
    status: "ok",
    message: tr("Przypisano do lejka „{name}”, etap „{label}”{movedFrom}.", {
      name: funnel.name,
      label: stages[stageIndex].label,
      movedFrom: movedFrom,
    }),
    detail: { funnel: funnel.name, stage: stages[stageIndex].label },
  };
}

/**
 * Takes a contact out of every funnel. No `funnel.stage_changed` is emitted —
 * see the same reasoning in setContactFunnelProgress: a contact who has left
 * isn't standing on a stage, so scenarios triggered by stage changes have
 * nothing meaningful to do with them.
 */
async function removeFromFunnel(contact: ContactRow): Promise<ActionResult> {
  const db = getDb();
  const existing = await db
    .select()
    .from(contactFunnelProgress)
    .where(eq(contactFunnelProgress.contactId, contact.id))
    .get();
  if (!existing) {
    return { status: "skipped", message: tr("Pacjent nie był przypisany do żadnego lejka.") };
  }

  await db.delete(contactFunnelProgress).where(eq(contactFunnelProgress.contactId, contact.id));

  const funnel = await db.select().from(funnels).where(eq(funnels.id, existing.funnelId)).get();
  return {
    status: "ok",
    message: tr("Usunięto z lejka „{v0}”.", { v0: funnel?.name ?? existing.funnelId }),
    detail: { funnel: funnel?.name ?? existing.funnelId },
  };
}

/** Contact columns an update_field node is allowed to write. Deliberately excludes pesel and ids. */
const WRITABLE_FIELDS: Record<string, keyof ContactRow> = {
  imie: "firstName",
  firstname: "firstName",
  nazwisko: "lastName",
  lastname: "lastName",
  email: "email",
  telefon: "phone",
  phone: "phone",
  status: "status",
  source: "source",
  medium: "medium",
  campaign: "campaign",
  kampania: "campaign",
};

/**
 * Contact columns a CONDITION may read. Wider than `WRITABLE_FIELDS` on purpose:
 * comparing a PESEL or the date somebody joined the base is harmless, writing
 * over them is not. Keys are the ones the field picker stores — which are the
 * `contact_field_defs` keys, i.e. the column names.
 */
const READABLE_FIELDS: Record<string, keyof ContactRow> = {
  ...WRITABLE_FIELDS,
  prmid: "prmId",
  pesel: "pesel",
  createdat: "createdAt",
  segments: "segments",
  tags: "tags",
};

/** One field of one contact, as text a condition can compare. */
async function readField(
  contact: ContactRow,
  rawField: string,
): Promise<{ label: string; value: string } | null> {
  const key = rawField.trim();
  const column = READABLE_FIELDS[key.toLowerCase()];
  if (column) {
    const value = contact[column];
    // Segmenty i tagi są listami — sklejone przecinkiem czytają się tak, jak
    // wyglądają na karcie, więc „zawiera” działa na nich bez niespodzianek.
    return {
      label: column,
      value: Array.isArray(value) ? value.join(", ") : String(value ?? ""),
    };
  }

  // Pole założone przez klinikę w Ustawieniach → Tabele / Dane. Pytamy o
  // definicję, nie o wartość: pole, którego nikt jeszcze nie uzupełnił, ISTNIEJE
  // i jest puste. Gdyby decydowała obecność klucza w JSON-ie, warunek „pole jest
  // puste” nie zadziałałby dokładnie dla tych kontaktów, o które w nim chodzi.
  if (!key) return null;
  const def = await getDb()
    .select({ label: contactFieldDefs.label })
    .from(contactFieldDefs)
    .where(eq(contactFieldDefs.key, key))
    .get();
  if (!def) return null;
  return { label: def.label, value: String((contact.customFields ?? {})[key] ?? "") };
}

async function updateField(node: AutomationNode, contact: ContactRow): Promise<ActionResult> {
  const rawField = cfg(node, "field").toLowerCase();
  const value = cfg(node, "value");
  const column = WRITABLE_FIELDS[rawField];
  if (!column) {
    return {
      status: "skipped",
      message: tr("Pole „{v0}” nie jest zapisywalne. Dozwolone: {v1}.", {
        v0: cfg(node, "field"),
        v1: Object.keys(WRITABLE_FIELDS).join(", "),
      }),
    };
  }
  if (column === "status" && !["active", "lead", "patient", "inactive"].includes(value)) {
    return {
      status: "skipped",
      message: tr("„{value}” nie jest poprawnym statusem (active/lead/patient/inactive).", {
        value: value,
      }),
    };
  }

  const previous = String(contact[column] ?? "");
  if (previous === value) {
    return {
      status: "skipped",
      message: tr("Pole {column} ma już wartość „{value}”.", { column: column, value: value }),
    };
  }

  const db = getDb();
  await db
    .update(contacts)
    .set({ [column]: value })
    .where(eq(contacts.id, contact.id));
  await emitFieldChanged(contact.id, column, value, previous);
  return {
    status: "ok",
    message: tr("Ustawiono {column} = „{value}”.", { column: column, value: value }),
  };
}

// ── dispatcher ──────────────────────────────────────────────────────────────

/**
 * Runs one action node against one contact. Never throws — every failure comes
 * back as an "error" result so the runner can log it and decide what to do,
 * rather than an exception tearing down the whole tick.
 */
export async function executeAction(
  node: AutomationNode,
  contactId: string,
  context?: ActionContext,
): Promise<ActionResult> {
  const contact = await loadContact(contactId);
  if (!contact) {
    return { status: "error", message: tr("Kontakt nie istnieje już w bazie."), stopRun: true };
  }

  const key = node.key ?? "";
  try {
    switch (key) {
      case "send_email":
        return await sendTemplatedEmail(node, contact, "email");
      case "send_newsletter":
        return await sendTemplatedEmail(node, contact, "newsletter");
      case "send_sms":
        return await sendTemplatedSms(node, contact);

      case "change_tags": {
        const tag = cfg(node, "tag");
        if (!tag) return { status: "skipped", message: tr("Krok pominięty — nie podano tagu.") };
        const mode = cfg(node, "mode") === "Usuń" ? "remove" : "add";
        const changed = await applyTagChange(contact, tag, mode);
        return {
          status: "ok",
          message: changed
            ? tr("{v0} tag „{tag}”.", {
                v0: mode === "add" ? tr("Dodano") : tr("Usunięto"),
                tag: tag,
              })
            : tr("Tag „{tag}” bez zmian (kontakt już był w tym stanie).", { tag: tag }),
        };
      }

      case "change_segment": {
        const segment = cfg(node, "segment");
        if (!segment)
          return { status: "skipped", message: tr("Krok pominięty — nie podano segmentu.") };
        const mode = cfg(node, "mode") === "Usuń" ? "remove" : "add";
        const changed = await applySegmentChange(contact, segment, mode);
        return {
          status: "ok",
          message: changed
            ? tr("{v0} segmentu „{segment}”.", {
                v0: mode === "add" ? tr("Dodano do") : tr("Usunięto z"),
                segment: segment,
              })
            : tr("Segment „{segment}” bez zmian (kontakt już był w tym stanie).", {
                segment: segment,
              }),
        };
      }

      case "change_stage":
        return await changeStage(node, contact);

      case "assign_funnel":
        return await assignFunnel(node, contact);

      case "remove_from_funnel":
        return await removeFromFunnel(contact);

      case "update_field":
        return await updateField(node, contact);

      case "set_dnc": {
        await applyTagChange(contact, DNC_TAG, "add");
        return { status: "ok", message: tr("Oznaczono kontakt jako „nie kontaktować”.") };
      }

      case "send_push": {
        // Honest simulation: there is no push infrastructure in the system, so
        // this records what WOULD have been sent instead of pretending.
        const content = cfg(node, "content") || tr("(brak treści)");
        await addNote({
          contactId: contact.id,
          text: tr("PRM Engine — symulacja powiadomienia push:\n{content}", { content: content }),
          source: "manual",
        });
        return {
          status: "ok",
          message: tr(
            "Powiadomienie push zasymulowane (brak infrastruktury push — zapisano notatkę).",
          ),
          detail: { simulated: "true", content },
        };
      }

      case "end_process":
        return { status: "ok", message: tr("Koniec procesu."), stopRun: true };

      case "delete_contact": {
        const db = getDb();
        await db.delete(contacts).where(eq(contacts.id, contact.id));
        return { status: "ok", message: tr("Kontakt usunięty z bazy."), stopRun: true };
      }

      case "show_popup":
        return await queueTemplatedPopup(node, contact, context);

      case "change_points":
        return {
          status: "skipped",
          message: tr("Punktacja nie istnieje jeszcze jako pole kontaktu — krok pominięty."),
        };

      default:
        return {
          status: "skipped",
          message: tr("Nieznana akcja „{key}” — krok pominięty.", { key: key }),
        };
    }
  } catch (err) {
    return {
      status: "error",
      message: tr("Błąd wykonania akcji „{key}”: {v1}", { key: key, v1: String(err) }),
    };
  }
}

// ── conditions ──────────────────────────────────────────────────────────────

function compare(operator: string, left: string, right: string): boolean {
  const l = left.toLowerCase();
  const r = right.toLowerCase();
  switch (operator) {
    case "zawiera":
      return l.includes(r);
    case "większe niż":
      return Number(left) > Number(right);
    case "mniejsze niż":
      return Number(left) < Number(right);
    default:
      return l === r;
  }
}

/** Deterministic evaluation over contact + email history. Unknown conditions fail closed (unmatched). */
/**
 * Picks the branch a contact takes out of a Path node: the FIRST branch whose
 * filter passes. A branch with no filters always passes, which is what makes
 * the last one a catch-all. If somehow none match (every branch has filters and
 * none fit), the contact takes the last branch rather than being stranded
 * mid-journey with no outgoing edge.
 */
export async function evaluatePath(
  node: AutomationNode,
  contactId: string,
): Promise<{ handle: string; message: string }> {
  const branches = node.branches ?? [];
  if (branches.length === 0) {
    return { handle: "", message: tr("Rozgałęzienie nie ma żadnej odnogi — przebieg zatrzymany.") };
  }

  for (const branch of branches) {
    const filters = branch.filters ?? [];
    if (filters.length === 0) {
      return {
        handle: branch.id,
        message: tr("Odnoga „{label}” (bez filtra — pozostali).", { label: branch.label }),
      };
    }

    const results: boolean[] = [];
    for (const filter of filters) {
      // Each filter is one catalog condition, so it is evaluated by the very
      // same code as a standalone condition node — wrapped in a throwaway node
      // rather than duplicating the switch.
      const { matched } = await evaluateCondition(
        {
          id: node.id,
          kind: "condition",
          key: filter.key,
          config: filter.config,
          position: node.position,
        },
        contactId,
      );
      results.push(matched);
      // Short-circuit: "any" is settled by the first hit, "all" by the first miss.
      if (branch.match === "any" && matched) break;
      if (branch.match !== "any" && !matched) break;
    }

    const passed =
      branch.match === "any" ? results.some(Boolean) : results.every(Boolean) && results.length > 0;
    if (passed) {
      return {
        handle: branch.id,
        message: tr("Odnoga „{label}” — filtr spełniony ({v1} z {length}).", {
          label: branch.label,
          v1: branch.match === "any" ? tr("dowolny") : tr("wszystkie"),
          length: filters.length,
        }),
      };
    }
  }

  const last = branches[branches.length - 1];
  return {
    handle: last.id,
    message: tr("Żadna odnoga nie pasowała — kontakt skierowany na ostatnią („{label}”).", {
      label: last.label,
    }),
  };
}

export async function evaluateCondition(
  node: AutomationNode,
  contactId: string,
): Promise<{ matched: boolean; message: string }> {
  const contact = await loadContact(contactId);
  if (!contact)
    return { matched: false, message: tr("Kontakt nie istnieje — warunek niespełniony.") };

  const key = node.key ?? "";
  switch (key) {
    case "in_segment": {
      const segment = cfg(node, "segment");
      // Two kinds of segment share one name space. A dynamic segment (a saved
      // set of conditions) is checked first and answers live; a name that is
      // only ever used as a label falls through to the label check, so every
      // automation written before dynamic segments existed keeps working.
      const dynamic = await contactInDynamicSegment(contact, segment);
      if (dynamic !== null) {
        return {
          matched: dynamic,
          message: tr("Segment dynamiczny „{segment}”: {v1}.", {
            segment: segment,
            v1: dynamic ? tr("tak") : tr("nie"),
          }),
        };
      }
      const matched = (contact.segments ?? []).some(
        (s) => s.toLowerCase() === segment.toLowerCase(),
      );
      return {
        matched,
        message: tr("Segment „{segment}”: {v1}.", {
          segment: segment,
          v1: matched ? tr("tak") : tr("nie"),
        }),
      };
    }
    case "has_tag": {
      const tag = cfg(node, "tag");
      const matched = (contact.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase());
      return {
        matched,
        message: tr("Tag „{tag}”: {v1}.", { tag: tag, v1: matched ? tr("tak") : tr("nie") }),
      };
    }
    case "field_value": {
      const field = await readField(contact, cfg(node, "field"));
      if (!field) {
        return {
          matched: false,
          message: tr("Nieznane pole „{v0}” — warunek niespełniony.", { v0: cfg(node, "field") }),
        };
      }
      const matched = compare(cfg(node, "operator"), field.value, cfg(node, "value"));
      return {
        matched,
        message: tr("Pole {label} („{value}”) {v2} „{v3}”: {v4}.", {
          label: field.label,
          value: field.value,
          v2: tr(cfg(node, "operator") || "równa się"),
          v3: cfg(node, "value"),
          v4: matched ? tr("tak") : tr("nie"),
        }),
      };
    }
    case "email_opened_cond": {
      const db = getDb();
      const sends = await db
        .select({ token: emailSends.token })
        .from(emailSends)
        .where(eq(emailSends.toEmail, contact.email));
      for (const s of sends) {
        const open = await db
          .select()
          .from(emailEvents)
          .where(and(eq(emailEvents.token, s.token), eq(emailEvents.kind, "open")))
          .get();
        if (open) {
          return { matched: true, message: tr("Kontakt otworzył wcześniejszą wiadomość.") };
        }
      }
      return { matched: false, message: tr("Brak zarejestrowanego otwarcia wiadomości.") };
    }
    case "dnc_status": {
      const matched = (contact.tags ?? []).some((t) => t.toLowerCase() === DNC_TAG);
      return {
        matched,
        message: matched
          ? tr("Kontakt ma status „nie kontaktować”.")
          : tr("Kontakt nie ma statusu „nie kontaktować”."),
      };
    }
    default:
      return {
        matched: false,
        message: tr("Nieznany warunek „{key}” — traktowany jako niespełniony.", { key: key }),
      };
  }
}
