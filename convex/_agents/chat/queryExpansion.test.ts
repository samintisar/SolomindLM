import { describe, expect, it } from "vitest";
import { expandQueryWithKeywords } from "./queryExpansion";

describe("expandQueryWithKeywords", () => {
  it("returns the original query when no synonyms apply", () => {
    expect(expandQueryWithKeywords("quantum entanglement")).toEqual(["quantum entanglement"]);
  });

  it("adds synonym variations for known terms", () => {
    const variations = expandQueryWithKeywords("What is the definition of entropy?");
    expect(variations[0]).toBe("What is the definition of entropy?");
    expect(variations.length).toBeGreaterThan(1);
    expect(variations.length).toBeLessThanOrEqual(3);
  });

  it("limits total variations to three", () => {
    const variations = expandQueryWithKeywords(
      "explain the difference between advantages and disadvantages"
    );
    expect(variations.length).toBeLessThanOrEqual(3);
  });

  it("replaces matched terms case-insensitively", () => {
    const variations = expandQueryWithKeywords("Give an Example");
    const hasSynonym = variations.some((v) => v.toLowerCase().includes("instance"));
    expect(hasSynonym).toBe(true);
  });

  it("adds no variations when the keyword variant cap is zero", () => {
    expect(expandQueryWithKeywords("What is the definition of entropy?", 0)).toEqual([
      "What is the definition of entropy?",
    ]);
  });

  it("adds at most the given number of variations", () => {
    const variations = expandQueryWithKeywords("explain the difference between advantages", 1);
    expect(variations).toHaveLength(2);
  });
});
