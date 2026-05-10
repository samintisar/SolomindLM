"use node";

import type { LiteratureReviewStateType } from "../state";
import type { LiteratureReviewNodeDeps } from "../types";
import { trackResearchStep } from "../../research/steps";
import { deduplicatePapers as deduplicatePapersService, normalizeTitle } from "../../../_services/search/AcademicSearchService";
import type { AcademicPaper } from "../../../_services/search/AcademicSearchService";

/**
 * deduplicatePapers node: Remove duplicate papers from multiple sources.
 *
 * Strategy:
 * 1. Match by DOI (exact)
 * 2. Fuzzy match by normalized title (Levenshtein distance < 0.15)
 * 3. Keep highest-scoring duplicate
 *
 * Input:  state.papers
 * Output: state.papers (deduplicated)
 */
export async function deduplicatePapersNode(
  state: LiteratureReviewStateType,
  deps: LiteratureReviewNodeDeps
): Promise<Partial<LiteratureReviewStateType>> {
  const { papers } = state;
  const originalCount = papers.length;

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "deduplicating",
      "in_progress",
      `Deduplicating ${originalCount} papers...`
    );
  }

  // Step 1: Exact DOI deduplication (using existing service function)
  let deduped = deduplicatePapersService(papers as AcademicPaper[]);

  // Step 2: Fuzzy title matching for remaining duplicates
  const seenTitles: string[] = [];
  const fuzzyDeduped: typeof deduped = [];

  for (const paper of deduped) {
    const normalized = normalizeTitle(paper.title);
    let isDuplicate = false;

    for (const seen of seenTitles) {
      const distance = levenshteinDistance(normalized, seen);
      const maxLen = Math.max(normalized.length, seen.length);
      const similarity = maxLen > 0 ? distance / maxLen : 0;

      if (similarity < 0.15) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seenTitles.push(normalized);
      fuzzyDeduped.push(paper);
    }
  }

  deduped = fuzzyDeduped;

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "deduplicating",
      "completed",
      `Removed ${originalCount - deduped.length} duplicates, ${deduped.length} unique papers remain`,
      { paperCount: deduped.length }
    );
  }

  return {
    papers: deduped,
    progress: {
      phase: "deduplicating",
      percentage: 35,
      message: `Removed ${originalCount - deduped.length} duplicates. ${deduped.length} unique papers remain.`,
    },
  };
}

// Simple Levenshtein distance for fuzzy title matching
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      );
    }
  }

  return matrix[b.length]![a.length]!;
}
