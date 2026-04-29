import { describe, it, expect } from "vitest";
import {
  inferSourceBadgeLabel,
  deriveWebOpenUrl,
  navigableUrlFromStoredSource,
  normalizeSourceTitleKey,
  aggregateRetrievalSources,
} from "./aggregateRetrievalSources";
import type { ReferenceChunk } from "@/shared/types/index";

describe("inferSourceBadgeLabel", () => {
  it("returns TEXT for empty string", () => {
    expect(inferSourceBadgeLabel("")).toBe("TEXT");
  });

  it("returns WEB for http/https URLs", () => {
    expect(inferSourceBadgeLabel("https://example.com")).toBe("WEB");
    expect(inferSourceBadgeLabel("http://example.com")).toBe("WEB");
  });

  it("returns WEB for YouTube URLs", () => {
    expect(inferSourceBadgeLabel("youtube.com/watch?v=123")).toBe("WEB");
    expect(inferSourceBadgeLabel("youtu.be/abc")).toBe("WEB");
  });

  it("returns WEB for TikTok and Instagram", () => {
    expect(inferSourceBadgeLabel("tiktok.com/@user")).toBe("WEB");
    expect(inferSourceBadgeLabel("instagram.com/p/123")).toBe("WEB");
  });

  it("returns extension-based badge for files", () => {
    expect(inferSourceBadgeLabel("report.pdf")).toBe("PDF");
    expect(inferSourceBadgeLabel("doc.docx")).toBe("DOCX");
    expect(inferSourceBadgeLabel("slides.pptx")).toBe("PPTX");
    expect(inferSourceBadgeLabel("data.xlsx")).toBe("XLSX");
    expect(inferSourceBadgeLabel("data.csv")).toBe("CSV");
    expect(inferSourceBadgeLabel("file.json")).toBe("JSON");
    expect(inferSourceBadgeLabel("notes.md")).toBe("MD");
    expect(inferSourceBadgeLabel("notes.txt")).toBe("TXT");
  });

  it("returns WEB for known TLDs", () => {
    expect(inferSourceBadgeLabel("example.com")).toBe("WEB");
    expect(inferSourceBadgeLabel("example.io")).toBe("WEB");
    expect(inferSourceBadgeLabel("example.dev")).toBe("WEB");
  });

  it("returns TEXT for plain titles", () => {
    expect(inferSourceBadgeLabel("My Research Notes")).toBe("TEXT");
    expect(inferSourceBadgeLabel("Chapter 1")).toBe("TEXT");
  });

  it("returns short unknown extensions", () => {
    expect(inferSourceBadgeLabel("archive.rar")).toBe("RAR");
  });

  it("returns TEXT for very long extensions", () => {
    expect(inferSourceBadgeLabel("file.superlongext")).toBe("TEXT");
  });
});

describe("deriveWebOpenUrl", () => {
  it("returns null for empty string", () => {
    expect(deriveWebOpenUrl("")).toBeNull();
  });

  it("returns null for strings with spaces", () => {
    expect(deriveWebOpenUrl("not a url")).toBeNull();
  });

  it("returns URL for valid https URL", () => {
    expect(deriveWebOpenUrl("https://example.com")).toBe("https://example.com/");
  });

  it("returns URL for valid http URL", () => {
    expect(deriveWebOpenUrl("http://example.com/path")).toBe("http://example.com/path");
  });

  it("adds https:// scheme for bare domain", () => {
    expect(deriveWebOpenUrl("example.com")).toBe("https://example.com/");
  });

  it("returns null for non-http protocols", () => {
    expect(deriveWebOpenUrl("ftp://example.com")).toBeNull();
  });

  it("returns null for hostname with ..", () => {
    expect(deriveWebOpenUrl("https://example..com")).toBeNull();
  });

  it("returns null for bare domain that looks like a file extension", () => {
    // "example.html" would be treated as a file, not a domain
    expect(deriveWebOpenUrl("example.html")).toBeNull();
  });

  it("returns null for invalid hostname format", () => {
    expect(deriveWebOpenUrl("localhost")).toBeNull();
    expect(deriveWebOpenUrl("192.168.1.1")).toBeNull();
  });

  it("handles www prefix", () => {
    expect(deriveWebOpenUrl("www.example.com")).toBe("https://www.example.com/");
  });
});

describe("navigableUrlFromStoredSource", () => {
  it("returns null for null/undefined", () => {
    expect(navigableUrlFromStoredSource(null)).toBeNull();
    expect(navigableUrlFromStoredSource(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(navigableUrlFromStoredSource("")).toBeNull();
  });

  it("delegates to deriveWebOpenUrl", () => {
    expect(navigableUrlFromStoredSource("https://example.com")).toBe("https://example.com/");
  });
});

describe("normalizeSourceTitleKey", () => {
  it("returns _empty for empty string", () => {
    expect(normalizeSourceTitleKey("")).toBe("_empty");
  });

  it("strips protocol", () => {
    expect(normalizeSourceTitleKey("https://example.com/path")).toBe("example.com");
  });

  it("strips www prefix", () => {
    expect(normalizeSourceTitleKey("www.example.com/page")).toBe("example.com");
  });

  it("strips query and hash", () => {
    expect(normalizeSourceTitleKey("example.com/page?q=1#top")).toBe("example.com");
  });

  it("lowercases", () => {
    expect(normalizeSourceTitleKey("Example.COM")).toBe("example.com");
  });
});

describe("aggregateRetrievalSources", () => {
  it("returns empty array for null", () => {
    expect(aggregateRetrievalSources(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(aggregateRetrievalSources(undefined)).toEqual([]);
  });

  it("returns empty array for empty array", () => {
    expect(aggregateRetrievalSources([])).toEqual([]);
  });

  function makeRef(overrides: Partial<ReferenceChunk> & { documentId: string }): ReferenceChunk {
    return {
      id: 1,
      sourceId: overrides.documentId,
      chunkIndex: 0,
      content: "chunk text",
      sourceTitle: "Document",
      ...overrides,
    } as ReferenceChunk;
  }

  it("groups by documentId", () => {
    const refs = [
      makeRef({ documentId: "doc1", sourceTitle: "Paper A" }),
      makeRef({ documentId: "doc1", sourceTitle: "Paper A" }),
      makeRef({ documentId: "doc2", sourceTitle: "Paper B" }),
    ];
    const result = aggregateRetrievalSources(refs);
    expect(result).toHaveLength(2);
    const doc1 = result.find((r) => r.sourceId === "doc:doc1");
    expect(doc1?.sectionCount).toBe(2);
    expect(doc1?.isFullDocument).toBe(false);
    const doc2 = result.find((r) => r.sourceId === "doc:doc2");
    expect(doc2?.sectionCount).toBe(1);
    expect(doc2?.isFullDocument).toBe(false);
  });

  it("sorts by sectionCount descending then title ascending", () => {
    const refs = [
      makeRef({ documentId: "b", sourceTitle: "B Paper" }),
      makeRef({ documentId: "a", sourceTitle: "A Paper" }),
      makeRef({ documentId: "a", sourceTitle: "A Paper" }),
    ];
    const result = aggregateRetrievalSources(refs);
    expect(result[0].sourceId).toBe("doc:a"); // 2 sections
    expect(result[0].sectionCount).toBe(2);
    expect(result[1].sourceId).toBe("doc:b"); // 1 section
  });

  it("uses title fallback when documentId missing", () => {
    const refs = [
      { text: "t1", score: 0.9, sourceTitle: "My Source", documentId: "" } as unknown as ReferenceChunk,
      { text: "t2", score: 0.8, sourceTitle: "My Source", documentId: "" } as unknown as ReferenceChunk,
    ];
    const result = aggregateRetrievalSources(refs);
    expect(result).toHaveLength(1);
    expect(result[0].sectionCount).toBe(2);
  });

  it("infers badge from title", () => {
    const refs = [makeRef({ documentId: "d1", sourceTitle: "report.pdf" })];
    const result = aggregateRetrievalSources(refs);
    expect(result[0].badgeLabel).toBe("PDF");
  });

  it("defaults to 'Document' for empty title", () => {
    const refs = [makeRef({ documentId: "d1", sourceTitle: "" })];
    const result = aggregateRetrievalSources(refs);
    expect(result[0].title).toBe("Document");
  });

  it("uses sourceUrl for openUrl", () => {
    const refs = [
      makeRef({ documentId: "d1", sourceTitle: "Article", sourceUrl: "https://example.com/article" }),
    ];
    const result = aggregateRetrievalSources(refs);
    expect(result[0].openUrl).toBe("https://example.com/article");
  });

  it("marks full-document expansion (chunkIndex -1) for activity panel labeling", () => {
    const refs = [
      makeRef({
        documentId: "d1",
        sourceTitle: "Paper",
        chunkIndex: -1,
        id: 99,
      }),
    ];
    const result = aggregateRetrievalSources(refs);
    expect(result).toHaveLength(1);
    expect(result[0].sectionCount).toBe(1);
    expect(result[0].isFullDocument).toBe(true);
  });
});
