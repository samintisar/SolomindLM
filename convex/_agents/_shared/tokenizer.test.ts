import { describe, it, expect } from "vitest";
import { countTokens, countTokensBatch, truncateToTokens, freeEncoder } from "./tokenizer";

describe("countTokens", () => {
  it("returns 0 for empty string", () => {
    expect(countTokens("")).toBe(0);
  });

  it("returns 0 for non-string input", () => {
    expect(countTokens(null as any)).toBe(0);
    expect(countTokens(undefined as any)).toBe(0);
  });

  it("estimates ~4 chars per token", () => {
    expect(countTokens("a")).toBe(1); // 1 char → ceil(1/4) = 1
    expect(countTokens("abcd")).toBe(1); // 4 chars → ceil(4/4) = 1
    expect(countTokens("abcde")).toBe(2); // 5 chars → ceil(5/4) = 2
    expect(countTokens("a".repeat(100))).toBe(25); // 100/4 = 25
  });

  it("handles typical English text", () => {
    const text = "Hello, how are you today?";
    expect(countTokens(text)).toBe(Math.ceil(text.length / 4));
  });
});

describe("countTokensBatch", () => {
  it("returns empty array for empty input", () => {
    expect(countTokensBatch([])).toEqual([]);
  });

  it("returns empty array for null/undefined", () => {
    expect(countTokensBatch(null as any)).toEqual([]);
  });

  it("counts tokens for multiple texts", () => {
    const result = countTokensBatch(["hello", "world", "test"]);
    expect(result).toHaveLength(3);
    expect(result).toEqual([2, 2, 1]);
  });

  it("handles mixed valid and empty strings", () => {
    const result = countTokensBatch(["hello", "", "world"]);
    expect(result).toEqual([2, 0, 2]);
  });

  it("handles non-string entries", () => {
    const result = countTokensBatch(["hello", null as any, 42 as any]);
    expect(result).toEqual([2, 0, 0]);
  });
});

describe("truncateToTokens", () => {
  it("returns empty string for empty input", () => {
    expect(truncateToTokens("", 100)).toBe("");
  });

  it("returns empty string for maxTokens <= 0", () => {
    expect(truncateToTokens("hello", 0)).toBe("");
    expect(truncateToTokens("hello", -1)).toBe("");
  });

  it("returns full text if within token limit", () => {
    // 5 chars = 2 tokens, limit 10 tokens = 40 chars
    expect(truncateToTokens("hello", 10)).toBe("hello");
  });

  it("truncates at word boundary when possible", () => {
    // "hello world test" = 17 chars, limit 3 tokens = 12 chars
    const result = truncateToTokens("hello world test", 3);
    expect(result.length).toBeLessThanOrEqual(17);
    expect(result).not.toContain("test");
  });

  it("truncates mid-word when no good word boundary", () => {
    const longWord = "a".repeat(100);
    const result = truncateToTokens(longWord, 5); // 5 tokens = 20 chars
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it("respects custom charsPerToken", () => {
    // With charsPerToken=2, 10 tokens = 20 chars max
    const text = "a".repeat(30);
    const result = truncateToTokens(text, 10, undefined, 2);
    expect(result.length).toBeLessThanOrEqual(20);
  });
});

describe("freeEncoder", () => {
  it("does not throw", () => {
    expect(() => freeEncoder()).not.toThrow();
  });
});
