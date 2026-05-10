"use node";

import type { LiteratureReviewStateType } from "../state";
import type { LiteratureReviewNodeDeps, RankedPaper } from "../types";
import { trackResearchStep } from "../../research/steps";
import { cachedRerank } from "../../chat/rerankCache";
import type { AcademicPaper } from "../../../_services/search/AcademicSearchService";

/**
 * rankPapers node: Rank papers by relevance to the research question using ZeroEntropy reranking.
 *
 * Input:  state.papers, state.query
 * Output: state.rankedPapers (top 30 by relevance)
 */
export async function rankPapersNode(
  state: LiteratureReviewStateType,
  deps: LiteratureReviewNodeDeps
): Promise<Partial<LiteratureReviewStateType>> {
  const { papers, query } = state;

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "ranking",
      "in_progress",
      `Ranking ${papers.length} papers by relevance...`
    );
  }

  let rankedPapers: RankedPaper[] = [];

  if (deps.rerankPapers) {
    // Use injected rerank function (e.g., from workflow or test)
    rankedPapers = await deps.rerankPapers(query, papers as AcademicPaper[]);
  } else if (deps.ctx) {
    // Use ZeroEntropy reranking via cachedRerank
    const documents = papers.map((paper) => ({
      id: paper.doi || paper.title,
      content: `${paper.title}\n${paper.abstract || ""}`,
    }));

    const reranked = await cachedRerank(
      deps.ctx,
      query,
      documents,
      "zerank-2",
      Math.min(papers.length, 30)
    );

    // Map reranked results back to papers
    const paperMap = new Map(papers.map((p) => [p.doi || p.title, p]));
    rankedPapers = reranked
      .map((r, index) => {
        const paper = paperMap.get(r.id);
        if (!paper) return null;
        return {
          ...paper,
          relevanceScore: r.score,
          rank: index + 1,
        };
      })
      .filter((p): p is RankedPaper => p !== null);
  } else {
    // Fallback: sort by original score
    rankedPapers = [...papers]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .map((p, index) => ({
        ...p,
        rank: index + 1,
      }));
  }

  // Take top 30 for screening
  const topPapers = rankedPapers.slice(0, 30);

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "ranking",
      "completed",
      `Ranked ${topPapers.length} papers by relevance`,
      { paperCount: topPapers.length }
    );
  }

  return {
    rankedPapers: topPapers,
    progress: {
      phase: "ranking",
      percentage: 45,
      message: `Ranked papers by relevance. Top ${topPapers.length} selected for screening.`,
    },
  };
}
