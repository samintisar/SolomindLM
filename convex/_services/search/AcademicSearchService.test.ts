import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock env before importing modules that use it
vi.mock("../../_lib/env", () => ({
  env: {
    SEMANTIC_SCHOLAR_API_KEY: "test-api-key",
    PUBMED_EMAIL: "test@example.com",
  },
}));

// Mock logging to keep test output clean
vi.mock("../../_lib/logging/serviceLogger", () => ({
  createServiceLogger: () => ({
    operationStart: vi.fn(),
    operationComplete: vi.fn(),
    operationError: vi.fn(),
    apiCall: vi.fn(),
    apiError: vi.fn(),
    apiSuccess: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    performance: vi.fn(),
    cacheHit: vi.fn(),
    cacheMiss: vi.fn(),
  }),
}));

// Mock the cache module
vi.mock("../cache/cachedAgent", () => ({
  createCachedAction: vi.fn(() => ({
    fetch: vi.fn(async (_ctx: any, args: any) => {
      // Pass through to searchInternal - we'll test that separately
      const { searchInternal } = await import("./AcademicSearchService");
      return searchInternal.handler(null as any, args);
    }),
  })),
}));

vi.mock("../cache/cache", () => ({
  CACHE_TTL: { search: 3600000 },
  withJitter: (ttl: number) => ttl,
}));

import { searchInternal, discoverAcademicPapersInternal } from "./AcademicSearchService";

describe("AcademicSearchService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("searchInternal", () => {
    it("returns empty array when all APIs fail", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      const result = await searchInternal.handler(null as any, {
        query: "machine learning",
        maxResults: 10,
      });

      expect(result).toEqual([]);
    });

    it("searches arXiv and returns parsed papers", async () => {
      const arxivXml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Test Paper Title</title>
            <summary>This is a test abstract.</summary>
            <published>2023-05-15T00:00:00Z</published>
            <author><name>John Doe</name></author>
            <author><name>Jane Smith</name></author>
            <link href="http://arxiv.org/abs/2305.12345" rel="alternate"/>
            <link href="http://arxiv.org/pdf/2305.12345.pdf" type="application/pdf"/>
          </entry>
        </feed>`;

      fetchMock.mockImplementation((url: string) => {
        if (url.includes("arxiv.org")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(arxivXml),
          });
        }
        // Semantic Scholar and PubMed return errors
        return Promise.reject(new Error("API error"));
      });

      const result = await searchInternal.handler(null as any, {
        query: "machine learning",
        maxResults: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Test Paper Title");
      expect(result[0].authors).toEqual(["John Doe", "Jane Smith"]);
      expect(result[0].year).toBe(2023);
      expect(result[0].abstract).toBe("This is a test abstract.");
      expect(result[0].source).toBe("arxiv");
      expect(result[0].pdfUrl).toBe("http://arxiv.org/pdf/2305.12345.pdf");
      expect(result[0].score).toBeGreaterThan(0);
    });

    it("searches Semantic Scholar and returns parsed papers", async () => {
      const semanticResponse = {
        data: [
          {
            paperId: "abc123",
            title: "Deep Learning Advances",
            authors: [{ name: "Alice Johnson" }, { name: "Bob Wilson" }],
            year: 2024,
            abstract: "Recent advances in deep learning...",
            openAccessPdf: { url: "https://pdf.example.com/paper.pdf" },
            citationCount: 150,
            externalIds: { DOI: "10.1234/example" },
            url: "https://semanticscholar.org/paper/abc123",
          },
        ],
      };

      fetchMock.mockImplementation((url: string) => {
        if (url.includes("semanticscholar.org")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(semanticResponse),
          });
        }
        return Promise.reject(new Error("API error"));
      });

      const result = await searchInternal.handler(null as any, {
        query: "deep learning",
        maxResults: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Deep Learning Advances");
      expect(result[0].authors).toEqual(["Alice Johnson", "Bob Wilson"]);
      expect(result[0].year).toBe(2024);
      expect(result[0].citationCount).toBe(150);
      expect(result[0].doi).toBe("10.1234/example");
      expect(result[0].source).toBe("semantic_scholar");
      expect(result[0].pdfUrl).toBe("https://pdf.example.com/paper.pdf");
    });

    it("searches PubMed and returns parsed papers", async () => {
      // First call: esearch
      const esearchResponse = {
        esearchresult: {
          idlist: ["12345", "67890"],
        },
      };

      // Second call: efetch
      const efetchXml = `<?xml version="1.0"?>
        <pmcarticles>
          <article>
            <front>
              <article-meta>
                <title-group><article-title>PubMed Test Article</article-title></title-group>
                <abstract><p>This is the abstract.</p></abstract>
                <contrib-group>
                  <contrib contrib-type="author">
                    <name><surname>Smith</surname><given-names>John</given-names></name>
                  </contrib>
                </contrib-group>
                <pub-date><year>2022</year></pub-date>
                <article-id pub-id-type="doi">10.5678/pubmed</article-id>
                <article-id pub-id-type="pmc">12345</article-id>
              </article-meta>
            </front>
          </article>
        </pmcarticles>`;

      let callCount = 0;
      fetchMock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // esearch
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(esearchResponse),
          });
        }
        if (callCount === 2) {
          // efetch
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(efetchXml),
          });
        }
        return Promise.reject(new Error("API error"));
      });

      const result = await searchInternal.handler(null as any, {
        query: "cancer treatment",
        maxResults: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("PubMed Test Article");
      expect(result[0].authors).toEqual(["John Smith"]);
      expect(result[0].year).toBe(2022);
      expect(result[0].doi).toBe("10.5678/pubmed");
      expect(result[0].source).toBe("pubmed");
      expect(result[0].url).toBe("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12345/");
      expect(result[0].pdfUrl).toBe("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12345/pdf/");
    });

    it("deduplicates papers by DOI", async () => {
      const arxivXml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Paper One</title>
            <summary>Abstract one.</summary>
            <published>2023-01-01T00:00:00Z</published>
            <author><name>Author A</name></author>
            <link href="http://arxiv.org/abs/2301.00001" rel="alternate"/>
            <doi>10.1234/same</doi>
          </entry>
        </feed>`;

      const semanticResponse = {
        data: [
          {
            paperId: "xyz789",
            title: "Paper One Duplicate",
            authors: [{ name: "Author B" }],
            year: 2023,
            abstract: "Abstract two.",
            citationCount: 50,
            externalIds: { DOI: "10.1234/same" },
            url: "https://semanticscholar.org/paper/xyz789",
          },
        ],
      };

      fetchMock.mockImplementation((url: string) => {
        if (url.includes("arxiv.org")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(arxivXml),
          });
        }
        if (url.includes("semanticscholar.org")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(semanticResponse),
          });
        }
        return Promise.reject(new Error("API error"));
      });

      const result = await searchInternal.handler(null as any, {
        query: "test",
        maxResults: 10,
      });

      // Should only return one paper since they have the same DOI
      expect(result).toHaveLength(1);
    });

    it("filters papers by publication year range", async () => {
      const semanticResponse = {
        data: [
          {
            paperId: "old",
            title: "Old Paper",
            authors: [{ name: "Author" }],
            year: 2010,
            abstract: "Old abstract.",
            citationCount: 1000,
            url: "https://example.com/old",
          },
          {
            paperId: "new",
            title: "New Paper",
            authors: [{ name: "Author" }],
            year: 2023,
            abstract: "New abstract.",
            citationCount: 50,
            url: "https://example.com/new",
          },
        ],
      };

      fetchMock.mockImplementation((url: string) => {
        if (url.includes("semanticscholar.org")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(semanticResponse),
          });
        }
        return Promise.reject(new Error("API error"));
      });

      const result = await searchInternal.handler(null as any, {
        query: "test",
        maxResults: 10,
        publicationYearFrom: 2020,
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("New Paper");
    });

    it("filters papers by minimum citations", async () => {
      const semanticResponse = {
        data: [
          {
            paperId: "low",
            title: "Low Citations",
            authors: [{ name: "Author" }],
            year: 2023,
            abstract: "Abstract.",
            citationCount: 5,
            url: "https://example.com/low",
          },
          {
            paperId: "high",
            title: "High Citations",
            authors: [{ name: "Author" }],
            year: 2023,
            abstract: "Abstract.",
            citationCount: 500,
            url: "https://example.com/high",
          },
        ],
      };

      fetchMock.mockImplementation((url: string) => {
        if (url.includes("semanticscholar.org")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(semanticResponse),
          });
        }
        return Promise.reject(new Error("API error"));
      });

      const result = await searchInternal.handler(null as any, {
        query: "test",
        maxResults: 10,
        minCitations: 100,
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("High Citations");
    });

    it("filters papers by open access only", async () => {
      const semanticResponse = {
        data: [
          {
            paperId: "closed",
            title: "Closed Access",
            authors: [{ name: "Author" }],
            year: 2023,
            abstract: "Abstract.",
            citationCount: 100,
            url: "https://example.com/closed",
          },
          {
            paperId: "open",
            title: "Open Access",
            authors: [{ name: "Author" }],
            year: 2023,
            abstract: "Abstract.",
            citationCount: 100,
            openAccessPdf: { url: "https://pdf.example.com/open.pdf" },
            url: "https://example.com/open",
          },
        ],
      };

      fetchMock.mockImplementation((url: string) => {
        if (url.includes("semanticscholar.org")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(semanticResponse),
          });
        }
        return Promise.reject(new Error("API error"));
      });

      const result = await searchInternal.handler(null as any, {
        query: "test",
        maxResults: 10,
        openAccessOnly: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Open Access");
    });

    it("sorts papers by citations", async () => {
      const semanticResponse = {
        data: [
          {
            paperId: "medium",
            title: "Medium Citations",
            authors: [{ name: "Author" }],
            year: 2023,
            abstract: "Abstract.",
            citationCount: 100,
            url: "https://example.com/medium",
          },
          {
            paperId: "high",
            title: "High Citations",
            authors: [{ name: "Author" }],
            year: 2023,
            abstract: "Abstract.",
            citationCount: 500,
            url: "https://example.com/high",
          },
        ],
      };

      fetchMock.mockImplementation((url: string) => {
        if (url.includes("semanticscholar.org")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(semanticResponse),
          });
        }
        return Promise.reject(new Error("API error"));
      });

      const result = await searchInternal.handler(null as any, {
        query: "test",
        maxResults: 10,
        sortBy: "citations",
      });

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("High Citations");
      expect(result[1].title).toBe("Medium Citations");
    });

    it("limits results to maxResults", async () => {
      const semanticResponse = {
        data: Array.from({ length: 20 }, (_, i) => ({
          paperId: `paper${i}`,
          title: `Paper ${i}`,
          authors: [{ name: "Author" }],
          year: 2023,
          abstract: "Abstract.",
          citationCount: i * 10,
          url: `https://example.com/paper${i}`,
        })),
      };

      fetchMock.mockImplementation((url: string) => {
        if (url.includes("semanticscholar.org")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(semanticResponse),
          });
        }
        return Promise.reject(new Error("API error"));
      });

      const result = await searchInternal.handler(null as any, {
        query: "test",
        maxResults: 5,
      });

      expect(result).toHaveLength(5);
    });

    it("handles arXiv XML with missing fields gracefully", async () => {
      const arxivXml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title></title>
            <summary></summary>
            <link href="http://arxiv.org/abs/2301.00001" rel="alternate"/>
          </entry>
        </feed>`;

      fetchMock.mockImplementation((url: string) => {
        if (url.includes("arxiv.org")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(arxivXml),
          });
        }
        return Promise.reject(new Error("API error"));
      });

      const result = await searchInternal.handler(null as any, {
        query: "test",
        maxResults: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Untitled");
      expect(result[0].abstract).toBe("");
      expect(result[0].authors).toEqual([]);
    });

    it("handles PubMed articles with collective names", async () => {
      const esearchResponse = {
        esearchresult: {
          idlist: ["99999"],
        },
      };

      const efetchXml = `<?xml version="1.0"?>
        <pmcarticles>
          <article>
            <front>
              <article-meta>
                <title-group><article-title>Group Authorship</article-title></title-group>
                <abstract><p>Abstract.</p></abstract>
                <contrib-group>
                  <contrib contrib-type="author">
                    <collab>The Genome Consortium</collab>
                  </contrib>
                </contrib-group>
                <pub-date><year>2023</year></pub-date>
                <article-id pub-id-type="pmc">99999</article-id>
              </article-meta>
            </front>
          </article>
        </pmcarticles>`;

      let callCount = 0;
      fetchMock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(esearchResponse),
          });
        }
        if (callCount === 2) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(efetchXml),
          });
        }
        return Promise.reject(new Error("API error"));
      });

      const result = await searchInternal.handler(null as any, {
        query: "genome",
        maxResults: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].authors).toEqual(["The Genome Consortium"]);
    });

    it("calculates score based on citations and recency", async () => {
      const semanticResponse = {
        data: [
          {
            paperId: "recent",
            title: "Recent Paper",
            authors: [{ name: "Author" }],
            year: 2024,
            abstract: "Abstract.",
            citationCount: 0,
            url: "https://example.com/recent",
          },
        ],
      };

      fetchMock.mockImplementation((url: string) => {
        if (url.includes("semanticscholar.org")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(semanticResponse),
          });
        }
        return Promise.reject(new Error("API error"));
      });

      const result = await searchInternal.handler(null as any, {
        query: "test",
        maxResults: 10,
      });

      expect(result).toHaveLength(1);
      // Score should be based on recency (2024/currentYear) * 0.3 since no citations
      expect(result[0].score).toBeGreaterThan(0);
      expect(result[0].score).toBeLessThanOrEqual(1);
    });
  });

  describe("discoverAcademicPapersInternal", () => {
    it("transforms AcademicPaper to DiscoveredSource format", async () => {
      const semanticResponse = {
        data: [
          {
            paperId: "abc123",
            title: "Test Paper",
            authors: [{ name: "Test Author" }],
            year: 2023,
            abstract: "This is a longer abstract that should be truncated in the snippet but kept in rawContent. It contains more information about the research.",
            openAccessPdf: { url: "https://pdf.example.com/paper.pdf" },
            citationCount: 42,
            externalIds: { DOI: "10.1234/test" },
            url: "https://semanticscholar.org/paper/abc123",
          },
        ],
      };

      fetchMock.mockImplementation((url: string) => {
        if (url.includes("semanticscholar.org")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(semanticResponse),
          });
        }
        return Promise.reject(new Error("API error"));
      });

      const result = await discoverAcademicPapersInternal.handler(null as any, {
        query: "test query",
        maxResults: 10,
      });

      expect(result).toHaveLength(1);
      const source = result[0];
      expect(source.title).toBe("Test Paper");
      expect(source.url).toBe("https://semanticscholar.org/paper/abc123");
      expect(source.snippet).toBe("This is a longer abstract that should be truncated in the snippet but kept in rawContent. It contains more information about the research.".substring(0, 500));
      expect(source.score).toBeGreaterThan(0);
      expect(source.publishedDate).toBe("2023-01-01");
      expect(source.domain).toBe("semanticscholar.org");
      expect(source.rawContent).toContain("longer abstract");
      expect(source.metadata).toEqual({
        pdfUrl: "https://pdf.example.com/paper.pdf",
        doi: "10.1234/test",
        citationCount: 42,
        sourceApi: "semantic_scholar",
      });
    });

    it("returns empty array when query produces no results", async () => {
      fetchMock.mockRejectedValue(new Error("API error"));

      const result = await discoverAcademicPapersInternal.handler(null as any, {
        query: "xyznonexistent",
        maxResults: 10,
      });

      expect(result).toEqual([]);
    });
  });
});
