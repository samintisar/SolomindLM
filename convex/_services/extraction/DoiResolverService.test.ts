import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DoiResolverService } from "./DoiResolverService";
import { InputValidationError } from "../../_lib/errors";

describe("DoiResolverService", () => {
  let service: DoiResolverService;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let originalSetTimeout: typeof global.setTimeout;

  beforeEach(() => {
    service = new DoiResolverService();
    fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    originalSetTimeout = global.setTimeout;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.setTimeout = originalSetTimeout;
  });

  describe("resolve", () => {
    it("resolves a valid DOI to a PaperRecord", async () => {
      const mockCrossrefResponse = {
        message: {
          title: ["Test Paper Title"],
          author: [{ given: "John", family: "Doe" }, { name: "Jane Smith" }],
          abstract: "This is a test abstract.",
          "container-title": ["Journal of Testing"],
          published: { "date-parts": [[2023, 5]] },
          DOI: "10.1234/test",
          URL: "https://doi.org/10.1234/test",
        },
      };

      const mockSemanticScholarResponse = {
        openAccessPdf: { url: "https://example.com/paper.pdf" },
        externalIds: { OpenAlex: "W123456789" },
      };

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockCrossrefResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockSemanticScholarResponse,
        });

      const result = await service.resolve("10.1234/test");

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Test Paper Title");
      expect(result?.authors).toEqual(["John Doe", "Jane Smith"]);
      expect(result?.abstract).toBe("This is a test abstract.");
      expect(result?.venue).toBe("Journal of Testing");
      expect(result?.year).toBe(2023);
      expect(result?.doi).toBe("10.1234/test");
      expect(result?.landingPageUrl).toBe("https://doi.org/10.1234/test");
      expect(result?.pdfUrl).toBe("https://example.com/paper.pdf");
      expect(result?.openAlexId).toBe("W123456789");
      expect(result?.isOa).toBe(true);
      expect(result?.sourceType).toBe("doi");
    });

    it("throws InputValidationError for invalid DOI format", async () => {
      await expect(service.resolve("invalid-doi")).rejects.toThrow(InputValidationError);
      await expect(service.resolve("invalid-doi")).rejects.toThrow("Invalid DOI format: invalid-doi");
    });

    it("returns null when DOI is not found in Crossref", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const result = await service.resolve("10.1234/notfound");
      expect(result).toBeNull();
    });

    it("handles PDF unavailability and falls back to OpenAlex", async () => {
      const mockCrossrefResponse = {
        message: {
          title: ["Paper Without PDF"],
          author: [{ given: "Alice", family: "Wonder" }],
          abstract: "No PDF available.",
          DOI: "10.1234/nopdf",
        },
      };

      const mockSemanticScholarResponse = {
        openAccessPdf: null,
        externalIds: {},
      };

      const mockOpenAlexResponse = {
        title: "Paper Without PDF",
        open_access: { oa_url: "https://openalex.org/pdf.pdf" },
        ids: { openalex: "W987654321" },
      };

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockCrossrefResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockSemanticScholarResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockOpenAlexResponse,
        });

      const result = await service.resolve("10.1234/nopdf");

      expect(result).not.toBeNull();
      expect(result?.pdfUrl).toBe("https://openalex.org/pdf.pdf");
      expect(result?.openAlexId).toBe("W987654321");
      expect(result?.isOa).toBe(true);
    });

    it("returns isOa: false when no PDF is available from any source", async () => {
      const mockCrossrefResponse = {
        message: {
          title: ["Closed Access Paper"],
          author: [{ given: "Bob", family: "Builder" }],
          abstract: "This paper is closed access.",
          DOI: "10.1234/closed",
        },
      };

      const mockSemanticScholarResponse = {
        openAccessPdf: null,
        externalIds: {},
      };

      const mockOpenAlexResponse = {
        title: "Closed Access Paper",
        open_access: {},
      };

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockCrossrefResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockSemanticScholarResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockOpenAlexResponse,
        });

      const result = await service.resolve("10.1234/closed");

      expect(result).not.toBeNull();
      expect(result?.pdfUrl).toBeUndefined();
      expect(result?.isOa).toBe(false);
    });

    it("retries on transient API failures", async () => {
      global.setTimeout = ((callback: (...args: unknown[]) => void, _ms?: number, ...args: unknown[]) => {
        return originalSetTimeout(callback, 0, ...args);
      }) as typeof global.setTimeout;

      const mockCrossrefResponse = {
        message: {
          title: ["Retry Paper"],
          author: [{ given: "Retry", family: "Master" }],
          abstract: "This paper required retries.",
          DOI: "10.1234/retry",
        },
      };

      const mockSemanticScholarResponse = {
        openAccessPdf: { url: "https://example.com/retry.pdf" },
      };

      fetchSpy
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockCrossrefResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockSemanticScholarResponse,
        });

      const result = await service.resolve("10.1234/retry");

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Retry Paper");
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe("resolveBatch", () => {
    it("resolves multiple DOIs in batch", async () => {
      const mockCrossrefBatchResponse = {
        message: {
          items: [
            {
              title: ["Paper One"],
              author: [{ given: "First", family: "Author" }],
              abstract: "Abstract one.",
              DOI: "10.1234/one",
            },
            {
              title: ["Paper Two"],
              author: [{ given: "Second", family: "Author" }],
              abstract: "Abstract two.",
              DOI: "10.1234/two",
            },
          ],
        },
      };

      const mockSemanticScholarBatchResponse = [
        { openAccessPdf: { url: "https://example.com/one.pdf" }, externalIds: { OpenAlex: "W1" } },
        { openAccessPdf: { url: "https://example.com/two.pdf" }, externalIds: { OpenAlex: "W2" } },
      ];

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockCrossrefBatchResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockSemanticScholarBatchResponse,
        });

      const results = await service.resolveBatch(["10.1234/one", "10.1234/two"]);

      expect(results).toHaveLength(2);
      expect(results[0]).not.toBeNull();
      expect(results[0]?.title).toBe("Paper One");
      expect(results[0]?.pdfUrl).toBe("https://example.com/one.pdf");
      expect(results[1]).not.toBeNull();
      expect(results[1]?.title).toBe("Paper Two");
      expect(results[1]?.pdfUrl).toBe("https://example.com/two.pdf");
    });

    it("returns null for DOIs not found in batch", async () => {
      const mockCrossrefBatchResponse = {
        message: {
          items: [
            {
              title: ["Found Paper"],
              author: [{ given: "Found", family: "Author" }],
              abstract: "This one was found.",
              DOI: "10.1234/found",
            },
          ],
        },
      };

      const mockSemanticScholarBatchResponse = [
        { openAccessPdf: { url: "https://example.com/found.pdf" } },
      ];

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockCrossrefBatchResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockSemanticScholarBatchResponse,
        });

      const results = await service.resolveBatch(["10.1234/found", "10.1234/missing"]);

      expect(results).toHaveLength(2);
      expect(results[0]).not.toBeNull();
      expect(results[0]?.title).toBe("Found Paper");
      expect(results[1]).toBeNull();
    });

    it("throws InputValidationError if any DOI in batch is invalid", async () => {
      await expect(service.resolveBatch(["10.1234/valid", "invalid-doi"])).rejects.toThrow(
        InputValidationError
      );
    });

    it("handles empty batch", async () => {
      const results = await service.resolveBatch([]);
      expect(results).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
