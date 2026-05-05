import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchArxiv } from "./arxiv";
import { arxivQueue } from "../utils/providerQueue";

describe("searchArxiv", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    arxivQueue.reset();
    arxivQueue.setDelay(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createArxivXmlResponse(entries: string[]): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Search Results</title>
${entries.join("\n")}
</feed>`;
  }

  function createEntry(options: {
    title: string;
    summary: string;
    published: string;
    authors: string[];
    id: string;
    pdfLink?: string;
    doi?: string;
  }): string {
    const authorTags = options.authors
      .map((name) => `    <author><name>${name}</name></author>`)
      .join("\n");

    const links = [
      `    <link href="http://arxiv.org/abs/${options.id}" rel="alternate" type="text/html"/>`,
    ];
    if (options.pdfLink) {
      links.push(
        `    <link href="${options.pdfLink}" rel="related" type="application/pdf" title="pdf"/>`
      );
    }

    const doiTag = options.doi ? `    <doi>${options.doi}</doi>` : "";

    return `  <entry>
    <title>${options.title}</title>
    <summary>${options.summary}</summary>
    <published>${options.published}</published>
${authorTags}
${links.join("\n")}
    <id>http://arxiv.org/abs/${options.id}</id>
${doiTag}
  </entry>`;
  }

  it("returns parsed papers from a valid arXiv XML response", async () => {
    const xml = createArxivXmlResponse([
      createEntry({
        title: "Quantum Machine Learning",
        summary: "This paper explores quantum algorithms for machine learning.",
        published: "2023-08-10T00:00:00Z",
        authors: ["Alice Smith", "Bob Jones"],
        id: "2308.00001",
        pdfLink: "http://arxiv.org/pdf/2308.00001.pdf",
      }),
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => xml,
    });

    const result = await searchArxiv("quantum machine learning", 10, {});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: "Quantum Machine Learning",
      authors: ["Alice Smith", "Bob Jones"],
      year: 2023,
      abstract: "This paper explores quantum algorithms for machine learning.",
      url: "http://arxiv.org/abs/2308.00001",
      pdfUrl: "http://arxiv.org/pdf/2308.00001.pdf",
      source: "arxiv",
    });
    expect(result[0].score).toBeGreaterThan(0);
  });

  it("handles empty results", async () => {
    const xml = createArxivXmlResponse([]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => xml,
    });

    const result = await searchArxiv("nonexistent query", 10, {});

    expect(result).toEqual([]);
  });

  it("parses DOI, PDF links, and authors correctly", async () => {
    const xml = createArxivXmlResponse([
      createEntry({
        title: "Neural Networks for NLP",
        summary: "A comprehensive study.",
        published: "2022-03-15T00:00:00Z",
        authors: ["Jane Doe"],
        id: "2203.00001",
        pdfLink: "http://arxiv.org/pdf/2203.00001.pdf",
        doi: "10.1234/example.doi",
      }),
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => xml,
    });

    const result = await searchArxiv("nlp", 5, {});

    expect(result[0].doi).toBe("10.1234/example.doi");
    expect(result[0].pdfUrl).toBe("http://arxiv.org/pdf/2203.00001.pdf");
    expect(result[0].authors).toEqual(["Jane Doe"]);
  });

  it("falls back to constructed URL when no link found", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Untitled Paper</title>
    <summary>No links here.</summary>
    <published>2021-01-01T00:00:00Z</published>
    <author><name>Anonymous</name></author>
    <id>http://arxiv.org/abs/2101.00001</id>
  </entry>
</feed>`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => xml,
    });

    const result = await searchArxiv("test", 5, {});

    expect(result[0].url).toBe("http://arxiv.org/abs/2101.00001");
    expect(result[0].pdfUrl).toBeUndefined();
  });

  it(
    "propagates HTTP errors as ExternalServiceError",
    async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "Service Unavailable",
      });

      await expect(searchArxiv("test", 5, {})).rejects.toThrow(
        "arxiv HTTP 503: Service Unavailable"
      );
    },
    15000
  );
});
