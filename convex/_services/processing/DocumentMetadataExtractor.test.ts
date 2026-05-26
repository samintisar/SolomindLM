import { describe, it, expect } from "vitest";
import {
  extractDocumentMetadata,
  getFileExtension,
  hasSignificantStructure,
} from "./DocumentMetadataExtractor";

describe("extractDocumentMetadata", () => {
  it("counts words and estimates reading time", () => {
    const text = "one two three four five six seven eight nine ten";
    const meta = extractDocumentMetadata(text);
    expect(meta.wordCount).toBe(10);
    expect(meta.estimatedReadingTimeMinutes).toBe(1);
  });

  it("detects hierarchical structure from headings", () => {
    const text = "# Title\n\n## Section\n\nContent here.";
    const meta = extractDocumentMetadata(text);
    expect(meta.documentStructure).toBe("hierarchical");
    expect(meta.maxHeadingLevel).toBe(2);
  });

  it("marks flat documents without headings", () => {
    const meta = extractDocumentMetadata("Plain paragraph only.");
    expect(meta.documentStructure).toBe("flat");
    expect(meta.maxHeadingLevel).toBe(0);
  });

  it("detects code blocks and math notation", () => {
    const text = "See `inline` and:\n```ts\nconst x = 1;\n```\nAlso $E=mc^2$ and $$\\int x$$";
    const meta = extractDocumentMetadata(text);
    expect(meta.hasCodeBlocks).toBe(true);
    expect(meta.hasMathNotation).toBe(true);
  });

  it("detects markdown tables", () => {
    const text = "| A | B |\n|---|---|\n| 1 | 2 |";
    expect(extractDocumentMetadata(text).hasTables).toBe(true);
  });

  it("uses pageCount when provided", () => {
    const meta = extractDocumentMetadata("text", undefined, 12);
    expect(meta.totalPages).toBe(12);
  });

  it("flags pdf extension as likely containing images", () => {
    const meta = extractDocumentMetadata("no image syntax", ".pdf");
    expect(meta.hasImages).toBe(true);
  });
});

describe("getFileExtension", () => {
  it("returns lowercase extension with dot", () => {
    expect(getFileExtension("report.PDF")).toBe(".pdf");
  });

  it("returns undefined for names without extension", () => {
    expect(getFileExtension("README")).toBeUndefined();
  });
});

describe("hasSignificantStructure", () => {
  it("is true when there are multiple level-2+ headings", () => {
    const text = "## A\n\n## B\n\n## C\n\nBody";
    expect(hasSignificantStructure(text)).toBe(true);
  });

  it("is false for a single top-level heading", () => {
    expect(hasSignificantStructure("# Only one\n\nText")).toBe(false);
  });
});
