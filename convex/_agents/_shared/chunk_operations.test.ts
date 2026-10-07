import { describe, expect, it } from "vitest";
import { packChunks, validateChunks } from "./chunk_operations";

describe("packChunks", () => {
  it("returns empty array for empty input", () => {
    expect(packChunks([], { targetSize: 100 })).toEqual([]);
  });

  it("returns empty array for null input", () => {
    expect(packChunks(null as any, { targetSize: 100 })).toEqual([]);
  });

  it("returns single chunk when all fit within target", () => {
    // "hello" = 2 tokens each, separator "\n\n" = 1 token
    // 3 chunks: 2 + (1+2) + (1+2) = 8 tokens total
    const result = packChunks(["hello", "world", "test"], { targetSize: 20 });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("hello\n\nworld\n\ntest");
  });

  it("splits into multiple chunks when exceeding target", () => {
    // Each chunk: ~25 tokens (100 chars / 4)
    // With targetSize=30, first chunk fills up, second starts
    const chunks = ["a".repeat(100), "b".repeat(100), "c".repeat(100)];
    const result = packChunks(chunks, { targetSize: 30 });
    expect(result.length).toBeGreaterThan(1);
  });

  it("skips empty or whitespace-only chunks", () => {
    const result = packChunks(["hello", "", "   ", "world"], { targetSize: 1000 });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("hello\n\nworld");
  });

  it("uses custom separator", () => {
    const result = packChunks(["a", "b"], { targetSize: 1000, separator: " | " });
    expect(result[0]).toBe("a | b");
  });
});

describe("validateChunks", () => {
  it("returns empty array for empty input", () => {
    expect(validateChunks([], { targetSize: 100 })).toEqual([]);
  });

  it("filters out non-string entries", () => {
    const result = validateChunks([null as any, 42 as any, "a".repeat(60), undefined as any], {
      targetSize: 100,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("a".repeat(60));
  });

  it("filters out chunks shorter than minChunkLength", () => {
    const result = validateChunks(
      ["short", "this is a longer chunk that meets the minimum length requirement"],
      { targetSize: 100, minChunkLength: 50 }
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("longer chunk");
  });

  it("truncates chunks exceeding maxChunkLength", () => {
    const long = "a".repeat(1000);
    const result = validateChunks([long], { targetSize: 100, maxChunkLength: 100 });
    expect(result[0]).toHaveLength(100);
  });

  it("trims whitespace before checking minChunkLength", () => {
    const result = validateChunks(["   " + "a".repeat(50) + "   "], {
      targetSize: 100,
      minChunkLength: 50,
    });
    expect(result).toHaveLength(1);
  });

  it("uses default minChunkLength of 50", () => {
    expect(validateChunks(["a".repeat(49)], { targetSize: 100 })).toHaveLength(0);
    expect(validateChunks(["a".repeat(50)], { targetSize: 100 })).toHaveLength(1);
  });
});
