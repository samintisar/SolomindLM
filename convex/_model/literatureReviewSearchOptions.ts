import type { Infer } from "convex/values";
import { v } from "convex/values";

export const literatureAcademicFiltersValidator = v.object({
  publicationYearFrom: v.optional(v.number()),
  publicationYearTo: v.optional(v.number()),
  minCitations: v.optional(v.number()),
  openAccessOnly: v.optional(v.boolean()),
  hasFullText: v.optional(v.boolean()),
  fieldOfStudyTerms: v.optional(v.array(v.string())),
});

export type LiteratureAcademicFilters = Infer<typeof literatureAcademicFiltersValidator>;

export const literatureSearchOptionsValidator = v.object({
  researchDatabase: v.union(v.literal("all"), v.literal("pubmed"), v.literal("arxiv")),
  academicFilters: v.optional(literatureAcademicFiltersValidator),
});

export type LiteratureSearchOptions = Infer<typeof literatureSearchOptionsValidator>;

export type AcademicPaperSource = "openalex" | "semantic_scholar" | "pubmed" | "arxiv";

/** Default API order when corpus is "all" (OpenAlex is the stable broad fallback; arXiv last). */
export const DEFAULT_ACADEMIC_SOURCES: AcademicPaperSource[] = [
  "semantic_scholar",
  "openalex",
  "pubmed",
  "arxiv",
];

/** Ordered sources for search: default order, filtered by allowlist when set. */
export function resolveAcademicSearchSources(
  allowlist?: AcademicPaperSource[]
): AcademicPaperSource[] {
  if (!allowlist) return [...DEFAULT_ACADEMIC_SOURCES];
  return DEFAULT_ACADEMIC_SOURCES.filter((s) => allowlist.includes(s));
}

/** Maps UI corpus choice to AcademicSearchService source allowlist. */
export function sourcesForResearchDatabase(
  db: LiteratureSearchOptions["researchDatabase"]
): AcademicPaperSource[] | undefined {
  if (db === "pubmed") return ["pubmed"];
  if (db === "arxiv") return ["arxiv"];
  return undefined;
}
