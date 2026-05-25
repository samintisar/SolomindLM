import { describe, expect, test, vi } from "vitest";
import { AcademicLoaderService } from "./AcademicLoaderService";

// Mock env module
vi.mock("../../_lib/env.js", () => ({
  env: {
    MISTRAL_API_KEY: "test-mistral-key",
  },
}));

describe("AcademicLoaderService.loadPaper", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockClear();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("uses PDF OCR when pdfUrl is available and succeeds", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        pages: [{ markdown: "OCR extracted text from PDF" }],
      }),
    } as Response);

    const service = new AcademicLoaderService();
    const result = await service.loadPaper({
      title: "Test Paper",
      authors: ["Author"],
      abstract: "Abstract",
      url: "https://example.com",
      pdfUrl: "https://example.com/paper.pdf",
      source: "arxiv",
    });

    expect(result.content).toContain("OCR extracted text from PDF");
    expect(result.source).toBe("arxiv");
  });

  test("falls back to web scrape when PDF OCR fails", async () => {
    // First call (PDF OCR) fails
    mockFetch.mockRejectedValueOnce(new Error("OCR failed"));

    const mockWebLoader = vi.fn().mockResolvedValue({
      title: "Scraped Title",
      content: "Scraped content from the web page.",
    });

    const service = new AcademicLoaderService(mockWebLoader);
    const result = await service.loadPaper({
      title: "Test Paper",
      authors: ["Author"],
      abstract: "Abstract",
      url: "https://example.com",
      pdfUrl: "https://example.com/paper.pdf",
      source: "semantic_scholar",
    });

    expect(mockWebLoader).toHaveBeenCalledWith("https://example.com");
    expect(result.content).toBe("Scraped content from the web page.");
    expect(result.title).toBe("Scraped Title");
    expect(result.source).toBe("semantic_scholar");
  });

  test("falls back to metadata stub when both PDF and web scrape fail", async () => {
    mockFetch.mockRejectedValueOnce(new Error("OCR failed"));

    const mockWebLoader = vi.fn().mockRejectedValue(new Error("Network error"));

    const service = new AcademicLoaderService(mockWebLoader);
    const result = await service.loadPaper({
      title: "Fallback Paper",
      authors: ["Alice", "Bob"],
      year: 2023,
      abstract: "This is the abstract.",
      url: "https://example.com",
      doi: "10.1234/test",
      source: "pubmed",
      citationCount: 42,
    });

    expect(result.content).toContain("# Fallback Paper");
    expect(result.content).toContain("Alice, Bob");
    expect(result.content).toContain("2023");
    expect(result.content).toContain("10.1234/test");
    expect(result.content).toContain("42");
    expect(result.content).toContain("This is the abstract.");
    expect(result.source).toBe("pubmed");
  });

  test("uses web scrape when no pdfUrl is provided", async () => {
    const mockWebLoader = vi.fn().mockResolvedValue({
      title: "Web Title",
      content: "Content from web scraping.",
    });

    const service = new AcademicLoaderService(mockWebLoader);
    const result = await service.loadPaper({
      title: "Test Paper",
      authors: ["Author"],
      abstract: "Abstract",
      url: "https://example.com/article",
      source: "arxiv",
    });

    expect(mockWebLoader).toHaveBeenCalledWith("https://example.com/article");
    expect(result.content).toBe("Content from web scraping.");
    expect(result.title).toBe("Web Title");
  });

  test("metadata stub handles missing optional fields gracefully", async () => {
    const mockWebLoader = vi.fn().mockRejectedValue(new Error("Network error"));

    const service = new AcademicLoaderService(mockWebLoader);
    const result = await service.loadPaper({
      title: "Minimal Paper",
      authors: [],
      abstract: "",
      url: "",
      source: "semantic_scholar",
    });

    expect(result.content).toContain("# Minimal Paper");
    expect(result.content).not.toContain("**Authors:**");
    expect(result.content).not.toContain("**Year:**");
    expect(result.content).not.toContain("**DOI:**");
    expect(result.content).not.toContain("**Citations:**");
    expect(result.content).toContain("## Abstract");
  });

  test("uses original title when web scrape returns no title", async () => {
    const mockWebLoader = vi.fn().mockResolvedValue({
      title: "",
      content: "Content without title.",
    });

    const service = new AcademicLoaderService(mockWebLoader);
    const result = await service.loadPaper({
      title: "Original Title",
      authors: ["Author"],
      abstract: "Abstract",
      url: "https://example.com",
      source: "arxiv",
    });

    expect(result.title).toBe("Original Title");
    expect(result.content).toBe("Content without title.");
  });
});
