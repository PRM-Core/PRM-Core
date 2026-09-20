import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { getSessionUser } from "../auth/session.server";
import { z } from "zod";
import {
  consentStats,
  createConsentDef,
  deleteConsentDef,
  getContactConsents,
  listConsentDefs,
  saveConsentDef,
  setConsents,
  setContactConsents,
  type ConsentDef,
  type ConsentStat,
} from "../consent/consent.server";
import { t } from "@/lib/i18n";

// RPC only — the rules live in consent/consent.server.ts.

export type { ConsentDef, ConsentStat };

export interface ConsentOverview {
  stats: ConsentStat[];
  /** Contacts who opted out or carry the do-not-contact tag. */
  withdrawn: number;
  /** Every consent the clinic tracks, including retired ones (the editor shows them greyed). */
  defs: ConsentDef[];
}

export const getConsentOverview = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<ConsentOverview> => {
    const [{ stats, withdrawn }, defs] = await Promise.all([consentStats(), listConsentDefs(true)]);
    return { stats, withdrawn, defs };
  });

/** The consents a contact card should render, in card order. Active ones only. */
export const getActiveConsentDefs = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<ConsentDef[]> => listConsentDefs());

export const saveConsentWording = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      key: z.string(),
      label: z.string().min(1).max(120),
      note: z.string().max(300).default(""),
      title: z.string().max(200).default(""),
      body: z.string().min(1).max(5000),
      active: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => saveConsentDef(data));

export const addConsentDef = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      label: z.string().min(1).max(120),
      note: z.string().max(300).default(""),
      title: z.string().max(200).default(""),
      body: z.string().min(1).max(5000),
    }),
  )
  .handler(async ({ data }) => createConsentDef(data));

export const removeConsentDef = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ key: z.string() }))
  .handler(async ({ data }) => deleteConsentDef(data.key));

/** Answers to the added consents for one contact — the built-ins ride on the contact row. */
export const getContactExtraConsents = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ contactId: z.string() }))
  .handler(
    async ({ data }): Promise<Record<string, boolean>> => getContactConsents(data.contactId),
  );

/** Sets consents from the contact card. Source is recorded as a manual edit. */
export const updateContactConsents = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      contactId: z.string(),
      email: z.boolean(),
      sms: z.boolean(),
      profiling: z.boolean(),
      extra: z.record(z.string(), z.boolean()).default({}),
    }),
  )
  .handler(async ({ data }) => {
    const builtin = await setConsents({
      contactId: data.contactId,
      email: data.email,
      sms: data.sms,
      profiling: data.profiling,
      source: "ręcznie",
    });
    const extra = await setContactConsents({
      contactId: data.contactId,
      values: data.extra,
      source: "ręcznie",
    });
    return { ok: builtin.ok, changed: [...builtin.changed, ...extra.changed] };
  });

/**
 * Zmiana zgód **wielu zaznaczonym kontaktom naraz**.
 *
 * **Trzy stany na kanał, nie dwa.** „Bez zmian" jest wartością domyślną, bo
 * inaczej otwarcie okna i zapis odebrałyby zgody wszystkim, którym nie
 * dotknięto suwaka — a odebrana zgoda marketingowa znaczy, że pacjent
 * przestaje dostawać wiadomości i nikt się o tym nie dowie.
 *
 * **Podstawa jest wymagana przy nadawaniu.** Nadanie zgody hurtem bez wskazania,
 * skąd się wzięła, to dokładnie ta sytuacja, w której przy kontroli nie ma czym
 * jej udowodnić. Przy wycofywaniu podstawa jest opcjonalna — wycofania nikt nie
 * kwestionuje, a pacjent ma prawo wycofać zgodę w każdej chwili.
 *
 * Idzie przez `setConsents` po jednym kontakcie, nie jednym `UPDATE`: każda
 * realna zmiana ma trafić na oś czasu pacjenta i wystawić zdarzenie dla
 * automatyzacji. Hurtowy `UPDATE` byłby szybszy i zostawiłby dokumentację
 * medyczną bez śladu, kto i kiedy to zrobił.
 */
export const bulkSetConsents = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      // Sufit jak przy masowym usuwaniu — jedno żądanie ma się zmieścić
      // w rozsądnym czasie, a przy większych zaznaczeniach klient dzieli
      // pracę na partie.
      ids: z.array(z.string()).min(1).max(500),
      email: z.enum(["keep", "grant", "revoke"]).default("keep"),
      sms: z.enum(["keep", "grant", "revoke"]).default("keep"),
      profiling: z.enum(["keep", "grant", "revoke"]).default("keep"),
      /** Podstawa zgody — trafia do kartoteki i na oś czasu. */
      source: z.string().max(200).default(""),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: boolean; changed: number; untouched: number; error?: string }> => {
      const user = await getSessionUser();
      if (!user) throw new Error(t("Wymagane zalogowanie."));

      const wanted = (v: "keep" | "grant" | "revoke") => (v === "keep" ? undefined : v === "grant");
      const grants = [data.email, data.sms, data.profiling].some((v) => v === "grant");

      if (data.email === "keep" && data.sms === "keep" && data.profiling === "keep") {
        return { ok: false, changed: 0, untouched: 0, error: t("Nie wskazano żadnej zmiany.") };
      }
      if (grants && !data.source.trim()) {
        return {
          ok: false,
          changed: 0,
          untouched: 0,
          error: t(
            "Przy nadawaniu zgody podaj podstawę — bez niej nie da się jej później wykazać.",
          ),
        };
      }

      // Kto zmienił, zapisane w podstawie: za pół roku „import" nie powie nic,
      // a „Zgoda papierowa — Anna Nowak" powie wszystko.
      const source =
        `${data.source.trim() || "wycofanie zbiorcze"} — ${user.firstName} ${user.lastName}`.trim();

      let changed = 0;
      let untouched = 0;
      for (const contactId of data.ids) {
        const r = await setConsents({
          contactId,
          email: wanted(data.email),
          sms: wanted(data.sms),
          profiling: wanted(data.profiling),
          source,
        });
        if (r.changed.length > 0) changed += 1;
        else untouched += 1;
      }

      return { ok: true, changed, untouched };
    },
  );
