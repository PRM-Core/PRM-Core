/**
 * TEMPLATE — how to test a provider: no network, `fetch` replaced, keys from
 * the environment. Copy next to your provider and adapt.
 */
import { afterAll, beforeEach, expect, test } from "bun:test";
import { provider, toVisit } from "./example.server";

const realFetch = globalThis.fetch;
const calls: string[] = [];
beforeEach(() => {
  calls.length = 0;
  process.env.EXAMPLE_API_URL = "https://api.example.test/v1/";
  process.env.EXAMPLE_API_TOKEN = "test-token";
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    if (String(url).endsWith("/patients/7/appointments")) {
      return Response.json([
        { id: 1, patient_id: 7, starts_at: "2026-09-16T10:30", status: "completed" },
        { id: 2, patient_id: 7, starts_at: "2026-09-20T08:00", status: "rescheduled" },
      ]);
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

test("statuses are mapped; unknown ones keep the system's label", async () => {
  const visits = await provider.patientVisits(7);
  expect(visits.map((v) => [v.id, v.state, v.statusLabel])).toEqual([
    [1, "completed", undefined],
    [2, "other", "rescheduled"],
  ]);
  expect(calls[0]).toBe("https://api.example.test/v1/patients/7/appointments");
});

test("local date and time are split as PRM Core expects", () => {
  const v = toVisit({ id: 3, patient_id: 7, starts_at: "2026-01-02T09:05", status: "scheduled" });
  expect([v.date, v.time, v.state]).toEqual(["2026-01-02", "09:05", "booked"]);
});

test("an unknown patient is null, not an error", async () => {
  expect(await provider.getPatient(999)).toBeNull();
});
