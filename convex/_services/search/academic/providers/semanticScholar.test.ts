import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchSemanticScholar } from "./semanticScholar";
import { semanticScholarQueue } from "../utils/providerQueue";

describe("searchSemanticScholar", () => {
  const mockFetch = vi.fn();
  const originalSetTimeout = globalThis.setTimeout;

  beforeEach(() => {
    mockFetch.mockClear();
    globalThis.fetch = mockFetch;
    semanticScholarQueue.reset();
    semanticScholarQueue.setDelay(0);
    // Fix Date for consistent score calculation
    vi.useFakeTimers({ now: new Date("2024-01-15") });
    // Speed up retries by resolving setTimeout immediately (must be after useFakeTimers)
    globalThis.setTimeout = vi.fn((cb: () => void) => {
      cb();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.setTimeout = originalSetTimeout;
  });

  function createMockResponse(data: unknown, status = 200, headers?: Record<string, string>) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (name: string) => headers?.[name] ?? null,
      },
      text: async () => JSON.stringify(data),
      json: async () => data,
    };
  }

  function createSemanticScholarResponse(items: unknown[]) {
    return {
      data: items,
    };
  }

  it("returns parsed papers from valid JSON response", async () => {
    const response = createSemanticScholarResponse([
      {
        paperId: "abc123",
        title: "Test Paper",
        authors: [{ name: "John Doe" }, { name: "Jane Smith" }],
        year: 2023,
        abstract: "This is the abstract.",
        openAccessPdf: { url: "https://pdf.url/paper.pdf" },
        citationCount: 42,
        externalIds: { DOI: "10.1234/test" },
        url: "https://semanticscholar.org/paper/abc123",
        fieldsOfStudy: ["Computer Science"],
      },
    ]);

    mockFetch.mockResolvedValueOnce(createMockResponse(response));

    const result = await searchSemanticScholar("test query", 10, {});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: "Test Paper",
      authors: ["John Doe", "Jane Smith"],
      year: 2023,
      abstract: "This is the abstract.",
      url: "https://semanticscholar.org/paper/abc123",
      pdfUrl: "https://pdf.url/paper.pdf",
      source: "semantic_scholar",
      citationCount: 42,
      doi: "10.1234/test",
      fieldsOfStudy: ["Computer Science"],
    });
    expect(result[0].score).toBeGreaterThan(0);
  });

  it("handles empty results", async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse(createSemanticScholarResponse([])));

    const result = await searchSemanticScholar("nonexistent query", 10, {});

    expect(result).toEqual([]);
  });

  it("parses authors, DOI, PDF, fieldsOfStudy correctly", async () => {
    const response = createSemanticScholarResponse([
      {
        paperId: "paper1",
        title: "Neural Networks",
        authors: [{ name: "Alice" }, { name: "Bob" }],
        year: 2022,
        abstract: "Abstract text.",
        openAccessPdf: { url: "https://pdf.example.com/nn.pdf" },
        citationCount: 100,
        externalIds: { DOI: "10.5678/nn" },
        url: "https://semanticscholar.org/paper/paper1",
        fieldsOfStudy: ["Computer Science", "AI"],
      },
    ]);

    mockFetch.mockResolvedValueOnce(createMockResponse(response));

    const result = await searchSemanticScholar("neural networks", 5, {});

    expect(result[0].authors).toEqual(["Alice", "Bob"]);
    expect(result[0].doi).toBe("10.5678/nn");
    expect(result[0].pdfUrl).toBe("https://pdf.example.com/nn.pdf");
    expect(result[0].fieldsOfStudy).toEqual(["Computer Science", "AI"]);
  });

  it("retries on 429 with Retry-After header", async () => {
    const successResponse = createSemanticScholarResponse([
      {
        paperId: "retry429",
        title: "Rate Limit Test",
        authors: [{ name: "Author" }],
        year: 2023,
        abstract: "Abstract.",
      },
    ]);

    mockFetch
      .mockResolvedValueOnce(createMockResponse({}, 429, { "retry-after": "2" }))
      .mockResolvedValueOnce(createMockResponse(successResponse));

    const result = await searchSemanticScholar("test", 5, {});

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Rate Limit Test");
  });

  it("retries on 500 with exponential backoff", async () => {
    const successResponse = createSemanticScholarResponse([
      {
        paperId: "retry500",
        title: "Server Error Test",
        authors: [{ name: "Author" }],
        year: 2023,
        abstract: "Abstract.",
      },
    ]);

    mockFetch
      .mockResolvedValueOnce(createMockResponse({}, 500))
      .mockResolvedValueOnce(createMockResponse({}, 502))
      .mockResolvedValueOnce(createMockResponse(successResponse));

    const result = await searchSemanticScholar("test", 5, {});

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Server Error Test");
  });

  it("fails after max retries", async () => {
    mockFetch.mockResolvedValue(createMockResponse({}, 503));

    await expect(searchSemanticScholar("test", 5, {})).rejects.toThrow(
      "semantic_scholar HTTP 503"
    );

    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it("constructs fallback URL when paperId missing", async () => {
    const response = createSemanticScholarResponse([
      {
        title: "No ID Paper",
        authors: [{ name: "Anonymous" }],
        year: 2021,
        abstract: "No paperId here.",
      },
    ]);

    mockFetch.mockResolvedValueOnce(createMockResponse(response));

    const result = await searchSemanticScholar("test", 5, {});

    expect(result[0].url).toBe("https://www.semanticscholar.org/paper/");
  });
});
