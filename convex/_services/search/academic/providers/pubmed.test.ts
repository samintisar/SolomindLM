import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchPubMed } from "./pubmed";
import { env } from "../../../../_lib/env";
import { pubmedQueue } from "../utils/providerQueue";

const originalSetTimeout = globalThis.setTimeout;

describe("searchPubMed", () => {
  const mockFetch = vi.fn();
  const originalEmail = env.PUBMED_EMAIL;

  beforeEach(() => {
    mockFetch.mockClear();
    globalThis.fetch = mockFetch;
    pubmedQueue.reset();
    pubmedQueue.setDelay(0);
    // Fix Date for consistent score calculation
    vi.useFakeTimers({ now: new Date("2024-01-15") });
    // Speed up retries by resolving setTimeout immediately (must be after useFakeTimers)
    globalThis.setTimeout = vi.fn((cb: () => void) => {
      cb();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout;
    // Set a predictable email
    (env as unknown as Record<string, string>).PUBMED_EMAIL = "test@example.com";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.setTimeout = originalSetTimeout;
    (env as unknown as Record<string, string>).PUBMED_EMAIL = originalEmail;
  });

  function createEsearchResponse(ids: string[]) {
    return {
      esearchresult: {
        idlist: ids,
      },
    };
  }

  function createEfetchResponse(articles: string[]) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<pmc-articleset>
${articles.join("\n")}
</pmc-articleset>`;
  }

  function createArticle(options: {
    title?: string;
    abstract?: string;
    authors?: Array<{
      surname?: string;
      givenNames?: string;
      stringName?: string;
      collectiveName?: string;
      surnameOnly?: boolean;
    }>;
    year?: number;
    doi?: string;
    pmcId?: string;
  }): string {
    const title = options.title ?? "Test Title";
    const abstract = options.abstract ?? "This is the abstract.";
    const year = options.year ?? 2023;

    const authorTags =
      options.authors
        ?.map((author) => {
          if (author.stringName) {
            return `  <contrib contrib-type="author">
    <string-name>${author.stringName}</string-name>
  </contrib>`;
          }
          if (author.collectiveName) {
            return `  <contrib contrib-type="author">
    <collective-name>${author.collectiveName}</collective-name>
  </contrib>`;
          }
          if (author.surname && author.givenNames) {
            return `  <contrib contrib-type="author">
    <name>
      <surname>${author.surname}</surname>
      <given-names>${author.givenNames}</given-names>
    </name>
  </contrib>`;
          }
          if (author.surname) {
            return `  <contrib contrib-type="author">
    <name>
      <surname>${author.surname}</surname>
    </name>
  </contrib>`;
          }
          return "";
        })
        .join("\n") ?? "";

    const doiTag = options.doi
      ? `  <article-id pub-id-type="doi">${options.doi}</article-id>`
      : "";
    const pmcTag = options.pmcId
      ? `  <article-id pub-id-type="pmc">${options.pmcId}</article-id>`
      : "";

    return `<article>
  <article-title>${title}</article-title>
  <abstract><p>${abstract}</p></abstract>
${authorTags}
  <pub-date><year>${year}</year></pub-date>
${doiTag}
${pmcTag}
</article>`;
  }

  function mockOkResponse(body: string | object, isJson = false) {
    return {
      ok: true,
      status: 200,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
      json: async () => body,
    };
  }

  function mockErrorResponse(status: number, text: string) {
    return {
      ok: false,
      status,
      text: async () => text,
    };
  }

  it("returns parsed papers from two-step esearch+efetch flow", async () => {
    mockFetch
      .mockResolvedValueOnce(mockOkResponse(createEsearchResponse(["12345", "67890"]), true))
      .mockResolvedValueOnce(
        mockOkResponse(
          createEfetchResponse([
            createArticle({
              title: "Quantum Biology",
              abstract: "Quantum effects in biological systems.",
              authors: [{ surname: "Doe", givenNames: "John" }],
              year: 2023,
              doi: "10.1234/test",
              pmcId: "12345",
            }),
          ])
        )
      );

    const result = await searchPubMed("quantum biology", 10, {});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: "Quantum Biology",
      authors: ["John Doe"],
      year: 2023,
      abstract: "Quantum effects in biological systems.",
      url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12345/",
      pdfUrl: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12345/pdf/",
      source: "pubmed",
      doi: "10.1234/test",
    });
    expect(result[0].score).toBeGreaterThan(0);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("handles empty esearch result and skips efetch", async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse(createEsearchResponse([]), true));

    const result = await searchPubMed("nonexistent query", 10, {});

    expect(result).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("parses complex author names correctly", async () => {
    mockFetch
      .mockResolvedValueOnce(mockOkResponse(createEsearchResponse(["11111"]), true))
      .mockResolvedValueOnce(
        mockOkResponse(
          createEfetchResponse([
            createArticle({
              title: "Multi-Author Paper",
              authors: [
                { surname: "Doe", givenNames: "John" },
                { stringName: "Jane Smith" },
                { collectiveName: "The Consortium" },
                { surname: "Brown" },
              ],
            }),
          ])
        )
      );

    const result = await searchPubMed("multi author", 5, {});

    expect(result).toHaveLength(1);
    expect(result[0].authors).toEqual([
      "John Doe",
      "Jane Smith",
      "The Consortium",
      "Brown",
    ]);
  });

  it("extracts DOI and PMC ID correctly", async () => {
    mockFetch
      .mockResolvedValueOnce(mockOkResponse(createEsearchResponse(["99999"]), true))
      .mockResolvedValueOnce(
        mockOkResponse(
          createEfetchResponse([
            createArticle({
              title: "DOI Test",
              doi: "10.5678/example",
              pmcId: "99999",
            }),
          ])
        )
      );

    const result = await searchPubMed("doi test", 5, {});

    expect(result[0].doi).toBe("10.5678/example");
    expect(result[0].url).toBe("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC99999/");
    expect(result[0].pdfUrl).toBe("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC99999/pdf/");
  });

  it("handles missing abstract gracefully", async () => {
    mockFetch
      .mockResolvedValueOnce(mockOkResponse(createEsearchResponse(["22222"]), true))
      .mockResolvedValueOnce(
        mockOkResponse(
          `<?xml version="1.0" encoding="UTF-8"?>
<pmc-articleset>
<article>
  <article-title>No Abstract Paper</article-title>
  <pub-date><year>2022</year></pub-date>
  <article-id pub-id-type="pmc">22222</article-id>
</article>
</pmc-articleset>`
        )
      );

    const result = await searchPubMed("no abstract", 5, {});

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("No Abstract Paper");
    expect(result[0].abstract).toBe("");
    expect(result[0].year).toBe(2022);
  });

  it("propagates HTTP errors from esearch step", async () => {
    mockFetch.mockResolvedValue(mockErrorResponse(503, "Service Unavailable"));

    await expect(searchPubMed("test", 5, {})).rejects.toThrow(
      "pubmed HTTP 503: Service Unavailable"
    );
  });

  it("propagates HTTP errors from efetch step", async () => {
    mockFetch
      .mockResolvedValueOnce(mockOkResponse(createEsearchResponse(["33333"]), true))
      .mockResolvedValue(mockErrorResponse(500, "Internal Server Error"));

    await expect(searchPubMed("test", 5, {})).rejects.toThrow(
      "pubmed HTTP 500: Internal Server Error"
    );
  });
});
