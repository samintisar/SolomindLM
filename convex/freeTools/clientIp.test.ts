// convex/freeTools/clientIp.test.ts
import { describe, expect, test } from "vitest";
import {
  clientIpFromHeaders,
  forwardedForHopCount,
  hashClientIp,
  normalizeClientIp,
} from "./clientIp";

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

describe("normalizeClientIp", () => {
  test("leaves IPv4 unchanged and strips a port", () => {
    expect(normalizeClientIp("203.0.113.9")).toBe("203.0.113.9");
    expect(normalizeClientIp("1.2.3.4:5678")).toBe("1.2.3.4");
  });
  test("unwraps IPv4-mapped IPv6", () => {
    expect(normalizeClientIp("::ffff:203.0.113.9")).toBe("203.0.113.9");
  });
  test("reduces IPv6 to its /64", () => {
    expect(normalizeClientIp("2001:db8:abcd:12::1")).toBe(
      normalizeClientIp("2001:db8:abcd:12:ffff::9")
    );
    expect(normalizeClientIp("2001:DB8:0:0::1")).toBe(normalizeClientIp("2001:db8::5"));
    expect(normalizeClientIp("2001:db8:abcd:12::1")).not.toBe(
      normalizeClientIp("2001:db8:abcd:13::1")
    );
    expect(normalizeClientIp("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });
  test("strips brackets and port from IPv6", () => {
    expect(normalizeClientIp("[2001:db8::1]:443")).toBe(normalizeClientIp("2001:db8::1"));
  });
  test("returns unparseable input trimmed", () => {
    expect(normalizeClientIp("  not-an-ip ")).toBe("not-an-ip");
    expect(normalizeClientIp("unknown")).toBe("unknown");
  });
});

describe("hashClientIp", () => {
  test("addresses in the same /64 hash equal; different /64s differ", async () => {
    const a = await hashClientIp("2001:db8:abcd:12::1", "salt");
    expect(await hashClientIp("2001:db8:abcd:12:ffff::9", "salt")).toBe(a);
    expect(await hashClientIp("2001:db8:abcd:13::1", "salt")).not.toBe(a);
  });
  test("an IPv4-mapped address hashes like the plain IPv4", async () => {
    expect(await hashClientIp("::ffff:203.0.113.9", "salt")).toBe(
      await hashClientIp("203.0.113.9", "salt")
    );
  });
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
