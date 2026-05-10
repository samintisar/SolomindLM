"use node";

import type { LiteratureReviewStateType } from "../state";
import type { LiteratureReviewNodeDeps } from "../types";
import { trackResearchStep } from "../../research/steps";
import { searchInternalHandler } from "../../../_services/search/AcademicSearchService";

/**
 * searchPapers node: Search academic sources (arXiv, Semantic Scholar, PubMed) in parallel.
 *
 * Input:  state.query
 * Output: state.papers (array of AcademicPaper)
 */
export async function searchPapersNode(
  state: LiteratureReviewStateType,
  deps: LiteratureReviewNodeDeps
): Promise<Partial<LiteratureReviewStateType>> {
  const { query, searchQueries } = state;
  const queries = searchQueries.length > 0 ? searchQueries : [query];

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "searching",
      "in_progress",
      `Searching academic sources for: ${query.substring(0, 80)}...`
    );
  }

  let papers: Awaited<ReturnType<typeof searchInternalHandler>> = [];

  if (deps.searchPapers) {
    // Use injected search function (e.g., from workflow or test)
    // Search with all queries and deduplicate
    const allPapers = await Promise.all(queries.map((q) => deps.searchPapers!(q, 30)));
    const seen = new Set<string>();
    papers = allPapers.flat().filter((p) => {
      const id = p.doi || p.title;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  } else {
    // Use default AcademicSearchService — concatenate planned queries for broader search
    const combinedQuery = queries.join(" OR ");
    papers = await searchInternalHandler({
      query: combinedQuery,
      maxResults: 30,
      sortBy: "relevance",
    });
  }

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "searching",
      "completed",
      `Found ${papers.length} papers from academic sources`,
      { paperCount: papers.length }
    );
  }

  return {
    papers,
    progress: {
      phase: "searching",
      percentage: 25,
      message: `Found ${papers.length} papers from arXiv, Semantic Scholar, and PubMed.`,
    },
  };
}
