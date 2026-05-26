import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACADEMIC_SOURCES,
  resolveAcademicSearchSources,
} from "./literatureReviewSearchOptions";

describe("resolveAcademicSearchSources", () => {
  it("uses S2 → OpenAlex → PubMed → arXiv by default", () => {
    expect(resolveAcademicSearchSources()).toEqual(DEFAULT_ACADEMIC_SOURCES);
    expect(DEFAULT_ACADEMIC_SOURCES).toEqual(["semantic_scholar", "openalex", "pubmed", "arxiv"]);
  });

  it("filters allowlist while preserving default order", () => {
    expect(resolveAcademicSearchSources(["arxiv", "semantic_scholar"])).toEqual([
      "semantic_scholar",
      "arxiv",
    ]);
  });

  it("returns only pubmed when corpus is pubmed-only", () => {
    expect(resolveAcademicSearchSources(["pubmed"])).toEqual(["pubmed"]);
  });
});
