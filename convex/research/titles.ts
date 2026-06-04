import {
  fallbackReviewTitleFromQuery,
  literatureReportTitle,
  literatureTableTitle,
  normalizeReviewTitle,
} from "../literatureReview/titles";

const DEFAULT_RESEARCH_TITLE = "Deep Research";

/** Normalize an LLM- or heuristic-derived deep research title for display and storage. */
export function normalizeResearchTitle(raw: string): string {
  const normalized = normalizeReviewTitle(raw);
  return normalized === "Literature Review" ? DEFAULT_RESEARCH_TITLE : normalized;
}

/** Strip common instruction tails from a user query to build a readable fallback title. */
export function fallbackResearchTitleFromQuery(query: string): string {
  const fallback = fallbackReviewTitleFromQuery(query);
  return fallback === "Literature Review" ? DEFAULT_RESEARCH_TITLE : fallback;
}

export function deepResearchTableTitle(researchTitle: string): string {
  return literatureTableTitle(researchTitle);
}

export function deepResearchReportTitle(researchTitle: string): string {
  return literatureReportTitle(researchTitle);
}
