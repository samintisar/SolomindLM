import { beforeEach, describe, expect, it, vi } from "vitest";
import { InputValidationError } from "../../_lib/errors";
import { DoiResolverService } from "./DoiResolverService";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

describe("DoiResolverService", () => {
  let service: DoiResolverService;

  beforeEach(() => {
    service = new DoiResolverService();
    mockFetch.mockClear();
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
      await expect(service.resolve("invalid-doi")).rejects.toThrow(
        "Invalid DOI format: invalid-doi"
      );
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

    it("returns null when Crossref returns 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not found",
      });

      const result = await service.resolve("10.1234/notfound");

      expect(result).toBeNull();
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
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => "Not found",
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
            isOpenAccess: false,
          }),
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
});
