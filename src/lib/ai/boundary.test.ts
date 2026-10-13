import { describe, expect, test } from "bun:test";
import { hostClass, isInsidePerimeter, parseAllowlist, resolveMode } from "./boundary";

describe("resolveMode — unset means the safe answer", () => {
  test("no mode, no local endpoint → off", () => {
    expect(resolveMode({})).toBe("off");
  });
  test("no mode, local endpoint set → local", () => {
    expect(resolveMode({ PRM_AI_LOCAL_URL: "http://localhost:11434/v1" })).toBe("local");
  });
  test("hosted only when said explicitly", () => {
    expect(resolveMode({ PRM_AI_MODE: "hosted" })).toBe("hosted");
    expect(resolveMode({ PRM_AI_MODE: " Hosted " })).toBe("hosted");
    expect(resolveMode({ PRM_AI_MODE: "cloud", PRM_AI_LOCAL_URL: "http://127.0.0.1:1" })).toBe(
      "local",
    );
  });
});

describe("hostClass — decided from the name alone", () => {
  test("loopback", () => {
    for (const h of [
      "localhost",
      "LOCALHOST",
      "127.0.0.1",
      "127.3.2.1",
      "::1",
      "[::1]",
      "ollama.localhost",
    ])
      expect(hostClass(h)).toBe("loopback");
  });
  test("private networks", () => {
    for (const h of [
      "10.0.0.5",
      "172.16.4.9",
      "172.31.255.1",
      "192.168.1.20",
      "fd12::1",
      "fe80::1",
      "100.64.0.3",
    ])
      expect(hostClass(h)).toBe("private");
  });
  test("everything else is public unless listed", () => {
    expect(hostClass("api.openai.com")).toBe("public");
    expect(hostClass("172.32.0.1")).toBe("public");
    expect(hostClass("8.8.8.8")).toBe("public");
    expect(hostClass("gpu.clinic.example")).toBe("public");
    expect(hostClass("gpu.clinic.example", ["GPU.clinic.example"])).toBe("allowlisted");
  });
});

describe("isInsidePerimeter", () => {
  test("accepts local and listed http(s) endpoints, refuses the rest", () => {
    expect(isInsidePerimeter("http://localhost:11434/v1")).toBe(true);
    expect(isInsidePerimeter("http://192.168.10.4:8000/v1")).toBe(true);
    expect(isInsidePerimeter("https://api.openai.com/v1")).toBe(false);
    expect(
      isInsidePerimeter("https://llm.clinic.lan/v1", parseAllowlist("llm.clinic.lan, other")),
    ).toBe(true);
    expect(isInsidePerimeter("ftp://localhost/x")).toBe(false);
    expect(isInsidePerimeter("not a url")).toBe(false);
  });
});
