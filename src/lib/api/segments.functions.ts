import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import {
  deleteSegment,
  segmentDeletionImpact,
  getSegment,
  listEmailMessageOptions,
  listSegmentOptions,
  listSegments,
  previewSegment,
  previewSegmentMembers,
  saveSegment,
  segmentMembers,
  type SegmentMember,
  type SegmentOption,
  type SegmentPreview,
  type SegmentSummary,
} from "../segments/segments.server";
import { listCustomFields } from "../fields/contact-fields.server";
import { getSessionUser } from "../auth/session.server";
import { chatSegment, type SegmentChatResult } from "../ai/segment-builder.server";

// RPC only — the rules live in segments/segments.server.ts.

export type { SegmentSummary, SegmentPreview, SegmentOption, SegmentMember };

const conditionSchema = z.object({
  id: z.string(),
  field: z.string(),
  operator: z.enum([
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "starts",
    "is_set",
    "is_empty",
    "occurred",
    "not_occurred",
  ]),
  value: z.string().default(""),
  days: z.number().int().min(0).max(3650).optional(),
});

const definitionSchema = z.object({
  match: z.enum(["all", "any"]),
  groups: z.array(
    z.object({
      id: z.string(),
      match: z.enum(["all", "any"]),
      conditions: z.array(conditionSchema),
    }),
  ),
});

export const getSegments = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<SegmentSummary[]> => listSegments());

export const getSegmentById = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<SegmentSummary | null> => getSegment(data.id));

/**
 * Counts a definition without saving it — what the builder calls while somebody
 * is still typing, so the audience size is visible before anybody commits.
 */
export const previewSegmentDefinition = createServerFn({ method: "POST" })
  .middleware([allowReporter])
  .inputValidator(z.object({ definition: definitionSchema }))
  .handler(async ({ data }): Promise<SegmentPreview> => previewSegment(data.definition));

export const saveSegmentDefinition = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1).max(120),
      description: z.string().max(500).default(""),
      status: z.enum(["draft", "live"]),
      definition: definitionSchema,
      /** Stały (cykliczny) — bez terminu ważności. Domyślnie doraźny. */
      permanent: z.boolean().default(false),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    return saveSegment({
      ...data,
      updatedBy: user ? `${user.firstName} ${user.lastName}`.trim() : "",
    });
  });

export const removeSegment = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => deleteSegment(data.id));

/**
 * Co się stanie po usunięciu — pytane PRZED pokazaniem potwierdzenia.
 *
 * Segment z etykiety znika razem z etykietą w kartotekach, a to zmiana
 * w danych pacjentów; człowiek ma prawo zobaczyć liczbę, zanim się zgodzi.
 */
export const getSegmentDeletionImpact = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => segmentDeletionImpact(data.id));

export const getSegmentMembers = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => segmentMembers(data.id));

/**
 * Strona kontaktów, które łapie definicja — to, co dociąga panel „Kontakty w
 * segmencie" po rozwinięciu. Działa na definicji, a nie na zapisanym id, żeby
 * dało się przejrzeć także niezapisany szkic z buildera.
 */
export const getSegmentDefinitionMembers = createServerFn({ method: "POST" })
  .middleware([allowReporter])
  .inputValidator(
    z.object({
      definition: definitionSchema,
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(200).default(50),
    }),
  )
  .handler(
    async ({ data }): Promise<{ members: SegmentMember[]; total: number }> =>
      previewSegmentMembers(data.definition, data.offset, data.limit),
  );

/**
 * Segmenty, które może zaproponować picker — lista tego, co da się przypisać na
 * karcie kontaktu.
 *
 * Same nazwy, bez liczenia osób: picker pyta „co istnieje", a przeliczanie
 * każdego segmentu wobec każdego kontaktu tylko po to sprawiłoby, że otwarcie
 * karty pacjenta płaci za cały moduł.
 */
export const getSegmentOptions = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<SegmentOption[]> => listSegmentOptions());

/**
 * One turn of the segment assistant.
 *
 * The whole conversation is sent each time and nothing is stored: a segment
 * definition is the artefact worth keeping, not the chat that produced it.
 */
export const askSegmentAssistant = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      messages: z
        .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() }))
        .max(40),
      definition: definitionSchema.optional(),
    }),
  )
  .handler(async ({ data }): Promise<SegmentChatResult> => {
    const [custom, emailMessages] = await Promise.all([
      listCustomFields(),
      listEmailMessageOptions(),
    ]);
    return chatSegment({
      messages: data.messages,
      currentDefinition: data.definition,
      customFields: custom.map((f) => ({ key: `custom:${f.key}`, label: f.label })),
      emailMessages,
    });
  });

/** Newsletter and Email messages a "opened / clicked" condition can point at. */
export const getEmailMessageOptions = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(
    async (): Promise<{ id: string; name: string; kind: string }[]> => listEmailMessageOptions(),
  );

/** Fields the clinic added, offered in the builder alongside the built-in ones. */
export const getCustomSegmentFields = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<{ key: string; label: string }[]> => {
    const fields = await listCustomFields();
    return fields.map((f) => ({ key: `custom:${f.key}`, label: f.label }));
  });
