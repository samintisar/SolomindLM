import { describe, expect, it } from "vitest";
import { env } from "../../_lib/env";
import { normalizeQuery, searchInternalHandler } from "./TavilySearchService";

describe("TavilySearchService - Helpers", () => {
  describe("normalizeQuery", () => {
    it("lowercases query", () => {
      expect(normalizeQuery("Machine Learning")).toBe("machine learning");
    });

    it("trims whitespace", () => {
      expect(normalizeQuery("  query  ")).toBe("query");
    });

    it("collapses multiple spaces", () => {
      expect(normalizeQuery("too   many    spaces")).toBe("too many spaces");
    });
  });
});

describe("TavilySearchService - searchInternalHandler", () => {
  it("throws when API key is missing", async () => {
    const originalKey = env.TAVILY_API_KEY;
    (env as any).TAVILY_API_KEY = "";

    await expect(
      searchInternalHandler({
        query: "test",
        maxResults: 10,
        scoreThreshold: 0.5,
      })
    ).rejects.toThrow("TAVILY_API_KEY is not configured");

    (env as any).TAVILY_API_KEY = originalKey;
  });
});
