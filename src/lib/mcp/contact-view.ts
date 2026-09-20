import type { ContactRow } from "@/lib/db/schema";

/**
 * Kontakt w postaci, którą widzi asystent AI przez MCP.
 *
 * **Lista dozwolonych pól, nie lista zakazanych.** Do 1.64.3 narzędzia MCP
 * oddawały cały wiersz tabeli `contacts` — razem z PESEL-em, identyfikatorem
 * pacjenta w systemie rejestracji i polami własnymi placówki. Asystent nie
 * potrzebuje żadnego z nich, a każda odpowiedź narzędzia trafia do dostawcy
 * modelu. Nowa kolumna w `contacts` nie wypłynie tu sama: trzeba ją dopisać
 * świadomie.
 */
export interface AssistantContact {
  id: string;
  prmId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
  tags: string[];
  segments: string[];
  source: string;
  medium: string;
  campaign: string;
  createdAt: string;
  consents: { email: boolean; sms: boolean; profiling: boolean };
}

export function toAssistantContact(c: ContactRow): AssistantContact {
  return {
    id: c.id,
    prmId: c.prmId,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    status: c.status,
    tags: c.tags,
    segments: c.segments,
    source: c.source,
    medium: c.medium,
    campaign: c.campaign,
    createdAt: c.createdAt,
    consents: {
      email: c.consentEmail === 1,
      sms: c.consentSms === 1,
      profiling: c.consentProfiling === 1,
    },
  };
}
