import { describe, expect, it, vi } from "vitest";
import {
  ACADEMIC_SEARCH_EMPTY_SKIP_CACHE,
  searchInternalHandler,
} from "./AcademicSearchService";

describe("searchInternalHandler rate limit metadata", () => {
  it("sets rateLimited when Semantic Scholar returns 429", async () => {
    const runMutation = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () =>
        JSON.stringify({
          message: "Too Many Requests",
          code: "429",
        }),
      headers: { get: () => null },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchInternalHandler(
      {
        query: "llm benchmarks",
        maxResults: 5,
        sources: ["semantic_scholar"],
      },
      { runMutation } as never
    );

    expect(result.papers).toEqual([]);
    expect(result.rateLimited).toBe(true);
    expect(runMutation).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("skips Semantic Scholar while provider cooldown is active", async () => {
    const runMutation = vi.fn().mockResolvedValue({
      coolingDown: true,
      retryAfterMs: 120000,
      cooldownUntil: Date.now() + 120000,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchInternalHandler(
      {
        query: "llm benchmarks",
        maxResults: 5,
        sources: ["semantic_scholar"],
      },
      { runMutation } as never
    );

    expect(result.papers).toEqual([]);
    expect(result.rateLimited).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("records arXiv cooldown when arXiv returns 429", async () => {
    const runMutation = vi
      .fn()
      .mockResolvedValueOnce({ coolingDown: false, retryAfterMs: 0 })
      .mockResolvedValueOnce({ acquired: true, waitMs: 0 })
      .mockResolvedValueOnce(null);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate exceeded.",
      headers: { get: () => null },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchInternalHandler(
      {
        query: "llm benchmarks",
        maxResults: 5,
        sources: ["arxiv"],
      },
      { runMutation } as never
    );

    expect(result.papers).toEqual([]);
    expect(result.rateLimited).toBe(true);
    expect(runMutation).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });

  it("returns OpenAlex papers when fragile providers are cooling down", async () => {
    const runMutation = vi
      .fn()
      .mockResolvedValueOnce({
        coolingDown: true,
        retryAfterMs: 120000,
        cooldownUntil: Date.now() + 120000,
      })
      .mockResolvedValueOnce({
        coolingDown: true,
        retryAfterMs: 120000,
        cooldownUntil: Date.now() + 120000,
      });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("eutils.ncbi.nlm.nih.gov")) {
        return {
          ok: true,
          json: async () => ({ esearchresult: { idlist: [] } }),
        };
      }
      if (url.includes("api.openalex.org/works")) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                display_name: "Machine learning",
                authorships: [{ author: { display_name: "Tom Mitchell" } }],
                publication_year: 1997,
                abstract_inverted_index: {
                  "Machine": [0],
                  "learning": [1],
                  "methods": [2],
                },
                open_access: { oa_url: "https://example.com/paper.pdf" },
                cited_by_count: 1234,
                doi: "https://doi.org/10.1234/ml",
                id: "https://openalex.org/W123",
              },
            ],
          }),
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchInternalHandler(
      {
        query: "machine learning",
        maxResults: 20,
      },
      { runMutation } as never
    );

    expect(result.papers).toMatchObject([
      {
        title: "Machine learning",
        authors: ["Tom Mitchell"],
        year: 1997,
        abstract: "Machine learning methods",
        pdfUrl: "https://example.com/paper.pdf",
        source: "openalex",
        citationCount: 1234,
        doi: "10.1234/ml",
      },
    ]);
    expect(result.rateLimited).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("ACADEMIC_SEARCH_EMPTY_SKIP_CACHE", () => {
  it("is a stable sentinel for cache bypass", () => {
    expect(ACADEMIC_SEARCH_EMPTY_SKIP_CACHE).toBe("ACADEMIC_SEARCH_EMPTY_SKIP_CACHE");
  });
});
