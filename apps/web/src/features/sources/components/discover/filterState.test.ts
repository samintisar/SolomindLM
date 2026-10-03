import { describe, expect, it } from "vitest";
import { countActiveFilters, DEFAULT_FILTERS, type FilterState } from "./filterState";

const withOverrides = (over: Partial<FilterState>): FilterState => ({
  ...DEFAULT_FILTERS,
  ...over,
});

describe("countActiveFilters", () => {
  it("is 0 at the defaults", () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
  });

  it("counts a time range", () => {
    expect(countActiveFilters(withOverrides({ timeRange: "week" }))).toBe(1);
  });

  it("counts a non-default sort and a non-default result count", () => {
    expect(countActiveFilters(withOverrides({ sortBy: "citations", maxResults: 10 }))).toBe(2);
  });

  it("counts academic filters only while Academic is selected", () => {
    const academic = { minCitations: 5, openAccessOnly: true };
    expect(countActiveFilters(withOverrides({ sourceTypes: ["web"], academic }))).toBe(0);
    expect(countActiveFilters(withOverrides({ sourceTypes: ["web", "academic"], academic }))).toBe(
      2
    );
  });
});
