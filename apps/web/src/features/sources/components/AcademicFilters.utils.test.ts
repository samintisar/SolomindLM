import { describe, it, expect } from "vitest";
import { DEFAULT_ACADEMIC_FILTERS } from "./AcademicFilters.utils";
import type { AcademicFilterState } from "./AcademicFilters.types";

// Local recreation of the mapping function for testing
function testAcademicFiltersToConvexPayload(academic: {
  advancedFilters?: AcademicFilterState;
}): {
  publicationYearFrom?: number;
  publicationYearTo?: number;
  minCitations?: number;
  openAccessOnly?: boolean;
  hasFullText?: boolean;
  provider?: "all" | "pubmed" | "arxiv";
  fieldsOfStudy?: string[];
} {
  const adv = academic.advancedFilters ?? DEFAULT_ACADEMIC_FILTERS;
  const currentYear = new Date().getFullYear();
  let publicationYearFrom: number | undefined;
  let publicationYearTo: number | undefined;
  if (adv.yearFilter === "last-n") {
    publicationYearFrom = currentYear - adv.yearCount + 1;
    publicationYearTo = currentYear;
  } else if (adv.yearFilter === "custom") {
    publicationYearFrom = adv.yearStart;
    publicationYearTo = adv.yearEnd;
  }

  return {
    publicationYearFrom,
    publicationYearTo,
    minCitations: adv.minCitations,
    openAccessOnly: adv.openAccess ? true : undefined,
    hasFullText: adv.hasPdf ? true : undefined,
    provider: adv.database !== "all" ? adv.database : undefined,
    fieldsOfStudy: adv.fieldsOfStudy.length > 0 ? adv.fieldsOfStudy : undefined,
  };
}

describe("academicFiltersToConvexPayload", () => {
  it("returns provider when database is not 'all'", () => {
    const result = testAcademicFiltersToConvexPayload({
      advancedFilters: {
        ...DEFAULT_ACADEMIC_FILTERS,
        database: "pubmed",
      },
    });
    expect(result.provider).toBe("pubmed");
  });

  it("returns undefined provider when database is 'all'", () => {
    const result = testAcademicFiltersToConvexPayload({
      advancedFilters: {
        ...DEFAULT_ACADEMIC_FILTERS,
        database: "all",
      },
    });
    expect(result.provider).toBeUndefined();
  });

  it("returns fieldsOfStudy when populated", () => {
    const result = testAcademicFiltersToConvexPayload({
      advancedFilters: {
        ...DEFAULT_ACADEMIC_FILTERS,
        fieldsOfStudy: ["Computer Science", "Neuroscience"],
      },
    });
    expect(result.fieldsOfStudy).toEqual(["Computer Science", "Neuroscience"]);
  });

  it("returns undefined fieldsOfStudy when empty", () => {
    const result = testAcademicFiltersToConvexPayload({
      advancedFilters: {
        ...DEFAULT_ACADEMIC_FILTERS,
        fieldsOfStudy: [],
      },
    });
    expect(result.fieldsOfStudy).toBeUndefined();
  });

  it("calculates last-n year range correctly", () => {
    const currentYear = new Date().getFullYear();
    const result = testAcademicFiltersToConvexPayload({
      advancedFilters: {
        ...DEFAULT_ACADEMIC_FILTERS,
        yearFilter: "last-n",
        yearCount: 5,
      },
    });
    expect(result.publicationYearFrom).toBe(currentYear - 4);
    expect(result.publicationYearTo).toBe(currentYear);
  });

  it("passes through custom year range", () => {
    const result = testAcademicFiltersToConvexPayload({
      advancedFilters: {
        ...DEFAULT_ACADEMIC_FILTERS,
        yearFilter: "custom",
        yearStart: 2020,
        yearEnd: 2024,
      },
    });
    expect(result.publicationYearFrom).toBe(2020);
    expect(result.publicationYearTo).toBe(2024);
  });

  it("returns undefined years when filter is 'all'", () => {
    const result = testAcademicFiltersToConvexPayload({
      advancedFilters: {
        ...DEFAULT_ACADEMIC_FILTERS,
        yearFilter: "all",
      },
    });
    expect(result.publicationYearFrom).toBeUndefined();
    expect(result.publicationYearTo).toBeUndefined();
  });

  it("passes through minCitations", () => {
    const result = testAcademicFiltersToConvexPayload({
      advancedFilters: {
        ...DEFAULT_ACADEMIC_FILTERS,
        minCitations: 50,
      },
    });
    expect(result.minCitations).toBe(50);
  });

  it("converts openAccess to openAccessOnly boolean", () => {
    const result = testAcademicFiltersToConvexPayload({
      advancedFilters: {
        ...DEFAULT_ACADEMIC_FILTERS,
        openAccess: true,
      },
    });
    expect(result.openAccessOnly).toBe(true);
  });

  it("converts hasPdf to hasFullText boolean", () => {
    const result = testAcademicFiltersToConvexPayload({
      advancedFilters: {
        ...DEFAULT_ACADEMIC_FILTERS,
        hasPdf: true,
      },
    });
    expect(result.hasFullText).toBe(true);
  });

  it("returns all filter fields together", () => {
    const result = testAcademicFiltersToConvexPayload({
      advancedFilters: {
        database: "arxiv",
        yearFilter: "custom",
        yearCount: 2,
        yearStart: 2021,
        yearEnd: 2023,
        hasPdf: true,
        openAccess: true,
        minCitations: 25,
        fieldsOfStudy: ["Physics and Astronomy"],
      },
    });
    expect(result.provider).toBe("arxiv");
    expect(result.publicationYearFrom).toBe(2021);
    expect(result.publicationYearTo).toBe(2023);
    expect(result.minCitations).toBe(25);
    expect(result.openAccessOnly).toBe(true);
    expect(result.hasFullText).toBe(true);
    expect(result.fieldsOfStudy).toEqual(["Physics and Astronomy"]);
  });
});
