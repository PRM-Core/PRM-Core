import type { ContactRow, ContactStatus } from "./db/schema";

export type Contact = ContactRow;
export type { ContactStatus };

/**
 * Seeded once into the database on first read, then fully user-managed — see contacts.functions.ts.
 *
 * **Dane są celowo niemożliwe.** Repozytorium jest publiczne, więc nic tu nie
 * może trafić na prawdziwą osobę, nawet przez przypadek:
 * - PESEL-e mają kształt numeru, ale **błędną sumę kontrolną** — numer z poprawną
 *   sumą i realną datą mógłby należeć do kogoś żywego, a stoi obok nazwiska
 *   i segmentu „Kardiologia". Skutek uboczny: demo nie pokazuje wieku z PESEL-u.
 * - Telefony zaczynają się od `000` — takich numerów nie ma w polskim planie
 *   numeracji, więc testowy SMS wysłany z instalacji demo nie trafi do obcego.
 * - E-maile w domenie `example.com`, zarezerwowanej do przykładów (RFC 2606).
 */
export const seedContacts: Contact[] = [
  {
    id: "1",
    prmId: "PRM-00231",
    firstName: "Anna",
    lastName: "Kowalska",
    email: "anna.kowalska@example.com",
    phone: "+48 000 000 001",
    pesel: "85010112346",
    segments: ["VIP", "Kardiologia"],
    tags: ["aktywny", "newsletter"],
    source: "Google",
    medium: "cpc",
    campaign: "kardio-q1-2026",
    createdAt: "2026-04-12",
    status: "patient",
    // Seed contacts stand in for a base that already existed, so they carry
    // the same consents the 0024 migration granted to real rows.
    consentEmail: 1,
    consentSms: 1,
    consentProfiling: 0,
    consentSource: "migracja",
    consentUpdatedAt: null,
    customFields: {},
    // Kontakty z zasiewu to pełne kartoteki, nie kontakty telefoniczne.
    phoneOnly: 0,
    externalPatientId: null,
    externalSyncedAt: null,
  },
  {
    id: "2",
    prmId: "PRM-00232",
    firstName: "Piotr",
    lastName: "Nowak",
    email: "p.nowak@example.com",
    phone: "+48 000 000 002",
    pesel: "78110567890",
    segments: ["Lead"],
    tags: ["nowy"],
    source: "Meta",
    medium: "social",
    campaign: "spring-leads",
    createdAt: "2026-05-02",
    status: "lead",
    // Seed contacts stand in for a base that already existed, so they carry
    // the same consents the 0024 migration granted to real rows.
    consentEmail: 1,
    consentSms: 1,
    consentProfiling: 0,
    consentSource: "migracja",
    consentUpdatedAt: null,
    customFields: {},
    // Kontakty z zasiewu to pełne kartoteki, nie kontakty telefoniczne.
    phoneOnly: 0,
    externalPatientId: null,
    externalSyncedAt: null,
  },
  {
    id: "3",
    prmId: "PRM-00233",
    firstName: "Magdalena",
    lastName: "Wiśniewska",
    email: "m.wisniewska@example.com",
    phone: "+48 000 000 003",
    pesel: "90050398713",
    segments: ["Dermatologia", "Powracający"],
    tags: ["sms-opt-in"],
    source: "Direct",
    medium: "referral",
    campaign: "—",
    createdAt: "2026-03-22",
    status: "active",
    // Seed contacts stand in for a base that already existed, so they carry
    // the same consents the 0024 migration granted to real rows.
    consentEmail: 1,
    consentSms: 1,
    consentProfiling: 0,
    consentSource: "migracja",
    consentUpdatedAt: null,
    customFields: {},
    // Kontakty z zasiewu to pełne kartoteki, nie kontakty telefoniczne.
    phoneOnly: 0,
    externalPatientId: null,
    externalSyncedAt: null,
  },
  {
    id: "4",
    prmId: "PRM-00234",
    firstName: "Krzysztof",
    lastName: "Zieliński",
    email: "k.zielinski@example.com",
    phone: "+48 000 000 004",
    pesel: "82021245678",
    segments: ["Ortopedia"],
    tags: ["wizyta"],
    source: "Google",
    medium: "organic",
    campaign: "—",
    createdAt: "2026-05-18",
    status: "patient",
    // Seed contacts stand in for a base that already existed, so they carry
    // the same consents the 0024 migration granted to real rows.
    consentEmail: 1,
    consentSms: 1,
    consentProfiling: 0,
    consentSource: "migracja",
    consentUpdatedAt: null,
    customFields: {},
    // Kontakty z zasiewu to pełne kartoteki, nie kontakty telefoniczne.
    phoneOnly: 0,
    externalPatientId: null,
    externalSyncedAt: null,
  },
  {
    id: "5",
    prmId: "PRM-00235",
    firstName: "Joanna",
    lastName: "Lewandowska",
    email: "j.lewandowska@example.com",
    phone: "+48 000 000 005",
    pesel: "95071834456",
    segments: ["Lead"],
    tags: ["lead-cold"],
    source: "Meta",
    medium: "paid_social",
    campaign: "derm-awareness",
    createdAt: "2026-05-20",
    status: "lead",
    // Seed contacts stand in for a base that already existed, so they carry
    // the same consents the 0024 migration granted to real rows.
    consentEmail: 1,
    consentSms: 1,
    consentProfiling: 0,
    consentSource: "migracja",
    consentUpdatedAt: null,
    customFields: {},
    // Kontakty z zasiewu to pełne kartoteki, nie kontakty telefoniczne.
    phoneOnly: 0,
    externalPatientId: null,
    externalSyncedAt: null,
  },
  {
    id: "6",
    prmId: "PRM-00236",
    firstName: "Tomasz",
    lastName: "Wójcik",
    email: "t.wojcik@example.com",
    phone: "+48 000 000 006",
    pesel: "70030712346",
    segments: ["Kardiologia"],
    tags: ["nieaktywny"],
    source: "Email",
    medium: "newsletter",
    campaign: "win-back",
    createdAt: "2025-12-04",
    status: "inactive",
    // Seed contacts stand in for a base that already existed, so they carry
    // the same consents the 0024 migration granted to real rows.
    consentEmail: 1,
    consentSms: 1,
    consentProfiling: 0,
    consentSource: "migracja",
    consentUpdatedAt: null,
    customFields: {},
    // Kontakty z zasiewu to pełne kartoteki, nie kontakty telefoniczne.
    phoneOnly: 0,
    externalPatientId: null,
    externalSyncedAt: null,
  },
  {
    id: "7",
    prmId: "PRM-00237",
    firstName: "Katarzyna",
    lastName: "Dąbrowska",
    email: "k.dabrowska@example.com",
    phone: "+48 000 000 007",
    pesel: "88112098765",
    segments: ["VIP"],
    tags: ["aktywny", "premium"],
    source: "Direct",
    medium: "—",
    campaign: "—",
    createdAt: "2026-01-30",
    status: "patient",
    // Seed contacts stand in for a base that already existed, so they carry
    // the same consents the 0024 migration granted to real rows.
    consentEmail: 1,
    consentSms: 1,
    consentProfiling: 0,
    consentSource: "migracja",
    consentUpdatedAt: null,
    customFields: {},
    // Kontakty z zasiewu to pełne kartoteki, nie kontakty telefoniczne.
    phoneOnly: 0,
    externalPatientId: null,
    externalSyncedAt: null,
  },
  {
    id: "8",
    prmId: "PRM-00238",
    firstName: "Marek",
    lastName: "Kamiński",
    email: "m.kaminski@example.com",
    phone: "+48 000 000 008",
    pesel: "83040634567",
    segments: ["Ortopedia", "Powracający"],
    tags: ["sms-opt-in"],
    source: "Google",
    medium: "cpc",
    campaign: "ortopedia-q2",
    createdAt: "2026-05-22",
    status: "active",
    // Seed contacts stand in for a base that already existed, so they carry
    // the same consents the 0024 migration granted to real rows.
    consentEmail: 1,
    consentSms: 1,
    consentProfiling: 0,
    consentSource: "migracja",
    consentUpdatedAt: null,
    customFields: {},
    // Kontakty z zasiewu to pełne kartoteki, nie kontakty telefoniczne.
    phoneOnly: 0,
    externalPatientId: null,
    externalSyncedAt: null,
  },
];
