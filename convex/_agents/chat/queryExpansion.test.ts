import { describe, it, expect } from "vitest";
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
});
