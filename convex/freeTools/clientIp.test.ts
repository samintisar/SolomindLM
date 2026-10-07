// convex/freeTools/clientIp.test.ts
import { describe, expect, test } from "vitest";
import { clientIpFromHeaders, forwardedForHopCount, hashClientIp } from "./clientIp";

describe("clientIpFromHeaders", () => {
  test("takes the last x-forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.9");
  });
  test("a spoofed first entry does not change the result", () => {
    const a = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    const b = new Headers({ "x-forwarded-for": "7.7.7.7, 203.0.113.9" });
    expect(clientIpFromHeaders(a)).toBe(clientIpFromHeaders(b));
  });
  test("falls back to x-real-ip, then null", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": " 198.51.100.4 " }))).toBe(
      "198.51.100.4"
    );
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });
});

describe("forwardedForHopCount", () => {
  test("counts non-empty entries", () => {
    expect(forwardedForHopCount(new Headers({ "x-forwarded-for": "a, b,," }))).toBe(2);
    expect(forwardedForHopCount(new Headers())).toBe(0);
  });
});

describe("hashClientIp", () => {
  test("is a stable 64-char hex digest that does not contain the IP", async () => {
    const a = await hashClientIp("203.0.113.9", "salt");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("203.0.113.9");
    expect(await hashClientIp("203.0.113.9", "salt")).toBe(a);
  });
  test("depends on the salt", async () => {
    expect(await hashClientIp("203.0.113.9", "a")).not.toBe(await hashClientIp("203.0.113.9", "b"));
  });
});
