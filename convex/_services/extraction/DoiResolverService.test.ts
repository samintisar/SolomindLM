import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExternalServiceError, InputValidationError } from "../../_lib/errors";
import { DoiResolverService, normalizeDoiInput } from "./DoiResolverService";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

type Route = { status: number; body?: unknown };

/** Answers each request by the first route whose key appears in the URL; unrouted URLs 404. */
function routeFetch(routes: Record<string, Route>) {
  mockFetch.mockImplementation(async (url: string) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    const route = key ? routes[key] : { status: 404, body: "Not found" };
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      json: async () => route.body,
      text: async () => (typeof route.body === "string" ? route.body : JSON.stringify(route.body)),
    };
  });
}

function requestedUrls(): string[] {
  return mockFetch.mock.calls.map(([url]) => String(url));
}

const ragDatacite = {
  data: {
    attributes: {
      doi: "10.48550/arxiv.2005.11401",
      titles: [{ title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks" }],
      creators: [
        { name: "Lewis, Patrick", givenName: "Patrick", familyName: "Lewis" },
        { name: "Perez, Ethan", givenName: "Ethan", familyName: "Perez" },
      ],
      descriptions: [
        { description: "Large pre-trained language models...", descriptionType: "Abstract" },
      ],
      publicationYear: 2020,
      publisher: "arXiv",
      url: "https://arxiv.org/abs/2005.11401",
      rightsList: [{ rightsUri: "http://arxiv.org/licenses/nonexclusive-distrib/1.0/" }],
    },
  },
};

describe("DoiResolverService", () => {
  let service: DoiResolverService;

  beforeEach(() => {
    service = new DoiResolverService();
    mockFetch.mockReset();
  });

  describe("resolve", () => {
    it("resolves a valid DOI to a PaperRecord", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            status: "ok",
            message: {
              title: ["Test Paper Title"],
              author: [{ given: "John", family: "Smith" }],
              abstract: "This is a test abstract.",
              DOI: "10.1234/test",
              "container-title": ["Journal of Testing"],
              published: { "date-parts": [[2023, 1, 1]] },
              URL: "https://doi.org/10.1234/test",
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            paperId: "abc123",
            title: "Test Paper Title",
            authors: [{ name: "John Smith" }],
            year: 2023,
            abstract: "This is a test abstract.",
            openAccessPdf: { url: "https://example.com/paper.pdf" },
            externalIds: { DOI: "10.1234/test", OpenAlex: "W123" },
            url: "https://semanticscholar.org/paper/abc123",
            isOpenAccess: true,
          }),
        });

      const result = await service.resolve("10.1234/test");

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Test Paper Title");
      expect(result?.authors).toEqual(["Smith, John"]);
      expect(result?.abstract).toBe("This is a test abstract.");
      expect(result?.doi).toBe("10.1234/test");
      expect(result?.venue).toBe("Journal of Testing");
      expect(result?.publicationYear).toBe(2023);
      expect(result?.pdfUrl).toBe("https://example.com/paper.pdf");
      expect(result?.landingPageUrl).toBe("https://doi.org/10.1234/test");
      expect(result?.openAlexId).toBe("https://openalex.org/W123");
      expect(result?.semanticScholarId).toBe("abc123");
      expect(result?.isOa).toBe(true);
      expect(result?.sourceType).toBe("doi");
    });

    it("throws InputValidationError for invalid DOI format", async () => {
      await expect(service.resolve("invalid-doi")).rejects.toThrow(InputValidationError);
      await expect(service.resolve("invalid-doi")).rejects.toThrow(/DOI .*or an arXiv ID/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns isOa: false and no pdfUrl when PDF is unavailable", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            status: "ok",
            message: {
              title: ["Closed Access Paper"],
              author: [{ given: "Jane", family: "Doe" }],
              abstract: "Abstract text.",
              DOI: "10.1234/closed",
              URL: "https://doi.org/10.1234/closed",
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            paperId: "def456",
            title: "Closed Access Paper",
            authors: [{ name: "Jane Doe" }],
            isOpenAccess: false,
            openAccessPdf: null,
          }),
        });

      const result = await service.resolve("10.1234/closed");

      expect(result).not.toBeNull();
      expect(result?.pdfUrl).toBeUndefined();
      expect(result?.isOa).toBe(false);
    });

    it("returns null when neither Crossref nor DataCite has the DOI", async () => {
      routeFetch({});

      const result = await service.resolve("10.1234/notfound");

      expect(result).toBeNull();
      expect(requestedUrls().some((u) => u.includes("api.crossref.org"))).toBe(true);
      expect(requestedUrls().some((u) => u.includes("api.datacite.org"))).toBe(true);
    });

    it("falls back gracefully when Semantic Scholar fails", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            status: "ok",
            message: {
              title: ["Paper Title"],
              author: [{ given: "Alice", family: "Wonder" }],
              abstract: "Abstract.",
              DOI: "10.1234/fallback",
              URL: "https://doi.org/10.1234/fallback",
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => "Server error",
        });

      const result = await service.resolve("10.1234/fallback");

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Paper Title");
      expect(result?.isOa).toBe(false);
    });
  });

  describe("resolveBatch", () => {
    it("resolves multiple DOIs in batch", async () => {
      // Crossref calls
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            status: "ok",
            message: {
              title: ["Paper One"],
              author: [{ given: "A", family: "Author" }],
              DOI: "10.1234/one",
              URL: "https://doi.org/10.1234/one",
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            paperId: "p1",
            openAccessPdf: { url: "https://example.com/one.pdf" },
            isOpenAccess: true,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            status: "ok",
            message: {
              title: ["Paper Two"],
              author: [{ given: "B", family: "Author" }],
              DOI: "10.1234/two",
              URL: "https://doi.org/10.1234/two",
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            paperId: "p2",
            openAccessPdf: null,
            isOpenAccess: false,
          }),
        });

      const results = await service.resolveBatch(["10.1234/one", "10.1234/two"]);

      expect(results).toHaveLength(2);
      expect(results[0]).not.toBeNull();
      expect(results[0]?.title).toBe("Paper One");
      expect(results[0]?.isOa).toBe(true);
      expect(results[1]).not.toBeNull();
      expect(results[1]?.title).toBe("Paper Two");
      expect(results[1]?.isOa).toBe(false);
    });

    it("throws InputValidationError if any DOI in batch is invalid", async () => {
      await expect(service.resolveBatch(["10.1234/valid", "invalid-doi"])).rejects.toThrow(
        InputValidationError
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("handles empty batch", async () => {
      const results = await service.resolveBatch([]);
      expect(results).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("continues on individual failures in batch", async () => {
      routeFetch({
        "api.crossref.org/works/10.1234%2Ftwo": {
          status: 200,
          body: {
            status: "ok",
            message: {
              title: ["Paper Two"],
              author: [{ given: "B", family: "Author" }],
              DOI: "10.1234/two",
              URL: "https://doi.org/10.1234/two",
            },
          },
        },
        "api.semanticscholar.org": { status: 200, body: { paperId: "p2", isOpenAccess: false } },
      });

      const results = await service.resolveBatch(["10.1234/notfound", "10.1234/two"]);

      expect(results).toHaveLength(2);
      expect(results[0]).toBeNull();
      expect(results[1]).not.toBeNull();
      expect(results[1]?.title).toBe("Paper Two");
    });
  });

  describe("JATS abstract cleaning", () => {
    it("cleans JATS XML from Crossref abstracts", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            status: "ok",
            message: {
              title: ["JATS Paper"],
              author: [{ given: "X", family: "Y" }],
              abstract: "<jats:p>This is a <jats:bold>JATS</jats:bold> abstract.</jats:p>",
              DOI: "10.1234/jats",
              URL: "https://doi.org/10.1234/jats",
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            paperId: "jats1",
            isOpenAccess: false,
          }),
        });

      const result = await service.resolve("10.1234/jats");

      expect(result?.abstract).toBe("This is a JATS abstract.");
    });
  });

  describe("arXiv DOIs", () => {
    it("resolves an arXiv DOI from DataCite, without asking Crossref", async () => {
      routeFetch({
        "api.datacite.org/dois/10.48550%2FarXiv.2005.11401": { status: 200, body: ragDatacite },
        "api.semanticscholar.org/graph/v1/paper/ARXIV:2005.11401": {
          status: 200,
          body: { paperId: "s2rag", externalIds: { ArXiv: "2005.11401", OpenAlex: "W1" } },
        },
      });

      const result = await service.resolve("10.48550/arXiv.2005.11401");

      expect(result).toMatchObject({
        title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
        authors: ["Lewis, Patrick", "Perez, Ethan"],
        abstract: "Large pre-trained language models...",
        doi: "10.48550/arXiv.2005.11401",
        venue: "arXiv",
        publicationYear: 2020,
        pdfUrl: "https://arxiv.org/pdf/2005.11401",
        landingPageUrl: "https://arxiv.org/abs/2005.11401",
        semanticScholarId: "s2rag",
        openAlexId: "https://openalex.org/W1",
        isOa: true,
        license: "http://arxiv.org/licenses/nonexclusive-distrib/1.0/",
        sourceType: "doi",
      });
      expect(requestedUrls().some((u) => u.includes("api.crossref.org"))).toBe(false);
    });

    it("still resolves when Semantic Scholar has no record of the paper", async () => {
      routeFetch({ "api.datacite.org": { status: 200, body: ragDatacite } });

      const result = await service.resolve("10.48550/arXiv.2005.11401");

      expect(result?.title).toBe(
        "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"
      );
      expect(result?.pdfUrl).toBe("https://arxiv.org/pdf/2005.11401");
      expect(result?.semanticScholarId).toBeUndefined();
    });

    it.each([
      "arXiv:2005.11401",
      "2005.11401",
      "2005.11401v4",
      "https://arxiv.org/abs/2005.11401v2",
      "https://arxiv.org/pdf/2005.11401.pdf",
      "https://doi.org/10.48550/arXiv.2005.11401",
    ])("accepts %s", async (input) => {
      routeFetch({
        "api.datacite.org/dois/10.48550%2FarXiv.2005.11401": { status: 200, body: ragDatacite },
      });

      const result = await service.resolve(input);

      expect(result?.doi).toBe("10.48550/arXiv.2005.11401");
    });
  });

  describe("DataCite fallback", () => {
    it("resolves a DataCite DOI that Crossref does not have", async () => {
      routeFetch({
        "api.datacite.org/dois/10.5281%2Fzenodo.42": {
          status: 200,
          body: {
            data: {
              attributes: {
                titles: [{ title: "A Dataset" }, { title: "Sub", titleType: "Subtitle" }],
                creators: [{ name: "Research Group", nameType: "Organizational" }],
                descriptions: [
                  { description: "Methods text", descriptionType: "Methods" },
                  { description: "<p>The abstract.</p>", descriptionType: "Abstract" },
                ],
                publicationYear: "2021",
                publisher: { name: "Zenodo" },
                url: "https://zenodo.org/record/42",
              },
            },
          },
        },
      });

      const result = await service.resolve("10.5281/zenodo.42");

      expect(result).toMatchObject({
        title: "A Dataset",
        authors: ["Research Group"],
        abstract: "The abstract.",
        venue: "Zenodo",
        publicationYear: 2021,
        landingPageUrl: "https://zenodo.org/record/42",
        isOa: false,
      });
      expect(result?.pdfUrl).toBeUndefined();
    });
  });

  describe("registry outages", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("reports an outage instead of a bad DOI when Crossref is down", async () => {
      routeFetch({ "api.crossref.org": { status: 503, body: "Service Unavailable" } });

      const pending = service.resolve("10.1234/whatever");
      const assertion = expect(pending).rejects.toBeInstanceOf(ExternalServiceError);
      await vi.runAllTimersAsync();
      await assertion;
    });

    it("does not ask for a retry when a registry rejects the request outright", async () => {
      routeFetch({ "api.crossref.org": { status: 400, body: "Bad Request" } });

      const err = await service.resolve("10.1234/whatever").catch((e) => e);

      expect(err).toBeInstanceOf(ExternalServiceError);
      expect(err.retryable).toBe(false);
      expect(err.data.detail).not.toMatch(/try again/i);
    });

    it("asks for a retry when the registry is down", async () => {
      routeFetch({ "api.crossref.org": { status: 503, body: "Service Unavailable" } });

      const pending = service.resolve("10.1234/whatever").catch((e) => e);
      await vi.runAllTimersAsync();
      const err = await pending;

      expect(err.retryable).toBe(true);
      expect(err.data.detail).toMatch(/try again/i);
    });

    it("uses DataCite when Crossref is down but DataCite has the DOI", async () => {
      routeFetch({
        "api.crossref.org": { status: 503, body: "Service Unavailable" },
        "api.datacite.org": { status: 200, body: ragDatacite },
      });

      const pending = service.resolve("10.9999/registered-at-datacite");
      await vi.runAllTimersAsync();

      expect((await pending)?.title).toBe(
        "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"
      );
    });
  });
});

describe("normalizeDoiInput", () => {
  it.each([
    ["10.1038/s41586-020-2649-2", "10.1038/s41586-020-2649-2"],
    ["  10.1038/x  ", "10.1038/x"],
    ["https://doi.org/10.1038/x", "10.1038/x"],
    ["http://dx.doi.org/10.1038/x", "10.1038/x"],
    ["doi:10.1038/x", "10.1038/x"],
    ["DOI: 10.1038/x", "10.1038/x"],
    ["arXiv:2005.11401", "10.48550/arXiv.2005.11401"],
    ["arxiv:2005.11401v3", "10.48550/arXiv.2005.11401"],
    ["1501.00001", "10.48550/arXiv.1501.00001"],
    ["https://arxiv.org/abs/hep-th/9711200", "10.48550/arXiv.hep-th/9711200"],
    ["10.48550/ARXIV.2005.11401", "10.48550/arXiv.2005.11401"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeDoiInput(input)).toBe(expected);
  });

  it("leaves text that is neither a DOI nor an arXiv ID for validation to reject", () => {
    expect(normalizeDoiInput("not a doi")).toBe("not a doi");
  });
});
