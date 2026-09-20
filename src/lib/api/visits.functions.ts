import { createServerFn } from "@tanstack/react-start";
import { allowReporter, requireUser } from "./require-user";
import { z } from "zod";
import { visitsForContact, type VisitActivityItem } from "../visits/visits.server";

// RPC only — the rules live in visits/visits.server.ts.

export type { VisitActivityItem };

/** Booked visits for the contact card timeline. */
export const getVisitsForContact = createServerFn({ method: "GET" })
  .middleware([allowReporter])
  .inputValidator(z.object({ contactId: z.string() }))
  .handler(async ({ data }): Promise<VisitActivityItem[]> => visitsForContact(data.contactId));
