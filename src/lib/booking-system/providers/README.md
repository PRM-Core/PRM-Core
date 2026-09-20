# Booking system providers

PRM Core reads the clinic's booking system (practice management system)
through a **provider**: a few files placed in this directory. The product ships
without one. Everything a provider feeds — linking contacts to patient records,
filling contact fields, visit history with states, no-shows, cancellations,
`visit.*` events, doctors' schedule occupancy — lives one level up and works
the same for every system (see `../provider.ts`).

Files here are **loaded automatically** by name. An installation adds its own
provider without editing any product file, so a product update never touches
it and never conflicts with it.

| File | Exports | Purpose |
|---|---|---|
| `<system>.server.ts` | `provider: BookingSystemProvider` | Talks to the system's API. Server only. |
| `<system>.catalog.ts` | `integration: IntegrationDef` (or a function returning one) | Credential fields shown in Integrations → Keys and credentials. |
| `<system>.en.ts` (optional) | `en: Record<string, string>` | English texts for the provider's Polish `t("…")` keys. |

## The contract in short

```ts
import type { BookingSystemProvider } from "../provider";
import { getCredentials } from "../../credentials/store.server";

export const provider: BookingSystemProvider = {
  id: "mysystem",            // prefix of visit keys: "mysystem-<visit id>" — never change it
  name: "My System",         // shown on visits ("source") and in the engine panel
  historyIsComplete: true,   // patientVisits() returns the whole history → a missing visit was cancelled
  async configured() { /* credentials present? */ },
  async getPatient(id) { /* { nationalId, email, phone, city } or null */ },
  async patientVisits(id) { /* ExternalVisit[] with state mapped onto VisitState */ },
  async doctorDayBookings(doctorId, day) { /* [{ patientId, firstName, lastName }] */ },
  async doctorMonthLoad(doctorId, month) { /* { capacity, booked } */ },
  async checkConnection() { /* optional; must not change anything on the other side */ },
};
```

Rules:

- **Map the system's statuses onto `VisitState`** (`booked`, `waiting`,
  `started`, `completed`, `cancelled`, `other`). A no-show is inferred by PRM
  Core from `booked` + two hours, not by the provider.
- **Doctor IDs** are the system's own; they are stored in the doctors table
  (`systemId`) and passed back to `doctorDayBookings` / `doctorMonthLoad`.
- **Credentials** come from the store (panel first, `.env` as fallback) under
  the field names declared in `<system>.catalog.ts`. Never log their values.
- **Read-only.** The provider only reads. Bookings reach PRM Core separately,
  through the booking webhook (`/api/webhooks/booking`).
- Throw `BookingSystemError` with a human-readable message on failures; the
  callers log it and move on to the next contact.

With no provider configured, every part of the mechanism stays idle and the
screens say so.
