import { describe, expect, it } from "vitest";
import { sourcesFromDiscoverResult } from "./_discoverResult";

describe("sourcesFromDiscoverResult", () => {
  it("reads Tavily-style arrays", () => {
    const rows = sourcesFromDiscoverResult([
      { title: "A", url: "https://a.example", snippet: "one" },
    ]);
    expect(rows).toEqual([{ title: "A", url: "https://a.example", snippet: "one" }]);
  });

  it("reads academic-style { sources } objects", () => {
    const rows = sourcesFromDiscoverResult({
      sources: [{ title: "Paper", url: "https://p.example", abstract: "abs" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("Paper");
  });

  it("returns [] when sources is missing (the research eval crash)", () => {
    expect(sourcesFromDiscoverResult(undefined)).toEqual([]);
    expect(sourcesFromDiscoverResult(null)).toEqual([]);
    expect(sourcesFromDiscoverResult({})).toEqual([]);
  });
});
