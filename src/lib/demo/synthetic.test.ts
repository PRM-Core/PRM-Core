/**
 * The demo's people are synthetic by construction: a fictional surname,
 * an address on a domain that can never receive mail, a number with an
 * unallocated prefix, a PESEL whose check digit is wrong.
 */
import { describe, expect, test } from "bun:test";
import { isValidPesel, peselInfo } from "../pesel";
import {
  DEMO_DOCTORS,
  hashUnit,
  isSyntheticIdentity,
  rng,
  syntheticPerson,
  syntheticPesel,
} from "./synthetic";

describe("synthetic people", () => {
  test("ten thousand people: every identifier synthetic, every contact route unique", () => {
    const r = rng(7);
    const emails = new Set<string>();
    const phones = new Set<string>();
    for (let n = 1; n <= 10_000; n++) {
      const p = syntheticPerson(r, n, true);
      expect(isSyntheticIdentity(p)).toBe(true);
      expect(p.email).toMatch(/^[a-z.]+\.\d{6}@example\.test$/);
      expect(p.phone).toMatch(/^\+48000\d{6}$/);
      expect(p.pesel).toMatch(/^\d{11}$/);
      expect(isValidPesel(p.pesel)).toBe(false);
      expect(peselInfo(p.pesel)).toBeNull();
      emails.add(p.email);
      phones.add(p.phone);
    }
    expect(emails.size).toBe(10_000);
    expect(phones.size).toBe(10_000);
  });

  test("a PESEL is off by exactly the check digit — shaped like one, never valid", () => {
    const r = rng(11);
    for (let i = 0; i < 2000; i++) {
      const pesel = syntheticPesel(r, i % 2 ? "M" : "K");
      const fixed = pesel.slice(0, 10) + String((Number(pesel[10]) + 9) % 10);
      expect(isValidPesel(pesel)).toBe(false);
      expect(isValidPesel(fixed)).toBe(true);
    }
  });

  test("the predicate refuses anything that could be real", () => {
    expect(isSyntheticIdentity({ lastName: "Kowalska" })).toBe(false);
    expect(isSyntheticIdentity({ email: "anna@gmail.com" })).toBe(false);
    expect(isSyntheticIdentity({ phone: "+15555550100" })).toBe(false);
    // A valid one is built here, not written down — a valid PESEL never sits in the repository.
    const bad = syntheticPesel(rng(1), "K");
    const valid = bad.slice(0, 10) + String((Number(bad[10]) + 9) % 10);
    expect(isSyntheticIdentity({ pesel: valid })).toBe(false);
    expect(isSyntheticIdentity({ lastName: "Testowa", email: "a@example.test" })).toBe(true);
  });

  test("the doctors follow the same rule", () => {
    for (const d of DEMO_DOCTORS) {
      const surname = d.split(" ").pop()!;
      expect(isSyntheticIdentity({ lastName: surname })).toBe(true);
    }
  });

  test("the generator and the fate hash are deterministic", () => {
    expect(syntheticPerson(rng(3), 5)).toEqual(syntheticPerson(rng(3), 5));
    expect(hashUnit("visit-1")).toBe(hashUnit("visit-1"));
    expect(hashUnit("visit-1")).not.toBe(hashUnit("visit-2"));
  });
});
