import { describe, expect, it } from "vitest";
import { generateShareToken, hashShareToken, timingSafeEqualHex } from "./shareToken";

describe("generateShareToken", () => {
  it("returns a 64-character hex string", () => {
    const token = generateShareToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different tokens on successive calls", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).not.toBe(b);
  });
});

describe("hashShareToken", () => {
  it("returns a deterministic SHA-256 hex digest", async () => {
    const token = generateShareToken();
    const hash1 = await hashShareToken(token);
    const hash2 = await hashShareToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different tokens", async () => {
    const hashA = await hashShareToken(generateShareToken());
    const hashB = await hashShareToken(generateShareToken());
    expect(hashA).not.toBe(hashB);
  });
});

describe("timingSafeEqualHex", () => {
  it("returns true for identical strings", () => {
    const s = "abcdef0123456789";
    expect(timingSafeEqualHex(s, s)).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(timingSafeEqualHex("abcdef0123456789", "abcdef0123456780")).toBe(false);
  });

  it("returns false for different-length strings", () => {
    expect(timingSafeEqualHex("abc", "ab")).toBe(false);
  });
});
