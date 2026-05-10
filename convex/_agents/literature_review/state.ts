"use node";
/**
 * State definitions for the literature review agent.
 *
 * Defines the LangGraph Annotation state used by any subgraphs
 * within the literature review workflow. Database remains the
 * source of truth; this is working memory for graph execution.
 */

import { Annotation } from "@langchain/langgraph";
import type {
  AcademicPaper,
  ScreenedPaper,
  TableColumn,
  LiteratureReviewProgress,
  LiteratureCitation,
} from "./types";

// ============================================================
// REDUCER HELPERS
// ============================================================

function mergeArrayReducer<T>(x: T[], y?: T[] | null): T[] {
  if (y === null) return [];
  if (y === undefined) return x;
  return x.concat(y);
}

function overwriteReducer<T>(x: T, y?: T): T {
  return y !== undefined ? y : x;
}

function mergeExtractedDataReducer(
  x: Record<string, Record<string, string>>,
  y?: Record<string, Record<string, string>> | null
): Record<string, Record<string, string>> {
  if (y === null) return {};
  if (y === undefined) return x;
  const merged: Record<string, Record<string, string>> = { ...x };
  for (const [paperId, columns] of Object.entries(y)) {
    merged[paperId] = { ...merged[paperId], ...columns };
  }
  return merged;
}

// ============================================================
// STATE DEFINITION
// ============================================================

export const LiteratureReviewState = Annotation.Root({
  query: Annotation<string>({
    reducer: overwriteReducer,
    default: () => "",
  }),

  suggestedColumns: Annotation<TableColumn[]>({
    reducer: mergeArrayReducer,
    default: () => [],
  }),

  confirmedColumns: Annotation<TableColumn[]>({
    reducer: overwriteReducer,
    default: () => [],
  }),

  papers: Annotation<AcademicPaper[]>({
    reducer: mergeArrayReducer,
    default: () => [],
  }),

  rankedPapers: Annotation<AcademicPaper[]>({
    reducer: overwriteReducer,
    default: () => [],
  }),

  screenedPapers: Annotation<ScreenedPaper[]>({
    reducer: overwriteReducer,
    default: () => [],
  }),

  extractedData: Annotation<Record<string, Record<string, string>>>({
    reducer: mergeExtractedDataReducer,
    default: () => ({}),
  }),

  tableColumns: Annotation<TableColumn[]>({
    reducer: overwriteReducer,
    default: () => [],
  }),

  citations: Annotation<LiteratureCitation[]>({
    reducer: mergeArrayReducer,
    default: () => [],
  }),

  progress: Annotation<LiteratureReviewProgress>({
    reducer: overwriteReducer,
    default: () => ({
      phase: "initializing",
      percentage: 0,
      message: "Initializing literature review...",
    }),
  }),

  error: Annotation<string | undefined>({
    reducer: overwriteReducer,
    default: () => undefined,
  }),
});

export type LiteratureReviewStateType = typeof LiteratureReviewState.State;
