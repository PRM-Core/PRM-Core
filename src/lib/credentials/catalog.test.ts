import { describe, expect, test } from "bun:test";
import {
  CREDENTIAL_NAMES,
  INTEGRATIONS,
  credentialHint,
  credentialProblem,
  integrationState,
  type CredentialStatus,
} from "./catalog";
// Registers the test booking system in the credentials catalog.
import "../booking-system/test-system";

describe("katalog", () => {
  test("każda nazwa należy do dokładnie jednej integracji", () => {
    const zPol = INTEGRATIONS.flatMap((i) => i.fields.map((f) => f.name)).sort();
    expect(zPol).toEqual([...CREDENTIAL_NAMES].sort());
    for (const i of INTEGRATIONS) {
      for (const r of i.required) expect(i.fields.some((f) => f.name === r)).toBe(true);
    }
  });

  test("klucz główny i ustawienia startowe nie są w panelu", () => {
    for (const n of ["PRM_SECRETS_KEY", "DATABASE_URL", "APP_BASE_URL", "PRM_2FA_DISABLED"]) {
      expect((CREDENTIAL_NAMES as readonly string[]).includes(n)).toBe(false);
    }
  });
});

describe("sprawdzenie formatu", () => {
  test("Docplanner: sama domena serwisu, bez adresu i ścieżki", () => {
    expect(credentialProblem("DOCPLANNER_DOMAIN", "www.doctoralia.es")).toBeNull();
    expect(credentialProblem("DOCPLANNER_DOMAIN", "https://www.znanylekarz.pl")).toMatch(
      /samą domenę/,
    );
    expect(credentialProblem("DOCPLANNER_DOMAIN", "www.znanylekarz.pl/api")).toMatch(/samą domenę/);
  });

  test("Twilio: SID klucza zamiast SID konta", () => {
    expect(credentialProblem("TWILIO_ACCOUNT_SID", `SK${"a".repeat(32)}`)).toMatch(/SID klucza/);
    expect(credentialProblem("TWILIO_ACCOUNT_SID", `AC${"0f".repeat(16)}`)).toBeNull();
  });

  test("spacja z kopiowania — błąd dla klucza, dozwolona w haśle", () => {
    expect(credentialProblem("SENDGRID_API_KEY", "SG.abc ")).toMatch(/spacja/);
    expect(credentialProblem("TESTSYS_PASSWORD", " hasło z spacją ")).toBeNull();
  });

  test("pusta wartość, nowa linia, przełącznik, adres", () => {
    expect(credentialProblem("OPENAI_API_KEY", "")).toMatch(/Usuń/);
    expect(credentialProblem("OPENAI_API_KEY", "sk-a\nb")).toMatch(/nowej linii/);
    expect(credentialProblem("TESTSYS_INSECURE", "tak")).not.toBeNull();
    expect(credentialProblem("TESTSYS_INSECURE", "0")).toBeNull();
    expect(credentialProblem("TESTSYS_URL", "ftp://x")).not.toBeNull();
    expect(credentialProblem("TESTSYS_URL", "https://testsys.example/api")).toBeNull();
    expect(credentialProblem("META_APP_ID", "12a")).not.toBeNull();
    expect(credentialProblem("PRM_MCP_TOKEN", "krótki")).not.toBeNull();
  });
});

describe("podpowiedź w panelu", () => {
  test("sekret: 4 ostatnie znaki, a przy krótkim nic", () => {
    expect(credentialHint("SENDGRID_API_KEY", "SG.test.abcdefgh.1234")).toBe("1234");
    expect(credentialHint("TESTSYS_PASSWORD", "krótkie")).toBe("");
  });
  test("pole jawne: całość", () => {
    expect(credentialHint("TESTSYS_URL", "https://testsys.example")).toBe(
      "https://testsys.example",
    );
  });
});

describe("stan integracji", () => {
  const st = (
    name: CredentialStatus["name"],
    source: CredentialStatus["source"],
    problem: CredentialStatus["problem"] = null,
  ): CredentialStatus => ({
    name,
    source,
    problem,
    hint: "",
    updatedAt: null,
    updatedBy: "",
  });
  const twilio = INTEGRATIONS.find((i) => i.id === "twilio")!;
  const ic = INTEGRATIONS.find((i) => i.id === "testsys")!;

  test("gotowe, częściowe, brak, problem", () => {
    expect(
      integrationState(twilio, [st("TWILIO_ACCOUNT_SID", "panel"), st("TWILIO_AUTH_TOKEN", "env")]),
    ).toBe("ready");
    expect(
      integrationState(twilio, [
        st("TWILIO_ACCOUNT_SID", "panel"),
        st("TWILIO_AUTH_TOKEN", "none"),
      ]),
    ).toBe("partial");
    expect(
      integrationState(twilio, [st("TWILIO_ACCOUNT_SID", "none"), st("TWILIO_AUTH_TOKEN", "none")]),
    ).toBe("missing");
    expect(
      integrationState(twilio, [
        st("TWILIO_ACCOUNT_SID", "env", "key-mismatch"),
        st("TWILIO_AUTH_TOKEN", "env"),
      ]),
    ).toBe("problem");
  });

  test("pole opcjonalne nie psuje stanu „gotowe”", () => {
    expect(
      integrationState(ic, [
        st("TESTSYS_URL", "env"),
        st("TESTSYS_USER", "env"),
        st("TESTSYS_PASSWORD", "panel"),
        st("TESTSYS_INSECURE", "none"),
      ]),
    ).toBe("ready");
  });
});
