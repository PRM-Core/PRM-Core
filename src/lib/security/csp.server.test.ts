/**
 * The Content-Security-Policy: the policy on paper, and the per-request
 * nonce — the router sees the same nonce the header carries, only HTML gets
 * the header, and development and PRM_CSP behave as documented.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { cspHeaderName, cspMode, cspPolicy } from "./csp";
import { withCsp } from "./csp.server";

const previous = { csp: process.env.PRM_CSP, env: process.env.NODE_ENV };
afterAll(() => {
  if (previous.csp === undefined) delete process.env.PRM_CSP;
  else process.env.PRM_CSP = previous.csp;
  process.env.NODE_ENV = previous.env;
});

describe("the policy", () => {
  test("scripts only from the app or with the nonce; no inline handlers, no plugins, no framing", () => {
    const p = cspPolicy("abc");
    expect(p).toContain("script-src 'self' 'nonce-abc'");
    expect(p).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(p).toContain("object-src 'none'");
    expect(p).toContain("frame-ancestors 'none'");
    expect(p).toContain("base-uri 'self'");
  });

  test("enforced in production, off in development, and PRM_CSP decides when set", () => {
    expect(cspMode(undefined, true)).toBe("enforce");
    expect(cspMode(undefined, false)).toBe("off");
    expect(cspMode("report", true)).toBe("report");
    expect(cspMode("OFF", true)).toBe("off");
    expect(cspMode("nonsense", true)).toBe("enforce");
    expect(cspHeaderName("report")).toBe("Content-Security-Policy-Report-Only");
  });
});

describe("the nonce per request", () => {
  test("the router sees the nonce the header carries; each request gets a new one", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.PRM_CSP;
    const seen: (string | undefined)[] = [];
    const page = () => {
      seen.push(globalThis.__prmCspNonce?.());
      return Promise.resolve(
        new Response("<html></html>", { headers: { "content-type": "text/html; charset=utf-8" } }),
      );
    };
    const a = await withCsp(page);
    const b = await withCsp(page);
    const header = a.headers.get("content-security-policy") ?? "";
    expect(header).toContain(`'nonce-${seen[0]}'`);
    expect(seen[0]).toBeTruthy();
    expect(seen[0]).not.toBe(seen[1]);
    expect(b.headers.get("content-security-policy")).toContain(`'nonce-${seen[1]}'`);
    // Outside a request there is no nonce.
    expect(globalThis.__prmCspNonce?.()).toBeUndefined();
  });

  test("only HTML gets the header", async () => {
    process.env.NODE_ENV = "production";
    const json = await withCsp(() => Promise.resolve(Response.json({ ok: true })));
    expect(json.headers.get("content-security-policy")).toBeNull();
  });

  test("PRM_CSP=report sends report-only; development sends none", async () => {
    const html = () =>
      Promise.resolve(new Response("<html></html>", { headers: { "content-type": "text/html" } }));
    process.env.NODE_ENV = "production";
    process.env.PRM_CSP = "report";
    const r = await withCsp(html);
    expect(r.headers.get("content-security-policy-report-only")).toContain("nonce-");
    expect(r.headers.get("content-security-policy")).toBeNull();
    delete process.env.PRM_CSP;
    process.env.NODE_ENV = "development";
    const d = await withCsp(html);
    expect(d.headers.get("content-security-policy")).toBeNull();
  });
});
