/** Passed in POST /api/chat/stream body `sourcePolicy` (Convex mirrors this shape). */
export type ChatStreamAcademicFilters = {
  publicationYearFrom?: number;
  publicationYearTo?: number;
  minCitations?: number;
  openAccessOnly?: boolean;
  hasFullText?: boolean;
  fieldOfStudyTerms?: string[];
};

export type ChatStreamSourcePolicy = {
  channels: string[];
  /** Deep Research: max hits per channel per sub-question (default 8 server-side). */
  maxResultsPerChannel?: number;
  academicFilters?: ChatStreamAcademicFilters;
};
