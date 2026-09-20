import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  CredentialCryptoError,
  decryptCredential,
  encryptCredential,
  readMasterKey,
  type MasterKey,
} from "./crypto.server";
// Registers the test booking system in the credentials catalog.
import "../booking-system/test-system";

const klucz = (): MasterKey => {
  const r = readMasterKey(randomBytes(32).toString("hex"));
  if (r.state !== "ok") throw new Error("klucz testowy");
  return r.master;
};

describe("klucz główny", () => {
  test("brak, zły format i poprawny", () => {
    expect(readMasterKey("").state).toBe("missing");
    expect(readMasterKey(undefined).state).toBe("missing");
    expect(readMasterKey("abc").state).toBe("invalid");
    expect(readMasterKey("z".repeat(64)).state).toBe("invalid");
    expect(readMasterKey(` ${"a".repeat(64)} `).state).toBe("ok");
  });

  test("identyfikator nie zawiera klucza i jest stały", () => {
    const hex = "ab".repeat(32);
    const a = readMasterKey(hex);
    const b = readMasterKey(hex);
    if (a.state !== "ok" || b.state !== "ok") throw new Error();
    expect(a.master.id).toBe(b.master.id);
    expect(a.master.id).toHaveLength(12);
    expect(hex.includes(a.master.id)).toBe(false);
  });
});

describe("szyfrowanie", () => {
  test("zapis i odczyt, także znaki spoza ASCII", () => {
    const m = klucz();
    const haslo = "zażółć$ab gęślą jaźń";
    const zapis = encryptCredential(haslo, "TESTSYS_PASSWORD", m);
    expect(zapis.includes(haslo)).toBe(false);
    expect(decryptCredential(zapis, "TESTSYS_PASSWORD", m.id, m)).toBe(haslo);
  });

  test("ta sama wartość daje za każdym razem inny zapis", () => {
    const m = klucz();
    expect(encryptCredential("SG.x", "SENDGRID_API_KEY", m)).not.toBe(
      encryptCredential("SG.x", "SENDGRID_API_KEY", m),
    );
  });

  test("wpisu nie da się przenieść do innego pola", () => {
    const m = klucz();
    const zapis = encryptCredential("https://obcy.example", "TESTSYS_URL", m);
    expect(() => decryptCredential(zapis, "META_APP_ID", m.id, m)).toThrow(CredentialCryptoError);
  });

  test("zmieniony zapis jest odrzucany", () => {
    const m = klucz();
    const [v, iv, tag, ct] = encryptCredential("sekret-sekret", "OPENAI_API_KEY", m).split(".");
    const bajty = Buffer.from(ct, "base64url");
    bajty[0] ^= 1;
    const zepsuty = [v, iv, tag, bajty.toString("base64url")].join(".");
    expect(() => decryptCredential(zepsuty, "OPENAI_API_KEY", m.id, m)).toThrow(/uszkodzony/);
  });

  test("inny klucz główny zgłasza się jako key-mismatch, nie jako uszkodzenie", () => {
    const stary = klucz();
    const nowy = klucz();
    const zapis = encryptCredential("x", "GOOGLE_API_KEY", stary);
    try {
      decryptCredential(zapis, "GOOGLE_API_KEY", stary.id, nowy);
      throw new Error("powinno rzucić");
    } catch (err) {
      expect(err).toBeInstanceOf(CredentialCryptoError);
      expect((err as CredentialCryptoError).reason).toBe("key-mismatch");
    }
  });

  test("nieznany format", () => {
    const m = klucz();
    expect(() => decryptCredential("jawny-tekst", "GOOGLE_API_KEY", m.id, m)).toThrow(/format/);
  });
});
