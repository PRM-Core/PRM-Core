import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "../db/client.server";
import {
  campaigns,
  contacts,
  emailSettings,
  segments,
  smsSends,
  type CampaignRow,
  type ContactRow,
} from "../db/schema";
import { getSnapshot } from "../engine/snapshots.server";
import { logStep } from "../engine/log.server";
import { getBaseUrl } from "../engine/settings.server";
import { collectAttachments } from "../email/attachments.server";
import { resolveDynamicFields } from "../messaging/dynamic-fields.server";
import { sendEmail, SendGridError } from "../email/sendgrid.server";
import { sendSms, TwilioError } from "../sms/twilio.server";
import {
  createTrackedSend,
  deleteTrackedSend,
  injectTracking,
} from "../email/email-tracking.server";
import { resolveSmsSender } from "../sms/senders.server";
import { resolveEmailSender } from "../email/senders.server";
import { checkConsent } from "../consent/consent.server";
import { applyTagChange, sampleFromContact } from "../engine/actions.server";
import { resolveMergeTagsInHtml, resolvePersonalizationInText } from "../content-builder";
import { segmentMemberIds } from "../segments/segments.server";
import { planBatch } from "./throttle";
import { intlLocale, t } from "@/lib/i18n";

/**
 * Wysyłka szablonu do segmentu.
 *
 * Osobno od automatyzacji, choć korzysta z tych samych klocków (migawki treści,
 * zgody, śledzenie otwarć, bramki). Automatyzacja reaguje na zdarzenie u jednego
 * pacjenta; kampania to jedno kliknięcie i tysiąc wiadomości — i to ta różnica
 * decyduje o wszystkim poniżej: partiami, z licznikami i z możliwością odwołania.
 */

/**
 * Ilu odbiorców na jeden przebieg pętli.
 *
 * Pętla tyka co 4 sekundy i nie nakłada się sama na siebie, więc partia, która
 * trwa dłużej, po prostu rozciąga tik. 25 realnych wysyłek to bezpieczny sufit:
 * duża kampania rozłoży się na kilka minut, zamiast zablokować silnik i wszystko
 * inne, co ma w tym czasie zadziałać.
 */
const BATCH_SIZE = 25;

/** Ile przed wysyłką przeliczyć segment. Wprost z ustalenia: minutę wcześniej. */
const RECOUNT_LEAD_MS = 60_000;

export interface CreateCampaignInput {
  kind: "newsletter" | "email" | "sms";
  templateName: string;
  segmentId: string;
  subject: string;
  tags: string[];
  /** Milisekundy epoki. Pusto albo w przeszłości = wyślij przy najbliższym tiku. */
  scheduledAt: number | null;
  /** Godziny wysyłki, „HH:MM" czasu polskiego. Puste = całą dobę. */
  sendFrom?: string;
  sendTo?: string;
  /** Ile wiadomości na godzinę. `null` = bez ograniczenia. */
  perHourLimit?: number | null;
  /** Ile wiadomości na dobę. `null` = bez ograniczenia. */
  perDayLimit?: number | null;
}

export async function createCampaign(
  input: CreateCampaignInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const db = getDb();

  const segment = await db.select().from(segments).where(eq(segments.id, input.segmentId)).get();
  if (!segment) return { ok: false, error: t("Wybrany segment nie istnieje.") };

  // Treść musi już być na serwerze — publikuje ją strona wysyłki, zanim tu
  // trafi. Bez migawki kampania wystartowałaby i padła dopiero przy wysyłce.
  const snapshot = await getSnapshot(input.kind, input.templateName);
  if (!snapshot) {
    return {
      ok: false,
      error: t(
        "Brak opublikowanej treści szablonu „{templateName}”. Otwórz szablon i zapisz go ponownie.",
        { templateName: input.templateName },
      ),
    };
  }
  if (input.kind === "sms" ? !snapshot.smsBody : !snapshot.html) {
    return {
      ok: false,
      error: t("Szablon „{templateName}” nie ma jeszcze treści.", {
        templateName: input.templateName,
      }),
    };
  }

  const now = Date.now();
  const scheduledAt = input.scheduledAt && input.scheduledAt > now ? input.scheduledAt : null;
  const id = `camp-${now}`;

  // Podgląd liczby odbiorców zapisany od razu, żeby lista kampanii nie była
  // pusta do czasu wysyłki. Przy wysyłce i tak zostanie przeliczony.
  const audienceCount = (await resolveAudience(input.segmentId)).length;

  await db.insert(campaigns).values({
    id,
    kind: input.kind,
    templateName: input.templateName,
    segmentId: input.segmentId,
    segmentName: segment.name,
    subject: input.subject.trim(),
    tags: input.tags.map((t) => t.trim()).filter(Boolean),
    scheduledAt,
    recountAt: scheduledAt ? scheduledAt - RECOUNT_LEAD_MS : null,
    status: "scheduled",
    audienceCount,
    sendFrom: input.sendFrom ?? "",
    sendTo: input.sendTo ?? "",
    perHourLimit: input.perHourLimit ?? null,
    perDayLimit: input.perDayLimit ?? null,
    createdAt: now,
  });

  await logStep({
    kind: "action",
    message: scheduledAt
      ? t("Zaplanowano wysyłkę „{templateName}” do segmentu „{name}” na {v2}.", {
          templateName: input.templateName,
          name: segment.name,
          v2: new Date(scheduledAt).toLocaleString(intlLocale(), { timeZone: "Europe/Warsaw" }),
        })
      : t("Zlecono natychmiastową wysyłkę „{templateName}” do segmentu „{name}”.", {
          templateName: input.templateName,
          name: segment.name,
        }),
    detail: {
      campaignId: id,
      kind: input.kind,
      segment: segment.name,
      limitGodzinowy: input.perHourLimit ? String(input.perHourLimit) : "brak",
      limitDobowy: input.perDayLimit ? String(input.perDayLimit) : "brak",
      godzinyWysylki:
        input.sendFrom && input.sendTo ? `${input.sendFrom}-${input.sendTo}` : t("cała doba"),
    },
  });

  return { ok: true, id };
}

/**
 * Wstrzymanie wysyłki — odwracalne.
 *
 * **Osobno od `cancelCampaign`, bo to dwie różne decyzje.** „Zatrzymaj" bywa
 * odruchem („coś jest nie tak, sprawdźmy"), a dotąd kasowało wysyłkę
 * bezpowrotnie: przy kampanii do ośmiu tysięcy osób, z której wyszło półtora,
 * jedyną drogą powrotu było zlecenie jej od nowa — czyli wysłanie tym
 * pierwszym po raz drugi.
 *
 * Wstrzymana kampania **zachowuje liczniki**, więc wznowienie idzie dalej od
 * miejsca, w którym stanęła, a nie od początku.
 */
export async function pauseCampaign(id: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const row = await db.select().from(campaigns).where(eq(campaigns.id, id)).get();
  if (!row) return { ok: false, error: t("Kampania nie istnieje.") };
  if (row.status !== "sending" && row.status !== "scheduled") {
    return { ok: false, error: t("Wstrzymać można tylko wysyłkę zaplanowaną albo trwającą.") };
  }
  // `finishedAt` zostaje puste — to nie jest koniec wysyłki.
  await db.update(campaigns).set({ status: "paused" }).where(eq(campaigns.id, id));
  return { ok: true };
}

/**
 * Wznowienie wstrzymanej wysyłki.
 *
 * Wraca do `sending`, a nie do `scheduled`: `scheduled` uruchomiłoby ponowne
 * przeliczenie segmentu i wysyłkę od nowa do wszystkich, także tych, którzy
 * wiadomość już dostali. Liczniki zostały nietknięte, więc silnik po prostu
 * bierze kolejną partię.
 */
export async function resumeCampaign(id: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const row = await db.select().from(campaigns).where(eq(campaigns.id, id)).get();
  if (!row) return { ok: false, error: t("Kampania nie istnieje.") };
  if (row.status !== "paused") return { ok: false, error: t("Ta wysyłka nie jest wstrzymana.") };
  await db
    .update(campaigns)
    .set({ status: "sending", startedAt: row.startedAt ?? Date.now(), recountAt: null })
    .where(eq(campaigns.id, id));
  return { ok: true };
}

export async function cancelCampaign(id: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const row = await db.select().from(campaigns).where(eq(campaigns.id, id)).get();
  if (!row) return { ok: false, error: t("Kampania nie istnieje.") };
  // „sending” też można odwołać — zatrzyma się po bieżącej partii. Wiadomości,
  // które już wyszły, nie wrócą i nikt nie powinien udawać, że jest inaczej.
  if (row.status === "sent" || row.status === "cancelled") {
    return { ok: false, error: t("Ta wysyłka jest już zakończona.") };
  }
  // Wstrzymaną również da się anulować — to właśnie jest druga z dwóch dróg,
  // które ma dostać człowiek po zatrzymaniu wysyłki.
  await db
    .update(campaigns)
    .set({ status: "cancelled", finishedAt: Date.now() })
    .where(eq(campaigns.id, id));
  return { ok: true };
}

export async function listCampaigns(): Promise<CampaignRow[]> {
  return getDb().select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(100);
}

/**
 * Kontakty w segmencie — ta sama ocena definicji, z której korzysta podgląd
 * segmentu, więc lista odbiorców nie może rozjechać się z liczbą, którą widział
 * człowiek klikający „Wyślij”.
 */
export async function resolveAudience(segmentId: string): Promise<ContactRow[]> {
  const db = getDb();
  const segment = await db.select().from(segments).where(eq(segments.id, segmentId)).get();
  if (!segment) return [];
  const ids = await segmentMemberIds(segment.definition);
  if (ids.size === 0) return [];
  const rows = await db.select().from(contacts);
  return rows.filter((c) => ids.has(c.id));
}

/**
 * Krok pętli silnika: przelicza to, co blisko wysyłki, i wysyła to, co należy.
 *
 * Nigdy nie rzuca — awaria jednej kampanii nie może zatrzymać całego tiku.
 */
export async function processDueCampaigns(): Promise<{ sent: number }> {
  const db = getDb();
  const now = Date.now();
  let sent = 0;

  // ── 1. Przeliczenie minutę przed ──────────────────────────────────────────
  // Liczba odbiorców pokazywana na liście ma być aktualna JESZCZE przed
  // wysyłką — tak, żeby dało się w ostatniej chwili zauważyć, że segment
  // urósł do kilku tysięcy, i zdążyć kampanię odwołać.
  const toRecount = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.status, "scheduled"), lte(campaigns.recountAt, now)))
    .all();
  for (const campaign of toRecount) {
    try {
      const audience = await resolveAudience(campaign.segmentId);
      await db
        .update(campaigns)
        .set({ audienceCount: audience.length, recountAt: null })
        .where(eq(campaigns.id, campaign.id));
    } catch {
      // Przeliczenie jest wygodą, nie warunkiem wysyłki — cisza jest tu w porządku.
      await db.update(campaigns).set({ recountAt: null }).where(eq(campaigns.id, campaign.id));
    }
  }

  // ── 2. Wysyłka ────────────────────────────────────────────────────────────
  const due = await db
    .select()
    .from(campaigns)
    .where(
      and(
        inArray(campaigns.status, ["scheduled", "sending"]),
        sql`(${campaigns.scheduledAt} IS NULL OR ${campaigns.scheduledAt} <= ${now})`,
      ),
    )
    .all();

  for (const campaign of due) {
    try {
      sent += await sendBatch(campaign);
    } catch (err) {
      await db
        .update(campaigns)
        .set({ status: "failed", error: String(err), finishedAt: Date.now() })
        .where(eq(campaigns.id, campaign.id));
      await logStep({
        kind: "error",
        message: t("Wysyłka „{templateName}” przerwana: {v1}", {
          templateName: campaign.templateName,
          v1: String(err),
        }),
        detail: { campaignId: campaign.id },
      });
    }
  }

  return { sent };
}

/**
 * Jedna partia jednej kampanii.
 *
 * Odbiorcy są wyliczani przy KAŻDEJ partii, a wysłani rozpoznawani po tym, że
 * mają już tag kampanii. Dzięki temu przerwany tik, restart serwera albo
 * awaria w połowie nie kończą się drugą wiadomością do tych samych osób —
 * a to jest najgorsza rzecz, jaka może się przy wysyłce wydarzyć.
 */
async function sendBatch(campaign: CampaignRow): Promise<number> {
  const db = getDb();

  if (campaign.status === "scheduled") {
    await db
      .update(campaigns)
      .set({ status: "sending", startedAt: Date.now(), recountAt: null })
      .where(eq(campaigns.id, campaign.id));
  }

  const snapshot = await getSnapshot(
    campaign.kind as "newsletter" | "email" | "sms",
    campaign.templateName,
  );
  if (!snapshot) {
    await db
      .update(campaigns)
      .set({
        status: "failed",
        error: t("Zniknęła migawka treści szablonu."),
        finishedAt: Date.now(),
      })
      .where(eq(campaigns.id, campaign.id));
    return 0;
  }

  const doneTag = campaignTag(campaign);
  const audience = await resolveAudience(campaign.segmentId);
  const pending = audience.filter(
    (c) => !(c.tags ?? []).some((t) => t.toLowerCase() === doneTag.toLowerCase()),
  );

  if (pending.length === 0) {
    await db
      .update(campaigns)
      .set({ status: "sent", finishedAt: Date.now(), audienceCount: audience.length })
      .where(eq(campaigns.id, campaign.id));
    await logStep({
      kind: "run_ended",
      message: t(
        "Wysyłka „{templateName}” zakończona — {sentCount} wysłanych, {skippedCount} pominiętych, {failedCount} błędów.",
        {
          templateName: campaign.templateName,
          sentCount: campaign.sentCount,
          skippedCount: campaign.skippedCount,
          failedCount: campaign.failedCount,
        },
      ),
      detail: { campaignId: campaign.id },
    });
    return 0;
  }

  // ── Tempo ─────────────────────────────────────────────────────────────────
  //
  // Sprawdzane **po** wyliczeniu oczekujących, żeby kampania, która właśnie
  // doszła do końca, zamknęła się od razu, a nie czekała na wolny slot tylko po
  // to, żeby stwierdzić, że nie ma już do kogo pisać. I **przed** czytaniem
  // załączników — nie ma sensu wczytywać 20 MB z dysku, żeby za chwilę nic nie
  // wysłać.
  const decision = planBatch(
    {
      sendFrom: campaign.sendFrom,
      sendTo: campaign.sendTo,
      perHourLimit: campaign.perHourLimit,
      perDayLimit: campaign.perDayLimit,
      hourWindowAt: campaign.hourWindowAt,
      hourSentCount: campaign.hourSentCount,
      dayKey: campaign.dayKey,
      daySentCount: campaign.daySentCount,
    },
    Date.now(),
    BATCH_SIZE,
  );

  if (decision.allowance <= 0) {
    // Kampania zostaje w „sending" — stoi, ale nie jest skończona. Przesunięte
    // okna zapisujemy nawet teraz, bo inaczej przy przełomie doby licznik
    // wisiałby na wczorajszej wartości aż do pierwszej udanej wysyłki.
    await db
      .update(campaigns)
      .set({
        hourWindowAt: decision.hourWindowAt,
        hourSentCount: decision.hourSentCount,
        dayKey: decision.dayKey,
        daySentCount: decision.daySentCount,
        throttledUntil: decision.nextAt,
      })
      .where(eq(campaigns.id, campaign.id));
    return 0;
  }

  // Nadawca z migawki: wiadomość podpisuje się nazwą wybraną przy jej
  // tworzeniu, a nie tą, która akurat jest domyślna w chwili wysyłki.
  const emailSender =
    campaign.kind === "sms" ? null : await resolveEmailSender(snapshot.senderId ?? "");
  const baseUrl = campaign.kind === "sms" ? "" : await getBaseUrl();
  const sender = campaign.kind === "sms" ? await resolveSmsSender("") : null;
  if (campaign.kind === "sms" && !sender) {
    await db
      .update(campaigns)
      .set({
        status: "failed",
        error: t("Brak skonfigurowanego nadawcy SMS — Integracje → SMS API."),
        finishedAt: Date.now(),
      })
      .where(eq(campaigns.id, campaign.id));
    return 0;
  }

  // Załączniki czytane RAZ na partię, nie na odbiorcę: te same bajty dla
  // wszystkich, a odczyt na każdego adresata przy tysiącu odbiorców to tysiąc
  // odczytów tego samego pliku z dysku.
  const { attachments: campaignAttachments, problems: attachmentProblems } =
    campaign.kind === "sms"
      ? { attachments: [], problems: [] as string[] }
      : await collectAttachments(snapshot.attachments ?? []);
  if (attachmentProblems.length > 0) {
    // Nie przerywamy kampanii — wiadomość bez załącznika jest lepsza niż brak
    // wiadomości. Ale problem musi być widoczny w dzienniku, a nie przemilczany.
    await logStep({
      kind: "error",
      message: t('Kampania „{templateName}": problem z załącznikami — {v1}', {
        templateName: campaign.templateName,
        v1: attachmentProblems.join(" "),
      }),
      detail: { campaign: campaign.id },
    });
  }

  /** Pola dynamiczne bez pokrycia — zbierane przez całą partię i logowane raz. */
  const dynamicMisses: string[] = [];

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const contact of pending.slice(0, BATCH_SIZE)) {
    // Budżet liczy **próby**, nie sukcesy: wiadomość odrzucona przez operatora
    // i tak przeszła przez jego bramkę, a limit ma chronić właśnie tę stronę.
    // Pominięci bez zgody nie kosztują nic — do nikogo nic nie poszło.
    if (sent + failed >= decision.allowance) break;

    // Kampania jest z definicji marketingowa — nawet gdy treść wygląda na
    // administracyjną. Kto chce wysłać coś administracyjnie, robi to
    // automatyzacją, gdzie tryb jest wyborem świadomym.
    const consent = checkConsent(contact, campaign.kind === "sms" ? "sms" : "email", "marketing");
    if (!consent.allowed) {
      skipped += 1;
      await markDone(contact, doneTag);
      continue;
    }

    try {
      if (campaign.kind === "sms") {
        const body = resolvePersonalizationInText(snapshot.smsBody, sampleFromContact(contact));
        await sendSms({ to: contact.phone, fromNumber: sender!.value, body });
        await db.insert(smsSends).values({
          id: randomUUID(),
          contactId: contact.id,
          toPhone: contact.phone,
          sender: sender!.value,
          body,
          source: "campaign",
          automationId: null,
          campaignId: campaign.id,
          sentAt: Date.now(),
        });
      } else {
        const subject = campaign.subject || snapshot.subject || snapshot.name;
        // Najpierw pola dynamiczne (plan leczenia, feed), potem znaczniki
        // personalizacji: wstawiona treść może zawierać imię pacjenta,
        // a odwrotna kolejność zostawiłaby w niej surowy znacznik.
        const dynamic = await resolveDynamicFields(snapshot.html, contact);
        if (dynamic.misses.length > 0) dynamicMisses.push(...dynamic.misses);
        const html = resolveMergeTagsInHtml(dynamic.html, sampleFromContact(contact));
        const token = await createTrackedSend({
          toEmail: contact.email,
          subject,
          contentItemId: snapshot.contentItemId,
          // Bez tego raport nie odróżni dwóch kampanii na tym samym szablonie.
          campaignId: campaign.id,
        });
        try {
          await sendEmail({
            to: contact.email,
            fromEmail: emailSender?.fromEmail ?? "",
            fromName: emailSender?.fromName ?? "",
            subject,
            html: injectTracking(html, token, baseUrl),
            attachments: campaignAttachments,
            trackingToken: token,
          });
        } catch (err) {
          // Token bez wysyłki udawałby wiadomość, która nigdy nie wyszła, i
          // psułby statystyki otwarć.
          await deleteTrackedSend(token);
          throw err;
        }
      }
      sent += 1;
      await markDone(contact, doneTag, campaign.tags ?? []);
    } catch (err) {
      failed += 1;
      const message =
        err instanceof SendGridError || err instanceof TwilioError ? err.message : String(err);
      await logStep({
        contactId: contact.id,
        kind: "error",
        message: t("Wysyłka „{templateName}” nie powiodła się: {message}", {
          templateName: campaign.templateName,
          message: message,
        }),
        detail: { campaignId: campaign.id },
      });
      // Oznaczony mimo błędu: bez tego następna partia próbowałaby w kółko tego
      // samego odbiorcę i kampania nigdy by się nie skończyła.
      await markDone(contact, doneTag);
    }
  }

  // Pola bez pokrycia — raz na partię, ze zliczeniem powtórzeń. Wpis na
  // każdego odbiorcę zalałby dziennik przy tysiącu wiadomości, a to zwykle
  // JEDEN brakujący wiersz powtórzony tysiąc razy.
  if (dynamicMisses.length > 0) {
    const counted = new Map<string, number>();
    for (const m of dynamicMisses) counted.set(m, (counted.get(m) ?? 0) + 1);
    await logStep({
      kind: "error",
      message:
        t('Kampania „{templateName}": pola dynamiczne bez pokrycia — ', {
          templateName: campaign.templateName,
        }) + [...counted.entries()].map(([m, n]) => `${m} (${n}×)`).join("; "),
      detail: { campaignId: campaign.id },
    });
  }

  await db
    .update(campaigns)
    .set({
      sentCount: campaign.sentCount + sent,
      skippedCount: campaign.skippedCount + skipped,
      failedCount: campaign.failedCount + failed,
      audienceCount: audience.length,
      hourWindowAt: decision.hourWindowAt,
      hourSentCount: decision.hourSentCount + sent + failed,
      dayKey: decision.dayKey,
      daySentCount: decision.daySentCount + sent + failed,
      throttledUntil: null,
    })
    .where(eq(campaigns.id, campaign.id));

  return sent;
}

/** Tag „ta osoba dostała tę konkretną wysyłkę” — jednocześnie znacznik postępu i ślad w kartotece. */
function campaignTag(campaign: CampaignRow): string {
  return `wysylka:${campaign.id}`;
}

async function markDone(
  contact: ContactRow,
  doneTag: string,
  extraTags: string[] = [],
): Promise<void> {
  await applyTagChange(contact, doneTag, "add");
  for (const tag of extraTags) {
    await applyTagChange(contact, tag, "add");
  }
}
