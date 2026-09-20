/**
 * Co asystent AI dostaje o kontakcie przez MCP.
 *
 * Test pilnuje listy dozwolonych pól: dopisanie kolumny do `contacts` nie może
 * po cichu wysłać jej dostawcy modelu.
 */
import { describe, expect, test } from "bun:test";
import type { ContactRow } from "@/lib/db/schema";
import { toAssistantContact } from "./contact-view";

const row = {
  id: "c-1",
  prmId: "PRM-00001",
  firstName: "Anna",
  lastName: "Przykładowa",
  email: "anna@example.com",
  phone: "+48 500 000 000",
  pesel: "00000000000",
  segments: ["Demo"],
  tags: ["demo"],
  source: "Formularz",
  medium: "website",
  campaign: "",
  createdAt: "2026-01-01",
  status: "lead",
  externalSyncedAt: 123,
  consentEmail: 1,
  consentSms: 0,
  consentProfiling: 0,
  consentSource: "formularz",
  consentUpdatedAt: 123,
  customFields: { notatka: "prywatne" },
  phoneOnly: 0,
  externalPatientId: "ic-42",
} as unknown as ContactRow;

describe("toAssistantContact", () => {
  test("oddaje tylko pola z listy dozwolonych", () => {
    expect(Object.keys(toAssistantContact(row)).sort()).toEqual(
      [
        "campaign",
        "consents",
        "createdAt",
        "email",
        "firstName",
        "id",
        "lastName",
        "medium",
        "phone",
        "prmId",
        "segments",
        "source",
        "status",
        "tags",
      ].sort(),
    );
  });

  test("nie zawiera PESEL-u, identyfikatora z rejestracji ani pól własnych", () => {
    const json = JSON.stringify(toAssistantContact(row));
    expect(json).not.toContain("00000000000");
    expect(json).not.toContain("ic-42");
    expect(json).not.toContain("prywatne");
  });

  test("zgody jako wartości logiczne", () => {
    expect(toAssistantContact(row).consents).toEqual({ email: true, sms: false, profiling: false });
  });
});
