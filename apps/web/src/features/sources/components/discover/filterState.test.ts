import { describe, expect, it } from "vitest";
import {
  applyFilterPatch,
  countActiveFilters,
  DEFAULT_FILTERS,
  type FilterState,
  isDefaultFilters,
} from "./filterState";

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

describe("countActiveFilters (academic concepts)", () => {
  const academicOn = (academic: FilterState["academic"]) =>
    withOverrides({ sourceTypes: ["web", "academic"], academic });

  it("counts a last-N-years window as one filter", () => {
    expect(countActiveFilters(academicOn({ publicationYearMode: "lastN", lastNYears: 5 }))).toBe(1);
  });

  it("counts a custom range with only From as one filter", () => {
    expect(
      countActiveFilters(academicOn({ publicationYearMode: "custom", customYearFrom: 2015 }))
    ).toBe(1);
  });

  it("counts a full custom range as one filter", () => {
    expect(
      countActiveFilters(
        academicOn({ publicationYearMode: "custom", customYearFrom: 2010, customYearTo: 2020 })
      )
    ).toBe(1);
  });

  it("counts citations, open access, full text and field of study each once", () => {
    expect(
      countActiveFilters(
        academicOn({
          minCitations: 10,
          openAccessOnly: true,
          hasFullText: true,
          fieldOfStudyIds: ["computer-science"],
        })
      )
    ).toBeGreaterThanOrEqual(3);
  });

  it("ignores no-op academic values", () => {
    expect(
      countActiveFilters(
        academicOn({ publicationYearMode: "all", fieldOfStudyIds: [], minCitations: 0 })
      )
    ).toBe(0);
  });
});

describe("isDefaultFilters", () => {
  it("is true at the defaults", () => {
    expect(isDefaultFilters(DEFAULT_FILTERS)).toBe(true);
  });

  it("is false when a top-level filter differs", () => {
    expect(isDefaultFilters(withOverrides({ timeRange: "week" }))).toBe(false);
    expect(isDefaultFilters(withOverrides({ sortBy: "date" }))).toBe(false);
    expect(isDefaultFilters(withOverrides({ maxResults: 10 }))).toBe(false);
    expect(isDefaultFilters(withOverrides({ sourceTypes: ["web", "academic"] }))).toBe(false);
  });

  it("ignores source type order and duplicates", () => {
    expect(isDefaultFilters(withOverrides({ sourceTypes: ["web", "web"] }))).toBe(true);
  });

  it("is false when an academic filter has an effect", () => {
    expect(isDefaultFilters(withOverrides({ academic: { openAccessOnly: true } }))).toBe(false);
  });

  it("ignores leftover no-op academic values", () => {
    expect(
      isDefaultFilters(
        withOverrides({
          academic: {
            fieldOfStudyIds: [],
            publicationYearMode: "all",
            minCitations: 0,
            customYearFrom: 2010,
            worstAllowedJournalQuartile: 2,
          },
        })
      )
    ).toBe(true);
  });
});

describe("applyFilterPatch", () => {
  it("merges an academic patch into the latest academic state", () => {
    const prev = withOverrides({ academic: { minCitations: 5 } });
    const next = applyFilterPatch(prev, { academic: { openAccessOnly: true } });
    expect(next.academic).toEqual({ minCitations: 5, openAccessOnly: true });
  });

  it("keeps academic untouched for a top-level patch", () => {
    const prev = withOverrides({ academic: { minCitations: 5 } });
    expect(applyFilterPatch(prev, { sortBy: "date" }).academic).toEqual({ minCitations: 5 });
  });
});
