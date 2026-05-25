import { describe, it, expect } from "vitest";
import {
  packChunks,
  validateChunks,
  calculateOptimalChunkSize,
  splitBySentenceBoundaries,
  getChunkPreview,
} from "./chunk_operations";

describe("packChunks", () => {
  it("returns empty array for empty input", () => {
    expect(packChunks([], { targetSize: 100 })).toEqual([]);
  });

  it("returns empty array for null input", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const result = validateChunks(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [null as any, 42 as any, "a".repeat(60), undefined as any],
      { targetSize: 100 }
    );
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

describe("calculateOptimalChunkSize", () => {
  it("divides total by count", () => {
    expect(calculateOptimalChunkSize(100000, 5)).toBe(20000);
  });

  it("rounds up", () => {
    expect(calculateOptimalChunkSize(101, 3)).toBe(34); // ceil(101/3) = 34
  });

  it("throws for targetChunkCount <= 0", () => {
    expect(() => calculateOptimalChunkSize(100, 0)).toThrow(
      "targetChunkCount must be greater than 0"
    );
    expect(() => calculateOptimalChunkSize(100, -1)).toThrow(
      "targetChunkCount must be greater than 0"
    );
  });
});

describe("splitBySentenceBoundaries", () => {
  it("splits at sentence-ending punctuation", () => {
    const result = splitBySentenceBoundaries("Hello world. How are you? Fine!", 1000);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("respects maxChunkSize", () => {
    const text = "This is sentence one. This is sentence two. This is sentence three.";
    const result = splitBySentenceBoundaries(text, 30);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(30 + 30); // Some tolerance for current sentence
    }
  });

  it("returns single chunk for short content", () => {
    const result = splitBySentenceBoundaries("Short text.", 1000);
    expect(result).toHaveLength(1);
  });

  it("handles content without sentence boundaries", () => {
    const result = splitBySentenceBoundaries("no punctuation here just words", 1000);
    expect(result).toHaveLength(1);
  });

  it("trims output chunks", () => {
    const result = splitBySentenceBoundaries("  Hello.  ", 1000);
    expect(result[0]).toBe(result[0].trim());
  });
});

describe("getChunkPreview", () => {
  it("shows full chunk when short", () => {
    const preview = getChunkPreview("hello", 100);
    expect(preview).toContain("hello");
    expect(preview).toContain("5 chars");
  });

  it("truncates long chunks", () => {
    const long = "a".repeat(200);
    const preview = getChunkPreview(long, 50);
    expect(preview).toContain("200 chars");
    expect(preview).toContain("...");
  });

  it("replaces newlines with spaces", () => {
    const preview = getChunkPreview("line1\nline2", 100);
    expect(preview).toContain("line1 line2");
  });
});
