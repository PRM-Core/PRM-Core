import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import {
  createContactField,
  customFieldUsage,
  deleteContactField,
  listContactFields,
  moveContactField,
  saveContactField,
  type ContactFieldDef,
} from "../fields/contact-fields.server";

// RPC only — the rules live in fields/contact-fields.server.ts.

export type { ContactFieldDef };

const fieldType = z.enum(["text", "textarea", "number", "date", "select", "boolean", "list"]);

export interface ContactFieldsView {
  fields: ContactFieldDef[];
  /** How many contacts already carry a value for each custom field. */
  usage: Record<string, number>;
}

export const getContactFields = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .handler(async (): Promise<ContactFieldsView> => {
    const [fields, usage] = await Promise.all([listContactFields(), customFieldUsage()]);
    return { fields, usage };
  });

export const addContactField = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      label: z.string().min(1).max(60),
      type: fieldType,
      options: z.array(z.string()).default([]),
      hint: z.string().max(300).default(""),
    }),
  )
  .handler(async ({ data }) => createContactField(data));

export const updateContactField = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      key: z.string(),
      label: z.string().min(1).max(60),
      hint: z.string().max(300).default(""),
      visible: z.boolean(),
      type: fieldType.optional(),
      options: z.array(z.string()).optional(),
      /** Statusy, przy których pole ma się pokazywać. Pusta lista = wszystkie. */
      statuses: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ data }) => saveContactField(data));

export const removeContactField = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ key: z.string() }))
  .handler(async ({ data }) => deleteContactField(data.key));

export const reorderContactField = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(z.object({ key: z.string(), direction: z.enum(["up", "down"]) }))
  .handler(async ({ data }) => moveContactField(data.key, data.direction));
